import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '@shared/settings'
import { CROP_PADDING_MAX, CROP_PADDING_MIN, displayShortcut } from '@shared/settings'
import { useUiStore } from '../stores/uiStore'

/**
 * Real settings. The main-process SettingsStore is the SSOT; this dialog reads
 * a snapshot, applies patches over IPC, and re-syncs from the store's answer
 * (so a rejected shortcut visibly keeps the old one, with an explanation).
 */
export function SettingsDialog() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const shortcutButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    void window.smartBrief.getSettings().then(setSettings)
    return window.smartBrief.onSettingsChanged(setSettings)
  }, [])

  const apply = useCallback(async (patch: Partial<AppSettings>) => {
    setShortcutError(null)
    const result = await window.smartBrief.setSettings(patch)
    setSettings(result.settings)
    if (result.shortcutError) setShortcutError(result.shortcutError)
  }, [])

  // Record a new shortcut: next modifier+key press while "recording".
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        setRecording(false)
        return
      }
      const mods: string[] = []
      if (e.metaKey) mods.push('Command')
      if (e.ctrlKey) mods.push('Control')
      if (e.altKey) mods.push('Alt')
      if (e.shiftKey) mods.push('Shift')
      const key = normalizeKey(e)
      if (!key || mods.length === 0) return // wait for a complete modifier+key chord
      setRecording(false)
      void apply({ captureShortcut: [...mods, key].join('+') })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, apply])

  const pickExportDir = async () => {
    const dir = await window.smartBrief.pickDirectory()
    if (dir) void apply({ defaultExportDir: dir })
  }

  if (!settings) return null

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Settings">
      <div className="modal settings-modal" data-testid="settings-dialog">
        <h3>Settings</h3>

        <section className="settings-section">
          <h4>Quick Capture</h4>
          <div className="settings-row">
            <label htmlFor="capture-shortcut">Capture shortcut</label>
            <button
              id="capture-shortcut"
              ref={shortcutButtonRef}
              className={`bar-button shortcut-button${recording ? ' recording' : ''}`}
              data-testid="settings-shortcut"
              onClick={() => setRecording(!recording)}
              title="Click, then press the new shortcut (Esc to cancel)"
            >
              {recording ? 'Press shortcut…' : displayShortcut(settings.captureShortcut)}
            </button>
          </div>
          {shortcutError && (
            <p className="settings-error" role="alert" data-testid="settings-shortcut-error">
              {shortcutError}
            </p>
          )}
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.menuBarMode}
              onChange={(e) => void apply({ menuBarMode: e.target.checked })}
            />
            Keep Smart Brief in the menu bar (capture works with the window closed)
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(e) => void apply({ launchAtLogin: e.target.checked })}
            />
            Launch at login
          </label>
        </section>

        <section className="settings-section">
          <h4>Export</h4>
          <div className="settings-row">
            <label>Default export folder</label>
            <div className="settings-inline">
              <span className="settings-path" title={settings.defaultExportDir ?? ''}>
                {settings.defaultExportDir ?? 'Ask every time'}
              </span>
              <button className="bar-button" onClick={() => void pickExportDir()}>
                Choose…
              </button>
              {settings.defaultExportDir && (
                <button className="bar-button" onClick={() => void apply({ defaultExportDir: null })}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.includeRegionCrops}
              onChange={(e) => void apply({ includeRegionCrops: e.target.checked })}
            />
            Include region crops in AI Brief ZIP
          </label>
          <div className="settings-row">
            <label htmlFor="crop-padding">Region crop padding</label>
            <div className="settings-inline">
              <input
                id="crop-padding"
                type="number"
                className="settings-number"
                min={CROP_PADDING_MIN}
                max={CROP_PADDING_MAX}
                value={settings.cropPadding}
                onChange={(e) => void apply({ cropPadding: Number(e.target.value) })}
              />
              <span className="settings-hint">px around each region</span>
            </div>
          </div>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.copyZipPathToClipboard}
              onChange={(e) => void apply({ copyZipPathToClipboard: e.target.checked })}
            />
            Copy the ZIP’s path to the clipboard after export
          </label>
        </section>

        <p className="settings-line">
          Smart Brief is local-first: briefs, screenshots and exports never leave this Mac unless
          you share them yourself. Animations follow the system “Reduce Motion” preference.
        </p>

        <div className="modal-actions">
          <button className="bar-button" onClick={() => setSettingsOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function normalizeKey(e: KeyboardEvent): string | null {
  const key = e.key
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn', 'Dead'].includes(key)) return null
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase()
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  const named: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown'
  }
  if (named[key]) return named[key]
  if (key.length === 1) return key
  return null
}
