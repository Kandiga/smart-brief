import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  launchApp,
  closeApp,
  makeDataDir,
  makePng,
  dropPng,
  getProject,
  waitForSaved
} from './helpers'

function projectFiles(dataDir: string): string[] {
  const dir = path.join(dataDir, 'projects')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
}

test('TEST 3 — deleting a project with a pending autosave never resurrects it', async () => {
  const dataDir = makeDataDir('deletion')
  let { app, page } = await launchApp(dataDir)

  // Project A.
  await dropPng(page, '[data-testid="empty-state"]', makePng(400, 300, [220, 220, 150]), 'a.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await page.fill('[data-testid="project-title"]', 'Keep me')
  await waitForSaved(page)
  const idA = (await getProject(page)).id

  // Project B, active, with a just-made edit so an autosave is scheduled.
  await page.click('[data-testid="overflow-menu"]')
  await page.click('[data-testid="menu-new-brief"]')
  await page.waitForSelector('[data-testid="empty-state"]')
  await dropPng(page, '[data-testid="empty-state"]', makePng(400, 300, [150, 220, 150]), 'b.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await page.fill('[data-testid="project-title"]', 'Delete me')
  // Do not wait for the save to settle: delete B while saves may be pending.
  await page.click('[data-testid="open-library"]')
  const idB = (await getProject(page)).id
  await page
    .locator(`[data-testid="library-card"][data-project-id="${idB}"] [data-testid="card-delete"]`)
    .click()
  await page.click('[data-testid="confirm-delete-project"]')

  // B disappears from the library immediately.
  await expect(
    page.locator(`[data-testid="library-card"][data-project-id="${idB}"]`)
  ).toHaveCount(0)
  await expect(
    page.locator(`[data-testid="library-card"][data-project-id="${idA}"]`)
  ).toHaveCount(1)

  // Close and reopen the library; still gone.
  await page.click('[data-testid="library-close"]')
  await page.click('[data-testid="open-library"]')
  await expect(
    page.locator(`[data-testid="library-card"][data-project-id="${idB}"]`)
  ).toHaveCount(0)
  await page.click('[data-testid="library-close"]')

  // Wait longer than the autosave debounce: no stale timer may recreate B.
  await page.waitForTimeout(2500)
  expect(projectFiles(dataDir).some((f) => f.includes(idB))).toBe(false)

  // Restart: B must remain deleted, A intact.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  await page.waitForTimeout(2000) // outlive any hypothetical revival timer
  expect(projectFiles(dataDir).some((f) => f.includes(idB))).toBe(false)
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(1)
  await expect(
    page.locator(`[data-testid="library-card"][data-project-id="${idA}"]`)
  ).toHaveCount(1)
  await closeApp({ app, page })
})

test('TEST 4 — an untouched blank draft never creates a ghost library card', async () => {
  const dataDir = makeDataDir('ghost')
  let { app, page } = await launchApp(dataDir)

  // A fresh untouched "Untitled brief" draft is active. Open the library.
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="library-empty"]')).toBeVisible()
  await page.click('[data-testid="library-close"]')

  // Also explicitly create another untouched draft.
  await page.click('[data-testid="overflow-menu"]')
  await page.click('[data-testid="menu-new-brief"]')
  await page.waitForTimeout(1500) // longer than the autosave debounce
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(0)

  // Restart: still no ghost projects on disk or in the library.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  expect(projectFiles(dataDir)).toHaveLength(0)
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(0)
  await closeApp({ app, page })
})
