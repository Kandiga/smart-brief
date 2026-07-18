import type { Project, RegionAnnotation } from './schemas/project'
import { regionsOf } from './schemas/project'

// The export model is the single source of truth for what appears in every
// export format. It deliberately contains only visual content: title, pages,
// page images, overall messages, and numbered region instructions.

export interface ExportRegion {
  number: number
  color: string
  instruction: string
}

export interface ExportPage {
  index: number // 1-based
  title: string
  overallMessage: string
  regions: ExportRegion[]
}

export interface ExportModel {
  title: string
  pages: ExportPage[]
}

export function buildExportModel(project: Project): ExportModel {
  return {
    title: project.title.trim() || 'Untitled brief',
    pages: project.pages.map((page, i) => ({
      index: i + 1,
      title: page.title.trim(),
      overallMessage: page.overallMessage.trim(),
      regions: regionsOf(page).map((r: RegionAnnotation) => ({
        number: r.number,
        color: r.color,
        instruction: r.instruction.trim()
      }))
    }))
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
