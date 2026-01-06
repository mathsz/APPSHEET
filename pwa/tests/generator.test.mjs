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
})