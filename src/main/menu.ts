import { app, Menu, BrowserWindow } from 'electron'
import { IPC, type MenuAction } from '../shared/contracts/ipc'

const UI_ZOOM_STEP = 0.5 // Electron zoom levels: factor = 1.2^level
const UI_ZOOM_MIN = -3
const UI_ZOOM_MAX = 3

export function buildMenu(
  getWindow: () => BrowserWindow | null,
  hooks: { saveUiZoom: (level: number) => void; startCapture: () => void }
) {
  const send = (action: MenuAction) => {
    getWindow()?.webContents.send(IPC.menu, action)
  }

  // Whole-interface zoom, like every standard Mac app (⌘+ / ⌘− / ⌘0).
  const zoomUi = (delta: number | null) => {
    const wc = getWindow()?.webContents
    if (!wc) return
    const next =
      delta === null
        ? 0
        : Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, wc.getZoomLevel() + delta))
    wc.setZoomLevel(next)
    hooks.saveUiZoom(next)
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Brief', accelerator: 'CmdOrCtrl+N', click: () => send('new-brief') },
        // Quick Capture's real shortcut is the GLOBAL one (default ⌥B, shown in
        // Settings); registering it here too would double-trigger while focused.
        { label: 'Quick Capture', click: () => hooks.startCapture() },
        { label: 'Import Screenshots…', accelerator: 'CmdOrCtrl+O', click: () => send('open-images') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/redo route through the renderer, which decides between text
        // undo (inside inputs) and canvas history undo.
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { id: 'zoom-in-ui', label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => zoomUi(UI_ZOOM_STEP) },
        // Hidden alias so plain ⌘= (no Shift) also zooms in, like other Mac apps.
        {
          id: 'zoom-in-ui-alias',
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => zoomUi(UI_ZOOM_STEP)
        },
        { id: 'zoom-out-ui', label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => zoomUi(-UI_ZOOM_STEP) },
        { id: 'zoom-reset-ui', label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => zoomUi(null) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.env.SMART_BRIEF_DEV_URL
          ? ([{ role: 'toggleDevTools' }, { role: 'reload' }] as Electron.MenuItemConstructorOptions[])
          : [])
      ]
    },
    { role: 'windowMenu' }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
