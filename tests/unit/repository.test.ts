import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProjectRepository } from '../../src/main/persistence/repository'
import { createEmptyProject, createPage, type Project } from '../../src/shared/schemas/project'

let dir: string
let repo: ProjectRepository

function project(id: string, title = 'Test'): Project {
  const p = createEmptyProject(id, Date.now())
  p.title = title
  const page = createPage(`${id}-page`, 'screenshot', Date.now(), {
    file: `${id}.png`,
    width: 100,
    height: 100
  })
  p.pages = [page]
  p.activePageId = page.id
  return p
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-repo-'))
  repo = new ProjectRepository(dir)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('ProjectRepository', () => {
  it('saves and reloads a project', async () => {
    const p = project('11111111-1111-1111-1111-111111111111')
    const result = await repo.saveProject(p, 0)
    expect(result.ok).toBe(true)
    expect(result.revision).toBe(1)
    const loaded = await repo.getProject(p.id)
    expect(loaded?.title).toBe('Test')
    expect(loaded?.revision).toBe(1)
  })

  it('rejects a stale save so delayed autosaves cannot clobber newer state', async () => {
    const p = project('22222222-2222-2222-2222-222222222222')
    await repo.saveProject(p, 0) // revision 1
    await repo.saveProject({ ...p, title: 'Newer' }, 1) // revision 2
    const stale = await repo.saveProject({ ...p, title: 'Old timer fired late' }, 1)
    expect(stale.ok).toBe(false)
    expect(stale.reason).toBe('stale')
    const loaded = await repo.getProject(p.id)
    expect(loaded?.title).toBe('Newer')
  })

  it('deletes a project permanently and blocks resurrection by later saves', async () => {
    const p = project('33333333-3333-3333-3333-333333333333')
    await repo.saveProject(p, 0)
    await repo.deleteProject(p.id)
    expect(await repo.getProject(p.id)).toBeNull()
    // A stale autosave arriving after deletion must be rejected.
    const zombie = await repo.saveProject(p, 1)
    expect(zombie.ok).toBe(false)
    expect(zombie.reason).toBe('deleted')
    expect(await repo.getProject(p.id)).toBeNull()
    expect((await repo.listProjects()).find((m) => m.id === p.id)).toBeUndefined()
  })

  it('keeps tombstones across repository restarts', async () => {
    const p = project('44444444-4444-4444-4444-444444444444')
    await repo.saveProject(p, 0)
    await repo.deleteProject(p.id)
    const reopened = new ProjectRepository(dir)
    const zombie = await reopened.saveProject(p, 0)
    expect(zombie.ok).toBe(false)
    expect(zombie.reason).toBe('deleted')
  })

  it('duplicates a project with entirely new ids', async () => {
    const p = project('55555555-5555-5555-5555-555555555555', 'Original')
    await repo.saveProject(p, 0)
    const copy = await repo.duplicateProject(p.id)
    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe(p.id)
    expect(copy!.title).toBe('Original copy')
    expect(copy!.pages[0].id).not.toBe(p.pages[0].id)
    const list = await repo.listProjects()
    expect(list).toHaveLength(2)
  })

  it('lists projects sorted by most recently updated', async () => {
    const a = { ...project('66666666-6666-6666-6666-666666666666', 'A'), updatedAt: 1000 }
    const b = { ...project('77777777-7777-7777-7777-777777777777', 'B'), updatedAt: 2000 }
    await repo.saveProject(a, 0)
    await repo.saveProject(b, 0)
    const list = await repo.listProjects()
    expect(list.map((m) => m.title)).toEqual(['B', 'A'])
    expect(list[0].regionCount).toBe(0)
    expect(list[0].pageCount).toBe(1)
  })

  it('survives a corrupt project file without losing other projects', async () => {
    const good = project('88888888-8888-8888-8888-888888888888', 'Good')
    await repo.saveProject(good, 0)
    fs.writeFileSync(path.join(dir, 'projects', 'aaaaaaaa-0000-0000-0000-000000000000.json'), '{corrupt not json')
    const reopened = new ProjectRepository(dir)
    const report = await reopened.recoverProjects()
    expect(report.corruptFiles).toHaveLength(1)
    // The corrupt original is preserved, not deleted.
    expect(fs.readdirSync(path.join(dir, 'corrupt')).length).toBe(1)
    const list = await reopened.listProjects()
    expect(list.map((m) => m.title)).toEqual(['Good'])
  })

  it('recovers from the .bak backup when the primary file is corrupt', async () => {
    const p = project('99999999-9999-9999-9999-999999999999', 'First')
    await repo.saveProject(p, 0)
    await repo.saveProject({ ...p, title: 'Second' }, 1) // creates .bak of revision 1
    const filePath = path.join(dir, 'projects', `${p.id}.json`)
    fs.writeFileSync(filePath, 'garbage{{{')
    const reopened = new ProjectRepository(dir)
    await reopened.recoverProjects()
    const loaded = await reopened.getProject(p.id)
    expect(loaded?.title).toBe('First') // recovered from backup
  })

  it('removes media used only by the deleted project, keeping shared media', async () => {
    const mediaDir = path.join(dir, 'media')
    fs.mkdirSync(mediaDir, { recursive: true })
    fs.writeFileSync(path.join(mediaDir, 'only-a.png'), 'x')
    fs.writeFileSync(path.join(mediaDir, 'shared.png'), 'x')
    const a = project('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A')
    a.pages[0].sourceImage = { file: 'only-a.png', width: 1, height: 1 }
    a.pages[0].placedImages = [
      { id: 'pi', file: 'shared.png', x: 0, y: 0, width: 1, height: 1, zIndex: 0 }
    ]
    const b = project('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B')
    b.pages[0].sourceImage = { file: 'shared.png', width: 1, height: 1 }
    await repo.saveProject(a, 0)
    await repo.saveProject(b, 0)
    await repo.deleteProject(a.id)
    expect(fs.existsSync(path.join(mediaDir, 'only-a.png'))).toBe(false)
    expect(fs.existsSync(path.join(mediaDir, 'shared.png'))).toBe(true)
  })

  it('serializes concurrent writes without corruption', async () => {
    const p = project('cccccccc-cccc-cccc-cccc-cccccccccccc')
    await repo.saveProject(p, 0)
    const results = await Promise.all([
      repo.saveProject({ ...p, title: 'w1' }, 1),
      repo.saveProject({ ...p, title: 'w2' }, 2),
      repo.saveProject({ ...p, title: 'w3' }, 3)
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(3)
    const loaded = await repo.getProject(p.id)
    expect(loaded?.title).toBe('w3')
    expect(loaded?.revision).toBe(4)
  })
})
