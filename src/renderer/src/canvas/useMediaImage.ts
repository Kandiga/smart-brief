import { useEffect, useState } from 'react'
import { loadMediaImage } from '../services/media'

export function useMediaImage(file: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let cancelled = false
    setImage(null)
    if (!file) return
    loadMediaImage(file)
      .then((img) => {
        if (!cancelled) setImage(img)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [file])
  return image
}
