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

test('TEST 1 — basic visual brief survives an app restart', async () => {
  const dataDir = makeDataDir('basic')
  let { app, page } = await launchApp(dataDir)

  // Import a screenshot by dropping it on the empty state.
  await dropPng(page, '[data-testid="empty-state"]', makePng(800, 600, [200, 210, 230]))
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')

  // Draw a numbered region (Region is the default tool).
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.3, 0.3, 0.55, 0.5)
  await expect(page.locator('[data-testid="region-card-1"]')).toBeVisible()

  // The instruction field is focused automatically; type into it.
  await page.keyboard.type('Make this headline significantly larger.')
  await expect(page.locator('[data-testid="region-card-1"] textarea')).toHaveValue(
    'Make this headline significantly larger.'
  )

  // Add an arrow.
  await page.click('[data-testid="tool-arrow"]')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.7, 0.7, 0.5, 0.45)

  // Add an overall message.
  await page.fill('[data-testid="overall-message"]', 'Tighten up the hero section.')

  // Give the brief a title so it is clearly identifiable.
  await page.fill('[data-testid="project-title"]', 'Hero refresh')
  await waitForSaved(page)

  const before = await getProject(page)
  expect(before.pages).toHaveLength(1)
  expect(before.pages[0].annotations).toHaveLength(2)

  // Restart the app with the same data directory.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))

  const restored = await getProject(page)
  expect(restored.title).toBe('Hero refresh')
  expect(restored.pages).toHaveLength(1)
  const annotations = restored.pages[0].annotations
  expect(annotations).toHaveLength(2)
  const region = annotations.find((a: any) => a.type === 'region')
  const arrow = annotations.find((a: any) => a.type === 'arrow')
  expect(region.instruction).toBe('Make this headline significantly larger.')
  expect(region.number).toBe(1)
  expect(arrow).toBeTruthy()
  expect(restored.pages[0].overallMessage).toBe('Tighten up the hero section.')
  // And the UI shows it too.
  await expect(page.locator('[data-testid="region-card-1"] textarea')).toHaveValue(
    'Make this headline significantly larger.'
  )
  await closeApp({ app, page })
})
