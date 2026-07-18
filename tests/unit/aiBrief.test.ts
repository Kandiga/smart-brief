import { describe, expect, it } from 'vitest'
import {
  buildAiBriefModel,
  expectedPackageFiles,
  generateBriefMd,
  generateManifest,
  generateReadme,
  packageRootName
} from '../../src/shared/aiBrief'
import { createEmptyProject, createPage, type Project, type RegionAnnotation } from '../../src/shared/schemas/project'

function sampleProject(): Project {
  const project = createEmptyProject('p1', 1000)
  project.title = 'Landing page fixes'
  const page = createPage('page1', 'screenshot', 1000, { file: 'abc.png', width: 1600, height: 1000 })
  const region1: RegionAnnotation = {
    id: 'r1',
    type: 'region',
    x: 100,
    y: 240,
    width: 430,
    height: 180,
    color: '#e5484d',
    strokeWidth: 3,
    number: 1,
    instruction: 'Change the button color to green'
  }
  const region2: RegionAnnotation = {
    id: 'r2',
    type: 'region',
    x: 700,
    y: 100,
    width: 200,
    height: 90,
    color: '#0090ff',
    strokeWidth: 3,
    number: 2,
    instruction: 'Remove this banner'
  }
  page.annotations = [region1, region2]
  page.overallMessage = 'Keep the overall layout intact'
  project.pages = [page]
  project.activePageId = page.id
  return project
}

const OPTS = { cropPadding: 16, includeRegionCrops: true, originalExtensions: ['png'] }

describe('buildAiBriefModel', () => {
  it('uses user-visible region numbers, source dimensions and package paths', () => {
    const model = buildAiBriefModel(sampleProject(), OPTS)
    expect(model.schemaVersion).toBe('1.0')
    expect(model.title).toBe('Landing page fixes')
    expect(model.pages).toHaveLength(1)
    const page = model.pages[0]
    expect(page.pageNumber).toBe(1)
    expect(page.sourceWidth).toBe(1600)
    expect(page.sourceHeight).toBe(1000)
    expect(page.originalImage).toBe('pages/page-001/original.png')
    expect(page.annotatedImage).toBe('pages/page-001/annotated.png')
    expect(page.regions.map((r) => r.number)).toEqual([1, 2])
    expect(page.regions[0].crop).toBe('pages/page-001/regions/region-001.png')
  })

  it('computes normalized bounds from source pixels', () => {
    const model = buildAiBriefModel(sampleProject(), OPTS)
    const r = model.pages[0].regions[0]
    expect(r.boundsPixels).toEqual({ x: 100, y: 240, width: 430, height: 180 })
    expect(r.boundsNormalized.x).toBeCloseTo(100 / 1600, 3)
    expect(r.boundsNormalized.height).toBeCloseTo(180 / 1000, 3)
  })

  it('omits crop paths when crops are excluded', () => {
    const model = buildAiBriefModel(sampleProject(), { ...OPTS, includeRegionCrops: false })
    expect(model.pages[0].regions.every((r) => r.crop === null)).toBe(true)
    expect(expectedPackageFiles(model).some((f) => f.includes('/regions/'))).toBe(false)
  })

  it('surfaces a single-page overall message at the top level', () => {
    const model = buildAiBriefModel(sampleProject(), OPTS)
    expect(model.overallMessage).toBe('Keep the overall layout intact')
  })
})

describe('generateManifest', () => {
  it('contains only contract fields — no internal metadata', () => {
    const manifest = generateManifest(buildAiBriefModel(sampleProject(), OPTS))
    const parsed = JSON.parse(manifest)
    expect(parsed.schemaVersion).toBe('1.0')
    // Forbidden internals must never leak into the package.
    for (const forbidden of [
      '"id"',
      'revision',
      'schemaVersion": 1,', // project schema version (number), not the package's
      'createdAt',
      'updatedAt',
      'tombstone',
      'zoomState',
      'panState',
      'activePageId',
      'media/',
      '/Users/',
      'file:'
    ]) {
      expect(manifest).not.toContain(forbidden)
    }
    const regionKeys = Object.keys(parsed.pages[0].regions[0]).sort()
    expect(regionKeys).toEqual(['boundsNormalized', 'boundsPixels', 'crop', 'instruction', 'number'])
  })
})

describe('generateBriefMd', () => {
  it('is human-readable with instructions, coordinates and crop references', () => {
    const md = generateBriefMd(buildAiBriefModel(sampleProject(), OPTS))
    expect(md).toContain('# Landing page fixes')
    expect(md).toContain('### Region 1')
    expect(md).toContain('Change the button color to green')
    expect(md).toContain('x: 100')
    expect(md).toContain('width: 430')
    expect(md).toContain('pages/page-001/regions/region-001.png')
    expect(md).toContain('Keep the overall layout intact')
  })

  it('marks regions without instructions instead of dropping them', () => {
    const project = sampleProject()
    ;(project.pages[0].annotations[0] as RegionAnnotation).instruction = ''
    const md = generateBriefMd(buildAiBriefModel(project, OPTS))
    expect(md).toContain('No instruction was written')
  })
})

describe('generateReadme', () => {
  it('explains the package layout and precedence rule', () => {
    const readme = generateReadme(buildAiBriefModel(sampleProject(), OPTS))
    expect(readme).toContain('brief.md')
    expect(readme).toContain('manifest.json')
    expect(readme).toContain('original')
    expect(readme).toContain('annotated')
    expect(readme.toLowerCase()).toContain('region instruction wins')
  })
})

describe('packageRootName', () => {
  it('sanitizes user titles into safe folder names', () => {
    expect(packageRootName('Landing page fixes')).toBe('smart-brief-landing-page-fixes')
    expect(packageRootName('../../etc/passwd')).toBe('smart-brief-etc-passwd')
    expect(packageRootName('שם בעברית! 🎉')).toBe('smart-brief-brief')
    expect(packageRootName('')).toBe('smart-brief-brief')
    expect(packageRootName('a'.repeat(200)).length).toBeLessThanOrEqual(73)
  })
})

describe('expectedPackageFiles', () => {
  it('lists every file the package must contain', () => {
    const files = expectedPackageFiles(buildAiBriefModel(sampleProject(), OPTS))
    expect(files).toContain('README.md')
    expect(files).toContain('manifest.json')
    expect(files).toContain('brief.md')
    expect(files).toContain('project-preview.jpg')
    expect(files).toContain('pages/page-001/original.png')
    expect(files).toContain('pages/page-001/annotated.png')
    expect(files).toContain('pages/page-001/regions/region-002.png')
  })
})
