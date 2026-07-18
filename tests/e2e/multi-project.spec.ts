import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  makeDataDir,
  makePng,
  dropPng,
  getProject,
  waitForSaved,
  dragOnCanvas
} from './helpers'

test('TEST 2 — two projects never mix content and both survive restart', async () => {
  const dataDir = makeDataDir('multi')
  let { app, page } = await launchApp(dataDir)

  // Project A: one page with a numbered region.
  await dropPng(page, '[data-testid="empty-state"]', makePng(640, 480, [230, 120, 120]), 'a.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.2, 0.2, 0.4, 0.4)
  await page.keyboard.type('A-instruction')
  await page.fill('[data-testid="project-title"]', 'Project A')
  await waitForSaved(page)
  const idA = (await getProject(page)).id

  // Project B: different page, overall message, no regions.
  await page.click('[data-testid="overflow-menu"]')
  await page.click('[data-testid="menu-new-brief"]')
  await page.waitForSelector('[data-testid="empty-state"]')
  await dropPng(page, '[data-testid="empty-state"]', makePng(500, 700, [120, 160, 230]), 'b.png')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  await page.fill('[data-testid="overall-message"]', 'B-message')
  await page.fill('[data-testid="project-title"]', 'Project B')
  await waitForSaved(page)
  const idB = (await getProject(page)).id
  expect(idB).not.toBe(idA)

  // Switch back to A through the library and verify no mixing.
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(2)
  await page
    .locator(`[data-testid="library-card"][data-project-id="${idA}"] [data-testid="card-open"]`)
    .click()
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  let current = await getProject(page)
  expect(current.id).toBe(idA)
  expect(current.title).toBe('Project A')
  expect(current.pages[0].annotations.some((a: any) => a.instruction === 'A-instruction')).toBe(true)
  expect(current.pages[0].overallMessage).toBe('')

  // Switch to B and verify.
  await page.click('[data-testid="open-library"]')
  await page
    .locator(`[data-testid="library-card"][data-project-id="${idB}"] [data-testid="card-open"]`)
    .click()
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  current = await getProject(page)
  expect(current.title).toBe('Project B')
  expect(current.pages[0].annotations).toHaveLength(0)
  expect(current.pages[0].overallMessage).toBe('B-message')

  // Restart and verify both are intact.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  current = await getProject(page)
  expect(current.title).toBe('Project B') // last active restored
  expect(current.pages[0].overallMessage).toBe('B-message')
  await page.click('[data-testid="open-library"]')
  await expect(page.locator('[data-testid="library-card"]')).toHaveCount(2)
  await page
    .locator(`[data-testid="library-card"][data-project-id="${idA}"] [data-testid="card-open"]`)
    .click()
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  current = await getProject(page)
  expect(current.title).toBe('Project A')
  expect(current.pages[0].annotations.some((a: any) => a.instruction === 'A-instruction')).toBe(true)
  await closeApp({ app, page })
})
