// Fatigue + history engine ported from Apps Script (Code.gs)

const HISTORY_KEY_PREFIX = 'homeworkouts_history_v1_' // per-user key
const HISTORY_MAX_DAYS = 7

export const MUSCLE_RECOVERY_HOURS = {
  Chest: 48,
  Back: 48,
  Legs: 72,
  Shoulders: 48,
  Biceps: 24,
  Triceps: 24,
  Abs: 24,
  Core: 24,
  Quads: 72,
  Hamstrings: 72,
  Glutes: 72,
  Calves: 48
}

const BASE_IMPACT_PER_EXERCISE = 50
const BASE_SETS = 3

export function monthDay(date) {
  const d = (date instanceof Date) ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function normalizeMuscleKeyTitle(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const key = raw.toLowerCase().replace(/\s+/g, ' ')
  const alias = {
    upperback: 'upper back',
    lowerback: 'lower back',
    midback: 'mid back',
    hipflexors: 'hip flexors',
    innerthighs: 'inner thighs',
    outerthighs: 'outer thighs',
    posteriorchain: 'posterior chain',
    ankles: 'calves',
    shoulder: 'shoulders',
    hip: 'hips',
    quad: 'quads',
    hamstring: 'hamstrings',
    glute: 'glutes',
    calf: 'calves',
    tricep: 'triceps',
    bicep: 'biceps',
    oblique: 'obliques',
    ab: 'abs'
  }

  const normalized = alias[key] || key
  return normalized
    .split(' ')
    .map(w => (w ? (w.charAt(0).toUpperCase() + w.slice(1)) : ''))
    .join(' ')
    .trim()
}

export function isMuscleKeyAllowed(muscleKey) {
  const k = normalizeMuscleKeyTitle(muscleKey)
  if (!k) return false
  if (k === 'Category') return false
  return true
}

export function getRecoveryTimeForMuscle(muscleKey) {
  const m = normalizeMuscleKeyTitle(muscleKey)
  if (!m) return 48
  if (MUSCLE_RECOVERY_HOURS[m]) return MUSCLE_RECOVERY_HOURS[m]

  const ml = m.toLowerCase()
  if (ml.includes('back')) return MUSCLE_RECOVERY_HOURS.Back || 48
  if (ml.includes('quad')) return MUSCLE_RECOVERY_HOURS.Quads || 72
  if (ml.includes('hamstring')) return MUSCLE_RECOVERY_HOURS.Hamstrings || 72
  if (ml.includes('glute')) return MUSCLE_RECOVERY_HOURS.Glutes || 72
  if (ml.includes('calf')) return MUSCLE_RECOVERY_HOURS.Calves || 48
  if (ml.includes('bicep')) return MUSCLE_RECOVERY_HOURS.Biceps || 24
  if (ml.includes('tricep')) return MUSCLE_RECOVERY_HOURS.Triceps || 24
  if (ml.includes('shoulder')) return MUSCLE_RECOVERY_HOURS.Shoulders || 48
  if (ml.includes('abs')) return MUSCLE_RECOVERY_HOURS.Abs || 24
  if (ml.includes('core') || ml.includes('oblique')) return MUSCLE_RECOVERY_HOURS.Core || 24

  return 48
}

export function parseMuscleMap(str) {
  if (!str) return {}
  const out = {}
  String(str)
    .split(';')
    .forEach(p => {
      const parts = String(p || '').split(':')
      if (parts.length < 2) return
      const v = parseFloat(parts[1])
      const key = normalizeMuscleKeyTitle(parts[0])
      if (!isNaN(v) && isMuscleKeyAllowed(key)) out[key] = v
    })
  return out
}

export function getDashboardMuscleList(extra = []) {
  const major = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Core', 'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves']
  const seen = new Set()
  const out = []
  for (const m of major.concat(extra || [])) {
    const k = normalizeMuscleKeyTitle(m)
    if (isMuscleKeyAllowed(k) && !seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out
}

function _historyKeyForEmail(email) {
  const e = String(email || '').trim().toLowerCase() || 'local'
  return HISTORY_KEY_PREFIX + e
}

export function loadHistory(email) {
  try {
    const raw = localStorage.getItem(_historyKeyForEmail(email))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHistory(email, rows) {
  try {
    localStorage.setItem(_historyKeyForEmail(email), JSON.stringify(Array.isArray(rows) ? rows : []))
  } catch {}
}

export function pruneHistoryTo7Days(rows, now = new Date()) {
  const tNow = (now instanceof Date) ? now.getTime() : new Date(now).getTime()
  const maxAgeMs = HISTORY_MAX_DAYS * 24 * 60 * 60 * 1000
  return (Array.isArray(rows) ? rows : []).filter(r => {
    const ts = new Date(r?.date || r?.timestamp || r?.ts || '').getTime()
    if (isNaN(ts)) return false
    return (tNow - ts) <= maxAgeMs
  })
}

export function computeMuscleFatigueMap(rows, now = new Date()) {
  const fatigue = {}
  const tNow = (now instanceof Date) ? now.getTime() : new Date(now).getTime()
  if (isNaN(tNow)) return fatigue

  const recent = pruneHistoryTo7Days(rows, new Date(tNow))

  for (const entry of recent) {
    const ts = new Date(entry?.date || entry?.timestamp || entry?.ts || '').getTime()
    if (isNaN(ts)) continue
    const hAgo = (tNow - ts) / 36e5

    const setCount = Math.max(1, parseInt(String(entry?.setCount ?? entry?.sets ?? 1), 10) || 1)
    const setFactor = Math.min(1, setCount / BASE_SETS)

    let musclesToHit = entry?.musclesToHit
    if (!musclesToHit || typeof musclesToHit !== 'object') {
      musclesToHit = {}
    }

    for (const mRaw of Object.keys(musclesToHit)) {
      const targetMuscle = normalizeMuscleKeyTitle(mRaw)
      if (!targetMuscle) continue
      const recoveryTime = getRecoveryTimeForMuscle(targetMuscle)
      if (hAgo >= recoveryTime) continue

      const decay = 1 - (hAgo / recoveryTime)
      const weight = Number(musclesToHit[mRaw] || 1)
      const impact = weight * BASE_IMPACT_PER_EXERCISE * setFactor
      fatigue[targetMuscle] = Math.min(100, (fatigue[targetMuscle] || 0) + (impact * decay))
    }
  }

  return fatigue
}

export function classifyFatigue(val) {
  const v = Math.min(100, Math.max(0, Math.round(Number(val || 0))))
  if (v < 40) return { label: '🟢 Frais', level: 'fresh' }
  if (v < 70) return { label: '🟠 Chargé', level: 'loaded' }
  return { label: '🔴 Repos', level: 'rest' }
}

export function pickSuggestedMuscle(requestedMuscles, fatigueMap) {
  const req = (Array.isArray(requestedMuscles) ? requestedMuscles : [requestedMuscles])
    .map(m => normalizeMuscleKeyTitle(m))
    .filter(Boolean)

  const reqFatigue = req.length
    ? Math.max(...req.map(m => Number(fatigueMap?.[m] || 0)))
    : 0

  const fatigued = req.length ? (reqFatigue >= 70) : false
  const muscles = getDashboardMuscleList(Object.keys(fatigueMap || {}))
  let best = null
  for (const m of muscles) {
    const v = Number(fatigueMap?.[m] || 0)
    if (best == null || v < best.fatigue) best = { muscle: m, fatigue: v }
  }

  return {
    requested: req[0] || null,
    requestedFatigue: reqFatigue,
    isRequestedFatigued: fatigued,
    suggested: best?.muscle || null,
    suggestedFatigue: best?.fatigue ?? 0
  }
}

export function appendWorkoutHistory(email, items, now = new Date(), source = 'workout') {
  const when = (now instanceof Date) ? now.toISOString() : new Date(now).toISOString()
  const rows = loadHistory(email)
  const next = rows.slice()

  for (const it of (Array.isArray(items) ? items : [])) {
    const musclesToHit = (it && it.musclesToHit && typeof it.musclesToHit === 'object')
      ? it.musclesToHit
      : (it && it.fatigueMap && typeof it.fatigueMap === 'object')
        ? it.fatigueMap
        : (it && it.fatigue && typeof it.fatigue === 'object')
          ? it.fatigue
          : (it && it.fatigueStr ? parseMuscleMap(it.fatigueStr) : {})

    // Fallback: if we only have a muscle label, treat it as weight 1.
    if ((!musclesToHit || Object.keys(musclesToHit).length === 0) && it && it.muscle) {
      const k = normalizeMuscleKeyTitle(it.muscle)
      if (k) musclesToHit[k] = 1
    }

    const clean = {}
    Object.keys(musclesToHit || {}).forEach(k => {
      const kk = normalizeMuscleKeyTitle(k)
      if (!isMuscleKeyAllowed(kk)) return
      clean[kk] = Number(musclesToHit[k] || 1)
    })

    next.push({
      date: when,
      source,
      exercise: it?.exercise || it?.name || '',
      muscleGroup: it?.muscleGroup || it?.muscle || '',
      setCount: Math.max(1, parseInt(String(it?.setCount ?? it?.sets ?? 1), 10) || 1),
      musclesToHit: clean
    })
  }

  // Keep full history for calendar/longitudinal views.
  // Fatigue calculation always uses a strict 7-day rolling window (see computeMuscleFatigueMap).
  saveHistory(email, next)
  return next
}

export function makeHistorySummaryBlock(muscleGroup, fatigueMap, date = new Date()) {
  const mg = normalizeMuscleKeyTitle(muscleGroup)
  const f = Number((fatigueMap && mg) ? (fatigueMap[mg] || 0) : 0)
  return {
    muscleGroup: mg || (muscleGroup || ''),
    fatigue: Math.min(100, Math.max(0, Math.round(f))),
    date: monthDay(date)
  }
}
