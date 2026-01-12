import fallback from './generate-fallback.js'
import { HOMEWORKOUTS_CONFIG } from './config.js'
import { setSetting } from './settings.js'

function safeKey(k) { return String(k || '').trim().toLowerCase() }

function getBackendCfg() {
  try {
    const execUrl = (localStorage.getItem('homeworkouts_exec_url') || '').trim() || (HOMEWORKOUTS_CONFIG?.backend?.execUrl || '').trim()
    const token = (localStorage.getItem('homeworkouts_token') || '').trim() || (HOMEWORKOUTS_CONFIG?.backend?.token || '').trim()
    const proxyBase = (localStorage.getItem('homeworkouts_proxy_base') || '').trim() || (HOMEWORKOUTS_CONFIG?.backend?.proxyBase || '').trim()
    return { execUrl, token, proxyBase }
  } catch {
    return {
      execUrl: (HOMEWORKOUTS_CONFIG?.backend?.execUrl || '').trim(),
      token: (HOMEWORKOUTS_CONFIG?.backend?.token || '').trim(),
      proxyBase: (HOMEWORKOUTS_CONFIG?.backend?.proxyBase || '').trim()
    }
  }
}

function buildProxiedUrl(proxyBase, targetUrl) {
  const base = String(proxyBase || '').trim()
  if (!base) return String(targetUrl || '')
  try {
    const u = new URL(base)
    u.searchParams.set('url', String(targetUrl || ''))
    return u.toString()
  } catch {
    const join = base.includes('?') ? '&' : '?'
    return base + join + 'url=' + encodeURIComponent(String(targetUrl || ''))
  }
}

async function fetchJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch (e) {
    const err = new Error(`Invalid JSON from backend (${res.status})`)
    err.status = res.status
    err.body = text.slice(0, 500)
    throw err
  }
  if (!res.ok) {
    const err = new Error(`Backend HTTP ${res.status}`)
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

async function callBackendGet(params) {
  const { execUrl, token, proxyBase } = getBackendCfg()
  if (!execUrl) return null

  const u = new URL(execUrl)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    u.searchParams.set(k, String(v))
  })
  if (token && !u.searchParams.get('token')) u.searchParams.set('token', token)

  const directUrl = u.toString()
  const url = proxyBase ? buildProxiedUrl(proxyBase, directUrl) : directUrl
  return fetchJson(url, {
    method: 'GET',
    headers: { 'accept': 'application/json' },
    cache: 'no-store'
  })
}

async function callBackendPost(body) {
  const { execUrl, token, proxyBase } = getBackendCfg()
  if (!execUrl) return null

  const payload = Object.assign({}, body || {})
  if (token && !payload.token) payload.token = token

  const targetUrl = execUrl
  const url = proxyBase ? buildProxiedUrl(proxyBase, targetUrl) : targetUrl
  return fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json' },
    body: JSON.stringify(payload)
  })
}

function shouldUseRemote() {
  const { execUrl, token } = getBackendCfg()
  return !!execUrl && !!token
}

export async function getGlideWodSummary(email) {
  if (!shouldUseRemote()) return fallback.getGlideWodSummaryLocal(email)
  try {
    return await callBackendGet({ action: 'GLIDE_WOD_SUMMARY', email: String(email || '').trim() })
  } catch (e) {
    // Fallback to local so the app keeps functioning offline.
    return fallback.getGlideWodSummaryLocal(email)
  }
}

export async function getGlideHiitSummary(email) {
  if (!shouldUseRemote()) return fallback.getGlideHiitSummaryLocal(email)
  try {
    return await callBackendGet({ action: 'GLIDE_HIIT_SUMMARY', email: String(email || '').trim() })
  } catch (e) {
    return fallback.getGlideHiitSummaryLocal(email)
  }
}

export async function replaceGlideExercise(glideId, equipment = '', muscle = '') {
  if (!shouldUseRemote()) return fallback.noOpLocal()
  return callBackendPost({
    action: 'REPLACE_GLIDE_EXERCISE',
    glideId: String(glideId || '').trim(),
    equipment: String(equipment || '').trim(),
    muscle: String(muscle || '').trim()
  })
}

export async function syncSetToGlide(glideId, setNumber, reps, load) {
  if (!shouldUseRemote()) return fallback.noOpLocal()
  return callBackendPost({
    action: 'SYNC_SET_TO_GLIDE',
    Row: {
      Glide_Wod_ID: String(glideId || '').trim(),
      SetNumber: Number(setNumber),
      Reps: reps != null ? reps : '',
      Load: load != null ? load : ''
    }
  })
}

export async function setDone(glideId, setNumber, reps, load, userEmail) {
  if (!shouldUseRemote()) return fallback.noOpLocal()
  return callBackendPost({
    action: 'SET_DONE',
    Row: {
      Glide_Wod_ID: String(glideId || '').trim(),
      SetNumber: Number(setNumber),
      Reps: reps != null ? reps : '',
      Load: load != null ? load : '',
      UserEmail: String(userEmail || '').trim()
    }
  })
}

export async function setGlideWodState(glideId, isDone = true, userEmail) {
  if (!shouldUseRemote()) return fallback.noOpLocal()
  return callBackendPost({
    action: 'GLIDE_WOD_DONE',
    Row: {
      ID: String(glideId || '').trim(),
      Is_Done: !!isDone,
      UserEmail: String(userEmail || '').trim()
    }
  })
}

export async function completeGlideWod(glideId, userEmail) {
  // AppSheet backend uses GLIDE_WOD_DONE for completion.
  return setGlideWodState(glideId, true, userEmail)
}

export async function debugProfile(email) {
  if (!shouldUseRemote()) return fallback.debugProfileLocal(email)
  try {
    return await callBackendGet({ action: 'DEBUG_PROFILE', email: String(email || '').trim() })
  } catch (e) {
    return fallback.debugProfileLocal(email)
  }
}

export async function triggerRegenerate(email) {
  if (!shouldUseRemote()) {
    await fallback.generateGlideWodLocal(email)
    await fallback.generateHiitLocal(email)
    return { status: 'ok' }
  }
  return callBackendPost({ action: 'FORCE_REGENERATE', userEmail: String(email || '').trim() })
}

export async function generateHiit(email) {
  if (!shouldUseRemote()) return fallback.generateHiitLocal(email)
  // Implemented in doPost as action=GENERATE_HIIT
  return callBackendPost({ action: 'GENERATE_HIIT', userEmail: String(email || '').trim() })
}

export async function setHiitIsDone(email, order, isDone = true) {
  // Not currently wired for PWA remote (the Apps Script timer uses google.script.run).
  return fallback.noOpLocal()
}

export async function setHiitRoundDone(email, round, isDone = true) {
  return fallback.noOpLocal()
}

export async function dumpRecoveryDash() {
  if (!shouldUseRemote()) return fallback.noOpLocal()
  return callBackendGet({ action: 'DUMP_RECOVERY_DASH' })
}

export async function testBackend(email) {
  try {
    if (!shouldUseRemote()) {
      const g = await fallback.getGlideWodSummaryLocal(email)
      const preview = JSON.stringify((g.sample || []).slice(0, 3))
      return { ok: true, status: 200, preview }
    }
    const g = await callBackendGet({ action: 'GLIDE_WOD_SUMMARY', email: String(email || '').trim() })
    const preview = JSON.stringify((g.sample || []).slice(0, 3))
    return { ok: true, status: 200, preview }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export async function setUserEquipment(email, equipment) {
  if (!shouldUseRemote()) {
    try { setSetting('equipment', String(equipment || '')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
  }
  return callBackendGet({
    action: 'SET_USER_EQUIPMENT',
    email: String(email || '').trim(),
    equipment: String(equipment || '').trim()
  })
}

export async function setUserAlias(email, alias) {
  if (!shouldUseRemote()) {
    try { localStorage.setItem(`homeworkouts_alias_${safeKey(email)}`, String(alias || '')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
  }
  return callBackendGet({
    action: 'SET_USER_ALIAS',
    email: String(email || '').trim(),
    alias: String(alias || '').trim()
  })
}

export async function setUserSetup(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest } = {}) {
  if (!shouldUseRemote()) return fallback.setUserSetupLocal(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest })
  return callBackendGet({
    action: 'SET_USER_SETUP',
    email: String(email || '').trim(),
    programType: programType != null ? String(programType) : '',
    selectedType: selectedType != null ? String(selectedType) : '',
    setCount: setCount != null ? String(setCount) : '',
    durationMin: durationMin != null ? String(durationMin) : '',
    hiitWork: hiitWork != null ? String(hiitWork) : '',
    hiitRest: hiitRest != null ? String(hiitRest) : ''
  })
}

export async function setUserDuree(email, minutes) {
  try { localStorage.setItem('homeworkouts_duration_min', String(minutes || '')); return { status: 'ok' } } catch (e) { return { status: 'error', error: String(e) } }
}

export async function setUserDureePost(email, minutes) {
  if (!shouldUseRemote()) return fallback.setUserDureePostLocal(email, minutes)
  return callBackendPost({
    action: 'SET_USER_SETUP',
    Row: {
      UserEmail: String(email || '').trim(),
      DUREE: minutes != null ? Number(minutes) : ''
    }
  })
}
