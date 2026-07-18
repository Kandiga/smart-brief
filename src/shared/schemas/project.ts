// Typed, versioned data model for Smart Brief projects.

export const SCHEMA_VERSION = 1

export interface MediaRef {
  file: string // filename inside the app's media directory
  width: number
  height: number
}

export interface PlacedImage {
  id: string
  file: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type AnnotationType = 'region' | 'arrow' | 'pen' | 'rectangle' | 'ellipse'

export interface AnnotationBase {
  id: string
  type: AnnotationType
  color: string
  strokeWidth: number
}

export interface RegionAnnotation extends AnnotationBase {
  type: 'region'
  x: number
  y: number
  width: number
  height: number
  number: number
  instruction: string
}

export interface RectAnnotation extends AnnotationBase {
  type: 'rectangle'
  x: number
  y: number
  width: number
  height: number
}

export interface EllipseAnnotation extends AnnotationBase {
  type: 'ellipse'
  x: number
  y: number
  width: number
  height: number
}

export interface ArrowAnnotation extends AnnotationBase {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PenAnnotation extends AnnotationBase {
  type: 'pen'
  points: number[] // flat [x0, y0, x1, y1, ...] in page coordinates
}

export type Annotation =
  | RegionAnnotation
  | RectAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | PenAnnotation

export type PageKind = 'screenshot' | 'blank'

export interface Page {
  id: string
  title: string
  kind: PageKind
  width: number
  height: number
  sourceImage: MediaRef | null
  placedImages: PlacedImage[]
  annotations: Annotation[]
  overallMessage: string
  createdAt: number
  updatedAt: number
  zoomState: number | null
  panState: { x: number; y: number } | null
}

export interface Project {
  id: string
  schemaVersion: number
  title: string
  createdAt: number
  updatedAt: number
  revision: number
  activePageId: string | null
  pages: Page[]
}

export interface ProjectMeta {
  id: string
  title: string
  pageCount: number
  regionCount: number
  createdAt: number
  updatedAt: number
  hasThumbnail: boolean
}

export const DEFAULT_TITLE = 'Untitled brief'
export const BLANK_PAGE_WIDTH = 1500
export const BLANK_PAGE_HEIGHT = 900

export function createEmptyProject(id: string, now: number): Project {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    activePageId: null,
    pages: []
  }
}

export function createPage(
  id: string,
  kind: PageKind,
  now: number,
  sourceImage: MediaRef | null
): Page {
  return {
    id,
    title: '',
    kind,
    width: kind === 'blank' ? BLANK_PAGE_WIDTH : (sourceImage?.width ?? BLANK_PAGE_WIDTH),
    height: kind === 'blank' ? BLANK_PAGE_HEIGHT : (sourceImage?.height ?? BLANK_PAGE_HEIGHT),
    sourceImage,
    placedImages: [],
    annotations: [],
    overallMessage: '',
    createdAt: now,
    updatedAt: now,
    zoomState: null,
    panState: null
  }
}

/**
 * A completely untouched draft must never be persisted (no ghost library cards).
 * A project is an empty draft when it has no pages and still carries the default title.
 */
export function isEmptyDraft(project: Project): boolean {
  return project.pages.length === 0 && project.title.trim() === DEFAULT_TITLE
}

/** Regions are numbered by creation order; renumber sequentially after any change. */
export function renumberRegions(annotations: Annotation[]): Annotation[] {
  let n = 0
  return annotations.map((a) => {
    if (a.type === 'region') {
      n += 1
      if (a.number !== n) return { ...a, number: n }
    }
    return a
  })
}

export function regionsOf(page: Page): RegionAnnotation[] {
  return page.annotations.filter((a): a is RegionAnnotation => a.type === 'region')
}

export function countRegions(project: Project): number {
  return project.pages.reduce((sum, p) => sum + regionsOf(p).length, 0)
}

/** Migrate any older stored payload to the current schema. */
export function migrateProject(raw: any): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Not a project object')
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  let data = raw
  if (version === 0) {
    // v0 -> v1: ensure all fields exist with defaults.
    data = { ...raw, schemaVersion: 1 }
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Project schema ${data.schemaVersion} is newer than this app supports`)
  }
  return normalizeProject(data)
}

/** Defensive normalization: fill defaults, drop malformed entries, keep valid work. */
export function normalizeProject(raw: any): Project {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('Project is missing an id')
  }
  const now = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
  const pages: Page[] = Array.isArray(raw.pages)
    ? raw.pages.filter((p: any) => p && typeof p.id === 'string').map((p: any) => normalizePage(p, now))
    : []
  const activePageId =
    typeof raw.activePageId === 'string' && pages.some((p) => p.id === raw.activePageId)
      ? raw.activePageId
      : (pages[0]?.id ?? null)
  return {
    id: raw.id,
    schemaVersion: SCHEMA_VERSION,
    title: typeof raw.title === 'string' ? raw.title : DEFAULT_TITLE,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: now,
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    activePageId,
    pages
  }
}

function normalizePage(raw: any, fallbackTime: number): Page {
  const annotations: Annotation[] = Array.isArray(raw.annotations)
    ? raw.annotations.filter(isValidAnnotation)
    : []
  const placedImages: PlacedImage[] = Array.isArray(raw.placedImages)
    ? raw.placedImages.filter(
        (i: any) => i && typeof i.id === 'string' && typeof i.file === 'string'
      )
    : []
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    kind: raw.kind === 'blank' ? 'blank' : 'screenshot',
    width: typeof raw.width === 'number' ? raw.width : BLANK_PAGE_WIDTH,
    height: typeof raw.height === 'number' ? raw.height : BLANK_PAGE_HEIGHT,
    sourceImage:
      raw.sourceImage && typeof raw.sourceImage.file === 'string' ? raw.sourceImage : null,
    placedImages,
    annotations: renumberRegions(annotations),
    overallMessage: typeof raw.overallMessage === 'string' ? raw.overallMessage : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : fallbackTime,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : fallbackTime,
    zoomState: typeof raw.zoomState === 'number' ? raw.zoomState : null,
    panState:
      raw.panState && typeof raw.panState.x === 'number' && typeof raw.panState.y === 'number'
        ? { x: raw.panState.x, y: raw.panState.y }
        : null
  }
}

function isValidAnnotation(a: any): boolean {
  if (!a || typeof a.id !== 'string' || typeof a.type !== 'string') return false
  switch (a.type) {
    case 'region':
      return ['x', 'y', 'width', 'height'].every((k) => typeof a[k] === 'number')
    case 'rectangle':
    case 'ellipse':
      return ['x', 'y', 'width', 'height'].every((k) => typeof a[k] === 'number')
    case 'arrow':
      return ['x1', 'y1', 'x2', 'y2'].every((k) => typeof a[k] === 'number')
    case 'pen':
      return Array.isArray(a.points) && a.points.length >= 4
    default:
      return false
  }
}
