// Quick smoke: launch built app with an isolated data dir, capture console
// errors and a screenshot.
import { _electron as electron } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-smoke-'))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, SMART_BRIEF_DATA_DIR: dataDir }
})
const page = await app.firstWindow()
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))
try {
  await page.waitForSelector('.app', { timeout: 15000 })
  await page.waitForTimeout(800)
  const shotDir = process.argv[2] ?? 'screenshots'
  fs.mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: path.join(shotDir, 'smoke-empty.png') })
  console.log('APP LOADED OK')
} catch (err) {
  console.log('LOAD FAILED:', err.message)
}
console.log('console errors:', errors.length ? errors : 'none')
await app.close()
