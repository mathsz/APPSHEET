import './setup.js'
import { describe, it, expect, beforeEach } from 'vitest'
import * as gen from '../src/generator.js'
import { setSetting } from '../src/settings.js'

beforeEach(() => {
  // reset exercises and localStorage
  try { localStorage.clear() } catch (e) {}
  gen.loadExercises([])
})

describe('duration -> target count mapping', () => {
  it('derives count from duration for Strength (sets=3)', () => {
    setSetting('program_type', 'Strength')
    setSetting('sets', '3')
    setSetting('duration_min', '10')

    gen.loadExercises([
      { id: '1', name: 'A', discipline: 'strength', muscles: ['chest'], equipment: ['bodyweight'] },
      { id: '2', name: 'B', discipline: 'strength', muscles: ['back'], equipment: ['bodyweight'] },
      { id: '3', name: 'C', discipline: 'strength', muscles: ['core'], equipment: ['bodyweight'] }
    ])

    // duration 10, sets 3 => minutesPerExercise = max(3, round(((3*60)+60)/60)) = 4 => floor(10/4)=2
    const w = gen.generateWorkout({ constraints: { programType: 'Strength', durationMin: 10, setCount: 3 } })
    expect(Array.isArray(w)).toBe(true)
    expect(w.length).toBe(2)
  })

  it('uses default sets for HIIT', () => {
    setSetting('program_type', 'HIIT')
    setSetting('sets', '6')
    setSetting('duration_min', '20')

    gen.loadExercises([
      { id: 'h1', name: 'H1', discipline: 'hiit', muscles: ['core'], equipment: ['bodyweight'], body_category: 'core', plyometric: false },
      { id: 'h2', name: 'H2', discipline: 'hiit', muscles: ['upper'], equipment: ['bodyweight'], body_category: 'upper body', plyometric: false },
      { id: 'h3', name: 'H3', discipline: 'hiit', muscles: ['lower'], equipment: ['bodyweight'], body_category: 'lower body', plyometric: false },
      { id: 'h4', name: 'H4', discipline: 'hiit', muscles: ['cardio'], equipment: ['bodyweight'], body_category: 'cardio', plyometric: true },
      { id: 'h5', name: 'H5', discipline: 'hiit', muscles: ['full'], equipment: ['bodyweight'], body_category: 'full body', plyometric: false },
      { id: 'h6', name: 'H6', discipline: 'hiit', muscles: ['core'], equipment: ['bodyweight'], body_category: 'core', plyometric: false }
    ])

    // duration 20 => uniqueCount = 5
    const w = gen.generateWorkout({ constraints: { programType: 'HIIT', durationMin: 20, allowJumps: false } })
    expect(Array.isArray(w)).toBe(true)
    expect(w.length).toBe(5)
    // allowJumps:false should exclude plyometric:true
    expect(w.some(x => x.plyometric === true)).toBe(false)
  })
})
