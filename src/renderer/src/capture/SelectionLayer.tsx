import { useEffect, useRef, useState } from 'react'

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The drag-to-select phase: a dim sheet over the frozen screen, a crosshair,
 * and a marquee that shows the size in real device pixels while dragging.
 */
export function SelectionLayer({
  scaleFactor,
  onSelected
}: {
  scaleFactor: number
  onSelected: (rect: SelectionRect) => void
}) {
  const [drag, setDrag] = useState<{ startX: number; startY: number; x: number; y: number } | null>(
    null
  )
  const draggingRef = useRef(false)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      draggingRef.current = true
      setDrag({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY })
    }
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d))
    }
    const onUp = (e: MouseEvent) => {
      if (!draggingRef.current || e.button !== 0) return
      draggingRef.current = false
      setDrag((d) => {
        if (!d) return null
        const rect = rectOf({ ...d, x: e.clientX, y: e.clientY })
        // A stray click is not a selection: reset and keep waiting.
        if (rect.width < 3 || rect.height < 3) return null
        onSelected(rect)
        return null
      })
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onSelected])

  const rect = drag ? rectOf(drag) : null

  return (
    <div className="capture-select-layer" data-testid="capture-select-layer">
      {!rect && <div className="capture-dim" />}
      {rect && (
        <>
          <div
            className="capture-marquee"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          <div
            className="capture-dims"
            style={{
              left: Math.max(4, rect.x),
              top: rect.y + rect.height + 30 < window.innerHeight ? rect.y + rect.height + 8 : Math.max(4, rect.y - 28)
            }}
          >
            {Math.round(rect.width * scaleFactor)} × {Math.round(rect.height * scaleFactor)}
          </div>
        </>
      )}
      {!rect && <div className="capture-hint">Drag to capture an area — Esc to cancel</div>}
    </div>
  )
}

function rectOf(d: { startX: number; startY: number; x: number; y: number }): SelectionRect {
  return {
    x: Math.min(d.startX, d.x),
    y: Math.min(d.startY, d.y),
    width: Math.abs(d.x - d.startX),
    height: Math.abs(d.y - d.startY)
  }
}
