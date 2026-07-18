// The AI Brief ZIP export contract. This is a NEW, independent export path —
// it does not touch exportModel.ts or the HTML/JPG/PDF exports.
//
// The contract is explicit: a package may contain ONLY the project title, page
// numbers/titles, overall messages, numbered region instructions, region
// bounds (source pixels + normalized), and the image files listed in the
// manifest. Never internal ids, local paths, user names, revisions,
// timestamps, or any persistence/Electron metadata.

import type { Project, RegionAnnotation } from './schemas/project'
import { regionsOf } from './schemas/project'
import { normalizedBounds, regionCropBounds, type PixelRect } from './captureGeometry'

export const AI_BRIEF_SCHEMA_VERSION = '1.0'

export interface AiBriefRegion {
  number: number
  instruction: string
  boundsPixels: PixelRect
  boundsNormalized: PixelRect
  /** Package-relative crop path, or null when crops are excluded. */
  crop: string | null
  /** Crop bounds in source pixels (region + padding, clamped). Not exported to manifest consumers who only need the file, but kept so builders and tests agree on the exact crop. */
  cropBounds: PixelRect
}

export interface AiBriefPage {
  pageNumber: number
  title: string
  overallMessage: string
  sourceWidth: number
  sourceHeight: number
  originalImage: string
  annotatedImage: string
  regions: AiBriefRegion[]
}

export interface AiBriefModel {
  schemaVersion: string
  title: string
  /** Convenience for single-page briefs; '' when multi-page (see per-page). */
  overallMessage: string
  pages: AiBriefPage[]
}

export interface AiBriefBuildOptions {
  cropPadding: number
  includeRegionCrops: boolean
  /** File extension (without dot) of each page's original image, by page index. */
  originalExtensions: string[]
}

const pad3 = (n: number) => String(n).padStart(3, '0')

export function pageDirName(pageNumber: number): string {
  return `pages/page-${pad3(pageNumber)}`
}

export function regionCropName(pageNumber: number, regionNumber: number): string {
  return `${pageDirName(pageNumber)}/regions/region-${pad3(regionNumber)}.png`
}

/**
 * Root folder name inside the ZIP. Derived from the user's title but never
 * used as a raw path: lowercase ascii, dashes only, bounded length.
 */
export function packageRootName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return `smart-brief-${slug || 'brief'}`
}

export function buildAiBriefModel(project: Project, options: AiBriefBuildOptions): AiBriefModel {
  const pages: AiBriefPage[] = project.pages.map((page, i) => {
    const pageNumber = i + 1
    const ext = sanitizeImageExt(options.originalExtensions[i])
    const dir = pageDirName(pageNumber)
    return {
      pageNumber,
      title: page.title.trim(),
      overallMessage: page.overallMessage.trim(),
      sourceWidth: page.width,
      sourceHeight: page.height,
      originalImage: `${dir}/original.${ext}`,
      annotatedImage: `${dir}/annotated.png`,
      regions: regionsOf(page).map((r: RegionAnnotation) => {
        const boundsPixels: PixelRect = {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height)
        }
        return {
          number: r.number,
          instruction: r.instruction.trim(),
          boundsPixels,
          boundsNormalized: normalizedBounds(boundsPixels, page.width, page.height),
          crop: options.includeRegionCrops ? regionCropName(pageNumber, r.number) : null,
          cropBounds: regionCropBounds(boundsPixels, options.cropPadding, page.width, page.height)
        }
      })
    }
  })
  return {
    schemaVersion: AI_BRIEF_SCHEMA_VERSION,
    title: project.title.trim() || 'Untitled brief',
    overallMessage: pages.length === 1 ? pages[0].overallMessage : '',
    pages
  }
}

/** manifest.json content. Contains only contract fields — nothing internal. */
export function generateManifest(model: AiBriefModel): string {
  return JSON.stringify(
    {
      schemaVersion: model.schemaVersion,
      title: model.title,
      overallMessage: model.overallMessage,
      pages: model.pages.map((p) => ({
        pageNumber: p.pageNumber,
        title: p.title,
        overallMessage: p.overallMessage,
        sourceWidth: p.sourceWidth,
        sourceHeight: p.sourceHeight,
        originalImage: p.originalImage,
        annotatedImage: p.annotatedImage,
        regions: p.regions.map((r) => ({
          number: r.number,
          instruction: r.instruction,
          boundsPixels: r.boundsPixels,
          boundsNormalized: r.boundsNormalized,
          crop: r.crop
        }))
      }))
    },
    null,
    2
  )
}

/** brief.md — the human/agent-readable instruction document. */
export function generateBriefMd(model: AiBriefModel): string {
  const lines: string[] = [`# ${model.title}`, '']
  for (const page of model.pages) {
    lines.push(`## Page ${page.pageNumber}${page.title ? ` — ${page.title}` : ''}`, '')
    if (page.overallMessage) {
      lines.push('### Overall Message', '', page.overallMessage, '')
    }
    lines.push(`Original screenshot: \`${page.originalImage}\``)
    lines.push(`Annotated screenshot: \`${page.annotatedImage}\``, '')
    if (page.regions.length === 0) {
      lines.push('_No numbered regions on this page._', '')
    }
    for (const region of page.regions) {
      lines.push(`### Region ${region.number}`, '')
      lines.push('Instruction:')
      lines.push(region.instruction || '_No instruction was written for this region._', '')
      lines.push('Coordinates (pixels in the original image):')
      lines.push(`x: ${region.boundsPixels.x}`)
      lines.push(`y: ${region.boundsPixels.y}`)
      lines.push(`width: ${region.boundsPixels.width}`)
      lines.push(`height: ${region.boundsPixels.height}`, '')
      if (region.crop) {
        lines.push(`Reference crop: \`${region.crop}\``, '')
      }
    }
  }
  return lines.join('\n')
}

/** README.md — orientation for an AI agent receiving the package. */
export function generateReadme(model: AiBriefModel): string {
  return [
    `# ${model.title} — Smart Brief package`,
    '',
    'This package is a visual change brief. A human marked numbered regions on',
    'screenshots and wrote an instruction for each region.',
    '',
    '## How to read it',
    '',
    '- `brief.md` — all instructions in reading order. Start here.',
    '- `manifest.json` — the same content as structured data (schema `' +
      AI_BRIEF_SCHEMA_VERSION +
      '`).',
    '- `pages/page-NNN/original.*` — the untouched screenshot at its original resolution.',
    '- `pages/page-NNN/annotated.png` — the same screenshot with numbered region markers',
    '  and any arrows/boxes/drawings the author added.',
    '- `pages/page-NNN/regions/region-NNN.png` — a close-up crop of each numbered region,',
    '  cut from the original image with a small padding (present only when crops are included).',
    '- `project-preview.jpg` — a small preview of the first page.',
    '',
    '## Rules',
    '',
    '- Region numbers match between the annotated image, `brief.md`, `manifest.json`',
    '  and the crop filenames.',
    '- Region coordinates in `manifest.json` are pixels in the ORIGINAL image',
    '  (`boundsPixels`), plus the same bounds normalized to 0–1 (`boundsNormalized`).',
    '- A page’s Overall Message applies to the whole page.',
    '- If a specific region instruction conflicts with the Overall Message, the',
    '  region instruction wins.',
    ''
  ].join('\n')
}

/** Every file path the package must contain for this model. */
export function expectedPackageFiles(model: AiBriefModel): string[] {
  const files = ['README.md', 'manifest.json', 'brief.md', 'project-preview.jpg']
  for (const page of model.pages) {
    files.push(page.originalImage, page.annotatedImage)
    for (const region of page.regions) {
      if (region.crop) files.push(region.crop)
    }
  }
  return files
}

function sanitizeImageExt(ext: string | undefined): string {
  const clean = (ext ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(clean) ? clean : 'png'
}
