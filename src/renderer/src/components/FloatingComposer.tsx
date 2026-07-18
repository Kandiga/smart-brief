import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Page, RegionAnnotation } from '@shared/schemas/project'
import { regionsOf } from '@shared/schemas/project'
import { pageToScreen, type Viewport } from '@shared/geometry'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { TrashIcon } from './icons'

const COMPOSER_WIDTH = 320
const COMPOSER_EST_HEIGHT = 170
const GAP = 12

interface Props {
  page: Page
  region: RegionAnnotation
  view: Viewport
  containerWidth: number
  containerHeight: number
}

/**
 * Floating instruction editor for Quick Capture mode. Appears next to the
 * region (auto-flipping so it never covers it), never resizes the canvas,
 * and saves through the normal store mutations (autosave + undo included).
 * Esc / ⌘Enter collapse it; the region, its number and its text always stay.
 */
export function FloatingComposer({ page, region, view, containerWidth, containerHeight }: Props) {
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const deleteAnnotation = useProjectStore((s) => s.deleteAnnotation)
  const setSelection = useUiStore((s) => s.setSelection)
  const setComposerCollapsed = useUiStore((s) => s.setComposerCollapsed)
  const focusInstructionId = useUiStore((s) => s.focusInstructionId)
  const setFocusInstruction = useUiStore((s) => s.setFocusInstruction)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  const regions = regionsOf(page)
  const index = regions.findIndex((r) => r.id === region.id)

  // Anchor next to the region: prefer right, flip left, then below, then above.
  const position = useMemo(() => {
    const topLeft = pageToScreen({ x: region.x, y: region.y }, view)
    const bottomRight = pageToScreen(
      { x: region.x + region.width, y: region.y + region.height },
      view
    )
    let x = bottomRight.x + GAP
    let y = topLeft.y
    if (x + COMPOSER_WIDTH > containerWidth - 8) {
      x = topLeft.x - GAP - COMPOSER_WIDTH
    }
    if (x < 8) {
      x = Math.min(Math.max(8, topLeft.x), containerWidth - COMPOSER_WIDTH - 8)
      y = bottomRight.y + GAP
      if (y + COMPOSER_EST_HEIGHT > containerHeight - 8) {
        y = topLeft.y - GAP - COMPOSER_EST_HEIGHT
      }
    }
    x = Math.min(Math.max(8, x + dragOffset.x), Math.max(8, containerWidth - COMPOSER_WIDTH - 8))
    y = Math.min(Math.max(8, y + dragOffset.y), Math.max(8, containerHeight - 120))
    return { x, y }
  }, [region, view, containerWidth, containerHeight, dragOffset])

  // Reset the manual drag offset when jumping to another region.
  useEffect(() => {
    setDragOffset({ x: 0, y: 0 })
  }, [region.id])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.focus()
    if (focusInstructionId === region.id) setFocusInstruction(null)
    // Put the caret at the end for quick continued typing.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [region.id]) // refocus only when jumping between regions, not per keystroke

  const autoGrow = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(160, el.scrollHeight)}px`
    }
  }
  useEffect(autoGrow, [region.instruction])

  const goTo = (offset: number) => {
    const next = regions[index + offset]
    if (!next) return
    setSelection({ pageId: page.id, kind: 'annotation', id: next.id })
    setComposerCollapsed(false)
  }

  const collapse = () => {
    setComposerCollapsed(true)
    textareaRef.current?.blur()
  }

  const startDrag = (e: React.PointerEvent) => {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y
    }
    const onMove = (ev: PointerEvent) => {
      const s = dragState.current
      if (!s) return
      setDragOffset({ x: s.baseX + ev.clientX - s.startX, y: s.baseY + ev.clientY - s.startY })
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className="floating-composer"
      data-testid="floating-composer"
      style={{ left: position.x, top: position.y, width: COMPOSER_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header className="composer-header" onPointerDown={startDrag}>
        <span className="region-badge" style={{ background: region.color }}>
          {region.number}
        </span>
        <span className="composer-title">Region {region.number}</span>
        <div className="composer-nav">
          <button
            className="icon-button"
            aria-label="Previous region"
            title="Previous region"
            disabled={index <= 0}
            onClick={() => goTo(-1)}
          >
            ‹
          </button>
          <button
            className="icon-button"
            aria-label="Next region"
            title="Next region"
            disabled={index >= regions.length - 1}
            onClick={() => goTo(1)}
          >
            ›
          </button>
          <button
            className="icon-button danger"
            aria-label={`Delete region ${region.number}`}
            title="Delete region"
            onClick={() => deleteAnnotation(page.id, region.id)}
          >
            <TrashIcon size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Collapse instruction"
            title="Collapse (Esc) — the region and text are kept"
            onClick={collapse}
          >
            ✕
          </button>
        </div>
      </header>
      <textarea
        ref={textareaRef}
        className="composer-instruction"
        data-testid="composer-instruction"
        value={region.instruction}
        rows={2}
        placeholder="Describe the change for this area…"
        aria-label={`Instruction for region ${region.number}`}
        onChange={(e) => {
          updateAnnotation(page.id, region.id, { instruction: e.target.value }, `instruction-${region.id}`)
          autoGrow()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            collapse()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            collapse()
          }
        }}
      />
      <footer className="composer-footer">⌘↩ done · Esc collapse</footer>
    </div>
  )
}
