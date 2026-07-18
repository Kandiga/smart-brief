import { app, BrowserWindow, nativeTheme, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { ProjectRepository } from './persistence/repository'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { IPC } from '../shared/contracts/ipc'
import { SettingsStore } from './settings'
import { CaptureController } from './capture'
import { TrayController } from './tray'

// Test/dev override for the data directory so e2e runs are isolated.
const dataDirOverride = process.env.SMART_BRIEF_DATA_DIR
if (dataDirOverride) {
  app.setPath('userData', dataDirOverride)
}

let mainWindow: BrowserWindow | null = null
let repo: ProjectRepository | null = null
let settings: SettingsStore | null = null
let capture: CaptureController | null = null
const tray = new TrayController()
let quitting = false
const flushBeforeClose = { pending: false, done: null as null | (() => void) }

// Whole-interface zoom level (⌘+/⌘−/⌘0), persisted across launches.
function uiStatePath(): string {
  return path.join(app.getPath('userData'), 'ui-state.json')
}

function loadUiZoom(): number {
  try {
    const raw = JSON.parse(fs.readFileSync(uiStatePath(), 'utf8'))
    return typeof raw.zoomLevel === 'number' ? raw.zoomLevel : 0
  } catch {
    return 0
  }
}

function saveUiZoom(level: number): void {
  try {
    fs.writeFileSync(uiStatePath(), JSON.stringify({ zoomLevel: level }))
  } catch {
    /* purely cosmetic state; never block on it */
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 600,
    title: 'Smart Brief',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    // Match the renderer's light/dark surface so the window never flashes.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#f4f2ee',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  mainWindow = win

  // Flush pending autosaves before the window actually closes.
  win.on('close', (event) => {
    if (flushBeforeClose.pending || win.webContents.isDestroyed()) return
    event.preventDefault()
    flushBeforeClose.pending = true
    const finish = () => {
      flushBeforeClose.done = null
      flushBeforeClose.pending = false
      if (!win.isDestroyed()) win.destroy()
    }
    flushBeforeClose.done = finish
    win.webContents.send(IPC.requestFlush)
    // Fallback: never hang shutdown on a broken renderer.
    setTimeout(finish, 2000)
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Restore the saved interface zoom once the page is ready.
  win.webContents.on('did-finish-load', () => {
    const level = loadUiZoom()
    if (level !== 0) win.webContents.setZoomLevel(level)
  })

  const devUrl = process.env.SMART_BRIEF_DEV_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** Bring up the main window, creating and awaiting its load when needed. */
async function ensureMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  const win = createWindow()
  await new Promise<void>((resolve) => {
    if (!win.webContents.isLoading()) return resolve()
    win.webContents.once('did-finish-load', () => resolve())
  })
  return win
}

function syncTray(): void {
  if (!settings || !capture) return
  const s = settings.get()
  tray.update(s.menuBarMode, s.captureShortcut, {
    openApp: () => {
      void ensureMainWindow().then((win) => {
        win.show()
        win.focus()
      })
    },
    startCapture: () => {
      void capture?.start()
    },
    openLibrary: () => {
      void ensureMainWindow().then((win) => {
        win.show()
        win.focus()
        win.webContents.send(IPC.menu, 'open-library')
      })
    },
    quit: () => app.quit()
  })
}

app.whenReady().then(async () => {
  repo = new ProjectRepository(app.getPath('userData'))
  await repo.recoverProjects()
  settings = new SettingsStore(app.getPath('userData'))

  capture = new CaptureController({
    ensureMainWindow,
    saveMedia: (bytes, name) => repo!.saveMediaBuffer(bytes, name),
    preloadPath: path.join(__dirname, '../preload/preload.cjs')
  })

  // Never allow any renderer to navigate away or open windows.
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      const allowed = process.env.SMART_BRIEF_DEV_URL
      if (!allowed || !url.startsWith(allowed)) event.preventDefault()
    })
  })

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  registerIpc(repo, {
    onFlushDone: () => {
      if (flushBeforeClose.done) flushBeforeClose.done()
    },
    settings,
    capture,
    getMainWindow: () => mainWindow
  })

  // Settings side effects: global shortcut, tray, launch-at-login.
  const applyShortcut = () => {
    const status = capture!.registerShortcut(settings!.get().captureShortcut)
    mainWindow?.webContents.send(IPC.captureShortcutStatus, status)
    return status
  }
  settings.onChange(() => {
    applyShortcut()
    settings!.applyLoginItem()
    syncTray()
    mainWindow?.webContents.send(IPC.settingsChanged, settings!.get())
  })
  applyShortcut()
  settings.applyLoginItem()

  // Support diagnostic: report what the app can actually see and exit. Runs
  // under the real bundle identity, so it reflects the true permission state
  // (unlike `getMediaAccessStatus`, which lies about screen capture).
  if (process.env.SMART_BRIEF_CAPTURE_DIAGNOSTIC) {
    const probe = await capture.probeScreenAccess()
    const report = `SMART_BRIEF_DIAGNOSTIC ${JSON.stringify(probe)}`
    process.stdout.write(`${report}\n`)
    // Also to a file: launched via `open` the app has no usable stdout, and
    // that is the only way to observe it under its own identity (a binary run
    // from a shell inherits the shell as TCC's "responsible process").
    try {
      fs.writeFileSync(path.join(os.tmpdir(), 'smart-brief-diagnostic.json'), report)
    } catch {
      /* diagnostic only */
    }
    app.exit(0)
    return
  }

  buildMenu(() => mainWindow, {
    saveUiZoom,
    startCapture: () => void capture?.start()
  })
  syncTray()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  capture?.dispose()
  tray.destroy()
})

app.on('window-all-closed', () => {
  // Menu-bar mode keeps the app (and the capture shortcut) alive in the
  // background; otherwise closing the last window quits, as before.
  if (quitting || !settings?.get().menuBarMode) {
    app.quit()
  }
})
