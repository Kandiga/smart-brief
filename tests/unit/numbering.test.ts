import { describe, expect, it } from 'vitest'
import { renumberRegions, type Annotation } from '../../src/shared/schemas/project'

function region(id: string, number: number): Annotation {
  return {
    id,
    type: 'region',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: '#e5484d',
    strokeWidth: 3,
    number,
    instruction: `note ${id}`
  }
}

function arrow(id: string): Annotation {
  return { id, type: 'arrow', x1: 0, y1: 0, x2: 5, y2: 5, color: '#000', strokeWidth: 2 }
}

describe('region numbering', () => {
  it('assigns sequential numbers in creation order', () => {
    const result = renumberRegions([region('a', 0), region('b', 0), region('c', 0)])
    expect(result.map((r: any) => r.number)).toEqual([1, 2, 3])
  })

  it('renumbers after a deletion in the middle', () => {
    const all = renumberRegions([region('a', 1), region('b', 2), region('c', 3)])
    const afterDelete = renumberRegions(all.filter((a) => a.id !== 'b'))
    expect(afterDelete.map((r: any) => r.number)).toEqual([1, 2])
    expect(afterDelete[1].id).toBe('c')
  })

  it('ignores non-region annotations and keeps their positions', () => {
    const result = renumberRegions([arrow('x'), region('a', 9), arrow('y'), region('b', 1)])
    expect(result[0].type).toBe('arrow')
    expect((result[1] as any).number).toBe(1)
    expect((result[3] as any).number).toBe(2)
  })

  it('preserves instruction text through renumbering', () => {
    const result = renumberRegions([region('a', 2), region('b', 1)])
    expect((result[0] as any).instruction).toBe('note a')
    expect((result[1] as any).instruction).toBe('note b')
  })

  it('does not mutate annotations that already have correct numbers', () => {
    const input = [region('a', 1), region('b', 2)]
    const result = renumberRegions(input)
    expect(result[0]).toBe(input[0])
    expect(result[1]).toBe(input[1])
  })
})
