import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  fitToView,
  normalizeRect,
  pageToScreen,
  screenToPage,
  thinPoints,
  zoomAt
} from '../../src/shared/geometry'

describe('coordinate transforms', () => {
  const views = [
    { zoom: 1, pan: { x: 0, y: 0 } },
    { zoom: 0.25, pan: { x: 120, y: -40 } },
    { zoom: 3.5, pan: { x: -300.5, y: 77.25 } }
  ]

  it('screenToPage and pageToScreen are inverse at every zoom level', () => {
    for (const view of views) {
      for (const point of [
        { x: 0, y: 0 },
        { x: 512.5, y: 384.25 },
        { x: -50, y: 900 }
      ]) {
        const roundTrip = pageToScreen(screenToPage(point, view), view)
        expect(roundTrip.x).toBeCloseTo(point.x, 6)
        expect(roundTrip.y).toBeCloseTo(point.y, 6)
      }
    }
  })

  it('a page point maps to expected screen coordinates', () => {
    const view = { zoom: 2, pan: { x: 10, y: 20 } }
    expect(pageToScreen({ x: 100, y: 50 }, view)).toEqual({ x: 210, y: 120 })
  })

  it('zoomAt keeps the anchor screen point stationary', () => {
    const view = { zoom: 1, pan: { x: 0, y: 0 } }
    const anchor = { x: 400, y: 300 }
    const pageBefore = screenToPage(anchor, view)
    const zoomed = zoomAt(view, anchor, 2.5)
    const pageAfter = screenToPage(anchor, zoomed)
    expect(pageAfter.x).toBeCloseTo(pageBefore.x, 6)
    expect(pageAfter.y).toBeCloseTo(pageBefore.y, 6)
  })

  it('fitToView centers and fully contains the page', () => {
    const view = fitToView(3000, 2000, 1000, 700)
    expect(view.zoom).toBeLessThan(1)
    // page fits inside viewport
    expect(3000 * view.zoom).toBeLessThanOrEqual(1000)
    expect(2000 * view.zoom).toBeLessThanOrEqual(700)
    // centered
    expect(view.pan.x).toBeCloseTo((1000 - 3000 * view.zoom) / 2, 5)
  })

  it('clampZoom bounds extremes', () => {
    expect(clampZoom(100)).toBe(40)
    expect(clampZoom(0.0001)).toBe(0.02)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('normalizeRect handles reversed drags', () => {
    expect(normalizeRect(10, 10, 2, 4)).toEqual({ x: 2, y: 4, width: 8, height: 6 })
  })

  it('thinPoints keeps endpoints and drops dense points', () => {
    const dense: number[] = []
    for (let i = 0; i <= 100; i++) dense.push(i * 0.5, 0)
    const thinned = thinPoints(dense, 2)
    expect(thinned.length).toBeLessThan(dense.length)
    expect(thinned.slice(0, 2)).toEqual([0, 0])
    expect(thinned.slice(-2)).toEqual([50, 0])
  })
})
