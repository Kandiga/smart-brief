import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { unzipSync } from 'fflate'
import { launchApp, closeApp, makeDataDir, waitForSaved, getProject } from './helpers'

// SMART_BRIEF_FAKE_CAPTURE swaps the OS screen grab for a deterministic
// synthetic image while keeping the REAL overlay flow — so these tests drive
// the actual in-place capture UI (select, annotate, Done) without needing
// macOS Screen Recording permission.
const CAPTURE_ENV = { SMART_BRIEF_FAKE_CAPTURE: '1' }

/** Trigger Quick Capture and return the overlay window once it is ready. */
async function openOverlay(app: ElectronApplication, page: Page): Promise<Page> {
  const overlayPromise = app.waitForEvent('window')
  await page.evaluate(() => (window as any).smartBrief.startCapture())
  const overlay = await overlayPromise
  await overlay.waitForSelector('[data-testid="capture-select-layer"]', { timeout: 15000 })
  return overlay
}

async function dragOn(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 })
  await page.mouse.move(x2, y2, { steps: 4 })
  await page.mouse.up()
}

/** Select a region in the overlay and wait for the annotation surface. */
async function selectRegion(overlay: Page): Promise<void> {
  await dragOn(overlay, 200, 200, 700, 560)
  await overlay.waitForSelector('[data-testid="capture-canvas-host"]', { timeout: 15000 })
  await overlay.waitForSelector('[data-testid="page-canvas-0"] canvas', { timeout: 15000 })
}

test('TEST 8 — Quick Capture is authored in place and handed to the app on Done', async () => {
  const dataDir = makeDataDir('capture')
  const exportDir = makeDataDir('capture-out')
  const { app, page } = await launchApp(dataDir, { ...CAPTURE_ENV, SMART_BRIEF_EXPORT_DIR: exportDir })

  const overlay = await openOverlay(app, page)
  // The app window is NOT pulled forward: the capture UI lives in the overlay.
  await expect(overlay.locator('[data-testid="capture-overlay"]')).toBeVisible()

  await selectRegion(overlay)
  // Toolbar floats over the frozen screen; the app window was never involved.
  await expect(overlay.locator('[data-testid="capture-toolbar"]')).toBeVisible()

  // Mark a region inside the captured area; the composer opens focused.
  await dragOn(overlay, 260, 260, 420, 380)
  await overlay.waitForSelector('[data-testid="floating-composer"]')
  await overlay.keyboard.type('Make this button green')
  await expect(overlay.locator('[data-testid="composer-instruction"]')).toHaveValue(
    'Make this button green'
  )

  // Esc collapses the composer without losing the region or its text.
  await overlay.keyboard.press('Escape')
  await expect(overlay.locator('[data-testid="floating-composer"]')).toHaveCount(0)

  // Overall message via the toolbar.
  await overlay.click('[data-testid="capture-overall-message"]')
  await overlay.fill('[data-testid="overall-composer-input"]', 'Keep the layout as is')
  await overlay.keyboard.press('Escape')

  // Done hands the finished project to the Smart Brief window.
  await overlay.click('[data-testid="capture-done"]')
  await page.waitForFunction(
    () => ((window as any).__sbTest.getProject()?.pages.length ?? 0) > 0,
    { timeout: 15000 }
  )

  const project = await getProject(page)
  expect(project.pages).toHaveLength(1)
  const capturedPage = project.pages[0]
  expect(capturedPage.kind).toBe('screenshot')
  // Captured at the display's native pixel density: the image is an integer
  // multiple of the 500×360-point selection, with the aspect ratio preserved.
  const scale = capturedPage.width / 500
  expect(scale).toBeGreaterThanOrEqual(1)
  expect(capturedPage.height).toBe(Math.round(360 * scale))
  const region = capturedPage.annotations.find((a: any) => a.type === 'region')
  expect(region.number).toBe(1)
  expect(region.instruction).toBe('Make this button green')
  expect(capturedPage.overallMessage).toBe('Keep the layout as is')

  await waitForSaved(page)
  await page.fill('[data-testid="project-title"]', 'Capture flow brief')
  await expect(page.locator('[data-testid="save-status"]')).toHaveText('Edited')
  await waitForSaved(page)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText('Saved locally')

  // Export the AI Brief ZIP from the app, as the user would.
  await page.click('[data-testid="export-button"]')
  await page.click('[data-testid="export-ai-zip"]')
  await expect(page.locator('[data-testid="export-result"]')).toContainText('.zip', {
    timeout: 45000
  })

  const zipFile = fs.readdirSync(exportDir).find((f) => f.endsWith('.zip'))!
  const unzipped = unzipSync(fs.readFileSync(path.join(exportDir, zipFile)))
  const names = Object.keys(unzipped)
  const root = names[0].split('/')[0]
  const rel = (n: string) => `${root}/${n}`
  for (const required of [
    'README.md',
    'manifest.json',
    'brief.md',
    'project-preview.jpg',
    'pages/page-001/original.png',
    'pages/page-001/annotated.png',
    'pages/page-001/regions/region-001.png'
  ]) {
    expect(names).toContain(rel(required))
    expect(unzipped[rel(required)].byteLength).toBeGreaterThan(0)
  }

  const manifestText = Buffer.from(unzipped[rel('manifest.json')]).toString('utf8')
  const manifest = JSON.parse(manifestText)
  expect(manifest.schemaVersion).toBe('1.0')
  expect(manifest.pages[0].sourceWidth).toBe(capturedPage.width)
  expect(manifest.pages[0].regions[0].instruction).toBe('Make this button green')
  for (const forbidden of ['revision', 'tombstone', 'activePageId', 'zoomState', '/Users/', 'media/']) {
    expect(manifestText).not.toContain(forbidden)
  }
  const briefMd = Buffer.from(unzipped[rel('brief.md')]).toString('utf8')
  expect(briefMd).toContain('Make this button green')
  expect(briefMd).toContain('Keep the layout as is')
  // The packaged original is the untouched capture, byte for byte.
  const original = Buffer.from(unzipped[rel('pages/page-001/original.png')])
  const stored = fs
    .readdirSync(path.join(dataDir, 'media'))
    .filter((f) => f.endsWith('.png'))
    .map((f) => fs.readFileSync(path.join(dataDir, 'media', f)))
  expect(stored.some((b) => b.equals(original))).toBe(true)

  // Everything survives a restart through the normal repository.
  const projectId = project.id
  await closeApp({ app, page })
  const second = await launchApp(dataDir, CAPTURE_ENV)
  const restored = await getProject(second.page)
  expect(restored.id).toBe(projectId)
  expect(restored.pages[0].annotations.find((a: any) => a.type === 'region').instruction).toBe(
    'Make this button green'
  )
  await closeApp(second)
})

test('TEST 9 — discarding a capture leaves no ghost project and no orphan media', async () => {
  const dataDir = makeDataDir('capture-cancel')
  const { app, page } = await launchApp(dataDir, CAPTURE_ENV)

  const overlay = await openOverlay(app, page)
  await selectRegion(overlay)
  const capturedId = await overlay.evaluate(
    () => (window as any).__sbCaptureTest?.getProjectId() ?? null
  )
  expect(capturedId).toBeTruthy()

  // Mark something, so Esc must ask before throwing work away.
  await dragOn(overlay, 260, 260, 400, 360)
  await overlay.waitForSelector('[data-testid="floating-composer"]')
  await overlay.keyboard.type('Doomed note')
  // Esc cascade: collapse the composer, clear the selection, then — and only
  // then — ask before throwing the marked-up capture away.
  await overlay.keyboard.press('Escape')
  await expect(overlay.locator('[data-testid="floating-composer"]')).toHaveCount(0)
  await overlay.keyboard.press('Escape')
  await expect(overlay.locator('[data-testid="capture-confirm-discard"]')).toHaveCount(0)
  await overlay.keyboard.press('Escape')
  await overlay.waitForSelector('[data-testid="capture-confirm-discard"]')
  await overlay.click('[data-testid="capture-confirm-discard-yes"]')

  // Wait past the autosave debounce: the discarded capture must stay gone.
  await page.waitForTimeout(1800)
  const projectsDir = path.join(dataDir, 'projects')
  const files = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json'))
    : []
  expect(files.some((f) => f.startsWith(capturedId))).toBe(false)
  const mediaDir = path.join(dataDir, 'media')
  const media = fs.existsSync(mediaDir)
    ? fs.readdirSync(mediaDir).filter((f) => f.endsWith('.png'))
    : []
  expect(media).toHaveLength(0)

  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-empty"]')).toBeVisible()
  await closeApp({ app, page })

  const second = await launchApp(dataDir, CAPTURE_ENV)
  await second.page.click('[data-testid="open-library"]')
  await expect(second.page.locator('[data-testid="library-empty"]')).toBeVisible()
  await closeApp(second)
})

test('TEST 10 — a deleted capture project cannot be resurrected by a stale autosave', async () => {
  const dataDir = makeDataDir('capture-delete')
  const { app, page } = await launchApp(dataDir, CAPTURE_ENV)

  const overlay = await openOverlay(app, page)
  await selectRegion(overlay)
  await dragOn(overlay, 260, 260, 420, 380)
  await overlay.waitForSelector('[data-testid="floating-composer"]')
  await overlay.keyboard.type('Doomed instruction')
  await overlay.click('[data-testid="capture-done"]')
  await page.waitForFunction(
    () => ((window as any).__sbTest.getProject()?.pages.length ?? 0) > 0,
    { timeout: 15000 }
  )
  const capturedId = (await getProject(page)).id
  await waitForSaved(page)

  // Dirty the project so an autosave may be in flight, then delete it.
  await page.fill('[data-testid="project-title"]', 'About to be deleted')
  await page.click('[data-testid="open-library"]')
  await page.click('[data-testid="card-delete"]')
  await page.click('[data-testid="confirm-delete-project"]')
  await page.click('[data-testid="library-close"]')

  await page.waitForTimeout(2000)
  const projectsDir = path.join(dataDir, 'projects')
  const files = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json'))
    : []
  expect(files.some((f) => f.startsWith(capturedId))).toBe(false)

  await closeApp({ app, page })
  const second = await launchApp(dataDir, CAPTURE_ENV)
  await second.page.click('[data-testid="open-library"]')
  await expect(second.page.locator('[data-testid="library-empty"]')).toBeVisible()
  await closeApp(second)
})
