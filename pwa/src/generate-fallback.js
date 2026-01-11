import { loadExercises, generateWorkout, listExercises } from './generator.js'
import { getSettingString, setSetting } from './settings.js'
import { resolveFetchUrl, getCachedResponse } from './fetch-utils.js'

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true } catch { return false }
}

function makeId(prefix='gen') {
  return `${prefix}_${Math.random().toString(36).slice(2,9)}`
}

function normalizeEmail(email) {
  return String(email || 'anonymous').trim().toLowerCase()
}

async function ensureExercisesLoaded_() {
  try {
    const cur = listExercises()
    if (Array.isArray(cur) && cur.length) return true
  } catch {}

  // Try network first; fall back to Cache Storage.
  let j = null
  try {
    const url = resolveFetchUrl('/Exercices.json')
    const res = await fetch(url, { cache: 'no-store' })
    if (res && res.ok) j = await res.json()
  } catch (e) {}
  if (!j) {
    try {
      const cached = await getCachedResponse('/Exercices.json')
      if (cached) j = await cached.json()
    } catch (e) {}
  }

  if (Array.isArray(j) && j.length) {
    try { loadExercises(j) } catch (e) {}
  }
  try {
    const after = listExercises()
    return Array.isArray(after) && after.length > 0
  } catch { return false }
}

export async function generateHiitLocal(email) {
  const e = normalizeEmail(email)
  const setup = readJSON('homeworkouts_setup_temp') || {
    programType: getSettingString('program_type', 'HIIT'),
    selectedType: getSettingString('selectedType', ''),
    setCount: parseInt(localStorage.getItem('homeworkouts_sets')||'8',10) || 8,
    durationMin: parseInt(localStorage.getItem('homeworkouts_duration_min')||'20',10) || 20
  }

  await ensureExercisesLoaded_()

  const durationMin = setup.durationMin || parseInt(localStorage.getItem('homeworkouts_duration_min')||'20',10) || 20
  const uniqueCount = (durationMin && !isNaN(durationMin) && durationMin > 0) ? Math.max(1, Math.min(5, Math.floor(durationMin))) : (setup.setCount || 8)
  const work = Number(localStorage.getItem('homeworkouts_hiit_work_s') || 40) || 40
  const rest = Number(localStorage.getItem('homeworkouts_hiit_rest_s') || 20) || 20
  const totalSeconds = Math.max(1, Number(durationMin || 0)) * 60
  const cycleSeconds = Math.max(1, (Number(work) + Number(rest)))
  const intervalCount = Math.max(1, Math.floor(totalSeconds / cycleSeconds))

  const allowJumps = String(localStorage.getItem('homeworkouts_hiit_allow_jumps') || '').toLowerCase()
  const allow = (allowJumps === 'true' || allowJumps === '1' || allowJumps === 'yes' || allowJumps === 'y')
  const uniques = await Promise.resolve(generateWorkout({ count: uniqueCount, constraints: { programType: 'HIIT', durationMin, allowJumps: allow } }))
  const sample = []
  for (let i = 0; i < intervalCount; i++) {
    const ex = uniques[i % uniques.length]
    sample.push({
      id: ex.id || makeId('hiit'),
      order: i + 1,
      round: Math.floor(i / uniques.length) + 1,
      slot_in_round: (i % uniques.length) + 1,
      exercise: ex.name || ex.exercise || '',
      interval_label: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''),
      work_s: (ex.value && ex.value.seconds) ? ex.value.seconds : work,
      rest_s: rest,
      video_url: ex.video || ex.video_url || '',
      image_url: ex.image || ex.image_url || ''
    })
  }

  const out = { status: 'ok', sample }
  writeJSON(`homeworkouts_generated_hiit_${e}`, out)
  return out
}

export async function getGlideHiitSummaryLocal(email) {
  const e = normalizeEmail(email)
  const stored = readJSON(`homeworkouts_generated_hiit_${e}`)
  if (stored && stored.status === 'ok' && Array.isArray(stored.sample) && stored.sample.length) return stored
  return await generateHiitLocal(email)
}

export async function generateGlideWodLocal(email) {
  const e = normalizeEmail(email)
  const setup = readJSON('homeworkouts_setup_temp') || {
    programType: getSettingString('program_type', 'Strength'),
    selectedType: getSettingString('selectedType', 'Full Body'),
    setCount: parseInt(localStorage.getItem('homeworkouts_sets')||'3',10) || 3,
    durationMin: parseInt(localStorage.getItem('homeworkouts_duration_min')||'30',10) || 30,
    equipment: getSettingString('equipment', '')
  }

  await ensureExercisesLoaded_()

  const programType = String(setup.programType || getSettingString('program_type', 'Strength') || 'Strength')
  const selectedType = String(setup.selectedType || getSettingString('selectedType', 'Full Body') || 'Full Body')
  const durationMin = (setup.durationMin != null) ? parseInt(setup.durationMin, 10) : (parseInt(localStorage.getItem('homeworkouts_duration_min')||'30',10) || 30)
  const setCount = (setup.setCount != null) ? parseInt(setup.setCount, 10) : (parseInt(localStorage.getItem('homeworkouts_sets')||'3',10) || 3)

  // Apps Script parity: Pilates = strictCategory 'pilates' and bodyweight equipment.
  const isPilates = programType.toLowerCase().includes('pilates') || selectedType.toLowerCase().includes('pilates')
  const equipment = isPilates ? 'Bodyweight' : (setup.equipment || getSettingString('equipment', '') || '')

  const items = await Promise.resolve(generateWorkout({
    constraints: {
      programType: (isPilates ? 'Pilates' : 'Strength'),
      selectedType,
      durationMin,
      setCount,
      equipment: equipment || null
    }
  }))

  const sample = (items || []).map((it, idx) => {
    const sc = (it && it.setCount != null) ? parseInt(it.setCount, 10) : (setCount || 3)
    const reps1 = (it && it.value && it.value.reps != null) ? it.value.reps : (it && it.set1_reps != null ? it.set1_reps : '')
    const load1 = (it && it.value && it.value.load != null) ? it.value.load : (it && it.set1_load != null ? it.set1_load : '')
    const out = {
      id: it.id || makeId('wod'),
      order: idx + 1,
      exercise: it.name || it.exercise || '',
      equipment: (Array.isArray(it.equipment) ? it.equipment.join(', ') : (it.equipment || equipment || '')),
      muscles: Array.isArray(it.muscles) ? it.muscles.join(', ') : (it.muscles || ''),
      reps_text: it.reps_text || '',
      setCount: sc,
      set1_reps: reps1,
      set1_load: load1,
      video_url: it.video || it.video_url || '',
      image_url: it.image || it.image_url || ''
    }
    for (let s = 2; s <= sc; s++) {
      out[`set${s}_reps`] = (it && it[`set${s}_reps`] != null) ? it[`set${s}_reps`] : reps1
      out[`set${s}_load`] = (it && it[`set${s}_load`] != null) ? it[`set${s}_load`] : load1
    }
    return out
  })
  const out = { status: 'ok', sample }
  writeJSON(`homeworkouts_generated_glide_${e}`, out)
  return out
}

export async function getGlideWodSummaryLocal(email) {
  const e = normalizeEmail(email)
  const stored = readJSON(`homeworkouts_generated_glide_${e}`)
  if (stored && stored.status === 'ok' && Array.isArray(stored.sample) && stored.sample.length) return stored
  return await generateGlideWodLocal(email)
}

// Generic local debug/profile info
export async function debugProfileLocal(email) {
  const hiit = await getGlideHiitSummaryLocal(email)
  return { status: 'ok', hiit: { minutes: localStorage.getItem('homeworkouts_duration_min') || '20', workSeconds: localStorage.getItem('homeworkouts_hiit_work_s') || '40', restSeconds: localStorage.getItem('homeworkouts_hiit_rest_s') || '20' }, sample: hiit.sample }
}

// No-op setters that persist minimal info in localStorage
export async function setUserSetupLocal(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest } = {}) {
  try {
    if (programType) setSetting('program_type', programType)
    if (setCount != null) localStorage.setItem('homeworkouts_sets', String(setCount))
    if (durationMin != null) localStorage.setItem('homeworkouts_duration_min', String(durationMin))
    if (hiitWork != null) localStorage.setItem('homeworkouts_hiit_work_s', String(hiitWork))
    if (hiitRest != null) localStorage.setItem('homeworkouts_hiit_rest_s', String(hiitRest))

    // Keep a consolidated setup object for generators that read `homeworkouts_setup_temp`.
    try {
      const cur = readJSON('homeworkouts_setup_temp') || {}
      const merged = {
        ...cur,
        ...(programType != null ? { programType } : {}),
        ...(selectedType != null ? { selectedType } : {}),
        ...(setCount != null ? { setCount } : {}),
        ...(durationMin != null ? { durationMin } : {}),
        savedAt: new Date().toISOString()
      }
      writeJSON('homeworkouts_setup_temp', merged)
    } catch (e) {}
    return { status: 'ok' }
  } catch (e) { return { status: 'error', error: String(e) } }
}

export async function setUserDureePostLocal(email, minutes) {
  try { localStorage.setItem('homeworkouts_duration_min', String(minutes)); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
}

export async function noOpLocal() { return { status: 'ok', msg: 'local-noop' } }

export default Object.freeze({
  generateHiitLocal,
  getGlideHiitSummaryLocal,
  generateGlideWodLocal,
  getGlideWodSummaryLocal,
  debugProfileLocal,
  setUserSetupLocal,
  setUserDureePostLocal,
  noOpLocal
})
