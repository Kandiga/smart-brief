import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/contracts/ipc'
import type {
  CaptureOpenProjectPayload,
  CapturePermissionPayload,
  CaptureShortcutStatus,
  MenuAction,
  SmartBriefApi
} from '../shared/contracts/ipc'
import type { AppSettings } from '../shared/settings'

function subscribe<T>(channel: string): (cb: (payload: T) => void) => () => void {
  return (cb) => {
    const listener = (_e: unknown, payload: T) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api: SmartBriefApi = {
  listProjects: () => ipcRenderer.invoke(IPC.listProjects),
  getProject: (id) => ipcRenderer.invoke(IPC.getProject, id),
  saveProject: (project, expectedRevision) =>
    ipcRenderer.invoke(IPC.saveProject, project, expectedRevision),
  duplicateProject: (id) => ipcRenderer.invoke(IPC.duplicateProject, id),
  deleteProject: (id) => ipcRenderer.invoke(IPC.deleteProject, id),
  recoveryReport: () => ipcRenderer.invoke(IPC.recoveryReport),
  getAppState: () => ipcRenderer.invoke(IPC.getAppState),
  setAppState: (state) => ipcRenderer.invoke(IPC.setAppState, state),
  importImagesDialog: () => ipcRenderer.invoke(IPC.importImagesDialog),
  saveMediaBuffer: (bytes, name) => ipcRenderer.invoke(IPC.saveMediaBuffer, bytes, name),
  getMediaData: (file) => ipcRenderer.invoke(IPC.getMediaData, file),
  saveThumbnail: (projectId, dataUrl) =>
    ipcRenderer.invoke(IPC.saveThumbnail, projectId, dataUrl),
  exportHtml: (html, defaultName) => ipcRenderer.invoke(IPC.exportHtml, html, defaultName),
  exportJpegParts: (parts, defaultName) =>
    ipcRenderer.invoke(IPC.exportJpegParts, parts, defaultName),
  exportPdf: (html, defaultName) => ipcRenderer.invoke(IPC.exportPdf, html, defaultName),
  exportAiBriefZip: (bytes, defaultName) =>
    ipcRenderer.invoke(IPC.exportAiBriefZip, bytes, defaultName),
  copyImageToClipboard: (dataUrl) => ipcRenderer.invoke(IPC.copyImageToClipboard, dataUrl),
  copyTextToClipboard: (text) => ipcRenderer.invoke(IPC.copyTextToClipboard, text),
  flushDone: () => ipcRenderer.send(IPC.flushDone),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  startCapture: () => ipcRenderer.invoke(IPC.captureStart),
  takePendingCapture: () => ipcRenderer.invoke(IPC.captureTakePending),
  getScreenPermissionStatus: () => ipcRenderer.invoke(IPC.capturePermissionStatus),
  openScreenRecordingSettings: () => ipcRenderer.invoke(IPC.captureOpenScreenSettings),
  captureOverlayInit: () => ipcRenderer.invoke(IPC.captureOverlayInit),
  captureGrabRegion: (rect) => ipcRenderer.invoke(IPC.captureGrabRegion, rect),
  captureFinish: (projectId) => ipcRenderer.send(IPC.captureFinish, projectId),
  captureOverlayCancel: () => ipcRenderer.send(IPC.captureOverlayCancel),
  onMenu: (cb) => {
    const listener = (_e: unknown, action: MenuAction) => cb(action)
    ipcRenderer.on(IPC.menu, listener)
    return () => ipcRenderer.removeListener(IPC.menu, listener)
  },
  onRequestFlush: (cb) => {
    const listener = () => cb()
    ipcRenderer.on(IPC.requestFlush, listener)
    return () => ipcRenderer.removeListener(IPC.requestFlush, listener)
  },
  onSettingsChanged: subscribe<AppSettings>(IPC.settingsChanged),
  onCaptureOpenProject: subscribe<CaptureOpenProjectPayload>(IPC.captureOpenProject),
  onCapturePermissionRequired: subscribe<CapturePermissionPayload>(IPC.capturePermissionRequired),
  onCaptureShortcutStatus: subscribe<CaptureShortcutStatus>(IPC.captureShortcutStatus)
}

contextBridge.exposeInMainWorld('smartBrief', api)
