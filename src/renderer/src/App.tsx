import React, { useEffect, useState } from 'react'
import { useProjectStore } from './stores/projectStore'
import { useUiStore } from './stores/uiStore'
import { TopBar } from './components/TopBar'
import { VisualToolbar } from './components/VisualToolbar'
import { PageEditor } from './components/PageEditor'
import { EmptyState } from './components/EmptyState'
import { ProjectLibrary } from './components/ProjectLibrary'
import { SettingsDialog } from './components/SettingsDialog'
import { importDroppedFiles, importFilesToPage } from './services/importActions'
import { importFiles } from './services/media'
import { checkPendingCapture, openCapturedProject } from './services/capture'

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

export default function App() {
  const project = useProjectStore((s) => s.project)
  const ready = useProjectStore((s) => s.ready)
  const libraryOpen = useUiStore((s) => s.libraryOpen)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const focusMode = useUiStore((s) => s.focusMode)
  const recoveryNotice = useUiStore((s) => s.recoveryNotice)
  const setRecoveryNotice = useUiStore((s) => s.setRecoveryNotice)
  const permissionHelpOpen = useUiStore((s) => s.permissionHelpOpen)
  const setPermissionHelpOpen = useUiStore((s) => s.setPermissionHelpOpen)
  const shortcutNotice = useUiStore((s) => s.shortcutNotice)
  const setShortcutNotice = useUiStore((s) => s.setShortcutNotice)
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown')
  const [permissionKind, setPermissionKind] = useState<'missing' | 'stale'>('missing')

  // Boot: restore the last active project (or newest, or a fresh draft).
  useEffect(() => {
    void useProjectStore
      .getState()
      .init()
      .then(() => checkPendingCapture())
    // Test hook: lets e2e tests read app state without scraping canvases.
    ;(window as any).__sbTest = {
      getProject: () => useProjectStore.getState().project,
      getSaveStatus: () => useProjectStore.getState().saveStatus
    }
  }, [])

  // Quick Capture events from the main process. Captures are authored in the
  // overlay; the main window is only told which finished project to open.
  useEffect(() => {
    const offOpen = window.smartBrief.onCaptureOpenProject((payload) => {
      void openCapturedProject(payload.projectId)
    })
    const offPermission = window.smartBrief.onCapturePermissionRequired((payload) => {
      setPermissionKind(payload?.kind ?? 'missing')
      void checkPendingCapture()
    })
    const offShortcut = window.smartBrief.onCaptureShortcutStatus((status) => {
      useUiStore
        .getState()
        .setShortcutNotice(
          status.ok
            ? null
            : `The Quick Capture shortcut ${status.shortcut} could not be registered` +
                (status.reason === 'conflict' ? ' (another app is using it).' : '.') +
                ' Change it in Settings.'
        )
    })
    return () => {
      offOpen()
      offPermission()
      offShortcut()
    }
  }, [])

  // While the permission explainer is open, re-check on window focus so the
  // user sees the state flip after granting access in System Settings.
  useEffect(() => {
    if (!permissionHelpOpen) return
    let cancelled = false
    const refresh = () => {
      void window.smartBrief.getScreenPermissionStatus().then((s) => {
        if (!cancelled) setPermissionStatus(s)
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
    }
  }, [permissionHelpOpen])

  // Menu actions from the main process.
  useEffect(() => {
    return window.smartBrief.onMenu((action) => {
      const store = useProjectStore.getState()
      const ui = useUiStore.getState()
      switch (action) {
        case 'new-brief':
          void store.newProject()
          break
        case 'open-images':
          void import('./services/importActions').then((m) => m.importFilesFromDialog())
          break
        case 'save':
          void store.flush()
          break
        case 'export':
          ui.setExportOpen(true)
          break
        case 'open-library':
          void store.flush().then(() => ui.setLibraryOpen(true))
          break
        case 'undo':
        case 'redo': {
          if (isTextTarget(document.activeElement)) {
            document.execCommand(action)
          } else {
            const pageId = store.project?.activePageId
            if (pageId) (action === 'undo' ? store.undo : store.redo)(pageId)
          }
          break
        }
      }
    })
  }, [])

  // Flush pending saves when the window is about to close.
  useEffect(() => {
    return window.smartBrief.onRequestFlush(() => {
      void useProjectStore
        .getState()
        .flush()
        .finally(() => window.smartBrief.flushDone())
    })
  }, [])

  // Global keyboard shortcuts that are not menu accelerators.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUiStore.getState()
      const store = useProjectStore.getState()
      if (e.key === 'Escape') {
        // Priority cascade — one action per keypress. Composer/overall-message
        // textareas handle their own Esc (collapse) and stop propagation.
        if (ui.exportOpen) ui.setExportOpen(false)
        else if (ui.settingsOpen) ui.setSettingsOpen(false)
        else if (ui.permissionHelpOpen) ui.setPermissionHelpOpen(false)
        else if (ui.libraryOpen) ui.setLibraryOpen(false)
        else if (ui.drawingActive) {
          /* the canvas cancels the in-progress shape */
        } else if (isTextTarget(e.target)) (e.target as HTMLElement).blur()
        else if (ui.selection) ui.setSelection(null)
        return
      }
      if (isTextTarget(e.target)) return
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault()
        ui.setSpacePan(true)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selection = ui.selection
        if (selection) {
          e.preventDefault()
          if (selection.kind === 'annotation') {
            store.deleteAnnotation(selection.pageId, selection.id)
          } else {
            store.deletePlacedImage(selection.pageId, selection.id)
          }
        }
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
  }, [])

  // Clipboard paste: image on a blank page becomes a placed image; otherwise a new page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTextTarget(e.target)) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length === 0) return
      e.preventDefault()
      const store = useProjectStore.getState()
      const activePage = store.project?.pages.find((p) => p.id === store.project?.activePageId)
      if (activePage?.kind === 'blank') {
        void importFilesToPage(activePage.id, files)
      } else {
        void (async () => {
          const refs = await importFiles(files)
          if (refs.length > 0) {
            store.addPagesFromMedia(refs, store.project?.activePageId ?? undefined)
          }
        })()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const handleWorkspaceDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    void importDroppedFiles(files, useProjectStore.getState().project?.activePageId)
  }

  if (!ready) {
    return <div className="app-loading">Loading…</div>
  }

  const pages = project?.pages ?? []

  return (
    <div className="app" data-focus={focusMode}>
      <TopBar />
      {recoveryNotice && (
        <div className="recovery-banner" role="alert">
          <span>{recoveryNotice}</span>
          <button className="link-button" onClick={() => setRecoveryNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      {shortcutNotice && (
        <div className="recovery-banner" role="alert" data-testid="shortcut-notice">
          <span>{shortcutNotice}</span>
          <button className="link-button" onClick={() => setShortcutNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="app-body">
        <VisualToolbar />
        <main
          className="workspace"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleWorkspaceDrop}
        >
          {pages.length === 0 ? (
            <EmptyState />
          ) : (
            pages.map((page, i) => (
              <PageEditor key={page.id} page={page} pageIndex={i} pageCount={pages.length} />
            ))
          )}
        </main>
      </div>
      {libraryOpen && <ProjectLibrary />}
      {settingsOpen && <SettingsDialog />}
      {permissionHelpOpen && (
        <div className="modal-backdrop" role="dialog" aria-label="Screen Recording permission">
          <div className="modal" data-testid="permission-help">
            <h3>
              {permissionKind === 'stale'
                ? 'Screen Recording stopped working'
                : 'Screen Recording permission needed'}
            </h3>
            {permissionKind === 'stale' ? (
              <>
                <p className="settings-line">
                  macOS still lists Smart Brief as allowed, but it is no longer handing over
                  other apps' windows — a capture right now would show only your wallpaper,
                  the menu bar and the Dock.
                </p>
                <p className="settings-line">
                  This happens when the app is replaced by a new build. Open System Settings →
                  Privacy &amp; Security → <strong>Screen Recording</strong>, switch Smart
                  Brief <strong>off and then on again</strong>, and reopen the app.
                </p>
              </>
            ) : (
              <>
                <p className="settings-line">
                  Quick Capture takes a picture of your screen, which macOS only allows after
                  you enable <strong>Screen Recording</strong> for Smart Brief in System
                  Settings → Privacy &amp; Security.
                </p>
                <p className="settings-line">
                  After enabling it, macOS may require quitting and reopening Smart Brief
                  before captures work.
                </p>
              </>
            )}
            {permissionStatus === 'granted' && (
              <p className="settings-line success">
                Permission looks granted now — try the capture shortcut again.
              </p>
            )}
            <div className="modal-actions">
              <button
                className="bar-button"
                onClick={() => void window.smartBrief.openScreenRecordingSettings()}
              >
                Open System Settings
              </button>
              <button
                className="bar-button primary"
                autoFocus
                onClick={() => setPermissionHelpOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
