import { test, expect } from '@playwright/test'
import {
  launchApp,
  closeApp,
  makeDataDir,
  makePng,
  dropPng,
  getProject,
  waitForSaved,
  dragOnCanvas,
  dragScreen,
  pagePointToScreen
} from './helpers'

test('TEST 6 — blank canvas composition with two images survives restart', async () => {
  const dataDir = makeDataDir('blank')
  let { app, page } = await launchApp(dataDir)

  // Create a blank 1500×900 page.
  await page.click('[data-testid="start-blank"]')
  await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
  const project = await getProject(page)
  expect(project.pages[0].kind).toBe('blank')
  expect(project.pages[0].width).toBe(1500)
  expect(project.pages[0].height).toBe(900)

  // Drop two images onto the blank canvas: they become placed images.
  await dropPng(page, '[data-testid="page-canvas-0"]', makePng(300, 200, [240, 170, 90]), 'one.png')
  await page.waitForFunction(
    () => (window as any).__sbTest.getProject()?.pages[0]?.placedImages.length === 1
  )
  await dropPng(page, '[data-testid="page-canvas-0"]', makePng(200, 300, [90, 170, 240]), 'two.png')
  await page.waitForFunction(
    () => (window as any).__sbTest.getProject()?.pages[0]?.placedImages.length === 2
  )

  // Move the topmost image with the Edit tool (both were dropped at the center,
  // so a click selects the image with the highest zIndex).
  await page.click('[data-testid="tool-edit"]')
  let images = (await getProject(page)).pages[0].placedImages
  const first = images.reduce((a: any, b: any) => (b.zIndex > a.zIndex ? b : a))
  const fromCenter = await pagePointToScreen(
    page,
    '[data-testid="page-canvas-0"]',
    first.x + first.width / 2,
    first.y + first.height / 2
  )
  await page.mouse.click(fromCenter.x, fromCenter.y) // select
  await dragScreen(page, fromCenter, { x: fromCenter.x - 120, y: fromCenter.y - 80 })
  images = (await getProject(page)).pages[0].placedImages
  const moved = images.find((i: any) => i.id === first.id)
  expect(moved.x).toBeLessThan(first.x - 40)

  // Resize it by dragging the bottom-right transformer handle.
  const corner = await pagePointToScreen(
    page,
    '[data-testid="page-canvas-0"]',
    moved.x + moved.width,
    moved.y + moved.height
  )
  await dragScreen(page, corner, { x: corner.x + 60, y: corner.y + 45 })
  images = (await getProject(page)).pages[0].placedImages
  const resized = images.find((i: any) => i.id === first.id)
  expect(resized.width).toBeGreaterThan(moved.width + 10)

  // Add a numbered region and an arrow over the composition.
  await page.click('[data-testid="tool-region"]')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.15, 0.15, 0.35, 0.35)
  await page.keyboard.type('Blend these two references.')
  await page.click('[data-testid="tool-arrow"]')
  await dragOnCanvas(page, '[data-testid="page-canvas-0"]', 0.8, 0.8, 0.55, 0.55)

  await page.fill('[data-testid="project-title"]', 'Composition')
  await waitForSaved(page)
  const beforeRestart = (await getProject(page)).pages[0]

  // Restart and verify the composition is fully restored.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  const restored = (await getProject(page)).pages[0]
  expect(restored.kind).toBe('blank')
  expect(restored.placedImages).toHaveLength(2)
  expect(restored.placedImages).toEqual(beforeRestart.placedImages)
  expect(restored.annotations).toHaveLength(2)
  expect(restored.annotations.find((a: any) => a.type === 'region').instruction).toBe(
    'Blend these two references.'
  )
  expect(restored.annotations.some((a: any) => a.type === 'arrow')).toBe(true)
  await closeApp({ app, page })
})
