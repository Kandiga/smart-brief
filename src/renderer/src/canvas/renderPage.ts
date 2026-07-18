import Konva from 'konva'
import type { Annotation, Page } from '@shared/schemas/project'
import { loadMediaImage } from '../services/media'

export const REGION_BADGE_RADIUS = 14
export const REGION_DASH = [8, 4]

interface RenderOptions {
  maxDimension?: number
  mime?: 'image/jpeg' | 'image/png'
  quality?: number
  /** Render only the page background + images (no annotations). */
  includeAnnotations?: boolean
  /** Render at exactly 1 image pixel per page unit (ignores the 2× cap). */
  fullResolution?: boolean
}

/** Draw one annotation onto a Konva layer (page coordinates). */
export function annotationNodes(annotation: Annotation): Konva.Shape[] {
  const a = annotation
  switch (a.type) {
    case 'region': {
      const rect = new Konva.Rect({
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        stroke: a.color,
        strokeWidth: Math.max(2, a.strokeWidth),
        dash: REGION_DASH,
        fill: `${a.color}14`
      })
      const badge = new Konva.Circle({
        x: a.x,
        y: a.y,
        radius: REGION_BADGE_RADIUS,
        fill: a.color,
        stroke: '#ffffff',
        strokeWidth: 2
      })
      const label = new Konva.Text({
        x: a.x - REGION_BADGE_RADIUS,
        y: a.y - REGION_BADGE_RADIUS,
        width: REGION_BADGE_RADIUS * 2,
        height: REGION_BADGE_RADIUS * 2,
        text: String(a.number),
        fontSize: 15,
        fontStyle: 'bold',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif',
        fill: '#ffffff',
        align: 'center',
        verticalAlign: 'middle'
      })
      return [rect, badge, label]
    }
    case 'rectangle':
      return [
        new Konva.Rect({
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
          stroke: a.color,
          strokeWidth: a.strokeWidth
        })
      ]
    case 'ellipse':
      return [
        new Konva.Ellipse({
          x: a.x + a.width / 2,
          y: a.y + a.height / 2,
          radiusX: Math.abs(a.width / 2),
          radiusY: Math.abs(a.height / 2),
          stroke: a.color,
          strokeWidth: a.strokeWidth
        })
      ]
    case 'arrow':
      return [
        new Konva.Arrow({
          points: [a.x1, a.y1, a.x2, a.y2],
          stroke: a.color,
          fill: a.color,
          strokeWidth: a.strokeWidth,
          pointerLength: 6 + a.strokeWidth * 2.5,
          pointerWidth: 6 + a.strokeWidth * 2.5,
          lineCap: 'round'
        })
      ]
    case 'pen':
      return [
        new Konva.Line({
          points: a.points,
          stroke: a.color,
          strokeWidth: a.strokeWidth,
          tension: 0.4,
          lineCap: 'round',
          lineJoin: 'round'
        })
      ]
  }
}

/**
 * Render a full page (background, images, annotations) offscreen and return a
 * data URL. Used for thumbnails and every export format.
 */
export async function renderPageToDataUrl(page: Page, options: RenderOptions = {}): Promise<string> {
  const {
    maxDimension = 2400,
    mime = 'image/jpeg',
    quality = 0.88,
    includeAnnotations = true,
    fullResolution = false
  } = options
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '0'
  document.body.appendChild(container)
  const stage = new Konva.Stage({ container, width: page.width, height: page.height })
  try {
    const layer = new Konva.Layer()
    stage.add(layer)
    layer.add(
      new Konva.Rect({ x: 0, y: 0, width: page.width, height: page.height, fill: '#ffffff' })
    )
    if (page.sourceImage) {
      try {
        const img = await loadMediaImage(page.sourceImage.file)
        layer.add(
          new Konva.Image({ image: img, x: 0, y: 0, width: page.width, height: page.height })
        )
      } catch {
        /* missing media: render annotations on a white page */
      }
    }
    const placed = [...page.placedImages].sort((a, b) => a.zIndex - b.zIndex)
    for (const item of placed) {
      try {
        const img = await loadMediaImage(item.file)
        layer.add(
          new Konva.Image({
            image: img,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height
          })
        )
      } catch {
        continue
      }
    }
    if (includeAnnotations) {
      for (const annotation of page.annotations) {
        for (const node of annotationNodes(annotation)) layer.add(node)
      }
    }
    layer.draw()
    const largest = Math.max(page.width, page.height)
    const pixelRatio = fullResolution ? 1 : Math.min(2, maxDimension / largest)
    return stage.toDataURL({ mimeType: mime, quality, pixelRatio })
  } finally {
    stage.destroy()
    container.remove()
  }
}
