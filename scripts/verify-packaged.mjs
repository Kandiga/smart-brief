// Launch the PACKAGED app, create a brief, restart it, verify persistence.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const exe = path.resolve('release/mac-arm64/Smart Brief.app/Contents/MacOS/Smart Brief')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-packaged-'))

async function launch(extraEnv = {}, dir = dataDir) {
  const app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      SMART_BRIEF_DATA_DIR: dir,
      // Never grab the user's real global shortcut during verification.
      SMART_BRIEF_DISABLE_GLOBAL_SHORTCUT: '1',
      ...extraEnv
    }
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app', { timeout: 15000 })
  return { app, page }
}

let { app, page } = await launch()
await page.click('[data-testid="start-blank"]')
await page.waitForSelector('[data-testid="page-canvas-0"] canvas')
// draw a region
const box = await page.locator('[data-testid="page-canvas-0"]').boundingBox()
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
await page.mouse.down()
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 5 })
await page.mouse.up()
await page.keyboard.type('Packaged build persistence check')
await page.fill('[data-testid="project-title"]', 'Packaged Test')
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="save-status"]')
  return el?.getAttribute('data-status') === 'saved'
})
await app.close()
;({ app, page } = await launch())
const project = await page.evaluate(() => window.__sbTest.getProject())
const region = project.pages[0].annotations.find((a) => a.type === 'region')
if (project.title === 'Packaged Test' && region?.instruction === 'Packaged build persistence check') {
  console.log('PACKAGED PERSISTENCE OK')
} else {
  console.log('PACKAGED PERSISTENCE FAILED', JSON.stringify(project).slice(0, 400))
  process.exitCode = 1
}
await app.close()

// Quick Capture in the packaged build (synthetic frame; the OS-level screen
// grab itself needs Screen Recording permission and a human, so it stays a
// manual checklist item). Drives the real in-place overlay.
// A fresh data dir, so "a capture arrived" is unambiguous rather than seeing
// the project the persistence check above just created.
const captureDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-packaged-capture-'))
;({ app, page } = await launch({ SMART_BRIEF_FAKE_CAPTURE: '1' }, captureDataDir))
const overlayPromise = app.waitForEvent('window')
await page.evaluate(() => window.smartBrief.startCapture())
const overlay = await overlayPromise
await overlay.waitForSelector('[data-testid="capture-select-layer"]', { timeout: 15000 })
await overlay.mouse.move(200, 200)
await overlay.mouse.down()
await overlay.mouse.move(700, 560, { steps: 5 })
await overlay.mouse.up()
await overlay.waitForSelector('[data-testid="capture-canvas-host"]', { timeout: 15000 })
await overlay.waitForSelector('[data-testid="capture-toolbar"]')
await overlay.click('[data-testid="capture-done"]')
await page.waitForFunction(() => (window.__sbTest.getProject()?.pages.length ?? 0) > 0, {
  timeout: 15000
})
const captured = await page.evaluate(() => window.__sbTest.getProject())
const capturePage = captured.pages[captured.pages.length - 1]
const scale = capturePage ? capturePage.width / 500 : 0
if (scale >= 1 && capturePage.height === Math.round(360 * scale)) {
  console.log('PACKAGED QUICK CAPTURE OK')
} else {
  console.log('PACKAGED QUICK CAPTURE FAILED', JSON.stringify(capturePage).slice(0, 200))
  process.exitCode = 1
}
await app.close()
