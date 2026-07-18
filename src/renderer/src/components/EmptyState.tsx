import { useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { importDroppedFiles, importFilesFromDialog } from '../services/importActions'
import { BlankIcon, ImageIcon } from './icons'

export function EmptyState() {
  const addBlankPage = useProjectStore((s) => s.addBlankPage)
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className="empty-state"
      data-testid="empty-state"
      data-dragover={dragOver}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        void importDroppedFiles(files)
      }}
    >
      <div className="empty-drop">
        <p className="empty-title">Drop screenshots here</p>
        <div className="empty-actions">
          <button
            className="bar-button primary"
            data-testid="choose-screenshots"
            onClick={() => void importFilesFromDialog()}
          >
            <ImageIcon /> Choose screenshots
          </button>
          <button className="bar-button" data-testid="start-blank" onClick={addBlankPage}>
            <BlankIcon /> Start with blank canvas
          </button>
          <button
            className="bar-button"
            data-testid="start-capture"
            title="Capture an area of your screen"
            onClick={() => void window.smartBrief.startCapture()}
          >
            Quick Capture
          </button>
        </div>
        <p className="empty-hint">or paste with ⌘V — or press the capture shortcut anywhere</p>
        <p className="empty-privacy">Files stay on this Mac and are saved automatically.</p>
      </div>
    </div>
  )
}
