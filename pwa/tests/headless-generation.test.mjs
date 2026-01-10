import './setup.js'
import { describe, it, expect, beforeEach } from 'vitest'
import * as gen from '../src/generator.js'
import * as auth from '../src/auth.js'
import { setSetting } from '../src/settings.js'

beforeEach(() => {
  try { localStorage.clear() } catch (e) {}
  gen.loadExercises([])
  // ensure workout-list container exists
  document.body.innerHTML = '<div id="app"><div id="workout-list"></div></div>'
})

// Generate a larger sample of exercises to ensure the generator can fill requested slots
const SAMPLE = []
for (let i = 1; i <= 14; i++) {
  SAMPLE.push({ id: 's' + i, name: 'Strength ' + i, discipline: 'strength', muscles: ['muscle' + i], equipment: ['bodyweight'] })
}
for (let j = 1; j <= 8; j++) {
  SAMPLE.push({ id: 'h' + j, name: 'HIIT ' + j, discipline: 'hiit', muscles: ['core'], equipment: ['bodyweight'], body_category: 'core', plyometric: false })
}

describe('Headless generation and rendering checks', () => {
  it('Strength: 15 / 30 / 45 minutes produce expected number of cards and per-exercise sets', () => {
    gen.loadExercises(SAMPLE)
    setSetting('program_type', 'Strength')

    const checks = [15, 30, 45]
    for (const mins of checks) {
      // provide setCount explicitly
      const setCount = 3
      const w = gen.generateWorkout({ constraints: { programType: 'Strength', durationMin: mins, setCount } })
      // Derive expected count using same algorithm as generator
      const expected = (!isNaN(Number(mins)) && Number(mins) > 0)
        ? gen.generateTimeBasedWorkout(mins, setCount, 90).exercises
        : 8

      expect(Array.isArray(w)).toBe(true)
      expect(w.length).toBe(expected)

      // Render using auth renderer and check DOM cards
      document.getElementById('workout-list').innerHTML = ''
      try { window.renderWorkoutsFromGenerated ? window.renderWorkoutsFromGenerated(w) : null } catch (e) { /* fail-safe */ }
      const cards = document.querySelectorAll('#workout-list .card')
      expect(cards.length).toBe(expected)
      // All cards should report data-set-count equal to setCount
      let allMatch = true
      cards.forEach(c => { if (parseInt(c.getAttribute('data-set-count')||'0',10) !== setCount) allMatch = false })
      expect(allMatch).toBe(true)
    }
  })

  it('HIIT: durations 15/30/45 expand to expected interval counts and render hiit elements', () => {
    gen.loadExercises(SAMPLE)
    setSetting('program_type', 'HIIT')

    const work = 40
    const rest = 20
    const checks = [15, 30, 45]
    for (const mins of checks) {
      const uniques = gen.generateWorkout({ constraints: { programType: 'HIIT', durationMin: mins, allowJumps: false } })
      // Production logic (Apps Script): uniqueCount = clamp(1..5, durationMinutes)
      const expectedUniqueCount = (mins && !isNaN(Number(mins)) && Number(mins) > 0)
        ? Math.max(1, Math.min(5, Math.floor(Number(mins))))
        : 5
      expect(uniques.length).toBe(expectedUniqueCount)

      const totalSeconds = Math.max(1, Number(mins || 0)) * 60
      const cycleSeconds = Math.max(1, (Number(work) + Number(rest)))
      const intervalCount = Math.max(1, Math.floor(totalSeconds / cycleSeconds))

      // Expand to intervals by cycling uniques
      const sample = []
      for (let order = 1; order <= intervalCount; order++) {
        const ex = uniques[(order - 1) % uniques.length]
        sample.push({ id: ex.id || ('gen_' + Math.random().toString(36).slice(2,9)), order: order, round: Math.floor((order - 1) / uniques.length) + 1, slot_in_round: ((order - 1) % uniques.length) + 1, exercise: ex.name || ex.exercise || '', interval_label: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''), work_s: work, rest_s: rest, video_url: ex.video || '' })
      }

      // Render using HIIT renderer
      document.getElementById('workout-list').innerHTML = ''
      try { window.renderHiitRounds ? window.renderHiitRounds(sample) : null } catch (e) { /* fail-safe */ }

      // Count hiit-ex entries and rounds
      const exEls = document.querySelectorAll('#workout-list .hiit-ex')
      expect(exEls.length).toBe(intervalCount)
      const roundEls = document.querySelectorAll('#workout-list .hiit-round')
      const expectedRounds = Math.ceil(intervalCount / expectedUniqueCount)
      expect(roundEls.length).toBe(expectedRounds)
    }
  })
})
