import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createPage,
  isEmptyDraft,
  migrateProject,
  SCHEMA_VERSION,
  type Project
} from '../../src/shared/schemas/project'

function sampleProject(): Project {
  const project = createEmptyProject('p1', 1000)
  const page = createPage('page1', 'screenshot', 1000, { file: 'a.png', width: 800, height: 600 })
  page.annotations = [
    {
      id: 'r1',
      type: 'region',
      x: 1,
      y: 2,
      width: 30,
      height: 40,
      color: '#e5484d',
      strokeWidth: 3,
      number: 1,
      instruction: 'Make this bigger'
    },
    { id: 'a1', type: 'arrow', x1: 0, y1: 0, x2: 9, y2: 9, color: '#000', strokeWidth: 2 }
  ]
  project.pages = [page]
  project.activePageId = 'page1'
  return project
}

describe('project serialization and migration', () => {
  it('round-trips through JSON without loss', () => {
    const project = sampleProject()
    const restored = migrateProject(JSON.parse(JSON.stringify(project)))
    expect(restored).toEqual(project)
  })

  it('migrates a version-0 payload by filling defaults', () => {
    const legacy = {
      id: 'old-1',
      title: 'Legacy',
      pages: [{ id: 'pg', annotations: [], kind: 'screenshot' }]
    }
    const migrated = migrateProject(legacy)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.pages[0].overallMessage).toBe('')
    expect(migrated.pages[0].placedImages).toEqual([])
    expect(migrated.activePageId).toBe('pg')
  })

  it('drops malformed annotations but keeps valid ones', () => {
    const raw = sampleProject() as any
    raw.pages[0].annotations.push({ id: 'bad', type: 'region' }, { nonsense: true }, null)
    const migrated = migrateProject(JSON.parse(JSON.stringify(raw)))
    expect(migrated.pages[0].annotations).toHaveLength(2)
  })

  it('renumbers regions during normalization', () => {
    const raw = sampleProject() as any
    raw.pages[0].annotations[0].number = 42
    const migrated = migrateProject(JSON.parse(JSON.stringify(raw)))
    expect((migrated.pages[0].annotations[0] as any).number).toBe(1)
  })

  it('falls back to the first page when activePageId is stale', () => {
    const raw = sampleProject() as any
    raw.activePageId = 'gone'
    const migrated = migrateProject(JSON.parse(JSON.stringify(raw)))
    expect(migrated.activePageId).toBe('page1')
  })

  it('rejects payloads from a newer schema', () => {
    expect(() => migrateProject({ id: 'x', schemaVersion: 999, pages: [] })).toThrow()
  })

  it('rejects non-objects and missing ids', () => {
    expect(() => migrateProject(null)).toThrow()
    expect(() => migrateProject({ title: 'no id' })).toThrow()
  })
})

describe('empty draft detection', () => {
  it('an untouched draft is empty', () => {
    expect(isEmptyDraft(createEmptyProject('d', 1))).toBe(true)
  })

  it('a renamed draft is not empty', () => {
    const p = createEmptyProject('d', 1)
    p.title = 'Homepage tweaks'
    expect(isEmptyDraft(p)).toBe(false)
  })

  it('a draft with a page is not empty', () => {
    const p = createEmptyProject('d', 1)
    p.pages.push(createPage('pg', 'blank', 1, null))
    expect(isEmptyDraft(p)).toBe(false)
  })
})
