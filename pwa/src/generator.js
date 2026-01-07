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
  if (equipment) {
    // allow comma-separated equipment strings or arrays; match ANY of requested equipment
    const reqs = Array.isArray(equipment) ? equipment.map(s => String(s).toLowerCase()) : String(equipment || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (reqs.length) {
      pool = pool.filter(e => reqs.some(r => (Array.isArray(e.equipment) ? e.equipment : [e.equipment]).map(x => String(x).toLowerCase()).includes(r)))
    }
  }
  if (muscle) {
    const m = String(muscle).toLowerCase()
    pool = pool.filter(e => e.muscles.includes(m))
  }
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

function _readLocalInt(key, fallback) {
  try { const v = localStorage.getItem(key); const n = parseInt(String(v||''), 10); return isNaN(n) ? fallback : n } catch { return fallback }
}
function _readLocalString(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : String(v) } catch { return fallback }
}

export function generateWorkout({count = null, constraints = {}} = {}) {
  // Default to local setup when available
  let c = count != null ? count : _readLocalInt('fitbook_sets', 5)
  if (!constraints || typeof constraints !== 'object') constraints = {}
  if (!constraints.equipment) {
    const eq = _readLocalString('fitbook_equipment', '')
    if (eq) constraints.equipment = eq
  }
  const out = []
  let excluded = []
  for (let i = 0; i < c; i++) {
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
