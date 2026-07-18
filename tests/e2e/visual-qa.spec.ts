import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import {
  launchApp,
  closeApp,
  makeDataDir,
  makePng,
  dropPng,
  waitForSaved,
  dragOnCanvas
} from './helpers'

const SHOTS = 'screenshots'

async function setWindowSize(app: any, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }: any, { width, height }: any) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setSize(width, height)
    },
    { width, height }
  )
}

async function assertNoHorizontalOverflow(page: any) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    workspace: (() => {
      const el = document.querySelector('.workspace')
      return el ? el.scrollWidth - el.clientWidth : 0
    })()
  }))
  expect(overflow.body).toBeLessThanOrEqual(0)
  expect(overflow.workspace).toBeLessThanOrEqual(1)
}

test('visual QA — key states at 1440×900, 1728×1117 and a narrow 900px window', async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const dataDir = makeDataDir('visual')
  const { app, page } = await launchApp(dataDir)

  // 1440×900 — empty state.
  await setWindowSize(app, 1440, 900)
  await page.waitForTimeout(400)
  await expect(page.locator('[data-testid="empty-state"]')).toBeVisible()
  await assertNoHorizontalOverflow(page)
  await page.screenshot({ path: `${SHOTS}/empty-state-1440.png` })

  // One-page editing with a numbered region + instruction + arrow.
  await dropPng(page, '[data-testid="empty-state"]', makePng(1200, 800, [214, 224, 235]), 'ui.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.25, 0.25, 0.5, 0.42)
  await page.keyboard.type('Make this headline significantly larger and align it left.')
  await page.click('[data-testid="tool-arrow"]')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.72, 0.68, 0.55, 0.45)
  await page.fill('[data-testid="overall-message"]', 'The hero should feel calmer and easier to scan.')
  await page.fill('[data-testid="project-title"]', 'Homepage hero refresh')
  await waitForSaved(page)
  await assertNoHorizontalOverflow(page)
  await page.screenshot({ path: `${SHOTS}/editing-region-1440.png` })

  // Retina-like 1728×1117.
  await setWindowSize(app, 1728, 1117)
  await page.waitForTimeout(500)
  await assertNoHorizontalOverflow(page)
  await page.screenshot({ path: `${SHOTS}/editing-1728.png` })

  // Narrow 900px window.
  await setWindowSize(app, 900, 700)
  await page.waitForTimeout(500)
  await assertNoHorizontalOverflow(page)
  await expect(page.locator('[data-testid="export-button"]')).toBeVisible()
  await expect(page.locator('[data-testid="tool-region"]')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/narrow-900.png` })

  // Library with a saved project, back at 1440×900.
  await setWindowSize(app, 1440, 900)
  await page.waitForTimeout(400)
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(1)
  await page.waitForTimeout(400) // let the thumbnail load
  await page.screenshot({ path: `${SHOTS}/library-1440.png` })

  await closeApp({ app, page })
})
