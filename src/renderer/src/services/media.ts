import type { MediaRef } from '@shared/schemas/project'

// Media files live on disk in the app's media directory. The renderer loads
// them once over IPC and keeps same-origin blob URLs + decoded images cached,
// so canvases never taint and repeated renders are cheap.

const imageCache = new Map<string, Promise<HTMLImageElement>>()

export function loadMediaImage(file: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(file)
  if (!cached) {
    cached = (async () => {
      const data = await window.smartBrief.getMediaData(file)
      if (!data) throw new Error(`Missing media file: ${file}`)
      const blob = new Blob([data])
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    })()
    imageCache.set(file, cached)
    cached.catch(() => imageCache.delete(file))
  }
  return cached
}

/** Store raw image bytes as a media file, probing its pixel dimensions. */
export async function importImageBytes(bytes: ArrayBuffer, name: string): Promise<MediaRef | null> {
  const saved = await window.smartBrief.saveMediaBuffer(bytes, name)
  if (!saved) return null
  try {
    const img = await loadMediaImage(saved.file)
    return { file: saved.file, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

export async function importFiles(files: File[]): Promise<MediaRef[]> {
  const refs: MediaRef[] = []
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    const bytes = await file.arrayBuffer()
    const ref = await importImageBytes(bytes, file.name || 'pasted.png')
    if (ref) refs.push(ref)
  }
  return refs
}

/** Probe dimensions for refs returned by the native file dialog (width 0). */
export async function resolveDialogRefs(refs: MediaRef[]): Promise<MediaRef[]> {
  const out: MediaRef[] = []
  for (const ref of refs) {
    try {
      const img = await loadMediaImage(ref.file)
      out.push({ file: ref.file, width: img.naturalWidth, height: img.naturalHeight })
    } catch {
      continue
    }
  }
  return out
}
