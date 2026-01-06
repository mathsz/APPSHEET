import { FITBOOK_CONFIG } from './config.js'

function readOverride(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function effectiveBackend() {
  const cfg = FITBOOK_CONFIG?.backend || {}
  const execUrl = readOverride('fitbook_exec_url') || cfg.execUrl || ''
  const token = readOverride('fitbook_token') || cfg.token || ''
  const proxyBase = readOverride('fitbook_proxy_base') || cfg.proxyBase || ''
  return { execUrl, token, proxyBase }
}

function normalizeProxyBase(pb) {
  let s = String(pb || '').trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  if (!s.endsWith('/')) s += '/'
  return s
}

function withProxy(url) {
  const { proxyBase } = effectiveBackend()
  const base = normalizeProxyBase(proxyBase)
  if (!base) return url
  const encoded = encodeURIComponent(url)
  return `${base}?url=${encoded}`
}

export async function getGlideWodSummary(email) {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=GLIDE_WOD_SUMMARY&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  // Try direct GET first (Apps Script often allows CORS for GET after redirect)
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', mode: 'cors', credentials: 'omit', cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP '+res.status)
    return await res.json()
  } catch (e) {
    // Fallback to proxy worker
    const res2 = await fetch(withProxy(url), { method: 'GET' })
    return res2.json()
  }
}

export async function replaceGlideExercise(glideId, equipment = '', muscle = '') {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'REPLACE_GLIDE_EXERCISE', token, glideId, equipment, muscle }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function syncSetToGlide(glideId, setNumber, reps, load) {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'SYNC_SET_TO_GLIDE', token, Row: { Glide_Wod_ID: glideId, SetNumber: setNumber, Reps: reps, Load: load } }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function completeGlideWod(glideId, userEmail) {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'GLIDE_WOD_DONE', token, Row: { ID: glideId, Is_Done: true, UserEmail: userEmail || '' } }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

// Set the Is_Done state (true/false) on a Glide WOD row; used for UNDO and batch saves
export async function setGlideWodState(glideId, isDone = true, userEmail) {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'GLIDE_WOD_DONE', token, Row: { ID: glideId, Is_Done: !!isDone, UserEmail: userEmail || '' } }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function setDone(glideId, setNumber, reps, load, userEmail) {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'SET_DONE', token, Row: { Glide_Wod_ID: glideId, SetNumber: setNumber, Reps: reps, Load: load, UserEmail: userEmail || '' } }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function getGlideHiitSummary(email) {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=GLIDE_HIIT_SUMMARY&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  // Try direct GET first, then fallback to proxy
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', mode: 'cors', credentials: 'omit', cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP '+res.status)
    return await res.json()
  } catch (e) {
    const res2 = await fetch(withProxy(url), { method: 'GET' })
    return res2.json()
  }
}

export async function debugProfile(email) {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=DEBUG_PROFILE&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

export async function triggerRegenerate(email) {
  const { execUrl, token } = effectiveBackend()
  const body = { action: 'USERPROFILE_UPDATED', token, userEmail: email }
  const res = await fetch(withProxy(execUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

// Generate HIIT workout intervals for a user
export async function generateHiit(email) {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=GENERATE_HIIT&token=${encodeURIComponent(token)}&email=${encodeURIComponent(String(email||''))}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Mark a single HIIT interval done/undone by order
export async function setHiitIsDone(email, order, isDone = true) {
  const { execUrl, token } = effectiveBackend()
  const params = new URLSearchParams()
  params.set('action', 'SET_HIIT_IS_DONE')
  params.set('token', token)
  params.set('email', String(email||''))
  params.set('order', String(order||''))
  params.set('isDone', isDone ? '1' : '0')
  const url = `${execUrl}?${params.toString()}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Mark entire HIIT round/set done/undone
export async function setHiitRoundDone(email, round, isDone = true) {
  const { execUrl, token } = effectiveBackend()
  const params = new URLSearchParams()
  params.set('action', 'SET_HIIT_SET_DONE')
  params.set('token', token)
  params.set('email', String(email||''))
  params.set('round', String(round||''))
  params.set('isDone', isDone ? '1' : '0')
  const url = `${execUrl}?${params.toString()}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

export async function dumpRecoveryDash() {
  const { execUrl, token } = effectiveBackend()
  const url = `${execUrl}?action=DUMP_RECOVERY_DASH&token=${encodeURIComponent(token)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Simple connectivity test: tries GLIDE_WOD_SUMMARY via proxy and returns a short preview.
export async function testBackend(email) {
  const { execUrl, token } = effectiveBackend()
  const safeEmail = String(email || '').trim() || 'test@example.com'
  const url = `${execUrl}?action=GLIDE_WOD_SUMMARY&token=${encodeURIComponent(token)}&email=${encodeURIComponent(safeEmail)}`
  try {
    const res = await fetch(withProxy(url), { method: 'GET' })
    const ct = String(res.headers.get('content-type') || '').toLowerCase()
    let preview = await res.text()
    if (ct.includes('application/json')) {
      try { preview = JSON.stringify(JSON.parse(preview)) } catch {}
    }
    return { ok: res.ok, status: res.status, preview: preview.slice(0, 300) }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// Update UserProfile equipment preference
export async function setUserEquipment(email, equipment) {
  const { execUrl, token } = effectiveBackend()
  const safeEmail = String(email || '').trim()
  const eq = String(equipment || '').trim()
  const url = `${execUrl}?action=SET_USER_EQUIPMENT&token=${encodeURIComponent(token)}&email=${encodeURIComponent(safeEmail)}&equipment=${encodeURIComponent(eq)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Save alias (display name) in UserProfile
export async function setUserAlias(email, alias) {
  const { execUrl, token } = effectiveBackend()
  const safeEmail = String(email || '').trim()
  const al = String(alias || '').trim()
  const url = `${execUrl}?action=SET_USER_ALIAS&token=${encodeURIComponent(token)}&email=${encodeURIComponent(safeEmail)}&alias=${encodeURIComponent(al)}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Save workout setup (program, session type, sets, duration, hiit work/rest)
export async function setUserSetup(email, { programType, selectedType, setCount, durationMin, hiitWork, hiitRest }) {
  const { execUrl, token } = effectiveBackend()
  const params = new URLSearchParams()
  params.set('action', 'SET_USER_SETUP')
  params.set('token', token)
  params.set('email', String(email||''))
  if (programType) params.set('programType', programType)
  if (selectedType) params.set('selectedType', selectedType)
  if (setCount != null) params.set('setCount', String(setCount))
  if (durationMin != null) {
    // Send multiple aliases to match backend expectations (Durée/DUREE/minutes)
    const d = String(durationMin)
    params.set('durationMin', d)
    params.set('minutes', d)
    params.set('DUREE', d)
    params.set('Durée', d)
    params.set('duree', d)
  }
  if (hiitWork != null) params.set('hiitWork', String(hiitWork))
  if (hiitRest != null) params.set('hiitRest', String(hiitRest))
  const url = `${execUrl}?${params.toString()}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// Fallback: push only Durée/Minutes to improve reliability
export async function setUserDuree(email, minutes) {
  const { execUrl, token } = effectiveBackend()
  const d = String(minutes || '')
  const params = new URLSearchParams()
  params.set('action', 'SET_USER_SETUP')
  params.set('token', token)
  params.set('email', String(email||''))
  params.set('durationMin', d)
  params.set('minutes', d)
  params.set('DUREE', d)
  params.set('Durée', d)
  params.set('duree', d)
  const url = `${execUrl}?${params.toString()}`
  const res = await fetch(withProxy(url), { method: 'GET' })
  return res.json()
}

// POST fallback: write numeric DUREE directly to UserProfile (column H)
export async function setUserDureePost(email, minutes) {
  const { execUrl, token } = effectiveBackend()
  const num = Number(minutes || 0)
  const body = {
    action: 'SET_USER_SETUP',
    token,
    Row: {
      UserEmail: String(email || ''),
      DUREE: isNaN(num) ? String(minutes || '') : num,
      // include aliases to maximize backend mapping success
      durationMin: isNaN(num) ? String(minutes || '') : num,
      Durée: isNaN(num) ? String(minutes || '') : num
    }
  }
  const res = await fetch(withProxy(execUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}
