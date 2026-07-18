// Render the app icon with a canvas inside Electron, then emit build/icon.png.
// The .icns is assembled afterwards with sips + iconutil (see package step).
import { _electron as electron } from 'playwright'
import fs from 'node:fs'

const app = await electron.launch({ args: ['.'], env: { ...process.env, SMART_BRIEF_DATA_DIR: fs.mkdtempSync('/tmp/sb-icon-') } })
const page = await app.firstWindow()
await page.waitForSelector('.app')
const dataUrl = await page.evaluate(() => {
  const size = 1024
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  const s = size / 20 // grid unit

  // macOS-style rounded square
  const r = size * 0.225
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.arcTo(size, 0, size, size, r)
  ctx.arcTo(size, size, 0, size, r)
  ctx.arcTo(0, size, 0, 0, r)
  ctx.arcTo(0, 0, size, 0, r)
  ctx.closePath()
  const grad = ctx.createLinearGradient(0, 0, 0, size)
  grad.addColorStop(0, '#2f8a77')
  grad.addColorStop(1, '#226455')
  ctx.fillStyle = grad
  ctx.fill()

  // dashed region rectangle
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = s * 0.55
  ctx.setLineDash([s * 1.15, s * 0.75])
  ctx.strokeRect(s * 5, s * 6.5, s * 10.5, s * 8)

  // arrow
  ctx.setLineDash([])
  ctx.lineWidth = s * 0.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(s * 13.6, s * 15.8)
  ctx.lineTo(s * 11.2, s * 12.6)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(s * 11.2, s * 12.6)
  ctx.lineTo(s * 11.1, s * 14.2)
  ctx.moveTo(s * 11.2, s * 12.6)
  ctx.lineTo(s * 12.6, s * 12.4)
  ctx.stroke()

  // numbered badge
  ctx.fillStyle = '#ffc53d'
  ctx.beginPath()
  ctx.arc(s * 5, s * 6.5, s * 2.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1c2024'
  ctx.font = `bold ${s * 2.6}px -apple-system, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('1', s * 5, s * 6.65)
  return c.toDataURL('image/png')
})
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', Buffer.from(dataUrl.split(',')[1], 'base64'))
console.log('icon written: build/icon.png')
await app.close()
