import { describe, it, expect } from 'vitest'
import { NODES, EDGES_BASE, SCENARIOS } from '../src/data/graph'

const ids = new Set(NODES.map(n => n.id))
const edgeKeys = new Set(EDGES_BASE.map(([a,b]) => `${a}>${b}`))

describe('graph integrity', () => {
  it('has unique node ids', () => {
    expect(ids.size).toBe(NODES.length)
  })

  it('edges reference existing nodes', () => {
    for (const [a,b] of EDGES_BASE) {
      expect(ids.has(a)).toBe(true)
      expect(ids.has(b)).toBe(true)
    }
  })

  it('scenarios only activate valid edges', () => {
    for (const [name, s] of Object.entries(SCENARIOS)) {
      for (const k of s.active) {
        expect(edgeKeys.has(k)).toBe(true)
      }
    }
  })

  it('high tanks share same X', () => {
    const TA = NODES.filter(n => ['TA1','TA2','TA3'].includes(n.id))
    expect(TA.every(n => n.x === TA[0].x)).toBe(true)
  })
})
