import { describe, expect, it } from 'vitest'
import {
  normalizedBounds,
  overlayRectToScreencaptureRegion,
  regionCropBounds
} from '../../src/shared/captureGeometry'

describe('overlayRectToScreencaptureRegion', () => {
  it('offsets a selection by the display origin (primary display)', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 10, y: 20, width: 100, height: 50 },
      { x: 0, y: 0 }
    )
    expect(region).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('normalizes negative-size drags (dragging up and to the left)', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 110, y: 70, width: -100, height: -50 },
      { x: 0, y: 0 }
    )
    expect(region).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('maps to global points on a display to the RIGHT of the primary', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 40, y: 30, width: 200, height: 100 },
      { x: 1512, y: 0 }
    )
    expect(region).toEqual({ x: 1552, y: 30, width: 200, height: 100 })
  })

  it('maps to global points on a display LEFT of the primary (negative origin)', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 40, y: 30, width: 200, height: 100 },
      { x: -1920, y: 0 }
    )
    expect(region).toEqual({ x: -1880, y: 30, width: 200, height: 100 })
  })

  it('maps to global points on a display ABOVE the primary (negative y)', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 10, y: 25, width: 80, height: 60 },
      { x: 0, y: -1080 }
    )
    expect(region).toEqual({ x: 10, y: -1055, width: 80, height: 60 })
  })

  it('rounds fractional pointer coordinates to whole points', () => {
    const region = overlayRectToScreencaptureRegion(
      { x: 10.4, y: 20.6, width: 100.5, height: 50.2 },
      { x: 0, y: 0 }
    )
    expect(Number.isInteger(region.x)).toBe(true)
    expect(Number.isInteger(region.y)).toBe(true)
    expect(Number.isInteger(region.width)).toBe(true)
    expect(Number.isInteger(region.height)).toBe(true)
  })

  it('does NOT apply a scale factor — screencapture takes points, emits pixels', () => {
    // A 200-point selection stays 200 points here; the OS writes 400px on a 2x
    // display. Pre-multiplying would capture a doubled (wrong) area.
    const region = overlayRectToScreencaptureRegion(
      { x: 0, y: 0, width: 200, height: 100 },
      { x: 0, y: 0 }
    )
    expect(region.width).toBe(200)
    expect(region.height).toBe(100)
  })
})

describe('regionCropBounds', () => {
  it('adds padding around the region', () => {
    const crop = regionCropBounds({ x: 100, y: 100, width: 50, height: 40 }, 16, 1000, 1000)
    expect(crop).toEqual({ x: 84, y: 84, width: 82, height: 72 })
  })

  it('clamps padding at the image edges', () => {
    const crop = regionCropBounds({ x: 4, y: 4, width: 50, height: 40 }, 16, 1000, 1000)
    expect(crop).toEqual({ x: 0, y: 0, width: 70, height: 60 })
  })

  it('never exceeds the image on the far edges', () => {
    const crop = regionCropBounds({ x: 960, y: 970, width: 60, height: 60 }, 16, 1000, 1000)
    expect(crop.x + crop.width).toBeLessThanOrEqual(1000)
    expect(crop.y + crop.height).toBeLessThanOrEqual(1000)
  })

  it('handles negative-size regions (resized past their origin)', () => {
    const crop = regionCropBounds({ x: 150, y: 140, width: -50, height: -40 }, 0, 1000, 1000)
    expect(crop).toEqual({ x: 100, y: 100, width: 50, height: 40 })
  })

  it('is independent of any viewport zoom (inputs are source pixels)', () => {
    const region = { x: 200, y: 300, width: 80, height: 60 }
    const a = regionCropBounds(region, 8, 2000, 1500)
    const b = regionCropBounds(region, 8, 2000, 1500)
    expect(a).toEqual(b)
  })
})

describe('normalizedBounds', () => {
  it('normalizes against image dimensions', () => {
    const n = normalizedBounds({ x: 250, y: 250, width: 500, height: 250 }, 1000, 500)
    expect(n).toEqual({ x: 0.25, y: 0.5, width: 0.5, height: 0.5 })
  })

  it('clamps out-of-range values into 0..1', () => {
    const n = normalizedBounds({ x: 900, y: 450, width: 500, height: 500 }, 1000, 500)
    expect(n.x + n.width).toBeLessThanOrEqual(1)
    expect(n.y + n.height).toBeLessThanOrEqual(1)
  })

  it('returns zeros for empty images', () => {
    expect(normalizedBounds({ x: 1, y: 1, width: 1, height: 1 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0
    })
  })
})
