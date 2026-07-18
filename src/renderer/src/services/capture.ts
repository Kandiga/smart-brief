import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'

/**
 * Quick Capture is authored entirely in the capture overlay (see
 * `capture/CaptureOverlayApp.tsx`), which creates and saves the project
 * through the normal repository. The main window's only job is to open the
 * finished project once the user presses Done.
 */
export async function openCapturedProject(projectId: string): Promise<void> {
  const ui = useUiStore.getState()
  ui.setLibraryOpen(false)
  ui.setExportOpen(false)
  ui.setSettingsOpen(false)
  ui.setSelection(null)
  await useProjectStore.getState().loadProject(projectId)
}

/** Pull anything that finished while this window was still loading. */
export async function checkPendingCapture(): Promise<void> {
  try {
    const pending = await window.smartBrief.takePendingCapture()
    if (pending === 'permission') {
      useUiStore.getState().setPermissionHelpOpen(true)
    } else if (pending) {
      await openCapturedProject(pending.projectId)
    }
  } catch {
    /* no pending capture */
  }
}
