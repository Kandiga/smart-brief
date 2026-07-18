// Coordinate transforms between screen space (the visible stage) and page
// space (the untransformed page/image coordinate system annotations live in).

export interface Viewport {
  zoom: number
  pan: { x: number; y: number } // stage position in screen pixels
}

export interface Point {
  x: number
  y: number
}

export function screenToPage(point: Point, view: Viewport): Point {
  return {
    x: (point.x - view.pan.x) / view.zoom,
    y: (point.y - view.pan.y) / view.zoom
  }
}

export function pageToScreen(point: Point, view: Viewport): Point {
  return {
    x: point.x * view.zoom + view.pan.x,
    y: point.y * view.zoom + view.pan.y
  }
}

/** Zoom around a fixed screen point (e.g. the cursor) keeping it stationary. */
export function zoomAt(view: Viewport, screenPoint: Point, nextZoom: number): Viewport {
  const pagePoint = screenToPage(screenPoint, view)
  return {
    zoom: nextZoom,
    pan: {
      x: screenPoint.x - pagePoint.x * nextZoom,
      y: screenPoint.y - pagePoint.y * nextZoom
    }
  }
}

/** Fit a page of pageW×pageH into a viewport of viewW×viewH with padding. */
export function fitToView(
  pageW: number,
  pageH: number,
  viewW: number,
  viewH: number,
  padding = 24
): Viewport {
  const availW = Math.max(50, viewW - padding * 2)
  const availH = Math.max(50, viewH - padding * 2)
  const zoom = Math.min(availW / pageW, availH / pageH, 4)
  return {
    zoom,
    pan: {
      x: (viewW - pageW * zoom) / 2,
      y: (viewH - pageH * zoom) / 2
    }
  }
}

// Allow deep zoom (up to 40x) so fine details in a screenshot can be inspected
// and annotated comfortably; the floor keeps very large pages reachable.
export function clampZoom(zoom: number): number {
  return Math.min(40, Math.max(0.02, zoom))
}

/** Normalize a drag rectangle so width/height are positive. */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

/** Thin freehand points: drop points closer than minDist to the previous kept point. */
export function thinPoints(points: number[], minDist = 2): number[] {
  if (points.length <= 4) return points
  const out = [points[0], points[1]]
  for (let i = 2; i < points.length - 2; i += 2) {
    const dx = points[i] - out[out.length - 2]
    const dy = points[i + 1] - out[out.length - 1]
    if (dx * dx + dy * dy >= minDist * minDist) {
      out.push(points[i], points[i + 1])
    }
  }
  out.push(points[points.length - 2], points[points.length - 1])
  return out
}
