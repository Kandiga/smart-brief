import type { MediaRef, PlacedImage } from '@shared/schemas/project'
import { useProjectStore } from '../stores/projectStore'
import { importFiles, resolveDialogRefs } from './media'

/** Import via the native open dialog; new pages land after the given page (or at the end). */
export async function importFilesFromDialog(afterPageId?: string | null): Promise<void> {
  const rawRefs = await window.smartBrief.importImagesDialog()
  const refs = await resolveDialogRefs(rawRefs)
  addAsPages(refs, afterPageId)
}

export async function importDroppedFiles(
  files: File[],
  afterPageId?: string | null
): Promise<void> {
  const refs = await importFiles(files)
  addAsPages(refs, afterPageId)
}

function addAsPages(refs: MediaRef[], afterPageId?: string | null) {
  if (refs.length === 0) return
  useProjectStore.getState().addPagesFromMedia(refs, afterPageId ?? undefined)
}

/** Place an image onto an existing (typically blank) page as a movable object. */
export function placeImageOnPage(pageId: string, ref: MediaRef, dropAt?: { x: number; y: number }) {
  const state = useProjectStore.getState()
  const page = state.project?.pages.find((p) => p.id === pageId)
  if (!page) return
  const maxScale = Math.min(
    1,
    (page.width * 0.6) / ref.width,
    (page.height * 0.6) / ref.height
  )
  const width = Math.max(24, ref.width * maxScale)
  const height = Math.max(24, ref.height * maxScale)
  const zIndex = page.placedImages.reduce((m, i) => Math.max(m, i.zIndex + 1), 0)
  const image: PlacedImage = {
    id: crypto.randomUUID(),
    file: ref.file,
    x: dropAt ? dropAt.x - width / 2 : (page.width - width) / 2 + zIndex * 24,
    y: dropAt ? dropAt.y - height / 2 : (page.height - height) / 2 + zIndex * 24,
    width,
    height,
    zIndex
  }
  state.addPlacedImage(pageId, image)
}

export async function importFilesToPage(
  pageId: string,
  files: File[],
  dropAt?: { x: number; y: number }
): Promise<void> {
  const refs = await importFiles(files)
  refs.forEach((ref, i) =>
    placeImageOnPage(pageId, ref, dropAt ? { x: dropAt.x + i * 32, y: dropAt.y + i * 32 } : undefined)
  )
}
