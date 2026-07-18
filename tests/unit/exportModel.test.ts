import { describe, expect, it } from 'vitest'
import { buildExportModel, escapeHtml } from '../../src/shared/exportModel'
import { createEmptyProject, createPage } from '../../src/shared/schemas/project'

const FORBIDDEN = ['brief direction', 'goal', 'target model', 'must preserve', 'must avoid']

describe('export model', () => {
  it('contains only visual brief content', () => {
    const project = createEmptyProject('p', 1)
    project.title = 'Landing page tweaks'
    const page = createPage('pg', 'screenshot', 1, { file: 'a.png', width: 10, height: 10 })
    page.title = 'Hero'
    page.overallMessage = 'Make the hero calmer.'
    page.annotations = [
      {
        id: 'r1',
        type: 'region',
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        color: '#12a594',
        strokeWidth: 2,
        number: 1,
        instruction: 'Enlarge the headline. '
      }
    ]
    project.pages = [page]
    const model = buildExportModel(project)
    expect(model.title).toBe('Landing page tweaks')
    expect(model.pages).toHaveLength(1)
    expect(model.pages[0].regions[0]).toEqual({
      number: 1,
      color: '#12a594',
      instruction: 'Enlarge the headline.'
    })
    // No bureaucratic metadata anywhere in the model.
    const keys = JSON.stringify(model).toLowerCase()
    for (const term of FORBIDDEN) {
      expect(keys).not.toContain(term)
    }
  })

  it('falls back to a default title', () => {
    const project = createEmptyProject('p', 1)
    project.title = '   '
    expect(buildExportModel(project).title).toBe('Untitled brief')
  })

  it('escapes HTML in user text', () => {
    expect(escapeHtml(`<img onerror="x()">&'`)).toBe(
      '&lt;img onerror=&quot;x()&quot;&gt;&amp;&#39;'
    )
  })
})
