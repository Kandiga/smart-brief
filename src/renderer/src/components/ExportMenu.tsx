import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import { exportHtml, exportPdf } from '../services/export/html'
import { copyBriefToClipboard, exportContinuousJpg } from '../services/export/jpg'
import { exportAiBriefZip } from '../services/export/aiBriefZip'

type Format = 'html' | 'jpg' | 'pdf' | 'clipboard' | 'ai-zip'

export function ExportMenu() {
  const setExportOpen = useUiStore((s) => s.setExportOpen)
  const flush = useProjectStore((s) => s.flush)
  const [busy, setBusy] = useState<Format | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zipRetryWithoutCrops, setZipRetryWithoutCrops] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current) return
      const anchor = menuRef.current.closest('.export-anchor')
      if (anchor && !anchor.contains(e.target as Node)) setExportOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [setExportOpen])

  const runAiZip = async (forceNoCrops: boolean) => {
    const project = useProjectStore.getState().project
    if (!project) return
    const settings = await window.smartBrief.getSettings()
    const outcome = await exportAiBriefZip(project, {
      includeRegionCrops: forceNoCrops ? false : settings.includeRegionCrops,
      cropPadding: settings.cropPadding
    })
    if (!outcome.ok) {
      setZipRetryWithoutCrops(outcome.fitsWithoutCrops)
      setError(
        `The package would be about ${outcome.estimateMB} MB — over the 100 MB export limit. ` +
          (outcome.fitsWithoutCrops
            ? 'It fits without region crops.'
            : 'Try exporting fewer pages (duplicate the brief and remove pages). Original image quality is never reduced silently.')
      )
      return
    }
    if (outcome.path) {
      setResult(outcome.path)
      if (settings.copyZipPathToClipboard) {
        await window.smartBrief.copyTextToClipboard(outcome.path).catch(() => false)
      }
    }
  }

  const run = async (format: Format, forceNoCrops = false) => {
    const project = useProjectStore.getState().project
    if (!project || project.pages.length === 0 || busy) return
    setBusy(format)
    setError(null)
    setResult(null)
    setZipRetryWithoutCrops(false)
    try {
      await flush()
      if (format === 'clipboard') {
        const sheets = await copyBriefToClipboard(project)
        setResult(
          sheets > 1
            ? `Copied sheet 1 of ${sheets} to clipboard — paste anywhere`
            : 'Copied to clipboard — paste anywhere'
        )
        return
      }
      if (format === 'ai-zip') {
        await runAiZip(forceNoCrops)
        return
      }
      let out: string | null = null
      if (format === 'html') out = await exportHtml(project)
      else if (format === 'pdf') out = await exportPdf(project)
      else {
        const parts = await exportContinuousJpg(project)
        out = parts && parts.length > 0 ? `${parts.join(', ')} (also copied to clipboard)` : null
      }
      if (out) {
        setResult(out)
      }
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const hasPages = (useProjectStore.getState().project?.pages.length ?? 0) > 0

  return (
    <div className="dropdown export-menu" ref={menuRef} role="menu" data-testid="export-menu">
      {!hasPages && <p className="dropdown-note">Add a page before exporting.</p>}
      <button role="menuitem" data-testid="export-ai-zip" disabled={!hasPages || busy !== null} onClick={() => void run('ai-zip')}>
        {busy === 'ai-zip' ? 'Exporting…' : 'AI Brief ZIP'}
      </button>
      <button role="menuitem" data-testid="export-clipboard" disabled={!hasPages || busy !== null} onClick={() => void run('clipboard')}>
        {busy === 'clipboard' ? 'Copying…' : 'Copy image to clipboard'}
      </button>
      <button role="menuitem" data-testid="export-html" disabled={!hasPages || busy !== null} onClick={() => void run('html')}>
        {busy === 'html' ? 'Exporting…' : 'HTML brief'}
      </button>
      <button role="menuitem" data-testid="export-jpg" disabled={!hasPages || busy !== null} onClick={() => void run('jpg')}>
        {busy === 'jpg' ? 'Exporting…' : 'Continuous JPG'}
      </button>
      <button role="menuitem" data-testid="export-pdf" disabled={!hasPages || busy !== null} onClick={() => void run('pdf')}>
        {busy === 'pdf' ? 'Exporting…' : 'PDF brief'}
      </button>
      {result && (
        <p className="dropdown-note success" data-testid="export-result">
          Saved: {result}
        </p>
      )}
      {error && (
        <p className="dropdown-note error" data-testid="export-error">
          {error}
        </p>
      )}
      {zipRetryWithoutCrops && (
        <button
          role="menuitem"
          data-testid="export-ai-zip-no-crops"
          disabled={busy !== null}
          onClick={() => void run('ai-zip', true)}
        >
          Export ZIP without region crops
        </button>
      )}
    </div>
  )
}
