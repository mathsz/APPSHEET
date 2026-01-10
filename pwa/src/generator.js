// Minimal client-side generator prototype
// Exports: loadExercises(list), pickRandomExercise(opts), generateWorkout({count, constraints})
let getSetting = () => undefined, getSettingInt = () => undefined, getSettingString = () => undefined;
try {
  ({ getSetting, getSettingInt, getSettingString } = require('./settings.js'));
} catch (e) {}

function _safeGetSettingString(key, fallback) {
  try {
    const v = getSettingString ? getSettingString(key, fallback) : undefined
    if (v === undefined || v === null) return fallback
    const s = String(v)
    return s === '' ? fallback : s
  } catch {
    return fallback
  }
}

function _safeGetSettingInt(key, fallback) {
  try {
    const v = getSettingInt ? getSettingInt(key, fallback) : undefined
    const n = parseInt(String(v ?? ''), 10)
    return isNaN(n) ? fallback : n
  } catch {
    return fallback
  }
}

let EXERCISES = []
let LAST_GEN = { fallback: false, requestedEquipment: null }

export function loadExercises(list) {
  if (!Array.isArray(list)) throw new Error('exercises must be array')

  const parseList = (v) => {
    if (Array.isArray(v)) return v.map(x => String(x || '').trim()).filter(Boolean)
    const s = String(v || '').trim()
    if (!s) return []
    return s.split(/\s*[;,]\s*|\s{2,}/).map(x => String(x || '').trim()).filter(Boolean)
  }

  const parseBool = (v) => {
    if (v === true) return true
    if (v === false) return false
    const s = String(v || '').trim().toLowerCase()
    return (s === 'true' || s === '1' || s === 'yes' || s === 'y')
  }

  const normalizeDiscipline = (v) => {
    const s = String(v || '').trim().toLowerCase()
    if (!s) return ''
    if (s.includes('hiit') || s.includes('tabata')) return 'hiit'
    if (s.includes('yoga')) return 'yoga'
    if (s.includes('pilates')) return 'pilates'
    if (s.includes('strength')) return 'strength'
    return s
  }

  EXERCISES = list.map((raw) => {
    // Supports both the generator-native schema and the ExerciceDB schema.
    const id = String(raw.id ?? raw.Id ?? raw.ID ?? raw.identifier ?? raw.Identifier ?? '').trim()
    const name = String(raw.name ?? raw.Name ?? raw['nom complet'] ?? raw['Nom complet'] ?? raw.Exercise ?? raw.Exercice ?? '').trim()

    const disciplineRaw = raw.discipline ?? raw.Discipline ?? raw.type ?? raw.Type ?? raw.program_type ?? raw.ProgramType
    const discipline = normalizeDiscipline(disciplineRaw || 'strength') || 'strength'

    const bodyCat = String(raw.Category ?? raw.category ?? raw.body_category ?? raw.Body_Category ?? '').trim()
    const Category = String(bodyCat || '').toLowerCase()

    // Muscles: prefer explicit muscles array; else use primary/secondary columns.
    const muscles = (Array.isArray(raw.muscles) ? raw.muscles : [])
      .map(m => String(m).toLowerCase().trim())
      .filter(Boolean)
    const primaryMuscle = normalizeMuscleKey(raw.primary_muscle ?? raw.Primary_Muscle ?? raw.primary ?? raw.Primary ?? (muscles[0] || ''))
    const secondary = parseList(raw.secondary_muscles ?? raw.Secondary_Muscles)
      .map(m => normalizeMuscleKey(m))
      .filter(Boolean)
    const allMuscles = Array.from(new Set([primaryMuscle, ...muscles.map(m => normalizeMuscleKey(m)), ...secondary].filter(Boolean)))

    // Equipment: prefer array; else parse string.
    const equipList = parseList(raw.equipment ?? raw.Equipment ?? raw.equip ?? raw.Equip ?? raw['matériel'] ?? raw['Materiel'])
    const equipment = equipList.map(q => normalizeEquipment(q)).filter(Boolean)

    const tags = parseList(raw.tags ?? raw.Tags ?? raw.tag ?? raw.Tag).map(t => String(t).toLowerCase()).filter(Boolean)
    const video = String(raw.video ?? raw.video_url ?? raw.IMAGE_URL ?? raw.fallback_url ?? '').trim()
    const cues = String(raw.cues ?? raw.description ?? raw.Description ?? '').trim()

    const fatigueStr = String(raw.Fatigue ?? raw.fatigue ?? raw.FATIGUE ?? '').trim()

    const isometric = parseBool(raw.isometric ?? raw.Isometric)
    const plyometric = parseBool(raw.plyometric ?? raw.Plyometric)

    // value: keep whatever is provided; downstream renderer uses value.reps/value.load.
    const value = (raw.value && typeof raw.value === 'object') ? raw.value : { reps: 10 }

    return {
      id,
      name,
      discipline,
      muscles: allMuscles,
      primaryMuscle,
      equipment,
      Category,
      tags,
      video,
      cues,
      fatigueStr,
      value,
      isometric,
      plyometric,
      lastUpdated: raw.lastUpdated || null
    }
  }).filter(e => e.id || e.name)
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickRandomExercise({
  excludeIds = [],
  equipment = null,
  muscle = null,
  targetCategories = [],
  strictCategory = null,
  discipline = null,
  allowJumps = true
} = {}) {
  // Apps Script-style selection:
  // - Choose ONE equipment for the slot (random among selected), then match by substring.
  // - Score by targetCategories against primary muscle (+50 per match).
  // - Optional strictCategory (pilates) performs a panoramic keyword filter.
  // - Optional strict muscle focus discards non-matching exercises.
  const excluded = new Set((excludeIds || []).map(String))

  const strictMuscles = Array.isArray(muscle)
    ? muscle.map(m => String(m || '').toLowerCase()).filter(Boolean)
    : (muscle ? [String(muscle || '').toLowerCase()] : [])

  let availableEquips = []
  if (Array.isArray(equipment)) availableEquips = equipment
  else if (typeof equipment === 'string') availableEquips = String(equipment || '').split(',')
  availableEquips = availableEquips.map(e => normalizeEquipment(e)).filter(Boolean)
  if (availableEquips.length === 0) availableEquips = ['bodyweight']

  const wantDisc = String(discipline || '').trim().toLowerCase()
  const strictKey = strictCategory ? String(strictCategory || '').trim().toLowerCase() : ''
  const cats = (Array.isArray(targetCategories) ? targetCategories : [])
    .map(c => String(c || '').trim().toLowerCase())
    .filter(Boolean)

  // Pick one equipment for this slot.
  const targetEquip = availableEquips[Math.floor(Math.random() * availableEquips.length)]

  // Base pool after panoramic strictCategory + discipline + allowJumps.
  let basePool = EXERCISES.filter(e => {
    if (!e) return false
    if (excluded.has(String(e.id || ''))) return false
    if (wantDisc) {
      const d = String(e.discipline || '').trim().toLowerCase()
      if (wantDisc === 'strength') {
        if (!(d === '' || d === 'strength')) return false
      } else {
        if (d !== wantDisc) return false
      }
    }
    if (strictKey) {
      const full = (
        String((e.equipment || []).join(',')) + ' ' +
        String(e.primaryMuscle || '') + ' ' +
        String(e.name || '') + ' ' +
        String(e.description || '') + ' ' +
        String((e.tags || []).join(','))
      ).toLowerCase()
      if (!full.includes(strictKey)) return false
    }
    if (allowJumps === false && e.plyometric === true) return false
    return true
  })

  if (!basePool.length) return null

  const matchesEquip = (ex) => {
    const exEquip = (Array.isArray(ex.equipment) ? ex.equipment : []).map(normalizeEquipment).filter(Boolean)
    if (targetEquip === 'bodyweight') {
      return exEquip.includes('bodyweight') || exEquip.length === 0 || exEquip.includes('pilates') || exEquip.includes('wall')
    }
    return exEquip.includes(targetEquip)
  }

  const matchesMuscle = (ex) => {
    if (!strictMuscles.length) return true
    return muscleMatchesAnyFocus_(ex.primaryMuscle || (ex.muscles || [])[0] || '', strictMuscles)
  }

  const scored = []
  for (const ex of basePool) {
    if (!matchesEquip(ex)) continue
    if (!matchesMuscle(ex)) continue
    const primary = String(ex.primaryMuscle || '').toLowerCase()
    let score = 10
    for (const tc of cats) {
      if (primary && tc && primary.includes(tc)) score += 50
    }
    if (strictKey) {
      const full = (String((ex.equipment || []).join(',')) + primary + String(ex.name || '')).toLowerCase()
      if (full.includes(strictKey)) score += 20
    }
    scored.push({ ex, score })
  }

  // Fallback: if no equipment matches, ignore equipment but keep strict muscles when provided.
  const fallbackPool = strictMuscles.length ? basePool.filter(matchesMuscle) : basePool

  const pool = scored.length
    ? scored.sort((a, b) => b.score - a.score).slice(0, Math.min(5, scored.length)).map(x => x.ex)
    : fallbackPool

  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

function _readLocalInt(key, fallback) {
  try { const v = localStorage.getItem(key); const n = parseInt(String(v||''), 10); return isNaN(n) ? fallback : n } catch { return fallback }
}
function _readLocalString(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : String(v) } catch { return fallback }
}

export function parseFocusMusclesFromType(selectedType) {
  const raw = String(selectedType || '').trim().toLowerCase()
  if (!raw) return []

  // Session-type shortcuts from the Setup dropdown.
  // These are not literal muscles, but should map to muscle focuses.
  if (raw.includes('upper body')) {
    return ['chest', 'back', 'shoulders', 'biceps', 'triceps']
  }
  if (raw.includes('lower body')) {
    return ['quads', 'hamstrings', 'glutes', 'calves']
  }
  if (raw.includes('full body')) {
    return ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'abs']
  }
  if (raw.includes('pilates')) {
    return ['core', 'abs', 'glutes']
  }

  const canon = {
    chest: 'chest', back: 'back', shoulders: 'shoulders', shoulder: 'shoulders',
    biceps: 'biceps', bicep: 'biceps', triceps: 'triceps', tricep: 'triceps',
    abs: 'abs', ab: 'abs', core: 'core', legs: 'legs', quads: 'quads', quad: 'quads',
    hamstrings: 'hamstrings', hamstring: 'hamstrings', glutes: 'glutes', glute: 'glutes',
    calves: 'calves', calf: 'calves'
  }
  const tokens = raw.replace(/&|\+|\//g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).map(t=>t.trim()).filter(Boolean)
  const out = []
  const add = (k) => { const v = canon[k]; if (!v) return; if (out.indexOf(v) === -1) out.push(v) }
  for (let i=0;i<tokens.length;i++){
    const t = tokens[i]
    if ((t === 'upper' || t === 'lower') && tokens[i+1] === 'back') { add('back'); i++; continue }
    add(t)
  }
  if (out.indexOf('core') !== -1 && out.indexOf('abs') === -1) out.push('abs')
  if (out.indexOf('abs') !== -1 && out.indexOf('core') === -1) out.push('core')
  return out
}

function normalizeMuscleKey(value) {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return ''
  if (s.includes('lat')) return 'back'
  if (s.includes('middle back')) return 'back'
  if (s.includes('upper back')) return 'back'
  if (s.includes('lower back')) return 'back'
  if (s.includes('abdominal')) return 'abs'
  if (s.includes('oblique')) return 'abs'
  if (s.includes('midsection')) return 'abs'
  if (s === 'core') return 'core'
  if (s === 'abs') return 'abs'
  return s
}

function muscleMatchesAnyFocus_(primaryMuscles, focusMusclesRaw) {
  const focus = (focusMusclesRaw || []).map(normalizeMuscleKey).filter(Boolean)
  if (focus.length === 0) return true
  const primary = (Array.isArray(primaryMuscles) ? primaryMuscles : [primaryMuscles]).map(normalizeMuscleKey).filter(Boolean)
  if (primary.length === 0) return false
  const primarySet = new Set(primary)
  if (primarySet.has('core')) primarySet.add('abs')
  if (primarySet.has('abs')) primarySet.add('core')
  for (const f of focus) {
    const fSet = new Set([f])
    if (f === 'core') fSet.add('abs')
    if (f === 'abs') fSet.add('core')
    for (const p of primarySet) {
      for (const ff of fSet) {
        if (p === ff) return true
        if (p.includes(ff) || ff.includes(p)) return true
      }
    }
  }
  return false
}

export function generateWorkout(options = {}) {
  // Support legacy call signature: generateWorkout({count, constraints})
  const { count = null, constraints = {}, sets = undefined, readSettings = undefined } = options || {}
  // Default to local setup when available
  let _constraints = constraints
  if (! _constraints || typeof _constraints !== 'object') _constraints = {}
  // Read local program/duration defaults
  const programType = (constraints.programType != null) ? constraints.programType : _safeGetSettingString('program_type', 'Strength')
  const durationMin = (_constraints.durationMin != null) ? parseInt(_constraints.durationMin, 10) : _readLocalInt('homeworkouts_duration_min', null)
  // Read local sets default via centralized settings helper
  const setCountLocal = (_constraints.setCount != null) ? parseInt(_constraints.setCount, 10) : _safeGetSettingInt('sets', 3)

  // Injected reader (for tests) or fallback reader that checks centralized settings
  const readLocal = readSettings ?? (() => _safeGetSettingInt('sets', null))

  let c = (count != null) ? count : (sets !== undefined ? sets : null)
  let cFromLocal = false
  // Read stored preference (may be null)
  const storedSetsPref = readLocal()
  if (c == null && storedSetsPref != null) { c = storedSetsPref; cFromLocal = true }

  const prog = String(programType).toLowerCase()


  // Apps Script count logic:
  // - Strength: targetCount = floor(durationMin / minutesPerExercise)
  //   Use set timing model: each set = 30s active + 60s rest.
  //   exercises = floor((durationMin*60) / (setCount * (30+60)))
  // - HIIT: uniqueCount = clamp(1..5, durationMinutes)
  const isHiit = prog.includes('hiit') || prog.includes('tabata')
  if (c == null) {
    if (isHiit) {
      const dm = Number(durationMin || 0)
      c = (!isNaN(dm) && dm > 0) ? Math.max(1, Math.min(5, Math.floor(dm))) : 5
    } else {
      const dm = Number(durationMin || 0)
      const sc = (setCountLocal && Number(setCountLocal) > 0) ? Number(setCountLocal) : 3
      const secondsPerSet = 90
      c = (!isNaN(dm) && dm > 0)
        ? Math.max(1, generateTimeBasedWorkout(dm, sc, secondsPerSet).exercises)
        : 8
    }
  }

  // Pull equipment from settings if missing.
  if (!constraints.equipment) {
    const eq = _safeGetSettingString('equipment', '')
    if (eq) constraints.equipment = eq
  }

  const selectedType = String(constraints.selectedType || '').trim()
  const strictMuscles = parseFocusMusclesFromType(selectedType)
  const isPilates = prog.includes('pilates') || selectedType.toLowerCase().includes('pilates')
  const strictCategory = isPilates ? 'pilates' : null
  const effectiveDiscipline = isPilates ? 'pilates' : prog

  // Strength uses equipment; non-Strength ignores it.
  const equipment = (!isHiit && prog.includes('strength')) ? (constraints.equipment || null) : null

  const allowJumps = (constraints.allowJumps === true)

  try { if (typeof console !== 'undefined' && console.debug) console.debug('[generateWorkout] computed', { c, setCountLocal, durationMin, exercisesLoaded: EXERCISES.length }) } catch(e) {}

  // HIIT branch: pick unique exercises with simple body-category variety.
  if (isHiit) {
    const bucketOrder = ['full body', 'lower body', 'upper body', 'core', 'cardio']
    const base = EXERCISES.filter(ex => {
      const d = String(ex.discipline || '').toLowerCase()
      const tags = String((ex.tags || []).join(','))
      const okDisc = (d === 'hiit') || (d === '' && tags.toLowerCase().includes('hiit'))
      if (!okDisc) return false
      if (!allowJumps && ex.plyometric === true) return false
      return true
    })
    if (!base.length) {
      LAST_GEN = { fallback: true, requestedEquipment: null, generated: 0 }
      return []
    }

    const buckets = {}
    for (const ex of base) {
      const key = String(ex.Category || '').trim().toLowerCase() || 'other'
      if (!buckets[key]) buckets[key] = []
      buckets[key].push(ex)
    }
    const used = new Set()
    const picked = []

    const pickFromBucket = (key) => {
      const arr = buckets[key] || []
      if (!arr.length) return null
      for (let tries = 0; tries < 20; tries++) {
        const ex = arr[Math.floor(Math.random() * arr.length)]
        if (!ex) continue
        const k = String(ex.id || ex.name || '').toLowerCase()
        if (k && !used.has(k)) return ex
      }
      return null
    }

    for (const b of bucketOrder) {
      if (picked.length >= c) break
      const ex = pickFromBucket(b)
      if (!ex) continue
      const k = String(ex.id || ex.name || '').toLowerCase()
      if (k) used.add(k)
      picked.push(ex)
    }
    let guard = 0
    while (picked.length < c && guard < 200) {
      guard++
      const ex = base[Math.floor(Math.random() * base.length)]
      if (!ex) continue
      const k = String(ex.id || ex.name || '').toLowerCase()
      if (!k || used.has(k)) continue
      used.add(k)
      picked.push(ex)
    }
    LAST_GEN = { fallback: false, requestedEquipment: null, generated: picked.length }
    return picked
  }

  const out = []
  const usedKeys = new Set()
  let lastKey = null
  let usedFallback = false

  const planCats = Array.isArray(constraints.targetCategories) ? constraints.targetCategories : null
  const maxAttemptsPerSlot = 12
  for (let i = 0; i < c; i++) {
    const slotCats = planCats ? (Array.isArray(planCats[i]) ? planCats[i] : [planCats[i]]).filter(Boolean) : []
    let attempts = 0
    let chosen = null
    while (attempts < maxAttemptsPerSlot && !chosen) {
      const pick = pickRandomExercise({
        excludeIds: Array.from(usedKeys),
        equipment,
        muscle: strictMuscles,
        targetCategories: slotCats,
        strictCategory,
        discipline: effectiveDiscipline,
        allowJumps
      })
      if (!pick) {
        attempts++
        continue
      }
      const key = String(pick.id || '').trim() || String(pick.name || '').trim().toLowerCase()
      if (!key) { attempts++; continue }
      if (usedKeys.has(key)) { attempts++; continue }
      if (lastKey && key === lastKey) { attempts++; continue }
      chosen = pick
      break
    }
    if (!chosen) {
      // If we couldn't fill more slots, stop.
      usedFallback = true
      break
    }

    const sc = (setCountLocal && Number(setCountLocal) > 0) ? Number(setCountLocal) : 3
    const isIso = chosen.isometric === true
    const repsVal = isIso ? '' : (chosen.value && chosen.value.reps != null ? chosen.value.reps : 10)
    const loadVal = (chosen.value && chosen.value.load != null) ? chosen.value.load : ''

    const enriched = {
      ...chosen,
      setCount: sc,
      reps_text: isIso ? 'Tenir 30-45s' : '10-12 reps',
      value: { ...(chosen.value || {}), reps: repsVal, load: (sc >= 1 ? loadVal : '') }
    }
    for (let s = 2; s <= sc; s++) {
      enriched[`set${s}_reps`] = repsVal
      enriched[`set${s}_load`] = loadVal
    }

    out.push(enriched)
    const k = String(enriched.id || '').trim() || String(enriched.name || '').trim().toLowerCase()
    if (k) {
      usedKeys.add(k)
      lastKey = k
    }
  }

  LAST_GEN = { fallback: usedFallback, requestedEquipment: equipment || null, generated: out.length }
  return out
}

export function lastGenerateInfo() {
  return { ...LAST_GEN, fallback: !!LAST_GEN.fallback }
}

export function listExercises() { return EXERCISES }

// Basic normalization helpers (extendable)
export function normalizeEquipment(e) {
  const map = {
    'db': 'dumbbell',
    'dumbbells': 'dumbbell',
    'kb': 'kettlebell',
    'kbs': 'kettlebell',
    'body weight': 'bodyweight',
    'bodyweight': 'bodyweight',
    'trx': 'trx',
    'suspension': 'trx',
    'suspension trainer': 'trx',
    'band': 'band',
    'bands': 'band'
  }
  const s = (String(e||'').trim().toLowerCase())
  return map[s] || s
}

/**
 * Calculate how many exercises and total sets fit in a time-based workout.
 * HARD CONSTRAINTS:
 * - Deterministic, no randomness
 * - totalSets = floor((minutes * 60) / secondsPerSet)
 * - exercises = floor(totalSets / setsPerExercise)
 * EDGE RULES:
 * - exercises >= 1
 * - totalSets >= setsPerExercise
 */
export function generateTimeBasedWorkout(minutes, setsPerExercise = 3, secondsPerSet = 90) {
  const mins = Number(minutes || 0)
  const spe = Number(setsPerExercise || 3)
  const sps = Number(secondsPerSet || 90)
  const secsPerSet = (!isNaN(sps) && sps > 0) ? Math.floor(sps) : 90
  const setsPerEx = (!isNaN(spe) && spe > 0) ? Math.floor(spe) : 3

  let totalSets = Math.floor((Math.max(0, mins) * 60) / secsPerSet)
  if (totalSets < setsPerEx) totalSets = setsPerEx
  let exercises = Math.floor(totalSets / setsPerEx)
  if (exercises < 1) exercises = 1
  return { totalSets, exercises }
}
