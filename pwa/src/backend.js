import fallback from './generate-fallback.js'
import { setSetting } from './settings.js'

function safeKey(k) { return String(k||'').trim().toLowerCase() }

export async function getGlideWodSummary(email) {
  return fallback.getGlideWodSummaryLocal(email)
}

export async function replaceGlideExercise(glideId, equipment = '', muscle = '') {
  return fallback.noOpLocal()
}

export async function syncSetToGlide(glideId, setNumber, reps, load) {
  return fallback.noOpLocal()
}

export async function completeGlideWod(glideId, userEmail) {
  return fallback.noOpLocal()
}

export async function setGlideWodState(glideId, isDone = true, userEmail) {
  return fallback.noOpLocal()
}

export async function setDone(glideId, setNumber, reps, load, userEmail) {
  return fallback.noOpLocal()
}

export async function getGlideHiitSummary(email) {
  return fallback.getGlideHiitSummaryLocal(email)
}

export async function debugProfile(email) {
  return fallback.debugProfileLocal(email)
}

export async function triggerRegenerate(email) {
  // regenerate local glide/hiit data
  await fallback.generateGlideWodLocal(email)
  await fallback.generateHiitLocal(email)
  return { status: 'ok' }
}

export async function generateHiit(email) {
  return fallback.generateHiitLocal(email)
}

export async function setHiitIsDone(email, order, isDone = true) {
  return fallback.noOpLocal()
}

export async function setHiitRoundDone(email, round, isDone = true) {
  return fallback.noOpLocal()
}

export async function dumpRecoveryDash() {
  return fallback.noOpLocal()
}

export async function testBackend(email) {
  try {
    const g = await fallback.getGlideWodSummaryLocal(email)
    const preview = JSON.stringify((g.sample||[]).slice(0,3))
    return { ok: true, status: 200, preview }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function setUserEquipment(email, equipment) {
  try { setSetting('equipment', String(equipment||'')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
}

export async function setUserAlias(email, alias) {
  try { localStorage.setItem(`homeworkouts_alias_${safeKey(email)}`, String(alias||'')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
}

export async function setUserSetup(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest } = {}) {
  return fallback.setUserSetupLocal(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest })
}

export async function setUserDuree(email, minutes) {
  try { localStorage.setItem('homeworkouts_duration_min', String(minutes||'')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
}

export async function setUserDureePost(email, minutes) {
  return fallback.setUserDureePostLocal(email, minutes)
}
