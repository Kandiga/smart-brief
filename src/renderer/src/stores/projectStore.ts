import { create } from 'zustand'
import {
  createEmptyProject,
  createPage,
  isEmptyDraft,
  renumberRegions,
  type Annotation,
  type MediaRef,
  type Page,
  type PlacedImage,
  type Project
} from '@shared/schemas/project'
import { useUiStore } from './uiStore'

export type SaveStatus = 'saved' | 'saving' | 'failed' | 'unsaved'

interface PageSnapshot {
  annotations: Annotation[]
  placedImages: PlacedImage[]
  overallMessage: string
}

interface PageHistory {
  past: PageSnapshot[]
  future: PageSnapshot[]
  lastCoalesceKey: string | null
  lastPushAt: number
}

const HISTORY_LIMIT = 100
const COALESCE_WINDOW_MS = 1200
export const AUTOSAVE_DEBOUNCE_MS = 800

interface ProjectState {
  project: Project | null
  storedRevision: number
  saveStatus: SaveStatus
  histories: Record<string, PageHistory>
  ready: boolean

  init: () => Promise<void>
  newProject: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  deleteProjectById: (id: string) => Promise<void>
  duplicateProjectById: (id: string) => Promise<void>
  flush: () => Promise<void>
  retrySave: () => void

  setTitle: (title: string) => void
  setActivePage: (pageId: string) => void
  addPagesFromMedia: (refs: MediaRef[], afterPageId?: string | null) => void
  addBlankPage: () => void
  movePage: (pageId: string, direction: -1 | 1) => void
  duplicatePage: (pageId: string) => void
  deletePage: (pageId: string) => void
  setPageTitle: (pageId: string, title: string) => void
  setOverallMessage: (pageId: string, message: string) => void
  clearMarks: (pageId: string) => void
  setViewState: (pageId: string, zoom: number, pan: { x: number; y: number }) => void

  addAnnotation: (pageId: string, annotation: Annotation) => void
  updateAnnotation: (
    pageId: string,
    annotationId: string,
    patch: Partial<Annotation>,
    coalesceKey?: string
  ) => void
  deleteAnnotation: (pageId: string, annotationId: string) => void
  addPlacedImage: (pageId: string, image: PlacedImage) => void
  updatePlacedImage: (pageId: string, imageId: string, patch: Partial<PlacedImage>) => void
  deletePlacedImage: (pageId: string, imageId: string) => void
  reorderPlacedImage: (
    pageId: string,
    imageId: string,
    action: 'forward' | 'backward' | 'front' | 'back'
  ) => void

  undo: (pageId: string) => void
  redo: (pageId: string) => void
  canUndo: (pageId: string) => boolean
  canRedo: (pageId: string) => boolean
}

// ---------------------------------------------------------------------------
// Autosave machinery (module scope). Every scheduled save captures the project
// id it is saving; tombstoned ids are never written; revisions are checked by
// the main-process repository. All renderer saves are serialized via a chain.
// ---------------------------------------------------------------------------

const deletedIds = new Set<string>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveTimerProjectId: string | null = null
let saveChain: Promise<void> = Promise.resolve()
let dirty = false

function cancelPendingSave(projectId?: string) {
  if (saveTimer && (!projectId || saveTimerProjectId === projectId)) {
    clearTimeout(saveTimer)
    saveTimer = null
    saveTimerProjectId = null
  }
}

function scheduleSave() {
  const project = useProjectStore.getState().project
  if (!project) return
  dirty = true
  cancelPendingSave()
  saveTimerProjectId = project.id
  const capturedId = project.id
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveTimerProjectId = null
    enqueueSave(capturedId)
  }, AUTOSAVE_DEBOUNCE_MS)
}

function enqueueSave(capturedId: string): Promise<void> {
  saveChain = saveChain.then(() => performSave(capturedId)).catch(() => undefined)
  return saveChain
}

async function performSave(capturedId: string): Promise<void> {
  const state = useProjectStore.getState()
  const project = state.project
  // Verify the project being saved is still the live, undeleted project.
  if (!project || project.id !== capturedId) return
  if (deletedIds.has(capturedId)) return
  // Untouched empty drafts must never hit disk (no ghost library cards) —
  // but keep updating a project that already exists on disk.
  if (isEmptyDraft(project) && state.storedRevision === 0) {
    dirty = false
    return
  }
  useProjectStore.setState({ saveStatus: 'saving' })
  dirty = false
  const payload: Project = { ...project, updatedAt: Date.now() }
  const result = await window.smartBrief.saveProject(payload, state.storedRevision)
  const after = useProjectStore.getState()
  if (!after.project || after.project.id !== capturedId) return
  if (result.ok && result.revision !== undefined) {
    useProjectStore.setState({
      storedRevision: result.revision,
      saveStatus: dirty ? 'unsaved' : 'saved',
      project: { ...after.project, revision: result.revision, updatedAt: payload.updatedAt }
    })
    void updateThumbnail(capturedId)
  } else if (result.reason === 'deleted') {
    // The project was deleted while this save was in flight; drop the write.
  } else if (result.reason === 'stale') {
    // Disk is newer than our bookkeeping; re-sync the revision and retry once.
    const fresh = await window.smartBrief.getProject(capturedId)
    if (fresh && useProjectStore.getState().project?.id === capturedId) {
      useProjectStore.setState({ storedRevision: fresh.revision })
      const retry = await window.smartBrief.saveProject(payload, fresh.revision)
      if (retry.ok && retry.revision !== undefined) {
        useProjectStore.setState({ storedRevision: retry.revision, saveStatus: 'saved' })
        return
      }
    }
    useProjectStore.setState({ saveStatus: 'failed' })
  } else {
    useProjectStore.setState({ saveStatus: 'failed' })
  }
}

async function updateThumbnail(projectId: string) {
  try {
    const state = useProjectStore.getState()
    const project = state.project
    if (!project || project.id !== projectId || deletedIds.has(projectId)) return
    const firstPage = project.pages[0]
    if (!firstPage) return
    const { renderPageToDataUrl } = await import('../canvas/renderPage')
    const dataUrl = await renderPageToDataUrl(firstPage, { maxDimension: 640, mime: 'image/jpeg', quality: 0.8 })
    if (deletedIds.has(projectId)) return
    await window.smartBrief.saveThumbnail(projectId, dataUrl)
  } catch {
    /* thumbnails are best-effort */
  }
}

async function flushNow(): Promise<void> {
  const project = useProjectStore.getState().project
  cancelPendingSave()
  if (!project) return
  const id = project.id
  if (dirty || useProjectStore.getState().saveStatus === 'failed') {
    await enqueueSave(id)
  } else {
    await saveChain
  }
}

function markDirty() {
  const s = useProjectStore.getState()
  if (s.saveStatus === 'saved') useProjectStore.setState({ saveStatus: 'unsaved' })
  scheduleSave()
}

// ---------------------------------------------------------------------------

function emptyHistory(): PageHistory {
  return { past: [], future: [], lastCoalesceKey: null, lastPushAt: 0 }
}

function snapshotOf(page: Page): PageSnapshot {
  return structuredClone({
    annotations: page.annotations,
    placedImages: page.placedImages,
    overallMessage: page.overallMessage
  })
}

export const useProjectStore = create<ProjectState>((set, get) => {
  /** Apply a mutation to one page, recording undo history. */
  function mutatePage(
    pageId: string,
    recipe: (page: Page) => void,
    opts: { coalesceKey?: string } = {}
  ) {
    const { project, histories } = get()
    if (!project) return
    const index = project.pages.findIndex((p) => p.id === pageId)
    if (index < 0) return
    const page = project.pages[index]
    const history = histories[pageId] ?? emptyHistory()
    const now = Date.now()
    const coalesce =
      opts.coalesceKey !== undefined &&
      history.lastCoalesceKey === opts.coalesceKey &&
      now - history.lastPushAt < COALESCE_WINDOW_MS
    let past = history.past
    if (!coalesce) {
      past = [...history.past, snapshotOf(page)].slice(-HISTORY_LIMIT)
    }
    const draft = structuredClone(page)
    recipe(draft)
    draft.annotations = renumberRegions(draft.annotations)
    draft.updatedAt = now
    const pages = [...project.pages]
    pages[index] = draft
    set({
      project: { ...project, pages },
      histories: {
        ...histories,
        [pageId]: {
          past,
          future: [],
          lastCoalesceKey: opts.coalesceKey ?? null,
          lastPushAt: coalesce ? history.lastPushAt : now
        }
      }
    })
    markDirty()
  }

  /** Project-level mutation without page history. */
  function mutateProject(recipe: (project: Project) => Project) {
    const { project } = get()
    if (!project) return
    set({ project: recipe(project) })
    markDirty()
  }

  return {
    project: null,
    storedRevision: 0,
    saveStatus: 'saved',
    histories: {},
    ready: false,

    init: async () => {
      const report = await window.smartBrief.recoveryReport()
      if (report.corruptFiles.length > 0) {
        useUiStore
          .getState()
          .setRecoveryNotice(
            `Some project data could not be read (${report.corruptFiles.join(', ')}). ` +
              `The original files were preserved in the app's "corrupt" folder and valid projects were recovered.`
          )
      }
      const appState = await window.smartBrief.getAppState()
      let project: Project | null = null
      if (appState.activeProjectId) {
        project = await window.smartBrief.getProject(appState.activeProjectId)
      }
      if (!project) {
        const list = await window.smartBrief.listProjects()
        if (list.length > 0) project = await window.smartBrief.getProject(list[0].id)
      }
      if (project) {
        set({ project, storedRevision: project.revision, saveStatus: 'saved', histories: {}, ready: true })
        void window.smartBrief.setAppState({ activeProjectId: project.id })
      } else {
        const fresh = createEmptyProject(crypto.randomUUID(), Date.now())
        set({ project: fresh, storedRevision: 0, saveStatus: 'saved', histories: {}, ready: true })
      }
    },

    newProject: async () => {
      await flushNow()
      const fresh = createEmptyProject(crypto.randomUUID(), Date.now())
      set({ project: fresh, storedRevision: 0, saveStatus: 'saved', histories: {} })
      useUiStore.getState().setSelection(null)
      void window.smartBrief.setAppState({ activeProjectId: fresh.id })
    },

    loadProject: async (id) => {
      const current = get().project
      if (current?.id === id) return
      // Save the outgoing project before switching.
      await flushNow()
      const project = await window.smartBrief.getProject(id)
      if (!project) return
      set({ project, storedRevision: project.revision, saveStatus: 'saved', histories: {} })
      useUiStore.getState().setSelection(null)
      void window.smartBrief.setAppState({ activeProjectId: id })
    },

    deleteProjectById: async (id) => {
      const wasActive = get().project?.id === id
      // Order matters: cancel pending saves, tombstone locally, then delete on
      // disk, then move to another project without snapshotting the deleted one.
      cancelPendingSave(id)
      deletedIds.add(id)
      if (wasActive) dirty = false
      await saveChain
      await window.smartBrief.deleteProject(id)
      if (wasActive) {
        const list = await window.smartBrief.listProjects()
        const next = list.length > 0 ? await window.smartBrief.getProject(list[0].id) : null
        if (next) {
          set({ project: next, storedRevision: next.revision, saveStatus: 'saved', histories: {} })
          void window.smartBrief.setAppState({ activeProjectId: next.id })
        } else {
          const fresh = createEmptyProject(crypto.randomUUID(), Date.now())
          set({ project: fresh, storedRevision: 0, saveStatus: 'saved', histories: {} })
          void window.smartBrief.setAppState({ activeProjectId: fresh.id })
        }
        useUiStore.getState().setSelection(null)
      }
    },

    duplicateProjectById: async (id) => {
      await flushNow()
      const copy = await window.smartBrief.duplicateProject(id)
      if (!copy) return
      set({ project: copy, storedRevision: copy.revision, saveStatus: 'saved', histories: {} })
      useUiStore.getState().setSelection(null)
      void window.smartBrief.setAppState({ activeProjectId: copy.id })
    },

    flush: flushNow,

    retrySave: () => {
      const project = get().project
      if (project) void enqueueSave(project.id)
    },

    setTitle: (title) => {
      mutateProject((p) => ({ ...p, title, updatedAt: Date.now() }))
    },

    setActivePage: (pageId) => {
      const { project } = get()
      if (!project || project.activePageId === pageId) return
      if (!project.pages.some((p) => p.id === pageId)) return
      set({ project: { ...project, activePageId: pageId } })
      markDirty()
    },

    addPagesFromMedia: (refs, afterPageId) => {
      if (refs.length === 0) return
      const now = Date.now()
      const newPages = refs.map((ref) => createPage(crypto.randomUUID(), 'screenshot', now, ref))
      mutateProject((project) => {
        const pages = [...project.pages]
        let insertAt = pages.length
        if (afterPageId) {
          const idx = pages.findIndex((p) => p.id === afterPageId)
          if (idx >= 0) insertAt = idx + 1
        }
        pages.splice(insertAt, 0, ...newPages)
        return { ...project, pages, activePageId: newPages[0].id, updatedAt: now }
      })
    },

    addBlankPage: () => {
      const now = Date.now()
      const page = createPage(crypto.randomUUID(), 'blank', now, null)
      mutateProject((project) => ({
        ...project,
        pages: [...project.pages, page],
        activePageId: page.id,
        updatedAt: now
      }))
    },

    movePage: (pageId, direction) => {
      mutateProject((project) => {
        const pages = [...project.pages]
        const idx = pages.findIndex((p) => p.id === pageId)
        const target = idx + direction
        if (idx < 0 || target < 0 || target >= pages.length) return project
        ;[pages[idx], pages[target]] = [pages[target], pages[idx]]
        return { ...project, pages, updatedAt: Date.now() }
      })
    },

    duplicatePage: (pageId) => {
      mutateProject((project) => {
        const idx = project.pages.findIndex((p) => p.id === pageId)
        if (idx < 0) return project
        const source = project.pages[idx]
        const copy: Page = structuredClone(source)
        copy.id = crypto.randomUUID()
        copy.title = source.title ? `${source.title} copy` : ''
        copy.createdAt = Date.now()
        copy.updatedAt = Date.now()
        copy.annotations = copy.annotations.map((a) => ({ ...a, id: crypto.randomUUID() }))
        copy.placedImages = copy.placedImages.map((i) => ({ ...i, id: crypto.randomUUID() }))
        const pages = [...project.pages]
        pages.splice(idx + 1, 0, copy)
        return { ...project, pages, activePageId: copy.id, updatedAt: Date.now() }
      })
    },

    deletePage: (pageId) => {
      mutateProject((project) => {
        const pages = project.pages.filter((p) => p.id !== pageId)
        const activePageId =
          project.activePageId === pageId ? (pages[0]?.id ?? null) : project.activePageId
        return { ...project, pages, activePageId, updatedAt: Date.now() }
      })
      const histories = { ...get().histories }
      delete histories[pageId]
      set({ histories })
    },

    setPageTitle: (pageId, title) => {
      mutateProject((project) => ({
        ...project,
        pages: project.pages.map((p) => (p.id === pageId ? { ...p, title } : p)),
        updatedAt: Date.now()
      }))
    },

    setOverallMessage: (pageId, message) => {
      mutatePage(
        pageId,
        (page) => {
          page.overallMessage = message
        },
        { coalesceKey: `overall-${pageId}` }
      )
    },

    clearMarks: (pageId) => {
      mutatePage(pageId, (page) => {
        page.annotations = []
      })
    },

    setViewState: (pageId, zoom, pan) => {
      const { project } = get()
      if (!project) return
      const pages = project.pages.map((p) =>
        p.id === pageId ? { ...p, zoomState: zoom, panState: pan } : p
      )
      set({ project: { ...project, pages } })
      markDirty()
    },

    addAnnotation: (pageId, annotation) => {
      mutatePage(pageId, (page) => {
        page.annotations.push(annotation)
      })
    },

    updateAnnotation: (pageId, annotationId, patch, coalesceKey) => {
      mutatePage(
        pageId,
        (page) => {
          page.annotations = page.annotations.map((a) =>
            a.id === annotationId ? ({ ...a, ...patch } as Annotation) : a
          )
        },
        { coalesceKey }
      )
    },

    deleteAnnotation: (pageId, annotationId) => {
      mutatePage(pageId, (page) => {
        page.annotations = page.annotations.filter((a) => a.id !== annotationId)
      })
      const selection = useUiStore.getState().selection
      if (selection?.id === annotationId) useUiStore.getState().setSelection(null)
    },

    addPlacedImage: (pageId, image) => {
      mutatePage(pageId, (page) => {
        page.placedImages.push(image)
      })
    },

    updatePlacedImage: (pageId, imageId, patch) => {
      mutatePage(pageId, (page) => {
        page.placedImages = page.placedImages.map((i) =>
          i.id === imageId ? { ...i, ...patch } : i
        )
      })
    },

    deletePlacedImage: (pageId, imageId) => {
      mutatePage(pageId, (page) => {
        page.placedImages = page.placedImages.filter((i) => i.id !== imageId)
      })
      const selection = useUiStore.getState().selection
      if (selection?.id === imageId) useUiStore.getState().setSelection(null)
    },

    reorderPlacedImage: (pageId, imageId, action) => {
      mutatePage(pageId, (page) => {
        const sorted = [...page.placedImages].sort((a, b) => a.zIndex - b.zIndex)
        const idx = sorted.findIndex((i) => i.id === imageId)
        if (idx < 0) return
        const [img] = sorted.splice(idx, 1)
        if (action === 'forward') sorted.splice(Math.min(idx + 1, sorted.length), 0, img)
        else if (action === 'backward') sorted.splice(Math.max(idx - 1, 0), 0, img)
        else if (action === 'front') sorted.push(img)
        else sorted.unshift(img)
        const zOf = new Map(sorted.map((i, z) => [i.id, z]))
        page.placedImages = page.placedImages.map((i) => ({ ...i, zIndex: zOf.get(i.id) ?? 0 }))
      })
    },

    undo: (pageId) => {
      const { project, histories } = get()
      if (!project) return
      const history = histories[pageId]
      if (!history || history.past.length === 0) return
      const index = project.pages.findIndex((p) => p.id === pageId)
      if (index < 0) return
      const page = project.pages[index]
      const previous = history.past[history.past.length - 1]
      const pages = [...project.pages]
      pages[index] = { ...page, ...structuredClone(previous), updatedAt: Date.now() }
      pages[index].annotations = renumberRegions(pages[index].annotations)
      set({
        project: { ...project, pages },
        histories: {
          ...histories,
          [pageId]: {
            past: history.past.slice(0, -1),
            future: [...history.future, snapshotOf(page)].slice(-HISTORY_LIMIT),
            lastCoalesceKey: null,
            lastPushAt: 0
          }
        }
      })
      useUiStore.getState().setSelection(null)
      markDirty()
    },

    redo: (pageId) => {
      const { project, histories } = get()
      if (!project) return
      const history = histories[pageId]
      if (!history || history.future.length === 0) return
      const index = project.pages.findIndex((p) => p.id === pageId)
      if (index < 0) return
      const page = project.pages[index]
      const next = history.future[history.future.length - 1]
      const pages = [...project.pages]
      pages[index] = { ...page, ...structuredClone(next), updatedAt: Date.now() }
      pages[index].annotations = renumberRegions(pages[index].annotations)
      set({
        project: { ...project, pages },
        histories: {
          ...histories,
          [pageId]: {
            past: [...history.past, snapshotOf(page)].slice(-HISTORY_LIMIT),
            future: history.future.slice(0, -1),
            lastCoalesceKey: null,
            lastPushAt: 0
          }
        }
      })
      useUiStore.getState().setSelection(null)
      markDirty()
    },

    canUndo: (pageId) => (get().histories[pageId]?.past.length ?? 0) > 0,
    canRedo: (pageId) => (get().histories[pageId]?.future.length ?? 0) > 0
  }
})
