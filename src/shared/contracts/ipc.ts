import type { MediaRef, Project, ProjectMeta } from '../schemas/project'
import type { AppSettings } from '../settings'

// Channel names for the typed, minimal IPC surface.
export const IPC = {
  listProjects: 'repo:listProjects',
  getProject: 'repo:getProject',
  saveProject: 'repo:saveProject',
  duplicateProject: 'repo:duplicateProject',
  deleteProject: 'repo:deleteProject',
  recoveryReport: 'repo:recoveryReport',
  getAppState: 'app:getState',
  setAppState: 'app:setState',
  importImagesDialog: 'media:importDialog',
  saveMediaBuffer: 'media:saveBuffer',
  getMediaData: 'media:getData',
  saveThumbnail: 'media:saveThumbnail',
  exportHtml: 'export:html',
  exportJpegParts: 'export:jpegParts',
  exportPdf: 'export:pdf',
  exportAiBriefZip: 'export:aiBriefZip',
  copyImageToClipboard: 'export:copyImage',
  copyTextToClipboard: 'export:copyText',
  flushDone: 'app:flushDone',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  pickDirectory: 'settings:pickDirectory',
  captureStart: 'capture:start',
  capturePermissionStatus: 'capture:permissionStatus',
  captureOpenScreenSettings: 'capture:openScreenSettings',
  captureTakePending: 'capture:takePending',
  captureOverlayInit: 'capture:overlayInit',
  captureGrabRegion: 'capture:grabRegion',
  captureFinish: 'capture:finish',
  captureOverlayCancel: 'capture:overlayCancel',
  // main -> renderer
  menu: 'menu:action',
  requestFlush: 'app:requestFlush',
  settingsChanged: 'settings:changed',
  captureOpenProject: 'capture:openProject',
  capturePermissionRequired: 'capture:permissionRequired',
  captureShortcutStatus: 'capture:shortcutStatus'
} as const

export interface SaveResult {
  ok: boolean
  revision?: number
  reason?: 'stale' | 'deleted' | 'io-error' | 'invalid'
  message?: string
}

export interface AppState {
  activeProjectId: string | null
}

export interface RecoveryReport {
  corruptFiles: string[]
}

export type MenuAction =
  | 'new-brief'
  | 'open-images'
  | 'save'
  | 'export'
  | 'undo'
  | 'redo'
  | 'open-library'

// --- Quick Capture -----------------------------------------------------------

export type ScreenPermissionStatus =
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unknown'

export interface CaptureStartResult {
  ok: boolean
  reason?: 'permission' | 'busy' | 'unavailable'
}

/** A region grabbed at native resolution and stored in the media directory. */
export interface CaptureGrabResult {
  /** Media filename (already stored through the repository's media dir). */
  file: string
  /** Captured image size in physical pixels. */
  width: number
  height: number
}

/** Told to the main window when an in-overlay capture is finished. */
export interface CaptureOpenProjectPayload {
  projectId: string
}

export interface CaptureShortcutStatus {
  ok: boolean
  shortcut: string
  /** Present when ok is false. */
  reason?: 'conflict' | 'invalid'
}

/** Data the selection overlay needs to render its frozen frame. */
export interface CaptureOverlayInit {
  /** JPEG data URL of the frozen frame (display preview only; grabs are native). */
  previewDataUrl: string
  /** Physical pixel size of the captured frame. */
  imageWidth: number
  imageHeight: number
  /** Display scale factor (image pixels per DIP). */
  scaleFactor: number
  /** Overlay size in DIP (this display's bounds). */
  overlayWidth: number
  overlayHeight: number
}

export interface SetSettingsResult {
  settings: AppSettings
  /** Set when a requested capture shortcut could not be registered. */
  shortcutError?: string
}

export interface SmartBriefApi {
  listProjects(): Promise<ProjectMeta[]>
  getProject(id: string): Promise<Project | null>
  saveProject(project: Project, expectedRevision: number): Promise<SaveResult>
  duplicateProject(id: string): Promise<Project | null>
  deleteProject(id: string): Promise<boolean>
  recoveryReport(): Promise<RecoveryReport>
  getAppState(): Promise<AppState>
  setAppState(state: AppState): Promise<void>
  importImagesDialog(): Promise<MediaRef[]>
  saveMediaBuffer(bytes: ArrayBuffer, name: string): Promise<MediaRef | null>
  getMediaData(file: string): Promise<ArrayBuffer | null>
  saveThumbnail(projectId: string, dataUrl: string): Promise<void>
  exportHtml(html: string, defaultName: string): Promise<string | null>
  exportJpegParts(parts: string[], defaultName: string): Promise<string[] | null>
  exportPdf(html: string, defaultName: string): Promise<string | null>
  exportAiBriefZip(bytes: ArrayBuffer, defaultName: string): Promise<string | null>
  copyImageToClipboard(dataUrl: string): Promise<boolean>
  copyTextToClipboard(text: string): Promise<boolean>
  flushDone(): void
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<SetSettingsResult>
  pickDirectory(): Promise<string | null>
  startCapture(): Promise<CaptureStartResult>
  /**
   * Pull-and-clear the pending capture hand-off. Results are both pushed
   * (onCaptureOpenProject / onCapturePermissionRequired as "check now" pings)
   * and pulled here, so a freshly created window can never miss one.
   */
  takePendingCapture(): Promise<CaptureOpenProjectPayload | 'permission' | null>
  getScreenPermissionStatus(): Promise<ScreenPermissionStatus>
  openScreenRecordingSettings(): Promise<void>
  captureOverlayInit(): Promise<CaptureOverlayInit | null>
  /**
   * Grab the selected region at native resolution while the overlay stays on
   * screen (overlays are excluded from screen capture via content protection).
   * Rect is in overlay-local DIP.
   */
  captureGrabRegion(rect: {
    x: number
    y: number
    width: number
    height: number
  }): Promise<CaptureGrabResult | null>
  /** Hand the finished, annotated capture to the main Smart Brief window. */
  captureFinish(projectId: string): void
  captureOverlayCancel(): void
  onMenu(cb: (action: MenuAction) => void): () => void
  onRequestFlush(cb: () => void): () => void
  onSettingsChanged(cb: (settings: AppSettings) => void): () => void
  onCaptureOpenProject(cb: (payload: CaptureOpenProjectPayload) => void): () => void
  onCapturePermissionRequired(cb: () => void): () => void
  onCaptureShortcutStatus(cb: (status: CaptureShortcutStatus) => void): () => void
}
