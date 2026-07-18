// Pure coordinate math for Quick Capture and for AI Brief region crops.
//
// Three coordinate spaces matter:
//  - Overlay space: CSS pixels (DIP) inside the overlay window that covers one
//    display. Window-local, so display origins (including negative x/y for
//    displays left of / above the primary) never enter the math.
//  - Image space: physical pixels of the captured frame (DIP × scaleFactor).
//    Region annotations on capture pages are stored in this space, so stored
//    coordinates are independent of viewport zoom/pan and of display layout.
//  - Normalized space: image space divided by image dimensions (0..1).

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Bounds for a region crop taken from the ORIGINAL image: the region rect in
 * source pixels, expanded by `padding`, clamped to the image. Never affected
 * by viewport zoom because inputs are already source-pixel coordinates.
 */
export function regionCropBounds(
  region: PixelRect,
  padding: number,
  imageWidth: number,
  imageHeight: number
): PixelRect {
  const pad = Math.max(0, padding)
  const x1 = Math.max(0, Math.floor(Math.min(region.x, region.x + region.width) - pad))
  const y1 = Math.max(0, Math.floor(Math.min(region.y, region.y + region.height) - pad))
  const x2 = Math.min(imageWidth, Math.ceil(Math.max(region.x, region.x + region.width) + pad))
  const y2 = Math.min(imageHeight, Math.ceil(Math.max(region.y, region.y + region.height) + pad))
  return {
    x: x1,
    y: y1,
    width: Math.max(1, x2 - x1),
    height: Math.max(1, y2 - y1)
  }
}

/** Region bounds normalized against the source image (0..1, clamped). */
export function normalizedBounds(
  region: PixelRect,
  imageWidth: number,
  imageHeight: number
): PixelRect {
  if (imageWidth <= 0 || imageHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const x = clamp01(region.x / imageWidth)
  const y = clamp01(region.y / imageHeight)
  const round = (v: number) => Math.round(v * 10000) / 10000
  return {
    x: round(x),
    y: round(y),
    width: round(Math.min(1 - x, Math.max(0, region.width / imageWidth))),
    height: round(Math.min(1 - y, Math.max(0, region.height / imageHeight)))
  }
}

/** Breathing room kept around the capture, and the strip the toolbar needs. */
export const CAPTURE_EDGE_MARGIN = 30
export const CAPTURE_TOOLBAR_SPACE = 80

/**
 * Where the captured image is shown while it is being annotated.
 *
 * A selection that comfortably fits stays exactly where it was taken, at 1:1 —
 * you mark up the thing right where you were looking at it. A selection too
 * large for that (a whole screen, most obviously) is scaled down and centred
 * instead, so it always reads as a captured image on a darkened backdrop
 * rather than as your live desktop with a toolbar stuck on top.
 */
export function captureDisplayRect(
  selection: PixelRect,
  overlayWidth: number,
  overlayHeight: number
): PixelRect & { scaled: boolean } {
  const availableWidth = Math.max(120, overlayWidth - CAPTURE_EDGE_MARGIN * 2)
  const availableHeight = Math.max(
    120,
    overlayHeight - CAPTURE_EDGE_MARGIN * 2 - CAPTURE_TOOLBAR_SPACE
  )
  if (selection.width <= availableWidth && selection.height <= availableHeight) {
    return { ...selection, scaled: false }
  }
  const scale = Math.min(availableWidth / selection.width, availableHeight / selection.height)
  const width = Math.max(1, Math.round(selection.width * scale))
  const height = Math.max(1, Math.round(selection.height * scale))
  return {
    x: Math.round((overlayWidth - width) / 2),
    y: Math.round((overlayHeight - CAPTURE_TOOLBAR_SPACE - height) / 2),
    width,
    height,
    scaled: true
  }
}

/**
 * Convert an overlay selection (window-local DIP on one display) to the global
 * point rectangle that macOS `screencapture -R x,y,w,h` expects: the display's
 * origin is added, and negative-size drags are normalized. No scale factor is
 * applied here — `screencapture` takes points and writes native pixels itself.
 */
export function overlayRectToScreencaptureRegion(
  rectDip: PixelRect,
  displayOrigin: { x: number; y: number }
): PixelRect {
  const x = Math.round(displayOrigin.x + Math.min(rectDip.x, rectDip.x + rectDip.width))
  const y = Math.round(displayOrigin.y + Math.min(rectDip.y, rectDip.y + rectDip.height))
  return {
    x,
    y,
    width: Math.round(Math.abs(rectDip.width)),
    height: Math.round(Math.abs(rectDip.height))
  }
}
