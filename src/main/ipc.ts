import { ipcMain, dialog, BrowserWindow, app, clipboard, nativeImage } from 'electron'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { IPC, type AppState, type SetSettingsResult } from '../shared/contracts/ipc'
import type { ProjectRepository } from './persistence/repository'
import type { SettingsStore } from './settings'
import type { CaptureController } from './capture'
import type { AppSettings } from '../shared/settings'
import { writeFileAtomic, readJson } from './persistence/atomicFile'
import { exportHtmlFile, exportJpegParts, exportPdfFile, exportZipFile } from './exporters'

const MAX_MEDIA_BYTES = 200 * 1024 * 1024
const MAX_TEXT_BYTES = 100 * 1024 * 1024
export const MAX_EXPORT_ZIP_BYTES = MAX_TEXT_BYTES

interface IpcHooks {
  onFlushDone: () => void
  settings: SettingsStore
  capture: CaptureController
  getMainWindow: () => BrowserWindow | null
}

export function registerIpc(repo: ProjectRepository, hooks: IpcHooks) {
  const appStatePath = path.join(app.getPath('userData'), 'app-state.json')

  ipcMain.handle(IPC.listProjects, () => repo.listProjects())

  ipcMain.handle(IPC.getProject, (_e, id: unknown) => {
    if (typeof id !== 'string') return null
    return repo.getProject(id)
  })

  ipcMain.handle(IPC.saveProject, (_e, project: unknown, expectedRevision: unknown) => {
    if (!project || typeof project !== 'object' || typeof expectedRevision !== 'number') {
      return { ok: false, reason: 'invalid' }
    }
    return repo.saveProject(project as any, expectedRevision)
  })

  ipcMain.handle(IPC.duplicateProject, (_e, id: unknown) => {
    if (typeof id !== 'string') return null
    return repo.duplicateProject(id)
  })

  ipcMain.handle(IPC.deleteProject, (_e, id: unknown) => {
    if (typeof id !== 'string') return false
    return repo.deleteProject(id)
  })

  ipcMain.handle(IPC.recoveryReport, () => repo.getRecoveryReport())

  ipcMain.handle(IPC.getAppState, async (): Promise<AppState> => {
    const raw = await readJson(appStatePath)
    return { activeProjectId: typeof raw?.activeProjectId === 'string' ? raw.activeProjectId : null }
  })

  ipcMain.handle(IPC.setAppState, async (_e, state: unknown) => {
    const s = state as AppState
    if (!s || typeof s !== 'object') return
    await writeFileAtomic(
      appStatePath,
      JSON.stringify({ activeProjectId: typeof s.activeProjectId === 'string' ? s.activeProjectId : null })
    )
  })

  ipcMain.handle(IPC.importImagesDialog, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Import screenshots',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }]
    })
    if (result.canceled) return []
    const refs = []
    for (const filePath of result.filePaths) {
      try {
        const bytes = await fsp.readFile(filePath)
        if (bytes.byteLength > MAX_MEDIA_BYTES) continue
        const file = await repo.saveMediaBuffer(bytes, path.basename(filePath))
        refs.push({ file, width: 0, height: 0 })
      } catch {
        continue
      }
    }
    return refs
  })

  ipcMain.handle(IPC.saveMediaBuffer, async (_e, bytes: unknown, name: unknown) => {
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return null
    if (typeof name !== 'string') return null
    const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : (bytes as Uint8Array))
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_MEDIA_BYTES) return null
    const file = await repo.saveMediaBuffer(buffer, path.basename(name))
    return { file, width: 0, height: 0 }
  })

  ipcMain.handle(IPC.getMediaData, async (_e, file: unknown) => {
    if (typeof file !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(file) || file.includes('..')) {
      return null
    }
    try {
      const bytes = await fsp.readFile(path.join(repo.mediaDir, file))
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.saveThumbnail, async (_e, projectId: unknown, dataUrl: unknown) => {
    if (typeof projectId !== 'string' || typeof dataUrl !== 'string') return
    if (repo.isDeleted(projectId)) return
    const match = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/)
    if (!match) return
    const buffer = Buffer.from(match[1], 'base64')
    if (buffer.byteLength > 5 * 1024 * 1024) return
    await fsp.writeFile(repo.thumbnailPath(projectId), buffer)
  })

  ipcMain.handle(IPC.exportHtml, async (event, html: unknown, defaultName: unknown) => {
    if (typeof html !== 'string' || typeof defaultName !== 'string') return null
    if (Buffer.byteLength(html) > MAX_TEXT_BYTES) return null
    return exportHtmlFile(BrowserWindow.fromWebContents(event.sender), html, defaultName)
  })

  ipcMain.handle(IPC.exportJpegParts, async (event, parts: unknown, defaultName: unknown) => {
    if (!Array.isArray(parts) || typeof defaultName !== 'string') return null
    if (!parts.every((p) => typeof p === 'string')) return null
    return exportJpegParts(BrowserWindow.fromWebContents(event.sender), parts, defaultName)
  })

  ipcMain.handle(IPC.exportPdf, async (event, html: unknown, defaultName: unknown) => {
    if (typeof html !== 'string' || typeof defaultName !== 'string') return null
    if (Buffer.byteLength(html) > MAX_TEXT_BYTES) return null
    return exportPdfFile(BrowserWindow.fromWebContents(event.sender), html, defaultName)
  })

  ipcMain.handle(IPC.copyImageToClipboard, (_e, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(dataUrl)) {
      return false
    }
    if (Buffer.byteLength(dataUrl) > MAX_TEXT_BYTES) return false
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) return false
    clipboard.writeImage(image)
    return true
  })

  ipcMain.on(IPC.flushDone, () => hooks.onFlushDone())

  // --- settings --------------------------------------------------------------

  ipcMain.handle(IPC.getSettings, () => hooks.settings.get())

  ipcMain.handle(IPC.setSettings, (_e, patch: unknown): SetSettingsResult => {
    if (!patch || typeof patch !== 'object') {
      return { settings: hooks.settings.get() }
    }
    const p = patch as Partial<AppSettings>
    const current = hooks.settings.get()
    // A shortcut change is applied only if the new accelerator actually
    // registers; otherwise the old one is restored and the error is returned.
    if (
      typeof p.captureShortcut === 'string' &&
      p.captureShortcut !== current.captureShortcut
    ) {
      const status = hooks.capture.registerShortcut(p.captureShortcut)
      if (!status.ok) {
        hooks.capture.registerShortcut(current.captureShortcut)
        const rest = { ...p }
        delete rest.captureShortcut
        const settings = hooks.settings.update(rest)
        return {
          settings,
          shortcutError:
            status.reason === 'conflict'
              ? `"${p.captureShortcut}" is already taken by another app. The previous shortcut was kept.`
              : `"${p.captureShortcut}" is not a valid shortcut (use one or more modifiers plus a key).`
        }
      }
    }
    return { settings: hooks.settings.update(p) }
  })

  ipcMain.handle(IPC.pickDirectory, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose export folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // --- Quick Capture ---------------------------------------------------------

  ipcMain.handle(IPC.captureStart, () => hooks.capture.start())
  // Deliberately NOT getMediaAccessStatus: that reports "granted" while macOS
  // withholds every other app's pixels. Only a real capture settles it.
  ipcMain.handle(IPC.capturePermissionStatus, async () =>
    (await hooks.capture.recheckScreenAccess()) ? 'granted' : 'denied'
  )
  ipcMain.handle(IPC.captureOpenScreenSettings, () => hooks.capture.openScreenRecordingSettings())
  ipcMain.handle(IPC.captureTakePending, () => hooks.capture.takePending())

  ipcMain.handle(IPC.captureOverlayInit, (event) => hooks.capture.handleOverlayInit(event.sender))

  ipcMain.handle(IPC.captureGrabRegion, (event, rect: unknown) => {
    const r = rect as { x: number; y: number; width: number; height: number }
    if (
      !r ||
      typeof r !== 'object' ||
      ![r.x, r.y, r.width, r.height].every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      return null
    }
    return hooks.capture.handleGrabRegion(event.sender, {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height
    })
  })

  ipcMain.on(IPC.captureFinish, (event, projectId: unknown) => {
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(projectId)) return
    void hooks.capture.handleFinish(event.sender, projectId)
  })

  ipcMain.on(IPC.captureOverlayCancel, (event) => hooks.capture.handleOverlayCancel(event.sender))

  // --- AI Brief ZIP ----------------------------------------------------------

  ipcMain.handle(IPC.exportAiBriefZip, async (event, bytes: unknown, defaultName: unknown) => {
    if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return null
    if (typeof defaultName !== 'string') return null
    const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : (bytes as Uint8Array))
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_EXPORT_ZIP_BYTES) return null
    return exportZipFile(
      BrowserWindow.fromWebContents(event.sender),
      buffer,
      path.basename(defaultName),
      hooks.settings.get().defaultExportDir
    )
  })

  ipcMain.handle(IPC.copyTextToClipboard, (_e, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 4096) return false
    clipboard.writeText(text)
    return true
  })
}
