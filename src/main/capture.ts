import {
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  type NativeImage,
  type WebContents
} from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import {
  IPC,
  type CaptureGrabResult,
  type CaptureOverlayInit,
  type CaptureShortcutStatus,
  type CaptureStartResult,
  type ScreenPermissionStatus
} from '../shared/contracts/ipc'
import { overlayRectToScreencaptureRegion, type PixelRect } from '../shared/captureGeometry'
import { isValidCaptureShortcut } from '../shared/settings'

// macOS' own screenshot tool. Unlike desktopCapturer thumbnails (which the
// window server renders as a scaled-down preview), this writes the real
// framebuffer pixels — full Retina resolution, pixel for pixel.
const SCREENCAPTURE_BIN = '/usr/sbin/screencapture'

export interface CaptureDeps {
  /** Bring up (creating if needed) and focus the main editor window. */
  ensureMainWindow: () => Promise<BrowserWindow>
  /** Store captured bytes through the repository's official media entry point. */
  saveMedia: (bytes: Buffer, name: string) => Promise<string>
  preloadPath: string
}

interface OverlayEntry {
  window: BrowserWindow
  /** Frozen frame — the backdrop the user selects and annotates over. */
  frame: NativeImage
  /** Image pixels per overlay DIP (effective, from the actual frame size). */
  scaleFactor: number
  /** Global origin of this overlay's display, in points. */
  displayOrigin: { x: number; y: number }
  /** Overlay size in DIP. */
  size: { width: number; height: number }
}

interface CaptureSession {
  /** One overlay per display, keyed by its webContents id. */
  overlays: Map<number, OverlayEntry>
  /** Set once a region is grabbed — the session is now an editing session. */
  annotating: boolean
}

/**
 * Quick Capture controller.
 *
 * The overlay is where the whole capture happens: every display gets a
 * frameless always-on-top window showing that display's frozen frame, the user
 * drags a region, and then annotates it **in place** — the screen context never
 * goes away and the app window is never brought forward. Pressing Done hands
 * the finished project to the main window.
 *
 * Overlays call `setContentProtection(true)`, which excludes them from screen
 * capture, so the region can be grabbed with `screencapture` at native
 * resolution while the overlay stays visible — no hiding, no flicker.
 *
 * Test hook: SMART_BRIEF_FAKE_CAPTURE=1 replaces the OS screen grab with a
 * deterministic synthetic image (and a synthetic frozen frame), so the real
 * overlay flow can be driven end to end without Screen Recording permission.
 */
export class CaptureController {
  private session: CaptureSession | null = null
  private registeredShortcut: string | null = null
  private starting = false
  /** Hand-off that survives main-window (re)creation races. */
  private pending: { projectId: string } | 'permission' | null = null
  /** Screen access proven to work this session; never re-probed once true. */
  private accessVerified = false

  constructor(private deps: CaptureDeps) {}

  takePending(): { projectId: string } | 'permission' | null {
    const pending = this.pending
    this.pending = null
    return pending
  }

  private get fake(): boolean {
    return Boolean(process.env.SMART_BRIEF_FAKE_CAPTURE)
  }

  // --- shortcut ------------------------------------------------------------

  registerShortcut(accelerator: string): CaptureShortcutStatus {
    this.unregisterShortcut()
    if (process.env.SMART_BRIEF_DISABLE_GLOBAL_SHORTCUT) {
      // Test environments opt out of touching the user's real global shortcuts.
      return { ok: true, shortcut: accelerator }
    }
    if (!isValidCaptureShortcut(accelerator)) {
      return { ok: false, shortcut: accelerator, reason: 'invalid' }
    }
    let ok = false
    try {
      ok = globalShortcut.register(accelerator, () => {
        void this.start()
      })
    } catch {
      ok = false
    }
    if (!ok) return { ok: false, shortcut: accelerator, reason: 'conflict' }
    this.registeredShortcut = accelerator
    return { ok: true, shortcut: accelerator }
  }

  unregisterShortcut(): void {
    if (this.registeredShortcut) {
      try {
        globalShortcut.unregister(this.registeredShortcut)
      } catch {
        /* already gone */
      }
      this.registeredShortcut = null
    }
  }

  dispose(): void {
    this.unregisterShortcut()
    this.cancelSession()
  }

  // --- permission ----------------------------------------------------------

  permissionStatus(): ScreenPermissionStatus {
    if (this.fake) return 'granted'
    if (process.platform !== 'darwin') return 'granted'
    try {
      return systemPreferences.getMediaAccessStatus('screen') as ScreenPermissionStatus
    } catch {
      return 'unknown'
    }
  }

  /**
   * Definitively answer "can this app actually capture the screen?".
   *
   * Nothing macOS *reports* can be trusted here: `getMediaAccessStatus` returns
   * "granted" when the permission is not working, and without it the window
   * list still shows desktop furniture (the Dock, desktop widgets), so counting
   * windows misreads that as success too.
   *
   * So we ask the screen itself. A small window is shown in a known spot filled
   * with an unmistakable colour, that exact spot is grabbed, and the pixel is
   * compared. If the grab comes back as whatever was underneath — the wallpaper
   * — then macOS is withholding real content and a capture would be worthless.
   */
  private async screenAccessLooksReal(): Promise<boolean> {
    if (this.accessVerified) return true
    const PROBE = { r: 13, g: 240, b: 121 } // no wallpaper looks like this
    const size = 28
    const display = screen.getPrimaryDisplay()
    const x = display.bounds.x + 6
    const y = display.bounds.y + Math.round(display.bounds.height / 2)

    const probeWindow = new BrowserWindow({
      x,
      y,
      width: size,
      height: size,
      frame: false,
      show: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      backgroundColor: '#0df079',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    probeWindow.setAlwaysOnTop(true, 'screen-saver')
    try {
      await probeWindow.loadURL(
        'data:text/html,<body style="margin:0;background:%230df079;width:100%25;height:100%25"></body>'
      )
      probeWindow.showInactive()
      await new Promise((resolve) => setTimeout(resolve, 220))
      const png = await grabRegionAtNativeResolution({
        x: x + 8,
        y: y + 8,
        width: 8,
        height: 8
      })
      if (!png) return false
      const bitmap = nativeImage.createFromBuffer(png).toBitmap() // BGRA
      if (bitmap.length < 4) return false
      const b = bitmap[0]
      const g = bitmap[1]
      const r = bitmap[2]
      const matches =
        Math.abs(r - PROBE.r) < 40 && Math.abs(g - PROBE.g) < 40 && Math.abs(b - PROBE.b) < 40
      this.accessVerified = matches
      return matches
    } catch {
      return false
    } finally {
      if (!probeWindow.isDestroyed()) probeWindow.destroy()
    }
  }

  /**
   * What the app can actually see. Without Screen Recording permission macOS
   * hides other applications' windows from `desktopCapturer` entirely (and
   * strips their pixels out of any capture), so "no window from any other app"
   * is a decisive signal — a Mac in normal use always has some.
   */
  async probeScreenAccess(): Promise<{
    reportedStatus: ScreenPermissionStatus
    canReallyCapture: boolean
    totalWindows: number
    usableWindows: number
    sampleNames: string[]
  }> {
    const reportedStatus = this.permissionStatus()
    const canReallyCapture = await this.screenAccessLooksReal()
    try {
      const windows = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1, height: 1 }
      })
      const others = windows.filter(
        (w) => (w.name ?? '').trim().length > 0 && !/^Smart Brief/i.test(w.name ?? '')
      )
      return {
        reportedStatus,
        canReallyCapture,
        totalWindows: windows.length,
        usableWindows: others.length,
        sampleNames: others.slice(0, 5).map((w) => w.name)
      }
    } catch {
      return { reportedStatus, canReallyCapture, totalWindows: 0, usableWindows: 0, sampleNames: [] }
    }
  }

  async openScreenRecordingSettings(): Promise<void> {
    await shell
      .openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      .catch(() => undefined)
  }

  // --- session lifecycle ---------------------------------------------------

  async start(): Promise<CaptureStartResult> {
    if (this.starting) return { ok: false, reason: 'busy' }
    this.starting = true
    try {
      // A new trigger during an open session restarts the capture cleanly.
      this.cancelSession()

      if (!this.fake) {
        const status = this.permissionStatus()
        // getMediaAccessStatus is not trustworthy for screen capture — it keeps
        // reporting "granted" when macOS is actually withholding every other
        // app's pixels. Trust what we can really see instead, so the user is
        // never handed a picture of their own empty wallpaper.
        if (!(await this.screenAccessLooksReal())) {
          // Asking for a screen source registers the app in the macOS Screen
          // Recording list (and raises the system prompt the first time), so
          // there is something for the user to switch on.
          void desktopCapturer
            .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
            .catch(() => undefined)
          return this.reportPermissionProblem(status === 'granted' ? 'stale' : 'missing')
        }
      }

      const displays = screen.getAllDisplays()
      const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      const frames = new Map<number, NativeImage>()
      for (const display of displays) {
        const frame = await this.freezeDisplay(display).catch(() => null)
        if (frame && !frame.isEmpty()) frames.set(display.id, frame)
      }
      if (frames.size === 0) {
        return this.reportPermissionProblem()
      }

      const session: CaptureSession = { overlays: new Map(), annotating: false }
      this.session = session

      for (const display of displays) {
        const frame = frames.get(display.id)
        if (!frame) continue
        const overlay = this.createOverlayWindow(display)
        const frameSize = frame.getSize()
        session.overlays.set(overlay.webContents.id, {
          window: overlay,
          frame,
          scaleFactor: frameSize.width / display.bounds.width,
          displayOrigin: { x: display.bounds.x, y: display.bounds.y },
          size: { width: display.bounds.width, height: display.bounds.height }
        })

        overlay.on('closed', () => {
          if (this.session === session) {
            session.overlays.delete(overlay.webContents.id)
            if (session.overlays.size === 0) this.session = null
          }
        })
        // While selecting, focus leaving the capture cancels it. Once the user
        // is annotating, they may click other apps (or a composer); never throw
        // their work away for a focus change.
        overlay.on('blur', () => {
          setTimeout(() => {
            if (this.session !== session || session.annotating) return
            const anyFocused = [...session.overlays.values()].some(
              (e) => !e.window.isDestroyed() && e.window.isFocused()
            )
            if (!anyFocused) this.cancelSession()
          }, 150)
        })
      }

      const devUrl = process.env.SMART_BRIEF_DEV_URL
      for (const entry of session.overlays.values()) {
        if (devUrl) {
          await entry.window.loadURL(new URL('capture.html', devUrl).toString())
        } else {
          await entry.window.loadFile(path.join(__dirname, '../renderer/capture.html'))
        }
      }
      if (this.session !== session) {
        // Cancelled while loading (e.g. shortcut pressed again).
        return { ok: false, reason: 'busy' }
      }
      for (const entry of session.overlays.values()) {
        entry.window.show()
      }
      // The display under the cursor gets keyboard focus (Esc works there
      // immediately; clicking any other overlay focuses it).
      const cursorEntry = [...session.overlays.values()].find(
        (e) =>
          e.displayOrigin.x === cursorDisplay.bounds.x &&
          e.displayOrigin.y === cursorDisplay.bounds.y
      )
      ;(cursorEntry ?? [...session.overlays.values()][0])?.window.focus()
      return { ok: true }
    } catch {
      this.cancelSession()
      return { ok: false, reason: 'unavailable' }
    } finally {
      this.starting = false
    }
  }

  private createOverlayWindow(display: Electron.Display): BrowserWindow {
    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      backgroundColor: '#000000',
      webPreferences: {
        preload: this.deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    })
    overlay.setAlwaysOnTop(true, 'screen-saver')
    // Excluded from screen capture, so `screencapture` sees the real screen
    // underneath and the overlay never photographs itself.
    overlay.setContentProtection(true)
    return overlay
  }

  private async reportPermissionProblem(
    kind: 'missing' | 'stale' = 'missing'
  ): Promise<CaptureStartResult> {
    this.pending = 'permission'
    const win = await this.deps.ensureMainWindow()
    win.show()
    win.focus()
    win.webContents.send(IPC.capturePermissionRequired, { kind })
    return { ok: false, reason: 'permission' }
  }

  /** Frozen backdrop for the overlay (a preview; grabs go through screencapture). */
  private async freezeDisplay(display: Electron.Display): Promise<NativeImage | null> {
    if (this.fake) {
      return syntheticFrame(
        Math.round(display.bounds.width * display.scaleFactor),
        Math.round(display.bounds.height * display.scaleFactor)
      )
    }
    const width = Math.round(display.bounds.width * display.scaleFactor)
    const height = Math.round(display.bounds.height * display.scaleFactor)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })
    if (sources.length === 0) return null
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    return source.thumbnail
  }

  cancelSession(): void {
    const session = this.session
    this.session = null
    if (!session) return
    for (const entry of session.overlays.values()) {
      if (!entry.window.isDestroyed()) entry.window.destroy()
    }
    session.overlays.clear()
  }

  // --- overlay IPC ---------------------------------------------------------

  private entryFor(sender: WebContents): OverlayEntry | null {
    return this.session?.overlays.get(sender.id) ?? null
  }

  handleOverlayInit(sender: WebContents): CaptureOverlayInit | null {
    const entry = this.entryFor(sender)
    if (!entry) return null
    const size = entry.frame.getSize()
    return {
      previewDataUrl: `data:image/jpeg;base64,${entry.frame.toJPEG(90).toString('base64')}`,
      imageWidth: size.width,
      imageHeight: size.height,
      scaleFactor: entry.scaleFactor,
      overlayWidth: entry.size.width,
      overlayHeight: entry.size.height
    }
  }

  /**
   * Grab the selected region at native resolution and store it as media. The
   * overlay stays on screen throughout (content protection keeps it out of the
   * shot), and the other displays' overlays are dismissed since the capture is
   * now bound to this one.
   */
  async handleGrabRegion(
    sender: WebContents,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<CaptureGrabResult | null> {
    const session = this.session
    const entry = this.entryFor(sender)
    if (!session || !entry) return null
    const region = overlayRectToScreencaptureRegion(rect, entry.displayOrigin)
    if (region.width < 2 || region.height < 2) return null

    session.annotating = true
    // Close the other displays' overlays; annotation happens on this one.
    for (const [id, other] of session.overlays) {
      if (other === entry) continue
      if (!other.window.isDestroyed()) other.window.destroy()
      session.overlays.delete(id)
    }

    const png = this.fake
      ? syntheticFrame(
          Math.round(region.width * entry.scaleFactor),
          Math.round(region.height * entry.scaleFactor)
        ).toPNG()
      : await grabRegionAtNativeResolution(region)
    if (!png) return null

    const size = nativeImage.createFromBuffer(png).getSize()
    if (size.width < 1 || size.height < 1) return null
    const file = await this.deps.saveMedia(png, 'capture.png')
    return { file, width: size.width, height: size.height }
  }

  /** The user pressed Done: hand the finished project to the main window. */
  async handleFinish(sender: WebContents, projectId: string): Promise<void> {
    if (!this.entryFor(sender)) return
    this.cancelSession()
    this.pending = { projectId }
    const win = await this.deps.ensureMainWindow()
    win.show()
    win.focus()
    win.webContents.send(IPC.captureOpenProject, { projectId })
  }

  handleOverlayCancel(sender: WebContents): void {
    // Esc / Cancel on any overlay ends the whole capture session.
    if (this.entryFor(sender)) this.cancelSession()
  }
}

/**
 * Grab a screen region with macOS' `screencapture`, which writes the actual
 * framebuffer at native (Retina) resolution. `-x` silences the shutter sound;
 * the cursor is excluded unless `-C` is passed. Resolves null on any failure.
 */
function grabRegionAtNativeResolution(region: PixelRect): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const tempPath = path.join(
      os.tmpdir(),
      `smart-brief-capture-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`
    )
    execFile(
      SCREENCAPTURE_BIN,
      ['-x', '-R', `${region.x},${region.y},${region.width},${region.height}`, tempPath],
      (error) => {
        if (error) {
          resolve(null)
          return
        }
        try {
          const bytes = fs.readFileSync(tempPath)
          resolve(bytes.byteLength > 0 ? bytes : null)
        } catch {
          resolve(null)
        } finally {
          fs.rm(tempPath, { force: true }, () => undefined)
        }
      }
    )
  })
}

/** Deterministic stand-in image for tests (no Screen Recording permission). */
function syntheticFrame(width: number, height: number): NativeImage {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const raw = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      raw[i] = (x * 255) / w // B
      raw[i + 1] = (y * 255) / h // G
      raw[i + 2] = 180 // R
      raw[i + 3] = 255 // A
    }
  }
  return nativeImage.createFromBitmap(raw, { width: w, height: h })
}
