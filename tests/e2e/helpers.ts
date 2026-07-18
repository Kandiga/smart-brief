import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import zlib from 'node:zlib'

export const ROOT = path.resolve(__dirname, '../..')

export interface AppHandle {
  app: ElectronApplication
  page: Page
}

export function makeDataDir(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `smart-brief-${name}-`))
  return dir
}

export async function launchApp(
  dataDir: string,
  extraEnv: Record<string, string> = {}
): Promise<AppHandle> {
  const app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      SMART_BRIEF_DATA_DIR: dataDir,
      // Tests must never register real global shortcuts (parallel workers
      // would conflict with each other and with a real running app).
      SMART_BRIEF_DISABLE_GLOBAL_SHORTCUT: '1',
      ...extraEnv
    }
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app', { timeout: 15000 })
  return { app, page }
}

export async function closeApp(handle: AppHandle): Promise<void> {
  await handle.app.close()
}

/** Generate a valid PNG of the given size and solid RGB color (no deps). */
export function makePng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const [r, g, b] = rgb
  const bytesPerRow = width * 3 + 1
  const raw = Buffer.alloc(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    raw[y * bytesPerRow] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const o = y * bytesPerRow + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const idat = zlib.deflateSync(raw)

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

let crcTable: number[] | null = null
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return crc ^ 0xffffffff
}

/** Drop a PNG buffer onto a selector as a simulated file drag-and-drop. */
export async function dropPng(
  page: Page,
  selector: string,
  png: Buffer,
  name = 'screenshot.png'
): Promise<void> {
  await page.evaluate(
    async ({ selector, base64, name }) => {
      const target = document.querySelector(selector)
      if (!target) throw new Error(`No element for selector ${selector}`)
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const file = new File([bytes], name, { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const rect = target.getBoundingClientRect()
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        dataTransfer: dt
      }
      target.dispatchEvent(new DragEvent('dragover', init))
      target.dispatchEvent(new DragEvent('drop', init))
    },
    { selector, base64: png.toString('base64'), name }
  )
}

/** Read the current in-memory project via the app's test hook. */
export async function getProject(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__sbTest.getProject())
}

export async function waitForSaved(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="save-status"]')
      return el?.getAttribute('data-status') === 'saved'
    },
    { timeout: 10000 }
  )
}

/** Convert page-space coordinates to absolute screen coordinates for a canvas. */
export async function pagePointToScreen(
  page: Page,
  canvasSelector: string,
  px: number,
  py: number
): Promise<{ x: number; y: number }> {
  const locator = page.locator(canvasSelector)
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('canvas not found')
  const zoom = parseFloat((await locator.getAttribute('data-zoom')) ?? '1')
  const panX = parseFloat((await locator.getAttribute('data-pan-x')) ?? '0')
  const panY = parseFloat((await locator.getAttribute('data-pan-y')) ?? '0')
  return { x: box.x + panX + px * zoom, y: box.y + panY + py * zoom }
}

export async function dragScreen(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
}

/** Draw with the mouse on a page canvas from (fx1,fy1) to (fx2,fy2) as fractions of the canvas box. */
export async function dragOnCanvas(
  page: Page,
  canvasSelector: string,
  fx1: number,
  fy1: number,
  fx2: number,
  fy2: number
): Promise<void> {
  const locator = page.locator(canvasSelector)
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error('canvas not found')
  const x1 = box.x + box.width * fx1
  const y1 = box.y + box.height * fy1
  const x2 = box.x + box.width * fx2
  const y2 = box.y + box.height * fy2
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 4 })
  await page.mouse.move(x2, y2, { steps: 4 })
  await page.mouse.up()
}
