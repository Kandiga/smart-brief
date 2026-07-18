import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { writeFileAtomic } from './persistence/atomicFile'
import {
  DEFAULT_SETTINGS,
  isValidCaptureShortcut,
  normalizeSettings,
  type AppSettings
} from '../shared/settings'

/**
 * Single source of truth for app settings. Lives in the main process, persists
 * to an atomic settings.json in userData, and notifies listeners on change so
 * side effects (global shortcut, tray, login item) stay in sync.
 */
export class SettingsStore {
  private settings: AppSettings
  private readonly filePath: string
  private listeners = new Set<(settings: AppSettings) => void>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'settings.json')
    this.settings = this.load()
  }

  private load(): AppSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return normalizeSettings(raw)
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  /**
   * Apply a partial update. Unknown keys are ignored; values are validated by
   * normalizeSettings. Returns the applied settings.
   */
  update(patch: Partial<AppSettings>): AppSettings {
    const merged = normalizeSettings({ ...this.settings, ...sanitizePatch(patch) })
    const changed = JSON.stringify(merged) !== JSON.stringify(this.settings)
    this.settings = merged
    if (changed) {
      this.persist()
      for (const listener of this.listeners) listener(this.get())
    }
    return this.get()
  }

  private persist(): void {
    const snapshot = JSON.stringify(this.settings, null, 2)
    this.writeQueue = this.writeQueue
      .then(() => writeFileAtomic(this.filePath, snapshot))
      .catch(() => undefined)
  }

  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Apply macOS launch-at-login according to current settings. */
  applyLoginItem(): void {
    try {
      app.setLoginItemSettings({ openAtLogin: this.settings.launchAtLogin })
    } catch {
      /* unsigned/dev builds may not support login items; never crash on it */
    }
  }
}

function sanitizePatch(patch: Partial<AppSettings>): Partial<AppSettings> {
  if (!patch || typeof patch !== 'object') return {}
  const out: Partial<AppSettings> = {}
  if ('captureShortcut' in patch && typeof patch.captureShortcut === 'string') {
    // Invalid accelerators are rejected here so a bad patch can't wipe the shortcut.
    if (isValidCaptureShortcut(patch.captureShortcut)) out.captureShortcut = patch.captureShortcut
  }
  if (typeof patch.launchAtLogin === 'boolean') out.launchAtLogin = patch.launchAtLogin
  if (typeof patch.menuBarMode === 'boolean') out.menuBarMode = patch.menuBarMode
  if ('defaultExportDir' in patch) {
    out.defaultExportDir =
      typeof patch.defaultExportDir === 'string' && patch.defaultExportDir.length > 0
        ? patch.defaultExportDir
        : null
  }
  if (typeof patch.cropPadding === 'number') out.cropPadding = patch.cropPadding
  if (typeof patch.includeRegionCrops === 'boolean') out.includeRegionCrops = patch.includeRegionCrops
  if (typeof patch.copyZipPathToClipboard === 'boolean')
    out.copyZipPathToClipboard = patch.copyZipPathToClipboard
  return out
}
