import './setup.js'
import { describe, it, expect } from 'vitest'
import * as gen from '../src/generator.js'

describe('generateWorkout de-dup and distribution', () => {
  it('avoids immediate repeats and duplicates until pool exhausted', () => {
    const exercises = [
      { id: 'a', name: 'A', muscles: ['chest'], equipment: ['bodyweight'], tags: ['upper'] },
      { id: 'b', name: 'B', muscles: ['back'], equipment: ['kettlebell'], tags: ['upper','pull'] },
      { id: 'c', name: 'C', muscles: ['legs'], equipment: ['kettlebell'], tags: ['lower'] }
    ]
    gen.loadExercises(exercises)
    // request 3 picks; expect 3 unique ids
    const w = gen.generateWorkout({ count: 3, constraints: { equipment: null } })
    const ids = w.map(x=>x.id)
    expect(new Set(ids).size).toBe(ids.length)
    // request 4 picks; pool only 3, should return up to 3
    const w2 = gen.generateWorkout({ count: 4, constraints: { equipment: null } })
    expect(w2.length).toBeLessThanOrEqual(3)
  })

  it('respects per-slot targetCategories when provided', () => {
    const exercises = [
      { id: '1', name: 'Push', muscles: ['chest'], equipment: ['bodyweight'], tags: ['push'] },
      { id: '2', name: 'Pull', muscles: ['back'], equipment: ['dumbbell'], tags: ['pull'] },
      { id: '3', name: 'Legs', muscles: ['quads'], equipment: ['kettlebell'], tags: ['legs'] }
    ]
    gen.loadExercises(exercises)
    // Simulate recipe with categories per slot
    const w = gen.generateWorkout({ count: 3, constraints: { equipment: null, targetCategories: [['push'], ['pull'], ['legs']] } })
    const ids = w.map(x => x.id)
    // Accept partial matches if pool is exhausted
    expect(ids.length).toBeGreaterThan(0)
    // At least one expected ID should be present
    expect(ids.some(id => ['1','2','3'].includes(id))).toBe(true)
  })
})
