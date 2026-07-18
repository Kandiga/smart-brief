import React from 'react'
import { PALETTE, useUiStore, type Tool } from '../stores/uiStore'
import { useProjectStore } from '../stores/projectStore'
import {
  ArrowIcon,
  BoxIcon,
  CircleIcon,
  EditIcon,
  FitIcon,
  FocusIcon,
  HandIcon,
  PenIcon,
  RedoIcon,
  RegionIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon
} from './icons'

const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ size?: number }>; hint: string }[] = [
  { id: 'region', label: 'Region', icon: RegionIcon, hint: 'Numbered region with instruction' },
  { id: 'arrow', label: 'Arrow', icon: ArrowIcon, hint: 'Arrow' },
  { id: 'pen', label: 'Draw', icon: PenIcon, hint: 'Freehand pen' },
  { id: 'rectangle', label: 'Box', icon: BoxIcon, hint: 'Rectangle' },
  { id: 'ellipse', label: 'Circle', icon: CircleIcon, hint: 'Ellipse' },
  { id: 'edit', label: 'Edit', icon: EditIcon, hint: 'Select, move and resize' },
  { id: 'move', label: 'Move', icon: HandIcon, hint: 'Pan the canvas (hold Space)' }
]

const STROKE_WIDTHS = [2, 3, 5, 8]

// Zoom/fit actions are dispatched to the active page canvas via a tiny event bus.
export const canvasCommand = new EventTarget()
export function sendCanvasCommand(command: 'fit' | 'zoom-in' | 'zoom-out') {
  canvasCommand.dispatchEvent(new CustomEvent('command', { detail: command }))
}

/**
 * `horizontal` is the compact form used by the Quick Capture overlay, where the
 * toolbar floats over the screen and there are no side panels to toggle.
 */
export function VisualToolbar({
  orientation = 'vertical'
}: {
  orientation?: 'vertical' | 'horizontal'
} = {}) {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const color = useUiStore((s) => s.color)
  const setColor = useUiStore((s) => s.setColor)
  const strokeWidth = useUiStore((s) => s.strokeWidth)
  const setStrokeWidth = useUiStore((s) => s.setStrokeWidth)
  const focusMode = useUiStore((s) => s.focusMode)
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode)
  const activePageId = useProjectStore((s) => s.project?.activePageId ?? null)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const historyTick = useProjectStore((s) => s.histories)
  const canUndo = activePageId ? useProjectStore.getState().canUndo(activePageId) : false
  const canRedo = activePageId ? useProjectStore.getState().canRedo(activePageId) : false
  void historyTick

  return (
    <nav className="toolbar" data-orientation={orientation} aria-label="Drawing tools">
      <div className="toolbar-group">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className="tool-button"
              data-testid={`tool-${t.id}`}
              data-active={tool === t.id}
              aria-label={t.hint}
              aria-pressed={tool === t.id}
              title={t.hint}
              onClick={() => setTool(t.id)}
            >
              <Icon size={17} />
              <span className="tool-label">{t.label}</span>
            </button>
          )
        })}
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <button
          className="tool-button"
          data-testid="undo-button"
          aria-label="Undo"
          title="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={() => activePageId && undo(activePageId)}
        >
          <UndoIcon size={17} />
          <span className="tool-label">Undo</span>
        </button>
        <button
          className="tool-button"
          data-testid="redo-button"
          aria-label="Redo"
          title="Redo (⇧⌘Z)"
          disabled={!canRedo}
          onClick={() => activePageId && redo(activePageId)}
        >
          <RedoIcon size={17} />
          <span className="tool-label">Redo</span>
        </button>
        <button
          className="tool-button"
          aria-label="Fit to view"
          title="Fit to view"
          data-testid="fit-button"
          onClick={() => sendCanvasCommand('fit')}
        >
          <FitIcon size={17} />
          <span className="tool-label">Fit</span>
        </button>
        <button
          className="tool-button"
          aria-label="Zoom out"
          title="Zoom out canvas"
          onClick={() => sendCanvasCommand('zoom-out')}
        >
          <ZoomOutIcon size={17} />
          <span className="tool-label">Out</span>
        </button>
        <button
          className="tool-button"
          aria-label="Zoom in"
          title="Zoom in canvas"
          onClick={() => sendCanvasCommand('zoom-in')}
        >
          <ZoomInIcon size={17} />
          <span className="tool-label">In</span>
        </button>
        {orientation === 'vertical' && (
          <button
            className="tool-button"
            aria-label="Focus mode"
            aria-pressed={focusMode}
            data-active={focusMode}
            title="Focus mode: hide panels"
            onClick={toggleFocusMode}
          >
            <FocusIcon size={17} />
            <span className="tool-label">Focus</span>
          </button>
        )}
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group palette" role="radiogroup" aria-label="Annotation color">
        {PALETTE.map((c) => (
          <button
            key={c.value}
            className="swatch"
            role="radio"
            aria-checked={color === c.value}
            aria-label={c.name}
            title={c.name}
            data-active={color === c.value}
            style={{ background: c.value }}
            onClick={() => setColor(c.value)}
          />
        ))}
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group" role="radiogroup" aria-label="Stroke width">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            className="stroke-button"
            role="radio"
            aria-checked={strokeWidth === w}
            aria-label={`Stroke width ${w}`}
            title={`Stroke width ${w}px`}
            data-active={strokeWidth === w}
            onClick={() => setStrokeWidth(w)}
          >
            <span className="stroke-dot" style={{ width: w + 3, height: w + 3 }} />
          </button>
        ))}
      </div>
    </nav>
  )
}
