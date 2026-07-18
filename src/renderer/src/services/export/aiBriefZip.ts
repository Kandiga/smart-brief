import { zipSync, type Zippable } from 'fflate'
import type { Page, Project } from '@shared/schemas/project'
import {
  buildAiBriefModel,
  expectedPackageFiles,
  generateBriefMd,
  generateManifest,
  generateReadme,
  packageRootName,
  type AiBriefModel
} from '@shared/aiBrief'
import { renderPageToDataUrl } from '../../canvas/renderPage'
import { loadMediaImage } from '../media'
import { safeFileName } from './html'

// Matches the main process's IPC payload cap for the ZIP.
export const MAX_ZIP_BYTES = 100 * 1024 * 1024

export type AiBriefZipResult =
  | { ok: true; path: string | null }
  | { ok: false; reason: 'too-large'; estimateMB: number; fitsWithoutCrops: boolean }

export interface AiBriefZipOptions {
  includeRegionCrops: boolean
  cropPadding: number
}

/**
 * Build and save the AI Brief ZIP. All images are produced at source
 * resolution: `original` is the untouched imported bytes (or a full-res render
 * of a blank-canvas composition), `annotated` is a full-res render with
 * markers, and each region crop is cut from the original pixels — viewport
 * zoom never affects any of it.
 *
 * If the package would exceed the payload cap the export refuses (never a
 * partial ZIP, never silent downscaling of originals) and reports whether
 * dropping region crops would make it fit.
 */
export async function exportAiBriefZip(
  project: Project,
  options: AiBriefZipOptions
): Promise<AiBriefZipResult> {
  const build = await buildPackageFiles(project, options)
  const totalBytes = Object.values(build.files).reduce((sum, f) => sum + f[0].byteLength, 0)
  if (totalBytes > MAX_ZIP_BYTES) {
    let fitsWithoutCrops = false
    if (options.includeRegionCrops) {
      const withoutCrops = Object.entries(build.files)
        .filter(([name]) => !/\/regions\//.test(name))
        .reduce((sum, [, f]) => sum + f[0].byteLength, 0)
      fitsWithoutCrops = withoutCrops <= MAX_ZIP_BYTES
    }
    return {
      ok: false,
      reason: 'too-large',
      estimateMB: Math.ceil(totalBytes / (1024 * 1024)),
      fitsWithoutCrops
    }
  }

  const zipped = zipSync(build.files as Zippable)
  if (zipped.byteLength > MAX_ZIP_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      estimateMB: Math.ceil(zipped.byteLength / (1024 * 1024)),
      fitsWithoutCrops: options.includeRegionCrops
    }
  }
  const name = safeFileName(project.title) || 'brief'
  const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
  const path = await window.smartBrief.exportAiBriefZip(bytes as ArrayBuffer, `${name}.zip`)
  return { ok: true, path }
}

interface PackageBuild {
  files: Record<string, [Uint8Array, { level: 0 | 6 }]>
  model: AiBriefModel
}

async function buildPackageFiles(
  project: Project,
  options: AiBriefZipOptions
): Promise<PackageBuild> {
  // Original bytes + their real extensions come first so the model can name files.
  const originals: { bytes: Uint8Array; ext: string }[] = []
  for (const page of project.pages) {
    originals.push(await originalImageBytes(page))
  }

  const model = buildAiBriefModel(project, {
    cropPadding: options.cropPadding,
    includeRegionCrops: options.includeRegionCrops,
    originalExtensions: originals.map((o) => o.ext)
  })

  const root = packageRootName(model.title)
  const text = new TextEncoder()
  const files: PackageBuild['files'] = {}
  const put = (name: string, data: Uint8Array, compress: boolean) => {
    files[`${root}/${name}`] = [data, { level: compress ? 6 : 0 }]
  }

  put('README.md', text.encode(generateReadme(model)), true)
  put('manifest.json', text.encode(generateManifest(model)), true)
  put('brief.md', text.encode(generateBriefMd(model)), true)
  put(
    'project-preview.jpg',
    dataUrlToBytes(
      await renderPageToDataUrl(project.pages[0], {
        maxDimension: 640,
        mime: 'image/jpeg',
        quality: 0.8
      })
    ),
    false
  )

  for (let i = 0; i < project.pages.length; i++) {
    const page = project.pages[i]
    const pageModel = model.pages[i]
    put(pageModel.originalImage, originals[i].bytes, false)
    put(
      pageModel.annotatedImage,
      dataUrlToBytes(
        await renderPageToDataUrl(page, { mime: 'image/png', fullResolution: true })
      ),
      false
    )
    if (options.includeRegionCrops && pageModel.regions.length > 0) {
      const source = await originalImageElement(page)
      for (const region of pageModel.regions) {
        if (!region.crop) continue
        put(region.crop, await cropToPng(source, region.cropBounds), false)
      }
    }
  }

  // The manifest must describe exactly what is in the package — no orphans,
  // no missing entries. This is asserted at build time, every time.
  const expected = new Set(expectedPackageFiles(model).map((f) => `${root}/${f}`))
  const actual = new Set(Object.keys(files))
  for (const f of expected) {
    if (!actual.has(f)) throw new Error(`AI Brief package is missing ${f}`)
  }
  for (const f of actual) {
    if (!expected.has(f)) throw new Error(`AI Brief package has an unexpected file ${f}`)
  }

  return { files, model }
}

/** Untouched original bytes for a page (full-res render for blank canvases). */
async function originalImageBytes(page: Page): Promise<{ bytes: Uint8Array; ext: string }> {
  if (page.kind === 'screenshot' && page.sourceImage) {
    const data = await window.smartBrief.getMediaData(page.sourceImage.file)
    if (data) {
      const ext = page.sourceImage.file.split('.').pop() ?? 'png'
      return { bytes: new Uint8Array(data), ext }
    }
  }
  // Blank composition (or missing media): render the page without annotations.
  const dataUrl = await renderPageToDataUrl(page, {
    mime: 'image/png',
    fullResolution: true,
    includeAnnotations: false
  })
  return { bytes: dataUrlToBytes(dataUrl), ext: 'png' }
}

/** An image element holding the page's original pixels, for region crops. */
async function originalImageElement(page: Page): Promise<HTMLImageElement> {
  if (page.kind === 'screenshot' && page.sourceImage) {
    try {
      return await loadMediaImage(page.sourceImage.file)
    } catch {
      /* fall through to the rendered composition */
    }
  }
  const dataUrl = await renderPageToDataUrl(page, {
    mime: 'image/png',
    fullResolution: true,
    includeAnnotations: false
  })
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  return img
}

async function cropToPng(
  source: HTMLImageElement,
  bounds: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, bounds.width)
  canvas.height = Math.max(1, bounds.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  )
  return dataUrlToBytes(canvas.toDataURL('image/png'))
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
