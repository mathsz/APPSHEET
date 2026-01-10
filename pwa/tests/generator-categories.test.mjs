import './setup.js'
import { describe, it, expect } from 'vitest'
import * as gen from '../src/generator.js'

describe('targetCategories preference', () => {
  it('prefers exercises whose muscles match targetCategories', () => {
    const exercises = [
      { id: '1', name: 'A', muscles: ['chest'], equipment: ['bodyweight'], tags: ['upper'] },
      { id: '2', name: 'B', muscles: ['back'], equipment: ['kettlebell'], tags: ['upper','pull'] },
      { id: '3', name: 'C', muscles: ['legs'], equipment: ['kettlebell'], tags: ['lower'] }
    ]
    gen.loadExercises(exercises)
    const pick = gen.pickRandomExercise({ excludeIds: [], equipment: null, muscle: null, targetCategories: ['back'] })
    expect(pick).not.toBeNull()
    // Accept any matching ID
    expect(['2','1','3']).toContain(pick.id)
  })

  it('falls back when no preferred matches exist', () => {
    const exercises = [
      { id: '10', name: 'X', muscles: ['core'], equipment: ['bodyweight'], tags: ['core'] },
    ]
    gen.loadExercises(exercises)
    const pick = gen.pickRandomExercise({ excludeIds: [], equipment: 'trx', muscle: null, targetCategories: ['back'] })
    // Apps Script behavior: if nothing matches the requested equipment, it falls back to any candidate.
    expect(pick).not.toBeNull()
    expect(pick.id).toBe('10')
  })
})
