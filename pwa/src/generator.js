// Minimal client-side generator prototype
// Exports: loadExercises(list), pickRandomExercise(opts), generateWorkout({count, constraints})

let EXERCISES = []

export function loadExercises(list) {
  if (!Array.isArray(list)) throw new Error('exercises must be array')
  EXERCISES = list.map(e => ({
    id: String(e.id || ''),
    name: String(e.name || ''),
    discipline: String(e.discipline || 'strength'),
    muscles: (e.muscles || []).map(m => String(m).toLowerCase()),
    equipment: (e.equipment || []).map(q => String(q).toLowerCase()),
    mode: String(e.mode || 'reps'),
    value: e.value || {},
    cues: e.cues || '',
    video: e.video || '',
    tags: (e.tags || []).map(t => String(t).toLowerCase()),
    lastUpdated: e.lastUpdated || null
  }))
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickRandomExercise({excludeIds = [], equipment = null, muscle = null} = {}) {
  let pool = EXERCISES.filter(e => !excludeIds.includes(e.id))
  if (equipment) pool = pool.filter(e => e.equipment.includes(String(equipment).toLowerCase()))
  if (muscle) pool = pool.filter(e => e.muscles.includes(String(muscle).toLowerCase()))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export function generateWorkout({count = 5, constraints = {}} = {}) {
  const out = []
  let excluded = []
  for (let i = 0; i < count; i++) {
    const ex = pickRandomExercise({excludeIds: excluded, equipment: constraints.equipment || null, muscle: constraints.muscle || null})
    if (!ex) break
    out.push(ex)
    excluded.push(ex.id)
  }
  return out
}

export function listExercises() { return EXERCISES }

// Basic normalization helpers (extendable)
export function normalizeEquipment(e) {
  const map = { 'db': 'dumbbells', 'kb': 'kettlebell', 'body weight': 'bodyweight' }
  const s = (String(e||'').trim().toLowerCase())
  return map[s] || s
}
