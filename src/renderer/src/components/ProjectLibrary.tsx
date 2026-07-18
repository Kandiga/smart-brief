import { useCallback, useEffect, useState } from 'react'
import type { ProjectMeta } from '@shared/schemas/project'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { CloseIcon, DuplicateIcon, PlusIcon, SearchIcon, TrashIcon } from './icons'

function useThumbnail(projectId: string, updatedAt: number, hasThumbnail: boolean) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!hasThumbnail) return
    let objectUrl: string | null = null
    let cancelled = false
    void window.smartBrief.getMediaData(`thumb-${projectId}.jpg`).then((data) => {
      if (cancelled || !data) return
      objectUrl = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }))
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [projectId, updatedAt, hasThumbnail])
  return url
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) {
    return `Today ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ProjectCard({
  meta,
  isCurrent,
  onOpen,
  onDuplicate,
  onDelete
}: {
  meta: ProjectMeta
  isCurrent: boolean
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const thumbnail = useThumbnail(meta.id, meta.updatedAt, meta.hasThumbnail)
  return (
    <div className="library-card" data-testid="library-card" data-project-id={meta.id}>
      <button className="card-thumb" onClick={onOpen} aria-label={`Open ${meta.title}`}>
        {thumbnail ? <img src={thumbnail} alt="" /> : <div className="thumb-placeholder" />}
      </button>
      <div className="card-info">
        <div className="card-title-row">
          <span className="card-title">{meta.title}</span>
          {isCurrent && <span className="current-badge">Current</span>}
        </div>
        <span className="card-meta">
          {meta.pageCount} {meta.pageCount === 1 ? 'page' : 'pages'} · {meta.regionCount}{' '}
          {meta.regionCount === 1 ? 'region' : 'regions'} · {formatDate(meta.updatedAt)}
        </span>
        <div className="card-actions">
          <button className="card-button" onClick={onOpen} data-testid="card-open">
            Open
          </button>
          <button
            className="icon-button"
            onClick={onDuplicate}
            aria-label={`Duplicate ${meta.title}`}
            title="Duplicate"
          >
            <DuplicateIcon size={14} />
          </button>
          <button
            className="icon-button danger"
            onClick={onDelete}
            aria-label={`Delete ${meta.title}`}
            title="Delete"
            data-testid="card-delete"
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProjectLibrary() {
  const setLibraryOpen = useUiStore((s) => s.setLibraryOpen)
  const project = useProjectStore((s) => s.project)
  const loadProject = useProjectStore((s) => s.loadProject)
  const duplicateProjectById = useProjectStore((s) => s.duplicateProjectById)
  const deleteProjectById = useProjectStore((s) => s.deleteProjectById)
  const newProject = useProjectStore((s) => s.newProject)
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null)

  const refresh = useCallback(async () => {
    setProjects(await window.smartBrief.listProjects())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = (projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="library-overlay" role="dialog" aria-label="Project library" data-testid="library">
      <div className="library-header">
        <h2>Library</h2>
        <div className="library-search">
          <SearchIcon size={14} />
          <input
            value={search}
            placeholder="Search briefs…"
            aria-label="Search projects"
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <button
          className="bar-button"
          data-testid="library-new-brief"
          onClick={() => {
            void newProject().then(() => setLibraryOpen(false))
          }}
        >
          <PlusIcon size={13} /> New brief
        </button>
        <button
          className="icon-button"
          aria-label="Close library"
          data-testid="library-close"
          onClick={() => setLibraryOpen(false)}
        >
          <CloseIcon size={15} />
        </button>
      </div>
      {projects !== null && filtered.length === 0 && (
        <p className="library-empty" data-testid="library-empty">
          {search ? 'No briefs match your search.' : 'No saved briefs yet. Start marking up a screenshot and it will appear here.'}
        </p>
      )}
      <div className="library-grid">
        {filtered.map((meta) => (
          <ProjectCard
            key={meta.id}
            meta={meta}
            isCurrent={meta.id === project?.id}
            onOpen={() => {
              void loadProject(meta.id).then(() => setLibraryOpen(false))
            }}
            onDuplicate={() => {
              void duplicateProjectById(meta.id).then(() => setLibraryOpen(false))
            }}
            onDelete={() => setConfirmDelete(meta)}
          />
        ))}
      </div>
      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-label="Confirm deletion">
          <div className="modal">
            <p>
              Delete “<strong>{confirmDelete.title}</strong>”? This permanently removes the brief
              and its pages.
            </p>
            <div className="modal-actions">
              <button className="bar-button" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="bar-button danger"
                data-testid="confirm-delete-project"
                onClick={() => {
                  const id = confirmDelete.id
                  setConfirmDelete(null)
                  void deleteProjectById(id).then(refresh)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
