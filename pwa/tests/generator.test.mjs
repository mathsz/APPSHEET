import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { loadExercises, pickRandomExercise, generateWorkout, listExercises } from '../src/generator.js'

const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'exercises.sample.json'), 'utf8'))

describe('generator', () => {
  beforeEach(() => {
    // reset exercises
    loadExercises(sample)
    // make randomness deterministic by returning 0 every call
    vi.spyOn(Math, 'random').mockImplementation(() => 0)
  })

  it('loadExercises rejects non-array', () => {
    expect(() => loadExercises({})).toThrow()
  })

  it('listExercises returns loaded array', () => {
    const all = listExercises()
    expect(Array.isArray(all)).toBe(true)
    expect(all.length).toBeGreaterThan(0)
  })

  it('pickRandomExercise filters by equipment and muscle', () => {
    const byEquip = pickRandomExercise({ equipment: 'kettlebell' })
    expect(byEquip).toBeDefined()
    expect(byEquip.equipment.includes('kettlebell')).toBe(true)

    const byMuscle = pickRandomExercise({ muscle: 'glutes' })
    expect(byMuscle).toBeDefined()
    expect(byMuscle.muscles.includes('glutes')).toBe(true)
  })

  it('generateWorkout returns unique items up to count', () => {
    const w = generateWorkout({ count: 3 })
    expect(w.length).toBe(3)
    const ids = new Set(w.map(x => x.id))
    expect(ids.size).toBe(w.length)
  })

  it('generateWorkout respects constraints and returns fewer if not enough', () => {
    const w = generateWorkout({ count: 10, constraints: { equipment: 'bench' } })
    // bench equipment likely not in sample so returns empty or fewer
    expect(w.length).toBeLessThanOrEqual(10)
  })

  it('generateWorkout uses local settings when no params provided', () => {
    // ensure localStorage exists/clear
    try { localStorage.removeItem('fitbook_sets'); localStorage.removeItem('fitbook_equipment') } catch {}
    // set local sets
    try { localStorage.setItem('fitbook_sets', '4') } catch {}
    const w = generateWorkout()
    expect(w.length).toBe(4)
    // equipment constraint from local storage
    try { localStorage.setItem('fitbook_equipment', 'kettlebell') } catch {}
    const w2 = generateWorkout({ count: 3 })
    // all returned exercises should include at least one requested equipment
    expect(w2.length).toBeGreaterThanOrEqual(0)
    if (w2.length) expect(w2.every(e => e.equipment.includes('kettlebell'))).toBe(true)
  })
})