import { test, expect } from '@playwright/test'
import { launchApp, closeApp, makeDataDir } from './helpers'

// ⌘+ / ⌘− / ⌘0 zoom the ENTIRE interface (webContents zoom), like standard
// Mac apps. Synthetic key events cannot trigger native menu accelerators, so
// the test drives the actual menu items the accelerators are bound to.

async function clickMenuItem(app: any, id: string): Promise<void> {
  await app.evaluate(({ Menu }: any, id: string) => {
    Menu.getApplicationMenu().getMenuItemById(id).click()
  }, id)
}

async function zoomFactor(app: any): Promise<number> {
  return app.evaluate(({ BrowserWindow }: any) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()
  )
}

test('⌘+ / ⌘− / ⌘0 zoom the whole UI and the level survives restart', async () => {
  const dataDir = makeDataDir('uizoom')
  let { app, page } = await launchApp(dataDir)

  expect(await zoomFactor(app)).toBeCloseTo(1, 3)

  // Zoom In twice (menu item bound to ⌘+ and hidden ⌘= alias).
  await clickMenuItem(app, 'zoom-in-ui')
  expect(await zoomFactor(app)).toBeGreaterThan(1.05)
  await clickMenuItem(app, 'zoom-in-ui-alias')
  const zoomedIn = await zoomFactor(app)
  expect(zoomedIn).toBeGreaterThan(1.15)

  // Zoom Out (⌘−).
  await clickMenuItem(app, 'zoom-out-ui')
  expect(await zoomFactor(app)).toBeLessThan(zoomedIn)

  // Restart: the zoom level is restored.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  await page.waitForTimeout(300)
  expect(await zoomFactor(app)).toBeGreaterThan(1.05)

  // Actual Size (⌘0) resets to 100%.
  await clickMenuItem(app, 'zoom-reset-ui')
  expect(await zoomFactor(app)).toBeCloseTo(1, 3)

  // And the reset persists too.
  await closeApp({ app, page })
  ;({ app, page } = await launchApp(dataDir))
  expect(await zoomFactor(app)).toBeCloseTo(1, 3)
  await closeApp({ app, page })
})
