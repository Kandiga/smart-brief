import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { importFilesFromDialog } from '../services/importActions'
import { ExportMenu } from './ExportMenu'
import {
  BlankIcon,
  DotsIcon,
  ExportIcon,
  ImageIcon,
  LibraryIcon,
  LogoMark
} from './icons'

export function TopBar() {
  const project = useProjectStore((s) => s.project)
  const saveStatus = useProjectStore((s) => s.saveStatus)
  const setTitle = useProjectStore((s) => s.setTitle)
  const retrySave = useProjectStore((s) => s.retrySave)
  const newProject = useProjectStore((s) => s.newProject)
  const addBlankPage = useProjectStore((s) => s.addBlankPage)
  const flush = useProjectStore((s) => s.flush)
  const setLibraryOpen = useUiStore((s) => s.setLibraryOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const exportOpen = useUiStore((s) => s.exportOpen)
  const setExportOpen = useUiStore((s) => s.setExportOpen)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuOpen])

  const openLibrary = async () => {
    await flush()
    setLibraryOpen(true)
  }

  const clearBrief = () => {
    if (!project) return
    for (const page of [...project.pages]) {
      useProjectStore.getState().deletePage(page.id)
    }
    setMenuOpen(false)
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <LogoMark />
        <span className="product-name">Smart Brief</span>
      </div>
      <div className="topbar-center">
        <input
          className="project-title"
          data-testid="project-title"
          value={project?.title ?? ''}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled brief"
          aria-label="Project title"
          spellCheck={false}
        />
        <span className="save-status" data-testid="save-status" data-status={saveStatus}>
          {saveStatus === 'saved' && 'Saved locally'}
          {saveStatus === 'unsaved' && 'Edited'}
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'failed' && (
            <>
              Save failed —{' '}
              <button className="link-button" onClick={retrySave}>
                Retry
              </button>
            </>
          )}
        </span>
      </div>
      <div className="topbar-right">
        <button
          className="bar-button"
          data-testid="add-screenshot"
          onClick={() => void importFilesFromDialog()}
          title="Import screenshots (⌘O)"
        >
          <ImageIcon /> Add screenshot
        </button>
        <button
          className="bar-button"
          data-testid="blank-canvas"
          onClick={addBlankPage}
          title="Add a blank 1500×900 canvas page"
        >
          <BlankIcon /> Blank canvas
        </button>
        <button
          className="bar-button"
          data-testid="open-library"
          onClick={() => void openLibrary()}
          title="Project library"
        >
          <LibraryIcon /> Library
        </button>
        <div className="export-anchor">
          <button
            className="bar-button primary"
            data-testid="export-button"
            onClick={() => setExportOpen(!exportOpen)}
            title="Export (⌘E)"
          >
            <ExportIcon /> Export
          </button>
          {exportOpen && <ExportMenu />}
        </div>
        <div className="export-anchor" ref={menuRef}>
          <button
            className="bar-button icon-only"
            aria-label="More actions"
            data-testid="overflow-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            title="More actions"
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div className="dropdown" role="menu">
              <button
                role="menuitem"
                data-testid="menu-new-brief"
                onClick={() => {
                  setMenuOpen(false)
                  void newProject()
                }}
              >
                New brief
              </button>
              <button role="menuitem" onClick={clearBrief}>
                Clear current brief
              </button>
              <div className="dropdown-separator" />
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setSettingsOpen(true)
                }}
              >
                Settings…
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
