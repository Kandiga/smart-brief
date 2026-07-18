import { create } from 'zustand'

export type Tool = 'region' | 'arrow' | 'pen' | 'rectangle' | 'ellipse' | 'edit' | 'move'

export const PALETTE = [
  { name: 'Coral', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Yellow', value: '#ffc53d' },
  { name: 'Green', value: '#46a758' },
  { name: 'Teal', value: '#12a594' },
  { name: 'Blue', value: '#0090ff' },
  { name: 'Purple', value: '#8e4ec6' },
  { name: 'Ink', value: '#1c2024' }
] as const

export interface Selection {
  pageId: string
  kind: 'annotation' | 'image'
  id: string
}

interface UiState {
  tool: Tool
  color: string
  strokeWidth: number
  selection: Selection | null
  hoveredRegionId: string | null
  spacePan: boolean
  focusMode: boolean
  libraryOpen: boolean
  exportOpen: boolean
  settingsOpen: boolean
  recoveryNotice: string | null
  focusInstructionId: string | null
  /** True while a drag/pen stroke is being drawn (Esc is the canvas's then). */
  drawingActive: boolean
  /** Floating composer collapsed state (region stays selected, text kept). */
  composerCollapsed: boolean
  overallComposerOpen: boolean
  permissionHelpOpen: boolean
  shortcutNotice: string | null
  setTool: (tool: Tool) => void
  setColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setSelection: (selection: Selection | null) => void
  setHoveredRegion: (id: string | null) => void
  setSpacePan: (on: boolean) => void
  toggleFocusMode: () => void
  setLibraryOpen: (open: boolean) => void
  setExportOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setRecoveryNotice: (notice: string | null) => void
  setFocusInstruction: (id: string | null) => void
  setDrawingActive: (active: boolean) => void
  setComposerCollapsed: (collapsed: boolean) => void
  setOverallComposerOpen: (open: boolean) => void
  setPermissionHelpOpen: (open: boolean) => void
  setShortcutNotice: (notice: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  tool: 'region',
  color: PALETTE[0].value,
  strokeWidth: 3,
  selection: null,
  hoveredRegionId: null,
  spacePan: false,
  focusMode: false,
  libraryOpen: false,
  exportOpen: false,
  settingsOpen: false,
  recoveryNotice: null,
  focusInstructionId: null,
  drawingActive: false,
  composerCollapsed: false,
  overallComposerOpen: false,
  permissionHelpOpen: false,
  shortcutNotice: null,
  // Switching tools collapses the floating composer (the region and its text
  // stay); everything else about the selection is untouched.
  setTool: (tool) => set({ tool, composerCollapsed: true }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setSelection: (selection) => set({ selection }),
  setHoveredRegion: (hoveredRegionId) => set({ hoveredRegionId }),
  setSpacePan: (spacePan) => set({ spacePan }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setRecoveryNotice: (recoveryNotice) => set({ recoveryNotice }),
  setFocusInstruction: (focusInstructionId) => set({ focusInstructionId }),
  setDrawingActive: (drawingActive) => set({ drawingActive }),
  setComposerCollapsed: (composerCollapsed) => set({ composerCollapsed }),
  setOverallComposerOpen: (overallComposerOpen) => set({ overallComposerOpen }),
  setPermissionHelpOpen: (permissionHelpOpen) => set({ permissionHelpOpen }),
  setShortcutNotice: (shortcutNotice) => set({ shortcutNotice })
}))
