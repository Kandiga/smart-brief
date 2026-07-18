import { useEffect, useRef, useState } from 'react'
import type { Page } from '@shared/schemas/project'
import { useProjectStore } from '../stores/projectStore'
import { CanvasWorkspace } from './CanvasWorkspace'
import { InstructionPanel } from './InstructionPanel'
import { importFilesFromDialog } from '../services/importActions'
import {
  ClearMarksIcon,
  DownIcon,
  DuplicateIcon,
  PlusIcon,
  TrashIcon,
  UpIcon
} from './icons'

interface Props {
  page: Page
  pageIndex: number
  pageCount: number
}

export function PageEditor({ page, pageIndex, pageCount }: Props) {
  const setPageTitle = useProjectStore((s) => s.setPageTitle)
  const movePage = useProjectStore((s) => s.movePage)
  const duplicatePage = useProjectStore((s) => s.duplicatePage)
  const deletePage = useProjectStore((s) => s.deletePage)
  const clearMarks = useProjectStore((s) => s.clearMarks)
  const setActivePage = useProjectStore((s) => s.setActivePage)
  const activePageId = useProjectStore((s) => s.project?.activePageId ?? null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Lazy-render the canvas until the section is near the viewport.
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(pageIndex < 2)
  useEffect(() => {
    if (visible) return
    const el = sectionRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible(true)
      },
      { rootMargin: '600px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

  return (
    <section
      ref={sectionRef}
      className="page-section"
      data-testid={`page-section-${pageIndex}`}
      data-active={activePageId === page.id}
      onMouseDown={() => setActivePage(page.id)}
    >
      <header className="page-header">
        <span className="page-number">{pageIndex + 1}</span>
        <input
          className="page-title"
          data-testid={`page-title-${pageIndex}`}
          value={page.title}
          placeholder={page.kind === 'blank' ? 'Blank canvas' : 'Page title'}
          aria-label={`Title for page ${pageIndex + 1}`}
          spellCheck={false}
          onChange={(e) => setPageTitle(page.id, e.target.value)}
        />
        <div className="page-actions">
          <button
            className="icon-button"
            aria-label="Move page up"
            title="Move page up"
            disabled={pageIndex === 0}
            onClick={() => movePage(page.id, -1)}
          >
            <UpIcon size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Move page down"
            title="Move page down"
            disabled={pageIndex === pageCount - 1}
            onClick={() => movePage(page.id, 1)}
          >
            <DownIcon size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Duplicate page"
            title="Duplicate page"
            onClick={() => duplicatePage(page.id)}
          >
            <DuplicateIcon size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Clear marks on this page"
            title="Clear marks (undoable)"
            disabled={page.annotations.length === 0}
            onClick={() => clearMarks(page.id)}
          >
            <ClearMarksIcon size={14} />
          </button>
          {confirmingDelete ? (
            <button
              className="icon-button danger confirming"
              aria-label="Confirm delete page"
              title="Click again to delete this page"
              data-testid={`confirm-delete-page-${pageIndex}`}
              onClick={() => {
                setConfirmingDelete(false)
                deletePage(page.id)
              }}
            >
              Delete?
            </button>
          ) : (
            <button
              className="icon-button danger"
              aria-label="Delete page"
              title="Delete page"
              data-testid={`delete-page-${pageIndex}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="page-body">
        {visible ? (
          <CanvasWorkspace page={page} pageIndex={pageIndex} />
        ) : (
          <div className="canvas-wrapper canvas-placeholder" aria-hidden="true" />
        )}
        <InstructionPanel page={page} />
      </div>
      <div className="insert-row">
        <button
          className="insert-button"
          data-testid={`insert-after-${pageIndex}`}
          title="Insert screenshots after this page"
          onClick={() => void importFilesFromDialog(page.id)}
        >
          <PlusIcon size={12} />{' '}
          {pageIndex === pageCount - 1 ? 'Add next screenshot' : 'Insert screenshot here'}
        </button>
      </div>
    </section>
  )
}
