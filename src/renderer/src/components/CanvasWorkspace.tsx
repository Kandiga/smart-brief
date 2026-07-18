import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Stage,
  Layer,
  Rect,
  Ellipse,
  Arrow,
  Line,
  Circle,
  Text,
  Group,
  Image as KonvaImage,
  Transformer
} from 'react-konva'
import type Konva from 'konva'
import type {
  Annotation,
  ArrowAnnotation,
  Page,
  PenAnnotation,
  RegionAnnotation
} from '@shared/schemas/project'
import {
  clampZoom,
  fitToView,
  normalizeRect,
  pageToScreen,
  screenToPage,
  thinPoints,
  zoomAt,
  type Viewport
} from '@shared/geometry'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { useMediaImage } from '../canvas/useMediaImage'
import { canvasCommand } from './VisualToolbar'
import { importFilesToPage } from '../services/importActions'
import { FloatingComposer } from './FloatingComposer'

const REGION_BADGE_RADIUS = 14
const REGION_DASH = [8, 4]
const BADGE_FONT =
  '-apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Arial, sans-serif'

interface DraftShape {
  tool: 'region' | 'arrow' | 'rectangle' | 'ellipse'
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface Props {
  page: Page
  pageIndex: number
  /** Quick Capture mode: floating per-region composer instead of the sidebar. */
  floatingComposer?: boolean
}

function PlacedImageNode({
  pageId,
  item,
  isEdit,
  isSelected,
  onSelect
}: {
  pageId: string
  item: Page['placedImages'][number]
  isEdit: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const image = useMediaImage(item.file)
  const updatePlacedImage = useProjectStore((s) => s.updatePlacedImage)
  return (
    <KonvaImage
      id={item.id}
      name={`placed-${item.id}`}
      image={image ?? undefined}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      stroke={isSelected ? '#0090ff' : undefined}
      strokeWidth={isSelected ? 1.5 : 0}
      strokeScaleEnabled={false}
      draggable={isEdit}
      listening={isEdit}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        updatePlacedImage(pageId, item.id, { x: e.target.x(), y: e.target.y() })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const width = Math.max(16, node.width() * node.scaleX())
        const height = Math.max(16, node.height() * node.scaleY())
        node.scaleX(1)
        node.scaleY(1)
        updatePlacedImage(pageId, item.id, { x: node.x(), y: node.y(), width, height })
      }}
    />
  )
}

export function CanvasWorkspace({ page, pageIndex, floatingComposer = false }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [view, setViewRaw] = useState<Viewport | null>(null)
  const [draft, setDraft] = useState<DraftShape | null>(null)
  const penPointsRef = useRef<number[]>([])
  const [penPreview, setPenPreview] = useState<number[] | null>(null)
  const viewInitialized = useRef(false)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A drag that just created a shape also emits a Konva "click" on whatever
  // node the drag started on; suppress region-click handling right after.
  const lastShapeCreatedAt = useRef(0)

  const tool = useUiStore((s) => s.tool)
  const color = useUiStore((s) => s.color)
  const strokeWidth = useUiStore((s) => s.strokeWidth)
  const spacePan = useUiStore((s) => s.spacePan)
  const selection = useUiStore((s) => s.selection)
  const hoveredRegionId = useUiStore((s) => s.hoveredRegionId)
  const setSelection = useUiStore((s) => s.setSelection)
  const setFocusInstruction = useUiStore((s) => s.setFocusInstruction)
  const setDrawingActive = useUiStore((s) => s.setDrawingActive)
  const setComposerCollapsed = useUiStore((s) => s.setComposerCollapsed)
  const setHoveredRegion = useUiStore((s) => s.setHoveredRegion)
  const composerCollapsed = useUiStore((s) => s.composerCollapsed)

  const addAnnotation = useProjectStore((s) => s.addAnnotation)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const setViewState = useProjectStore((s) => s.setViewState)
  const setActivePage = useProjectStore((s) => s.setActivePage)
  const activePageId = useProjectStore((s) => s.project?.activePageId ?? null)
  const reorderPlacedImage = useProjectStore((s) => s.reorderPlacedImage)
  const deletePlacedImage = useProjectStore((s) => s.deletePlacedImage)

  const isActive = activePageId === page.id
  const panMode = tool === 'move' || spacePan
  const isEdit = tool === 'edit' && !panMode

  const sourceImage = useMediaImage(page.sourceImage?.file)

  // --- viewport ------------------------------------------------------------

  const setView = useCallback(
    (v: Viewport) => {
      setViewRaw(v)
      if (commitTimer.current) clearTimeout(commitTimer.current)
      commitTimer.current = setTimeout(() => {
        setViewState(page.id, v.zoom, v.pan)
      }, 400)
    },
    [page.id, setViewState]
  )

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      if (rect.width > 20 && rect.height > 20) {
        setSize({ w: rect.width, h: rect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!size || viewInitialized.current) return
    viewInitialized.current = true
    if (page.zoomState !== null && page.panState !== null) {
      setViewRaw({ zoom: page.zoomState, pan: page.panState })
    } else {
      setViewRaw(fitToView(page.width, page.height, size.w, size.h))
    }
  }, [size])

  // Toolbar fit/zoom commands apply to the active page only.
  useEffect(() => {
    const handler = (e: Event) => {
      if (!isActive || !size || !view) return
      const command = (e as CustomEvent).detail as string
      if (command === 'fit') {
        setView(fitToView(page.width, page.height, size.w, size.h))
      } else if (command === 'zoom-in' || command === 'zoom-out') {
        const factor = command === 'zoom-in' ? 1.25 : 0.8
        const center = { x: size.w / 2, y: size.h / 2 }
        setView(zoomAt(view, center, clampZoom(view.zoom * factor)))
      }
    }
    canvasCommand.addEventListener('command', handler)
    return () => canvasCommand.removeEventListener('command', handler)
  }, [isActive, size, view, page.width, page.height, setView])

  // Cancel an in-progress draft with Escape.
  useEffect(() => {
    if (!draft && penPreview === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft(null)
        penPointsRef.current = []
        setPenPreview(null)
        setDrawingActive(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, penPreview, setDrawingActive])

  // --- pointer handling ----------------------------------------------------

  const pagePointer = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage || !view) return null
    const pos = stage.getPointerPosition()
    if (!pos) return null
    return screenToPage(pos, view)
  }, [view])

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    setActivePage(page.id)
    if (panMode) return
    if (isEdit) {
      // Clicking empty space (stage or page background) clears the selection.
      const name = e.target.name?.() ?? ''
      if (e.target === e.target.getStage() || name === 'page-background') {
        setSelection(null)
      }
      return
    }
    const point = pagePointer()
    if (!point) return
    if (tool === 'pen') {
      penPointsRef.current = [point.x, point.y]
      setPenPreview([point.x, point.y])
      setDrawingActive(true)
    } else if (tool === 'region' || tool === 'arrow' || tool === 'rectangle' || tool === 'ellipse') {
      setDraft({ tool, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
      setDrawingActive(true)
    }
  }

  const handleMouseMove = () => {
    if (panMode || isEdit) return
    const point = pagePointer()
    if (!point) return
    if (tool === 'pen' && penPreview !== null) {
      penPointsRef.current.push(point.x, point.y)
      setPenPreview([...penPointsRef.current])
    } else if (draft) {
      setDraft({ ...draft, currentX: point.x, currentY: point.y })
    }
  }

  const handleMouseUp = () => {
    setDrawingActive(false)
    if (tool === 'pen' && penPreview !== null) {
      const points = thinPoints(penPointsRef.current, 2)
      penPointsRef.current = []
      setPenPreview(null)
      if (points.length >= 4) {
        lastShapeCreatedAt.current = Date.now()
        addAnnotation(page.id, {
          id: crypto.randomUUID(),
          type: 'pen',
          points,
          color,
          strokeWidth
        })
      }
      return
    }
    if (!draft) return
    const rect = normalizeRect(draft.startX, draft.startY, draft.currentX, draft.currentY)
    const id = crypto.randomUUID()
    setDraft(null)
    if (draft.tool === 'arrow') {
      const length = Math.hypot(draft.currentX - draft.startX, draft.currentY - draft.startY)
      if (length < 6) return
      lastShapeCreatedAt.current = Date.now()
      addAnnotation(page.id, {
        id,
        type: 'arrow',
        x1: draft.startX,
        y1: draft.startY,
        x2: draft.currentX,
        y2: draft.currentY,
        color,
        strokeWidth
      })
      return
    }
    if (rect.width < 5 && rect.height < 5) return
    lastShapeCreatedAt.current = Date.now()
    if (draft.tool === 'region') {
      const number =
        page.annotations.filter((a) => a.type === 'region').length + 1
      addAnnotation(page.id, {
        id,
        type: 'region',
        ...rect,
        color,
        strokeWidth,
        number,
        instruction: ''
      })
      setSelection({ pageId: page.id, kind: 'annotation', id })
      setComposerCollapsed(false)
      setFocusInstruction(id)
    } else if (draft.tool === 'rectangle') {
      addAnnotation(page.id, { id, type: 'rectangle', ...rect, color, strokeWidth })
    } else if (draft.tool === 'ellipse') {
      addAnnotation(page.id, { id, type: 'ellipse', ...rect, color, strokeWidth })
    }
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    if (!view) return
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    const center = pointer ?? { x: (size?.w ?? 0) / 2, y: (size?.h ?? 0) / 2 }
    // Trackpad pinch sends wheel events with ctrlKey; ⌘/Ctrl+scroll also zooms.
    // Exponential scaling keeps the gesture smooth and proportional to how fast
    // the fingers move, and lets you keep zooming in for as long as you want.
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const nextZoom = clampZoom(view.zoom * Math.exp(-e.evt.deltaY * 0.01))
      setView(zoomAt(view, center, nextZoom))
    } else {
      setView({
        zoom: view.zoom,
        pan: { x: view.pan.x - e.evt.deltaX, y: view.pan.y - e.evt.deltaY }
      })
    }
  }

  // --- selection / transformer --------------------------------------------

  const selectedHere = selection && selection.pageId === page.id ? selection : null
  const selectedAnnotation = useMemo(
    () =>
      selectedHere?.kind === 'annotation'
        ? page.annotations.find((a) => a.id === selectedHere.id) ?? null
        : null,
    [selectedHere, page.annotations]
  )

  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    let node: Konva.Node | null = null
    if (isEdit && selectedHere) {
      if (selectedHere.kind === 'image') {
        node = stage.findOne(`.placed-${selectedHere.id}`) ?? null
      } else if (
        selectedAnnotation &&
        (selectedAnnotation.type === 'region' ||
          selectedAnnotation.type === 'rectangle' ||
          selectedAnnotation.type === 'ellipse')
      ) {
        node = stage.findOne(`.shape-${selectedHere.id}`) ?? null
      }
    }
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [isEdit, selectedHere, selectedAnnotation, page.annotations, page.placedImages])

  const select = (id: string, kind: 'annotation' | 'image') => {
    if (!isEdit) return
    setSelection({ pageId: page.id, kind, id })
    if (kind === 'annotation') {
      const annotation = page.annotations.find((a) => a.id === id)
      if (annotation?.type === 'region') setFocusInstruction(null)
    }
  }

  // --- annotation rendering ------------------------------------------------

  const renderAnnotation = (a: Annotation) => {
    const isSelected = selectedHere?.kind === 'annotation' && selectedHere.id === a.id
    const isHovered = a.type === 'region' && hoveredRegionId === a.id
    const emphasis = isSelected || isHovered
    const common = {
      draggable: isEdit,
      listening: isEdit,
      onClick: () => select(a.id, 'annotation'),
      onTap: () => select(a.id, 'annotation')
    }
    switch (a.type) {
      case 'region': {
        const r = a as RegionAnnotation
        const openComposer = () => {
          if (Date.now() - lastShapeCreatedAt.current < 200) return
          setSelection({ pageId: page.id, kind: 'annotation', id: a.id })
          setComposerCollapsed(false)
          setFocusInstruction(a.id)
        }
        return (
          <Group
            key={a.id}
            x={r.x}
            y={r.y}
            {...common}
            listening={isEdit || floatingComposer}
            onMouseEnter={floatingComposer ? () => setHoveredRegion(a.id) : undefined}
            onMouseLeave={floatingComposer ? () => setHoveredRegion(null) : undefined}
            onClick={isEdit ? common.onClick : floatingComposer ? openComposer : undefined}
            onTap={isEdit ? common.onTap : floatingComposer ? openComposer : undefined}
            onDragEnd={(e) => {
              updateAnnotation(page.id, a.id, { x: e.target.x(), y: e.target.y() })
            }}
          >
            <Rect
              name={`shape-${a.id}`}
              x={0}
              y={0}
              width={r.width}
              height={r.height}
              stroke={r.color}
              strokeWidth={Math.max(2, r.strokeWidth) + (emphasis ? 1 : 0)}
              strokeScaleEnabled={false}
              dash={REGION_DASH}
              fill={`${r.color}${emphasis ? '2e' : '14'}`}
              onTransformEnd={(e) => {
                const node = e.target
                const group = node.getParent()!
                const width = Math.max(8, node.width() * node.scaleX())
                const height = Math.max(8, node.height() * node.scaleY())
                const x = group.x() + node.x()
                const y = group.y() + node.y()
                node.scaleX(1)
                node.scaleY(1)
                node.position({ x: 0, y: 0 })
                updateAnnotation(page.id, a.id, { x, y, width, height })
              }}
            />
            <Circle radius={REGION_BADGE_RADIUS} fill={r.color} stroke="#ffffff" strokeWidth={2} />
            <Text
              x={-REGION_BADGE_RADIUS}
              y={-REGION_BADGE_RADIUS}
              width={REGION_BADGE_RADIUS * 2}
              height={REGION_BADGE_RADIUS * 2}
              text={String(r.number)}
              fontSize={15}
              fontStyle="bold"
              fontFamily={BADGE_FONT}
              fill="#ffffff"
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          </Group>
        )
      }
      case 'rectangle':
        return (
          <Rect
            key={a.id}
            name={`shape-${a.id}`}
            x={a.x}
            y={a.y}
            width={a.width}
            height={a.height}
            stroke={a.color}
            strokeWidth={a.strokeWidth + (isSelected ? 1 : 0)}
            strokeScaleEnabled={false}
            {...common}
            onDragEnd={(e) => updateAnnotation(page.id, a.id, { x: e.target.x(), y: e.target.y() })}
            onTransformEnd={(e) => {
              const node = e.target
              const width = Math.max(6, node.width() * node.scaleX())
              const height = Math.max(6, node.height() * node.scaleY())
              node.scaleX(1)
              node.scaleY(1)
              updateAnnotation(page.id, a.id, { x: node.x(), y: node.y(), width, height })
            }}
          />
        )
      case 'ellipse':
        return (
          <Ellipse
            key={a.id}
            name={`shape-${a.id}`}
            x={a.x + a.width / 2}
            y={a.y + a.height / 2}
            radiusX={Math.max(3, a.width / 2)}
            radiusY={Math.max(3, a.height / 2)}
            stroke={a.color}
            strokeWidth={a.strokeWidth + (isSelected ? 1 : 0)}
            strokeScaleEnabled={false}
            {...common}
            onDragEnd={(e) =>
              updateAnnotation(page.id, a.id, {
                x: e.target.x() - a.width / 2,
                y: e.target.y() - a.height / 2
              })
            }
            onTransformEnd={(e) => {
              const node = e.target as Konva.Ellipse
              const radiusX = Math.max(3, node.radiusX() * node.scaleX())
              const radiusY = Math.max(3, node.radiusY() * node.scaleY())
              node.scaleX(1)
              node.scaleY(1)
              updateAnnotation(page.id, a.id, {
                x: node.x() - radiusX,
                y: node.y() - radiusY,
                width: radiusX * 2,
                height: radiusY * 2
              })
            }}
          />
        )
      case 'arrow': {
        const arrow = a as ArrowAnnotation
        return (
          <React.Fragment key={a.id}>
            <Arrow
              points={[arrow.x1, arrow.y1, arrow.x2, arrow.y2]}
              stroke={a.color}
              fill={a.color}
              strokeWidth={a.strokeWidth + (isSelected ? 1 : 0)}
              pointerLength={6 + a.strokeWidth * 2.5}
              pointerWidth={6 + a.strokeWidth * 2.5}
              lineCap="round"
              hitStrokeWidth={16}
              {...common}
              onDragEnd={(e) => {
                const dx = e.target.x()
                const dy = e.target.y()
                e.target.position({ x: 0, y: 0 })
                updateAnnotation(page.id, a.id, {
                  x1: arrow.x1 + dx,
                  y1: arrow.y1 + dy,
                  x2: arrow.x2 + dx,
                  y2: arrow.y2 + dy
                })
              }}
            />
            {isSelected && isEdit && view && (
              <>
                {(
                  [
                    ['x1', 'y1', arrow.x1, arrow.y1],
                    ['x2', 'y2', arrow.x2, arrow.y2]
                  ] as const
                ).map(([kx, ky, px, py]) => (
                  <Circle
                    key={kx}
                    x={px}
                    y={py}
                    radius={6 / view.zoom}
                    fill="#ffffff"
                    stroke="#0090ff"
                    strokeWidth={1.5 / view.zoom}
                    draggable
                    onDragEnd={(e) => {
                      updateAnnotation(page.id, a.id, {
                        [kx]: e.target.x(),
                        [ky]: e.target.y()
                      } as Partial<Annotation>)
                    }}
                  />
                ))}
              </>
            )}
          </React.Fragment>
        )
      }
      case 'pen': {
        const pen = a as PenAnnotation
        return (
          <Line
            key={a.id}
            points={pen.points}
            stroke={a.color}
            strokeWidth={a.strokeWidth + (isSelected ? 1 : 0)}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={16}
            {...common}
            onDragEnd={(e) => {
              const dx = e.target.x()
              const dy = e.target.y()
              e.target.position({ x: 0, y: 0 })
              updateAnnotation(page.id, a.id, {
                points: pen.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
              })
            }}
          />
        )
      }
    }
  }

  const draftShape = () => {
    if (!draft) return null
    const rect = normalizeRect(draft.startX, draft.startY, draft.currentX, draft.currentY)
    if (draft.tool === 'arrow') {
      return (
        <Arrow
          points={[draft.startX, draft.startY, draft.currentX, draft.currentY]}
          stroke={color}
          fill={color}
          strokeWidth={strokeWidth}
          pointerLength={6 + strokeWidth * 2.5}
          pointerWidth={6 + strokeWidth * 2.5}
          listening={false}
          opacity={0.85}
        />
      )
    }
    if (draft.tool === 'ellipse') {
      return (
        <Ellipse
          x={rect.x + rect.width / 2}
          y={rect.y + rect.height / 2}
          radiusX={rect.width / 2}
          radiusY={rect.height / 2}
          stroke={color}
          strokeWidth={strokeWidth}
          listening={false}
          opacity={0.85}
        />
      )
    }
    return (
      <Rect
        {...rect}
        stroke={color}
        strokeWidth={draft.tool === 'region' ? Math.max(2, strokeWidth) : strokeWidth}
        dash={draft.tool === 'region' ? REGION_DASH : undefined}
        fill={draft.tool === 'region' ? `${color}14` : undefined}
        listening={false}
        opacity={0.9}
      />
    )
  }

  const cursor = panMode
    ? 'grab'
    : isEdit
      ? 'default'
      : 'crosshair'

  const sortedImages = useMemo(
    () => [...page.placedImages].sort((a, b) => a.zIndex - b.zIndex),
    [page.placedImages]
  )

  const handleDrop = (e: React.DragEvent) => {
    if (page.kind !== 'blank') return
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = wrapperRef.current!.getBoundingClientRect()
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const dropAt = view ? screenToPage(screen, view) : undefined
    void importFilesToPage(page.id, files, dropAt)
  }

  return (
    <div
      ref={wrapperRef}
      className="canvas-wrapper"
      data-testid={`page-canvas-${pageIndex}`}
      data-page-id={page.id}
      data-zoom={view?.zoom ?? ''}
      data-pan-x={view?.pan.x ?? ''}
      data-pan-y={view?.pan.y ?? ''}
      style={{ cursor }}
      onDragOver={(e) => {
        if (page.kind === 'blank') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onDrop={handleDrop}
    >
      {size && view && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={view.zoom}
          scaleY={view.zoom}
          x={view.pan.x}
          y={view.pan.y}
          draggable={panMode}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setView({ zoom: view.zoom, pan: { x: e.target.x(), y: e.target.y() } })
            }
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          <Layer>
            <Rect
              name="page-background"
              x={0}
              y={0}
              width={page.width}
              height={page.height}
              fill="#ffffff"
              stroke="#d8d5cf"
              strokeWidth={1 / view.zoom}
              shadowColor="rgba(30, 30, 30, 0.18)"
              shadowBlur={12}
              shadowOffsetY={2}
              listening={isEdit}
            />
            {sourceImage && page.sourceImage && (
              <KonvaImage
                name="page-background"
                image={sourceImage}
                x={0}
                y={0}
                width={page.width}
                height={page.height}
                listening={isEdit}
              />
            )}
            {sortedImages.map((item) => (
              <PlacedImageNode
                key={item.id}
                pageId={page.id}
                item={item}
                isEdit={isEdit}
                isSelected={selectedHere?.kind === 'image' && selectedHere.id === item.id}
                onSelect={() => select(item.id, 'image')}
              />
            ))}
            {page.annotations.map(renderAnnotation)}
            {draftShape()}
            {penPreview && penPreview.length >= 2 && (
              <Line
                points={penPreview}
                stroke={color}
                strokeWidth={strokeWidth}
                tension={0.4}
                lineCap="round"
                lineJoin="round"
                listening={false}
                opacity={0.85}
              />
            )}
            <Transformer
              ref={trRef}
              rotateEnabled={false}
              flipEnabled={false}
              ignoreStroke
              anchorSize={8}
              anchorCornerRadius={2}
              borderStroke="#0090ff"
              anchorStroke="#0090ff"
              anchorFill="#ffffff"
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      )}
      {selectedHere?.kind === 'image' && isEdit && (
        <div className="layer-controls" role="toolbar" aria-label="Image layer order">
          <button onClick={() => reorderPlacedImage(page.id, selectedHere.id, 'front')} title="Bring to front">
            To front
          </button>
          <button onClick={() => reorderPlacedImage(page.id, selectedHere.id, 'forward')} title="Bring forward">
            Forward
          </button>
          <button onClick={() => reorderPlacedImage(page.id, selectedHere.id, 'backward')} title="Send backward">
            Backward
          </button>
          <button onClick={() => reorderPlacedImage(page.id, selectedHere.id, 'back')} title="Send to back">
            To back
          </button>
          <button
            className="danger"
            onClick={() => deletePlacedImage(page.id, selectedHere.id)}
            title="Remove image"
          >
            Remove
          </button>
        </div>
      )}
      {view && (
        <div className="zoom-readout" aria-hidden="true">
          {Math.round(view.zoom * 100)}%
        </div>
      )}
      {floatingComposer &&
        view &&
        size &&
        selectedAnnotation?.type === 'region' &&
        !composerCollapsed && (
          <FloatingComposer
            page={page}
            region={selectedAnnotation as RegionAnnotation}
            view={view}
            containerWidth={size.w}
            containerHeight={size.h}
          />
        )}
      {floatingComposer &&
        view &&
        hoveredRegionId &&
        (composerCollapsed || selectedAnnotation?.id !== hoveredRegionId) &&
        (() => {
          const hovered = page.annotations.find(
            (a): a is RegionAnnotation => a.type === 'region' && a.id === hoveredRegionId
          )
          if (!hovered || !hovered.instruction.trim()) return null
          const at = pageToScreen({ x: hovered.x + hovered.width / 2, y: hovered.y }, view)
          return (
            <div
              className="region-hover-preview"
              style={{
                left: Math.max(8, Math.min(at.x - 120, (size?.w ?? 0) - 248)),
                top: Math.max(8, at.y - 44)
              }}
            >
              <span className="region-badge small" style={{ background: hovered.color }}>
                {hovered.number}
              </span>
              <span className="preview-text">{hovered.instruction}</span>
            </div>
          )
        })()}
    </div>
  )
}
