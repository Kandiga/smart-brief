import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureOverlayInit } from '@shared/contracts/ipc'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { CanvasWorkspace } from '../components/CanvasWorkspace'
import { VisualToolbar } from '../components/VisualToolbar'
import { SelectionLayer, type SelectionRect } from './SelectionLayer'

type Phase = 'loading' | 'select' | 'grabbing' | 'annotate'

/**
 * Quick Capture happens entirely inside this overlay: select a region, then
 * annotate it **in place** over the frozen screen. The Smart Brief window is
 * never brought forward — pressing Done hands the finished project to it.
 *
 * Annotation reuses the real editor: the same project store (so autosave,
 * revisions and undo/redo are the proven ones), the same Konva canvas, the
 * same tools and the same floating instruction composer.
 */
export function CaptureOverlayApp() {
  const [init, setInit] = useState<CaptureOverlayInit | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const projectIdRef = useRef<string | null>(null)
  const finishedRef = useRef(false)

  const project = useProjectStore((s) => s.project)
  const page = project?.pages[0] ?? null

  useEffect(() => {
    // Test hook: lets e2e assert real overlay state instead of guessing ids.
    ;(window as any).__sbCaptureTest = {
      getProjectId: () => projectIdRef.current,
      getProject: () => useProjectStore.getState().project
    }
    void window.smartBrief.captureOverlayInit().then((data) => {
      if (!data) {
        window.smartBrief.captureOverlayCancel()
        return
      }
      setInit(data)
      setPhase('select')
    })
  }, [])

  /** Discard everything this capture created, then close the overlay. */
  const cancel = useCallback(async () => {
    if (finishedRef.current) return
    finishedRef.current = true
    const id = projectIdRef.current
    if (id) {
      // Official deletion path: tombstone + media garbage collection, so a
      // cancelled capture leaves no ghost project and no orphan screenshot.
      const store = useProjectStore.getState()
      await store.flush().catch(() => undefined)
      await store.deleteProjectById(id).catch(() => undefined)
    }
    window.smartBrief.captureOverlayCancel()
  }, [])

  /** Esc / Cancel: never throw away authored work without asking first. */
  const requestCancel = useCallback(() => {
    const project = useProjectStore.getState().project
    const authored = project?.pages.some(
      (p) => p.annotations.length > 0 || p.overallMessage.trim().length > 0
    )
    if (authored && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    void cancel()
  }, [cancel, confirmDiscard])

  const finish = useCallback(async () => {
    const id = projectIdRef.current
    if (!id || finishedRef.current) return
    finishedRef.current = true
    await useProjectStore.getState().flush().catch(() => undefined)
    window.smartBrief.captureFinish(id)
  }, [])

  /** A completed drag: grab the region natively and switch to annotating. */
  const handleSelected = useCallback(
    async (rect: SelectionRect) => {
      if (!init) return
      setPhase('grabbing')
      const grabbed = await window.smartBrief.captureGrabRegion(rect)
      if (!grabbed) {
        setError('That region could not be captured. Press Esc and try again.')
        setPhase('select')
        return
      }
      const store = useProjectStore.getState()
      await store.newProject()
      store.addPagesFromMedia([grabbed])
      const created = useProjectStore.getState()
      projectIdRef.current = created.project?.id ?? null
      const newPage = created.project?.pages[0]
      if (newPage) {
        // Render the capture at exactly 1:1 over the spot it came from, so the
        // annotation surface sits where the content actually is on screen.
        created.setViewState(newPage.id, rect.width / grabbed.width, { x: 0, y: 0 })
      }
      const ui = useUiStore.getState()
      ui.setTool('region')
      ui.setSelection(null)
      ui.setComposerCollapsed(false)
      setSelection(rect)
      setPhase('annotate')
    },
    [init]
  )

  // Esc cascade for the overlay. Text fields and the composer handle their own
  // Esc (collapse) and stop propagation, so this only sees the rest.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const ui = useUiStore.getState()
      if (ui.drawingActive) return // the canvas cancels the in-progress shape
      if (ui.overallComposerOpen) {
        ui.setOverallComposerOpen(false)
        return
      }
      if (ui.selection) {
        ui.setSelection(null)
        return
      }
      e.preventDefault()
      requestCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [requestCancel])

  // Space-to-pan and Delete-to-remove, matching the main editor.
  useEffect(() => {
    const isTextTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextTarget(e.target)) return
      const ui = useUiStore.getState()
      const store = useProjectStore.getState()
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        ui.setSpacePan(true)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = ui.selection
        if (sel) {
          e.preventDefault()
          if (sel.kind === 'annotation') store.deleteAnnotation(sel.pageId, sel.id)
          else store.deletePlacedImage(sel.pageId, sel.id)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const pageId = store.project?.activePageId
        if (pageId) (e.shiftKey ? store.redo : store.undo)(pageId)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void finish()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') useUiStore.getState().setSpacePan(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [finish])

  if (!init) return null

  const annotating = phase === 'annotate' && selection !== null && page !== null

  return (
    <div className="capture-overlay" data-phase={phase} data-testid="capture-overlay">
      <div
        className="capture-frame"
        style={{ backgroundImage: `url("${init.previewDataUrl}")` }}
      />

      {phase === 'select' && (
        <SelectionLayer scaleFactor={init.scaleFactor} onSelected={handleSelected} />
      )}

      {phase === 'grabbing' && <div className="capture-dim" />}

      {annotating && selection && page && (
        <>
          {/* Dim everything except the captured region, which stays bright and
              exactly where it came from. */}
          <div
            className="capture-spotlight"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height
            }}
          />
          <div
            className="capture-canvas-host"
            data-testid="capture-canvas-host"
            style={{
              left: selection.x,
              top: selection.y,
              width: selection.width,
              height: selection.height
            }}
          >
            <CanvasWorkspace page={page} pageIndex={0} floatingComposer />
          </div>
          <CaptureToolbar
            selection={selection}
            overlayWidth={init.overlayWidth}
            overlayHeight={init.overlayHeight}
            onDone={() => void finish()}
            onCancel={requestCancel}
          />
          <OverallComposer pageId={page.id} />
        </>
      )}

      {confirmDiscard && (
        <div className="capture-confirm" role="alertdialog" data-testid="capture-confirm-discard">
          <span>Discard this capture and everything you marked?</span>
          <button className="bar-button" onClick={() => setConfirmDiscard(false)}>
            Keep editing
          </button>
          <button
            className="bar-button danger"
            data-testid="capture-confirm-discard-yes"
            onClick={() => void cancel()}
          >
            Discard
          </button>
        </div>
      )}

      {error && (
        <div className="capture-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}

/** Floating editor for the capture's one overall message. */
function OverallComposer({ pageId }: { pageId: string }) {
  const open = useUiStore((s) => s.overallComposerOpen)
  const setOpen = useUiStore((s) => s.setOverallComposerOpen)
  const setOverallMessage = useProjectStore((s) => s.setOverallMessage)
  const message = useProjectStore(
    (s) => s.project?.pages.find((p) => p.id === pageId)?.overallMessage ?? ''
  )
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div className="overall-composer capture-overall" data-testid="overall-composer">
      <header className="composer-header">
        <span className="composer-title">Overall message</span>
        <button
          className="icon-button"
          aria-label="Close overall message"
          title="Close — the message is kept"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </header>
      <textarea
        ref={ref}
        className="composer-instruction"
        data-testid="overall-composer-input"
        value={message}
        rows={2}
        placeholder="One sentence that explains the main idea…"
        aria-label="Overall message for this capture"
        onChange={(e) => setOverallMessage(pageId, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }
        }}
      />
    </div>
  )
}

/**
 * Floating toolbar. Sits just below the selection when there is room, above it
 * otherwise, so it never covers the area being annotated.
 */
function CaptureToolbar({
  selection,
  overlayWidth,
  overlayHeight,
  onDone,
  onCancel
}: {
  selection: SelectionRect
  overlayWidth: number
  overlayHeight: number
  onDone: () => void
  onCancel: () => void
}) {
  const setOverallOpen = useUiStore((s) => s.setOverallComposerOpen)
  const overallOpen = useUiStore((s) => s.overallComposerOpen)
  const TOOLBAR_HEIGHT = 52
  const GAP = 10
  const below = selection.y + selection.height + GAP
  const fitsBelow = below + TOOLBAR_HEIGHT < overlayHeight - 8
  const top = fitsBelow ? below : Math.max(8, selection.y - GAP - TOOLBAR_HEIGHT)
  const left = Math.min(Math.max(8, selection.x), Math.max(8, overlayWidth - 620))

  return (
    <div className="capture-toolbar" style={{ left, top }} data-testid="capture-toolbar">
      <VisualToolbar orientation="horizontal" />
      <div className="capture-toolbar-actions">
        <button
          className="bar-button"
          data-testid="capture-overall-message"
          aria-pressed={overallOpen}
          title="Overall message for this capture"
          onClick={() => setOverallOpen(!overallOpen)}
        >
          Note
        </button>
        <button
          className="bar-button"
          data-testid="capture-cancel"
          title="Discard this capture (Esc)"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="bar-button primary"
          data-testid="capture-done"
          title="Send to Smart Brief (⌘↩)"
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  )
}
