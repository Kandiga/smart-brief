import { useEffect, useRef } from 'react'
import type { Page, RegionAnnotation } from '@shared/schemas/project'
import { regionsOf } from '@shared/schemas/project'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { TrashIcon } from './icons'

function RegionCard({ page, region }: { page: Page; region: RegionAnnotation }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const updateAnnotation = useProjectStore((s) => s.updateAnnotation)
  const deleteAnnotation = useProjectStore((s) => s.deleteAnnotation)
  const selection = useUiStore((s) => s.selection)
  const setSelection = useUiStore((s) => s.setSelection)
  const setHoveredRegion = useUiStore((s) => s.setHoveredRegion)
  const focusInstructionId = useUiStore((s) => s.focusInstructionId)
  const setFocusInstruction = useUiStore((s) => s.setFocusInstruction)

  const isSelected = selection?.kind === 'annotation' && selection.id === region.id

  useEffect(() => {
    if (focusInstructionId === region.id) {
      textareaRef.current?.focus()
      setFocusInstruction(null)
    }
  }, [focusInstructionId, region.id, setFocusInstruction])

  useEffect(() => {
    if (isSelected) {
      textareaRef.current?.closest('.region-card')?.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  const autoGrow = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(160, el.scrollHeight)}px`
    }
  }
  useEffect(autoGrow, [region.instruction])

  return (
    <div
      className="region-card"
      data-testid={`region-card-${region.number}`}
      data-selected={isSelected}
      onMouseEnter={() => setHoveredRegion(region.id)}
      onMouseLeave={() => setHoveredRegion(null)}
      onClick={() => setSelection({ pageId: page.id, kind: 'annotation', id: region.id })}
    >
      <span className="region-badge" style={{ background: region.color }}>
        {region.number}
      </span>
      <textarea
        ref={textareaRef}
        className="region-instruction"
        value={region.instruction}
        rows={1}
        placeholder="Describe the change for this area…"
        aria-label={`Instruction for region ${region.number}`}
        onChange={(e) => {
          updateAnnotation(page.id, region.id, { instruction: e.target.value }, `instruction-${region.id}`)
          autoGrow()
        }}
        onFocus={() => setSelection({ pageId: page.id, kind: 'annotation', id: region.id })}
      />
      <button
        className="icon-button subtle"
        aria-label={`Delete region ${region.number}`}
        title="Delete region"
        onClick={(e) => {
          e.stopPropagation()
          deleteAnnotation(page.id, region.id)
        }}
      >
        <TrashIcon size={14} />
      </button>
    </div>
  )
}

export function InstructionPanel({ page }: { page: Page }) {
  const setOverallMessage = useProjectStore((s) => s.setOverallMessage)
  const regions = regionsOf(page)

  return (
    <aside className="instruction-panel" aria-label="Page notes and instructions">
      <textarea
        className="overall-message"
        data-testid="overall-message"
        value={page.overallMessage}
        placeholder="One sentence that explains the main idea for this page…"
        aria-label="Overall message for this page"
        rows={2}
        onChange={(e) => setOverallMessage(page.id, e.target.value)}
      />
      {regions.length === 0 ? (
        <p className="panel-hint">
          Use the <strong>Region</strong> tool to mark an area, then write what should change.
        </p>
      ) : (
        <div className="region-list">
          {regions.map((region) => (
            <RegionCard key={region.id} page={page} region={region} />
          ))}
        </div>
      )}
    </aside>
  )
}
