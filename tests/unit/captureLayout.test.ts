import { describe, expect, it } from 'vitest'
import { captureDisplayRect } from '../../src/shared/captureGeometry'

const SCREEN = { width: 1512, height: 982 }

describe('captureDisplayRect', () => {
  it('keeps a comfortable selection exactly where it was captured, at 1:1', () => {
    const selection = { x: 300, y: 250, width: 600, height: 400 }
    const rect = captureDisplayRect(selection, SCREEN.width, SCREEN.height)
    expect(rect).toEqual({ ...selection, scaled: false })
  })

  it('scales down a full-screen capture so it reads as an image, not the desktop', () => {
    // The reported bug: capturing the whole screen showed the desktop 1:1 with
    // no frame and no room for the toolbar.
    const selection = { x: 0, y: 0, width: SCREEN.width, height: SCREEN.height }
    const rect = captureDisplayRect(selection, SCREEN.width, SCREEN.height)
    expect(rect.scaled).toBe(true)
    expect(rect.width).toBeLessThan(SCREEN.width)
    expect(rect.height).toBeLessThan(SCREEN.height)
    // Visible margin on every side, and a clear strip left for the toolbar.
    expect(rect.x).toBeGreaterThan(0)
    expect(rect.y).toBeGreaterThan(0)
    expect(rect.x + rect.width).toBeLessThan(SCREEN.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(SCREEN.height - 80)
  })

  it('preserves the aspect ratio when scaling down', () => {
    const selection = { x: 0, y: 0, width: 3000, height: 1000 }
    const rect = captureDisplayRect(selection, SCREEN.width, SCREEN.height)
    expect(rect.scaled).toBe(true)
    expect(rect.width / rect.height).toBeCloseTo(3, 1)
  })

  it('centres a scaled capture horizontally', () => {
    const selection = { x: 0, y: 0, width: SCREEN.width, height: SCREEN.height }
    const rect = captureDisplayRect(selection, SCREEN.width, SCREEN.height)
    const leftGap = rect.x
    const rightGap = SCREEN.width - (rect.x + rect.width)
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1)
  })

  it('scales a selection that is only too tall', () => {
    const selection = { x: 100, y: 0, width: 400, height: SCREEN.height }
    const rect = captureDisplayRect(selection, SCREEN.width, SCREEN.height)
    expect(rect.scaled).toBe(true)
    expect(rect.height).toBeLessThanOrEqual(SCREEN.height - 80)
  })

  it('never returns a zero or negative size for a tiny selection', () => {
    const rect = captureDisplayRect({ x: 10, y: 10, width: 4, height: 4 }, SCREEN.width, SCREEN.height)
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  })

  it('copes with an implausibly small overlay without producing nonsense', () => {
    const rect = captureDisplayRect({ x: 0, y: 0, width: 800, height: 600 }, 200, 150)
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
    expect(Number.isFinite(rect.x)).toBe(true)
    expect(Number.isFinite(rect.y)).toBe(true)
  })
})
