import './setup.js'
import { describe, it, expect } from 'vitest'
import * as gen from '../src/generator.js'

describe('loadExercises schema compatibility', () => {
  it('normalizes ExerciceDB-shaped rows (Id/primary_muscle/equipment/body_category/Discipline)', () => {
    const rows = [
      {
        Id: '99',
        name: 'Pallof Press',
        primary_muscle: 'Core',
        secondary_muscles: 'Shoulders, Triceps',
        equipment: 'bodyweight',
        body_category: 'Core',
        Discipline: 'strength',
        tags: 'Abdos',
        plyometric: 'FALSE',
        isometric: 'FALSE',
        description: 'Anti-rotation hold.'
      }
    ]
    gen.loadExercises(rows)
    const pick = gen.pickRandomExercise({ equipment: '', muscle: ['core'] })
    expect(pick).not.toBeNull()
    expect(pick.id).toBe('99')
    expect(pick.discipline).toBe('strength')
    expect(Array.isArray(pick.muscles)).toBe(true)
    expect(pick.muscles).toEqual(expect.arrayContaining(['core']))
    expect(Array.isArray(pick.equipment)).toBe(true)
    expect(pick.equipment).toEqual(expect.arrayContaining(['bodyweight']))
  })
})
