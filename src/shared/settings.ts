// Typed app settings. The main-process SettingsStore is the single source of
// truth; the renderer receives validated copies over IPC and never writes the
// file itself.

export interface AppSettings {
  /** Electron accelerator for the global Quick Capture shortcut. */
  captureShortcut: string
  launchAtLogin: boolean
  /** Keep a menu-bar (tray) item and stay alive when the window closes. */
  menuBarMode: boolean
  /** Export save dialogs start here; null = system default (last used). */
  defaultExportDir: string | null
  /** Padding in source pixels around region crops in the AI Brief ZIP. */
  cropPadding: number
  includeRegionCrops: boolean
  /** Copy the exported ZIP's path to the clipboard after export. */
  copyZipPathToClipboard: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  captureShortcut: 'Alt+B',
  launchAtLogin: false,
  menuBarMode: true,
  defaultExportDir: null,
  cropPadding: 16,
  includeRegionCrops: true,
  copyZipPathToClipboard: false
}

export const CROP_PADDING_MIN = 0
export const CROP_PADDING_MAX = 64

const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'Shift', 'Super', 'Meta'])

/**
 * A valid capture shortcut is 1+ modifiers plus exactly one non-modifier key,
 * e.g. "Alt+B". Single bare keys are rejected (they would swallow typing).
 */
export function isValidCaptureShortcut(accelerator: string): boolean {
  if (typeof accelerator !== 'string' || accelerator.length === 0 || accelerator.length > 64) {
    return false
  }
  const parts = accelerator.split('+')
  if (parts.some((p) => p.length === 0)) return false
  const mods = parts.filter((p) => MODIFIERS.has(p))
  const keys = parts.filter((p) => !MODIFIERS.has(p))
  if (mods.length < 1 || keys.length !== 1) return false
  // A single printable key, F-key, or named key.
  return /^([A-Za-z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Return|Enter|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|[`~!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|])$/.test(
    keys[0]
  )
}

/** Validate + normalize a raw (possibly partial / foreign) settings payload. */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clampPadding = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(CROP_PADDING_MAX, Math.max(CROP_PADDING_MIN, Math.round(v)))
      : DEFAULT_SETTINGS.cropPadding
  return {
    captureShortcut:
      typeof r.captureShortcut === 'string' && isValidCaptureShortcut(r.captureShortcut)
        ? r.captureShortcut
        : DEFAULT_SETTINGS.captureShortcut,
    launchAtLogin: typeof r.launchAtLogin === 'boolean' ? r.launchAtLogin : DEFAULT_SETTINGS.launchAtLogin,
    menuBarMode: typeof r.menuBarMode === 'boolean' ? r.menuBarMode : DEFAULT_SETTINGS.menuBarMode,
    defaultExportDir:
      typeof r.defaultExportDir === 'string' && r.defaultExportDir.length > 0
        ? r.defaultExportDir
        : null,
    cropPadding: clampPadding(r.cropPadding),
    includeRegionCrops:
      typeof r.includeRegionCrops === 'boolean'
        ? r.includeRegionCrops
        : DEFAULT_SETTINGS.includeRegionCrops,
    copyZipPathToClipboard:
      typeof r.copyZipPathToClipboard === 'boolean'
        ? r.copyZipPathToClipboard
        : DEFAULT_SETTINGS.copyZipPathToClipboard
  }
}

/** Human-readable form of an accelerator for macOS UI (⌥B, ⇧⌘E, …). */
export function displayShortcut(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      switch (part) {
        case 'Command':
        case 'Cmd':
        case 'CommandOrControl':
        case 'CmdOrCtrl':
        case 'Meta':
        case 'Super':
          return '⌘'
        case 'Control':
        case 'Ctrl':
          return '⌃'
        case 'Alt':
        case 'Option':
          return '⌥'
        case 'Shift':
          return '⇧'
        case 'Space':
          return '␣'
        default:
          return part.length === 1 ? part.toUpperCase() : part
      }
    })
    .join('')
}
