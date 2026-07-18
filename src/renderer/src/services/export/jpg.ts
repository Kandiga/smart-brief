import type { Project } from '@shared/schemas/project'
import { buildExportModel } from '@shared/exportModel'
import { renderPageToDataUrl } from '../../canvas/renderPage'
import { safeFileName } from './html'

const SHEET_WIDTH = 1400
const MARGIN = 48
const CONTENT_WIDTH = SHEET_WIDTH - MARGIN * 2
// Stay far below Chromium's canvas dimension ceiling; split into parts beyond this.
const MAX_PART_HEIGHT = 14000

const FONT = '-apple-system, BlinkMacSystemFont, system-ui, Helvetica, Arial, sans-serif'

interface Block {
  height: number
  draw: (ctx: CanvasRenderingContext2D, y: number) => void
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word
    if (ctx.measureText(attempt).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = attempt
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Render the whole brief as one continuous JPEG (or numbered parts when the
 * total height would exceed a safe canvas size). Returns JPEG data URLs.
 */
export async function buildBriefJpegParts(project: Project): Promise<string[] | null> {
  const model = buildExportModel(project)
  const measure = document.createElement('canvas').getContext('2d')!

  const blocks: Block[] = []

  // Title block
  blocks.push({
    height: 84,
    draw: (ctx, y) => {
      ctx.fillStyle = '#23262a'
      ctx.font = `650 34px ${FONT}`
      ctx.fillText(model.title, MARGIN, y + 52)
    }
  })

  for (let i = 0; i < project.pages.length; i++) {
    const page = project.pages[i]
    const meta = model.pages[i]
    const dataUrl = await renderPageToDataUrl(page, { maxDimension: 2000 })
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const drawWidth = Math.min(CONTENT_WIDTH, img.naturalWidth)
    const drawHeight = (img.naturalHeight / img.naturalWidth) * drawWidth

    // Page header
    blocks.push({
      height: 56,
      draw: (ctx, y) => {
        ctx.fillStyle = '#7b7f85'
        ctx.font = `600 15px ${FONT}`
        ctx.fillText(`PAGE ${meta.index}`, MARGIN, y + 34)
        if (meta.title) {
          ctx.fillStyle = '#23262a'
          ctx.font = `600 21px ${FONT}`
          ctx.fillText(meta.title, MARGIN + 90, y + 36)
        }
      }
    })

    // Page image
    blocks.push({
      height: drawHeight + 16,
      draw: (ctx, y) => {
        ctx.drawImage(img, MARGIN, y, drawWidth, drawHeight)
        ctx.strokeStyle = '#dcd9d3'
        ctx.lineWidth = 1
        ctx.strokeRect(MARGIN + 0.5, y + 0.5, drawWidth - 1, drawHeight - 1)
      }
    })

    // Overall message
    if (meta.overallMessage) {
      measure.font = `400 18px ${FONT}`
      const lines = wrapText(measure, meta.overallMessage, CONTENT_WIDTH - 24)
      const height = lines.length * 26 + 20
      blocks.push({
        height,
        draw: (ctx, y) => {
          ctx.fillStyle = '#2a7d6c'
          ctx.fillRect(MARGIN, y + 6, 4, lines.length * 26)
          ctx.fillStyle = '#3a3f45'
          ctx.font = `400 18px ${FONT}`
          lines.forEach((line, li) => ctx.fillText(line, MARGIN + 18, y + 25 + li * 26))
        }
      })
    }

    // Region instructions
    for (const region of meta.regions) {
      measure.font = `400 17px ${FONT}`
      const text = region.instruction || 'No instruction'
      const lines = wrapText(measure, text, CONTENT_WIDTH - 52)
      const height = Math.max(38, lines.length * 24 + 14)
      blocks.push({
        height,
        draw: (ctx, y) => {
          ctx.fillStyle = region.color
          ctx.beginPath()
          ctx.arc(MARGIN + 15, y + 18, 14, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = `700 15px ${FONT}`
          ctx.textAlign = 'center'
          ctx.fillText(String(region.number), MARGIN + 15, y + 23)
          ctx.textAlign = 'left'
          ctx.fillStyle = region.instruction ? '#23262a' : '#9aa0a6'
          ctx.font = `400 17px ${FONT}`
          lines.forEach((line, li) => ctx.fillText(line, MARGIN + 42, y + 24 + li * 24))
        }
      })
    }

    // Spacer between pages
    blocks.push({ height: 36, draw: () => undefined })
  }

  // Group blocks into parts under the height ceiling.
  const parts: Block[][] = []
  let current: Block[] = []
  let currentHeight = MARGIN
  for (const block of blocks) {
    if (currentHeight + block.height > MAX_PART_HEIGHT && current.length > 0) {
      parts.push(current)
      current = []
      currentHeight = MARGIN
    }
    current.push(block)
    currentHeight += block.height
  }
  if (current.length > 0) parts.push(current)

  const dataUrls: string[] = []
  for (const partBlocks of parts) {
    const totalHeight =
      partBlocks.reduce((sum, b) => sum + b.height, 0) + MARGIN * 2
    const canvas = document.createElement('canvas')
    canvas.width = SHEET_WIDTH
    canvas.height = Math.ceil(totalHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#f6f5f2'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    let y = MARGIN
    for (const block of partBlocks) {
      block.draw(ctx, y)
      y += block.height
    }
    dataUrls.push(canvas.toDataURL('image/jpeg', 0.85))
  }

  return dataUrls
}

/**
 * Export the brief as continuous JPEG file(s) and also copy the first sheet to
 * the system clipboard, so it can be pasted straight into another app. Returns
 * the written file paths, or null if nothing was rendered.
 */
export async function exportContinuousJpg(project: Project): Promise<string[] | null> {
  const dataUrls = await buildBriefJpegParts(project)
  if (!dataUrls || dataUrls.length === 0) return null
  // Copy first so a failed/cancelled save dialog still leaves the image on the
  // clipboard; a clipboard failure must never block the file export.
  await window.smartBrief.copyImageToClipboard(dataUrls[0]).catch(() => false)
  const name = safeFileName(project.title) || 'brief'
  return window.smartBrief.exportJpegParts(dataUrls, `${name}.jpg`)
}

/**
 * Render the brief to a single JPEG and copy it to the clipboard without ever
 * writing a file. Returns the number of sheets (only the first is copied).
 */
export async function copyBriefToClipboard(project: Project): Promise<number> {
  const dataUrls = await buildBriefJpegParts(project)
  if (!dataUrls || dataUrls.length === 0) return 0
  const ok = await window.smartBrief.copyImageToClipboard(dataUrls[0]).catch(() => false)
  if (!ok) throw new Error('Clipboard copy was rejected')
  return dataUrls.length
}
