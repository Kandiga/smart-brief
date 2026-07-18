import { Menu, Tray, nativeImage } from 'electron'
import { displayShortcut } from '../shared/settings'

export interface TrayHooks {
  openApp: () => void
  startCapture: () => void
  openLibrary: () => void
  quit: () => void
}

/**
 * Menu-bar presence for Quick Capture. Created/destroyed according to the
 * menuBarMode setting; the icon is a code-drawn macOS template image (black +
 * alpha only) so it adapts to light/dark menu bars without bundling assets.
 */
export class TrayController {
  private tray: Tray | null = null

  update(enabled: boolean, shortcut: string, hooks: TrayHooks): void {
    if (!enabled) {
      this.destroy()
      return
    }
    if (!this.tray) {
      this.tray = new Tray(buildTemplateIcon())
      this.tray.setToolTip('Smart Brief')
    }
    const menu = Menu.buildFromTemplate([
      { label: 'Open Smart Brief', click: hooks.openApp },
      { label: `Quick Capture (${displayShortcut(shortcut)})`, click: hooks.startCapture },
      { label: 'Library', click: hooks.openLibrary },
      { type: 'separator' },
      { label: 'Quit Smart Brief', click: hooks.quit }
    ])
    this.tray.setContextMenu(menu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

/**
 * Draw the tray glyph in code: a dashed "region" rectangle with a badge dot —
 * the Smart Brief mark. 36×36 raw bitmap rendered at 2×, marked as a template
 * image (only black pixels + alpha) per macOS menu-bar guidelines.
 */
function buildTemplateIcon() {
  const size = 36 // 18pt @2x
  const buf = Buffer.alloc(size * size * 4)
  const put = (x: number, y: number, alpha: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = 0
    buf[i + 1] = 0
    buf[i + 2] = 0
    buf[i + 3] = Math.max(buf[i + 3], Math.round(alpha * 255))
  }
  const rect = { x: 5, y: 7, w: 26, h: 22 }
  // Dashed border, 2px thick, dash pattern 4-on 3-off.
  const dashOn = (t: number) => t % 7 < 4
  for (let t = 0; t < rect.w; t++) {
    if (dashOn(t)) {
      for (const dy of [0, 1]) {
        put(rect.x + t, rect.y + dy, 1)
        put(rect.x + t, rect.y + rect.h - 1 - dy, 1)
      }
    }
  }
  for (let t = 0; t < rect.h; t++) {
    if (dashOn(t)) {
      for (const dx of [0, 1]) {
        put(rect.x + dx, rect.y + t, 1)
        put(rect.x + rect.w - 1 - dx, rect.y + t, 1)
      }
    }
  }
  // Badge dot at the top-left corner.
  const cx = rect.x + 1
  const cy = rect.y + 1
  const r = 6
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d <= r) put(x, y, d > r - 1.2 ? r - d + 0.2 : 1)
    }
  }
  const image = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
  image.setTemplateImage(true)
  return image
}
