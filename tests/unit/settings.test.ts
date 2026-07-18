import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  displayShortcut,
  isValidCaptureShortcut,
  normalizeSettings
} from '../../src/shared/settings'

describe('isValidCaptureShortcut', () => {
  it('accepts modifier + single key', () => {
    expect(isValidCaptureShortcut('Alt+B')).toBe(true)
    expect(isValidCaptureShortcut('Command+Shift+5')).toBe(true)
    expect(isValidCaptureShortcut('Control+F6')).toBe(true)
  })

  it('rejects bare keys (they would swallow typing)', () => {
    expect(isValidCaptureShortcut('B')).toBe(false)
    expect(isValidCaptureShortcut('F5')).toBe(false)
  })

  it('rejects malformed accelerators', () => {
    expect(isValidCaptureShortcut('')).toBe(false)
    expect(isValidCaptureShortcut('Alt+')).toBe(false)
    expect(isValidCaptureShortcut('Alt+B+C')).toBe(false)
    expect(isValidCaptureShortcut('Alt')).toBe(false)
    expect(isValidCaptureShortcut('NotAModifier+B')).toBe(false)
  })
})

describe('normalizeSettings', () => {
  it('returns defaults for garbage input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({ captureShortcut: 42, cropPadding: 'big' })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values and fixes invalid ones', () => {
    const s = normalizeSettings({
      captureShortcut: 'Command+Shift+X',
      cropPadding: 999,
      launchAtLogin: true,
      defaultExportDir: '',
      unknownKey: 'ignored'
    })
    expect(s.captureShortcut).toBe('Command+Shift+X')
    expect(s.cropPadding).toBe(64) // clamped to max
    expect(s.launchAtLogin).toBe(true)
    expect(s.defaultExportDir).toBeNull()
    expect('unknownKey' in s).toBe(false)
  })

  it('rejects an invalid shortcut back to the default', () => {
    expect(normalizeSettings({ captureShortcut: 'B' }).captureShortcut).toBe('Alt+B')
  })

  it('clamps and rounds crop padding', () => {
    expect(normalizeSettings({ cropPadding: -5 }).cropPadding).toBe(0)
    expect(normalizeSettings({ cropPadding: 12.7 }).cropPadding).toBe(13)
  })
})

describe('displayShortcut', () => {
  it('renders macOS symbols', () => {
    expect(displayShortcut('Alt+B')).toBe('⌥B')
    expect(displayShortcut('Command+Shift+E')).toBe('⌘⇧E')
    expect(displayShortcut('Control+F6')).toBe('⌃F6')
  })
})
