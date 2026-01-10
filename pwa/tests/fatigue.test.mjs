import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeMuscleFatigueMap,
  parseMuscleMap,
  pruneHistoryTo7Days,
  pickSuggestedMuscle
} from '../src/fatigue.js'

beforeEach(() => {
  try { localStorage.clear() } catch {}
})

describe('fatigue', () => {
  it('parses Fatigue strings into a muscle map', () => {
    const m = parseMuscleMap('Core:0.7;Chest:0.2;Category:1')
    expect(m.Core).toBeCloseTo(0.7)
    expect(m.Chest).toBeCloseTo(0.2)
    expect(m.Category).toBeUndefined()
  })

  it('computes fatigue with set scaling and recovery decay', () => {
    const now = new Date('2026-01-08T12:00:00Z')
    const rows = [
      { date: '2026-01-08T12:00:00Z', setCount: 3, musclesToHit: { Core: 1 } }, // +50
      { date: '2026-01-08T00:00:00Z', setCount: 3, musclesToHit: { Core: 1 } } // 12h ago, recovery 24h => +25
    ]
    const fm = computeMuscleFatigueMap(rows, now)
    expect(Math.round(fm.Core)).toBe(75)
  })

  it('prunes history to a strict 7-day window', () => {
    const now = new Date('2026-01-08T12:00:00Z')
    const rows = [
      { date: '2025-12-31T11:59:59Z', setCount: 1, musclesToHit: { Core: 1 } }, // >7 days old
      { date: '2026-01-02T12:00:00Z', setCount: 1, musclesToHit: { Core: 1 } }
    ]
    const pruned = pruneHistoryTo7Days(rows, now)
    expect(pruned.length).toBe(1)
    expect(new Date(pruned[0].date).toISOString()).toBe('2026-01-02T12:00:00.000Z')
  })

  it('suggests a lower-fatigue alternative when requested is fatigued', () => {
    const fatigueMap = { Back: 80, Chest: 10, Core: 50 }
    const info = pickSuggestedMuscle(['Back'], fatigueMap)
    expect(info.isRequestedFatigued).toBe(true)
    expect(info.suggested).not.toBe('Back')
    expect(info.suggestedFatigue).toBeLessThanOrEqual(10)
  })
})
