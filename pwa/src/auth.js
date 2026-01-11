    // DEBUG: Log merged is_done state for each round
    try {
      const byRoundDebug = {}
      items.forEach(it => {
        const r = parseInt(it.round||1,10)
        if (!byRoundDebug[r]) byRoundDebug[r] = []
        byRoundDebug[r].push({id: it.id, is_done: it.is_done})
      })
      console.log('HIIT ROUNDS merged is_done states:', byRoundDebug)
    } catch {}
  // DEBUG: Log is_done state of all items after render
  try {
    console.log('HIIT ROUNDS is_done states:', items.map(it => ({round: it.round, is_done: it.is_done})))
  } catch {}
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { HOMEWORKOUTS_CONFIG } from './config.js'
import { getGlideWodSummary, replaceGlideExercise, syncSetToGlide, setDone, completeGlideWod, setGlideWodState, getGlideHiitSummary, generateHiit, debugProfile, setHiitRoundDone, setHiitIsDone, setUserSetup, setUserDureePost } from './backend.js'
import { getSetting, setSetting, removeSetting, getSettingInt, getSettingString } from './settings.js'
import { appendWorkoutHistory, computeMuscleFatigueMap, loadHistory, makeHistorySummaryBlock, normalizeMuscleKeyTitle } from './fatigue.js'
import { getCachedResponse } from './fetch-utils.js'

// Ensure localStorage exists in non-browser test environments
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const _store = {}
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v) },
    removeItem: (k) => { delete _store[k] },
    clear: () => { for (const k in _store) delete _store[k] }
  }
}

// Local pending store helpers: store per-workout and queued batches
const PENDING_KEY = 'homeworkouts_pending_workout'
const PENDING_BATCHES = 'homeworkouts_pending_batches'

function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') } catch { return {} }
}
function savePending(p) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p || {})) } catch {}
}
function clearPendingForId(glideId) {
  try { const p = loadPending(); delete p[glideId]; savePending(p); } catch {}
}
function enqueueBatch(batch) {
  try {
    const arr = JSON.parse(localStorage.getItem(PENDING_BATCHES) || '[]')
    arr.push(batch)
    localStorage.setItem(PENDING_BATCHES, JSON.stringify(arr))
    try { updateQueueIndicator() } catch (e) {}
  } catch (e) {}
} 
async function flushPendingBatches() {
  try {
    const arr = JSON.parse(localStorage.getItem(PENDING_BATCHES) || '[]')
    if (!Array.isArray(arr) || !arr.length) return
    // Try to send batches sequentially
    const remaining = []
    for (const b of arr) {
      try {
        const ops = []
        const email = b.email || ''
        // read per-id pending info (replacements, sets)
        const pendingStore = loadPending() || {}
        for (const item of b.items || []) {
          const gid = item.glideId
          // If there's a local replacement saved for this glide row, apply it first (best-effort)
          try {
            const rep = pendingStore[gid] && pendingStore[gid].replacement
            if (rep) {
              ops.push(replaceGlideExercise(gid, rep.equipment || '', rep.muscles || ''))
            }
          } catch (e) { console.warn('replacement push failed for', gid, e) }

          // sync sets
          for (const s of item.sets || []) {
            ops.push(syncSetToGlide(gid, s.setNumber, s.reps || '', s.load || ''))
            if (s.done) ops.push(setDone(gid, s.setNumber, s.reps || '', s.load || '', email))
          }
          // set row Is_Done
          ops.push(setGlideWodState(gid, !!item.is_done, email))
        }
        await Promise.all(ops)
        // on success, clear pending per-id
        try { const p = loadPending(); for (const item of b.items || []) delete p[item.glideId]; savePending(p) } catch(e){}
      } catch (e) {
        // couldn't send this batch; keep it
        remaining.push(b)
      }
    }
    localStorage.setItem(PENDING_BATCHES, JSON.stringify(remaining))
    try { updateQueueIndicator() } catch (e) {}
  } catch (e) {}
} 

// Try flush when online
try { window.addEventListener && window.addEventListener('online', () => { setTimeout(flushPendingBatches, 1000) }) } catch (e) {}

// Profile pending helpers (use centralized settings helper)
const PENDING_PROFILE = 'homeworkouts_pending_profile'
function loadPendingProfile() { try { const raw = getSetting('pending_profile'); return raw ? JSON.parse(raw) : {} } catch { return {} } }
function savePendingProfile(p) { try { const raw = JSON.stringify(p || {}); setSetting('pending_profile', raw); } catch {} }
function clearPendingProfile() { try { removeSetting('pending_profile') } catch {} }

// Expose helper to save profile changes locally (queued)
export function enqueueProfile(profile) {
  try {
    const p = loadPendingProfile() || {}
    const t = { profile, createdAt: new Date().toISOString() }
    // simple replace semantics - keep last update
    savePendingProfile(t)
    return true
  } catch (e) { return false }
}

// Flush profile and batches with progress reporting
export async function flushAllPending({ onProgress } = {}) {
  // onProgress: (info) => {}
  try {
    // flush profile first
    const pendingProfile = loadPendingProfile()
    if (pendingProfile && pendingProfile.profile) {
      try {
        onProgress && onProgress({ step: 'profile', status: 'started' })
        const prof = pendingProfile.profile || {}
        // prefer setUserSetup (GET) for light updates; fallback to POST when robust data required
        try {
          await setUserSetup(localStorage.getItem('homeworkouts_user_email') || '', prof)
        } catch (e) {
          // fallback to POST
          await setUserDureePost(localStorage.getItem('homeworkouts_user_email') || '', prof.durationMin || prof.minutes || '')
        }
        clearPendingProfile()
        onProgress && onProgress({ step: 'profile', status: 'done' })
      } catch (e) {
        onProgress && onProgress({ step: 'profile', status: 'error', error: String(e) })
        throw e
      }
    }

    // then flush workout batches
    onProgress && onProgress({ step: 'batches', status: 'started' })
    const result = { success: 0, failed: 0 }
    try {
      const arr = JSON.parse(localStorage.getItem(PENDING_BATCHES) || '[]')
      if (!Array.isArray(arr) || !arr.length) {
        onProgress && onProgress({ step: 'batches', status: 'done', result })
        return { profile: pendingProfile && pendingProfile.profile ? 'sent' : 'none', batches: result }
      }
      const total = arr.length
      const remaining = []

      const withTimeout = async (p, ms, label) => {
        let t
        const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' timed out')), ms) })
        try {
          return await Promise.race([p, timeout])
        } finally {
          try { clearTimeout(t) } catch {}
        }
      }

      for (let i = 0; i < arr.length; i++) {
        const b = arr[i]
        try {
          onProgress && onProgress({ step: 'batches', status: 'in-progress', index: i + 1, total })
          const ops = []
          const email = b.email || (localStorage.getItem('homeworkouts_user_email') || '')
          const pendingStore = loadPending() || {}
          for (const item of b.items || []) {
            const gid = item.glideId
            if (!gid) continue
            // Apply replacement first (best-effort)
            try {
              const rep = pendingStore[gid] && pendingStore[gid].replacement
              if (rep) ops.push(replaceGlideExercise(gid, rep.equipment || '', rep.muscles || ''))
            } catch {}

            for (const s of item.sets || []) {
              ops.push(syncSetToGlide(gid, s.setNumber, s.reps || '', s.load || ''))
              if (s.done) ops.push(setDone(gid, s.setNumber, s.reps || '', s.load || '', email))
            }
            ops.push(setGlideWodState(gid, !!item.is_done, email))
          }

          // Avoid a single hung network request trapping the whole UI forever.
          await withTimeout(Promise.all(ops), 30000, 'Batch sync')

          // On success, clear pending per-id data for items in this batch.
          try { const p = loadPending(); for (const it of b.items || []) delete p[it.glideId]; savePending(p) } catch {}
          result.success += 1
          onProgress && onProgress({ step: 'batches', status: 'item-done', index: i + 1, total })
        } catch (e) {
          result.failed += 1
          remaining.push(b)
        }
      }

      localStorage.setItem(PENDING_BATCHES, JSON.stringify(remaining))
      try { updateQueueIndicator() } catch {}
      onProgress && onProgress({ step: 'batches', status: 'done', result })
      return { profile: pendingProfile && pendingProfile.profile ? 'sent' : 'none', batches: result }
    } catch (e) {
      onProgress && onProgress({ step: 'batches', status: 'error', error: String(e) })
      throw e
    }
  } catch (e) { throw e }
}

// expose flush and enqueue helpers globally for UI modules
try { window.enqueueProfile = enqueueProfile; window.flushAllPending = flushAllPending } catch (e) {}


// Queue indicator helpers
function getPendingBatchCount() {
  try { const arr = JSON.parse(localStorage.getItem(PENDING_BATCHES) || '[]'); return Array.isArray(arr) ? arr.length : 0 } catch { return 0 }
}
function updateQueueIndicator() {
  try {
    const el = document.getElementById('queue-indicator')
    const cntEl = document.getElementById('queue-count')
    const n = getPendingBatchCount()
    if (cntEl) cntEl.textContent = String(n)
    if (el) {
      if (n > 0) el.classList.remove('hidden')
      else el.classList.add('hidden')
      el.onclick = () => {
        try {
          const arr = JSON.parse(localStorage.getItem(PENDING_BATCHES) || '[]')
          const msg = Array.isArray(arr) && arr.length ? `You have ${arr.length} queued batch(es).` : 'No queued batches.'
          // Minimal UI: use alert to surface count; can be enhanced later
          alert(msg)
        } catch (e) { alert('Unable to read queued batches') }
      }
    }
  } catch {}
}

// Ensure indicator reflects current state on load
try { setTimeout(updateQueueIndicator, 50) } catch {}



let app, auth

function setStatus(msg) {
  const el = document.getElementById('status')
  if (el) el.textContent = msg || ''
}
// Make available globally so other modules (e.g., main.js) can call setStatus directly
try { window.setStatus = setStatus } catch {}

function renderUser(user) {
  const emailEl = document.getElementById('user-email')
  const btnIn = document.getElementById('btn-signin')
  const btnOut = document.getElementById('btn-signout')
  if (!emailEl || !btnIn || !btnOut) return
  if (user && user.email) {
    emailEl.textContent = user.email
    btnIn.classList.add('hidden')
    btnOut.classList.remove('hidden')
    try { localStorage.setItem('homeworkouts_user_email', user.email) } catch {}
  } else {
    emailEl.textContent = 'Not signed in'
    btnIn.classList.remove('hidden')
    btnOut.classList.add('hidden')
    renderWorkouts([])
  }
}

function getActiveEmail() {
  const raw = (document.getElementById('user-email')?.textContent || '').trim()
  const normalized = (raw && raw !== 'Not signed in') ? raw : ''
  const stored = (localStorage.getItem('homeworkouts_user_email') || '').trim()
  return normalized || stored || ''
}

export function initAuth() {
  // In CI / local dev without env vars, Firebase config may be empty.
  // Avoid initializing Firebase Auth in that case (it can throw auth/invalid-api-key).
  const apiKey = HOMEWORKOUTS_CONFIG?.firebase?.apiKey
  if (!apiKey || String(apiKey).trim() === '') {
    console.warn('Firebase config missing: auth disabled')
    try { setStatus('Auth disabled (missing Firebase config)') } catch {}
    try { renderUser(null) } catch {}
    try { window.homeworkoutsAuthDisabled = true } catch {}
    return
  }

  app = initializeApp(HOMEWORKOUTS_CONFIG.firebase)
  auth = getAuth(app)
  const provider = new GoogleAuthProvider()

  const btnIn = document.getElementById('btn-signin')
  const btnOut = document.getElementById('btn-signout')
  if (btnIn) btnIn.onclick = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      console.error('Sign-in error', e)
      setStatus('Sign-in failed: ' + (e && e.message ? e.message : ''))
    }
  }
  if (btnOut) btnOut.onclick = async () => {
    try { await signOut(auth) } catch {}
  }

  onAuthStateChanged(auth, (user) => {
    console.log('onAuthStateChanged', !!user, user && user.email)
    renderUser(user || null)
  })

  // Expose loaders for Workout mode toggles
  window.homeworkoutsLoadStrength = () => {
    const email = getActiveEmail()
    if (email) loadWorkouts(email)
  }
  window.homeworkoutsLoadHiit = () => {
    const email = getActiveEmail()
    if (email) loadHiitWorkouts(email)
  }
}

async function autoLoadByProgram(email) {
  setStatus('Loading profile…')
  try {
    const localProg = (() => { try { return getSettingString('program_type', '') } catch { return '' } })()
    const prof = await debugProfile(email)
    const program = String(localProg || prof?.profile?.programType || '').toLowerCase()
    const selectedType = String(prof?.profile?.selectedType || '').toLowerCase()
    const isPilates = program.includes('pilates') || selectedType.includes('pilates')
    if (isPilates) {
      setStatus('Program: Pilates')
      try { window.showLoading && window.showLoading('Loading…') } catch {}
      await loadWorkouts(email)
      try { window.hideLoading && window.hideLoading() } catch {}
      return
    }
    if (program.includes('hiit') || program.includes('tabata')) {
      setStatus('Program: HIIT')
      try { window.showLoading && window.showLoading('Loading…') } catch {}
      await loadHiitWorkouts(email)
      try { window.hideLoading && window.hideLoading() } catch {}
    } else {
      setStatus('Program: Strength')
      try { window.showLoading && window.showLoading('Loading…') } catch {}
      await loadWorkouts(email)
      try { window.hideLoading && window.hideLoading() } catch {}
    }
  } catch {
    // Fallback to strength
    const localProg = (() => { try { return getSettingString('program_type', '') } catch { return '' } })()
    if (String(localProg).toLowerCase().includes('hiit')) {
      await loadHiitWorkouts(email)
    } else {
      await loadWorkouts(email)
    }
  }
}

// Expose for navigation auto-load
try { window.autoLoadByProgram = autoLoadByProgram } catch {}
// Expose renderWorkouts so external modules (dev/test) can invoke the UI renderer
try { window.renderWorkouts = renderWorkouts } catch {}

// Allow external modules (e.g., local generator) to render items via the same renderer.
// Must exist before any non-empty Strength load so Setup generation is consistent.
try {
  window.renderWorkoutsFromGenerated = function renderWorkoutsFromGenerated(genItems) {
    try {
      const items = (Array.isArray(genItems) ? genItems : []).map(g => {
        const setCount = clampInt(g?.setCount ?? g?.set_count ?? (Array.isArray(g?.sets) ? g.sets.length : null), 1, 50, getDefaultSetCount())
        const mapped = {
          id: g?.id || (g?.name ? ('gen_' + String(g.name).replace(/\s+/g, '_')) : ''),
          exercise: g?.name || g?.exercise || '',
          muscles: (Array.isArray(g?.muscles) ? g.muscles.join(', ') : (g?.muscles || '')),
          equipment: (Array.isArray(g?.equipment) ? g.equipment.join(', ') : (g?.equipment || '')),
          reps_text: g?.cues || g?.reps_text || '',
          fatigue_str: g?.fatigueStr || g?.fatigue_str || '',
          setCount,
          set1_reps: (g?.value && g.value.reps != null) ? g.value.reps : (g?.set1_reps || ''),
          set1_load: (g?.value && g.value.load != null) ? g.value.load : (g?.set1_load || ''),
          video_url: g?.video || g?.video_url || '',
          is_done: false
        }
        for (let s = 2; s <= setCount; s++) {
          mapped[`set${s}_reps`] = g?.[`set${s}_reps`] ?? ''
          mapped[`set${s}_load`] = g?.[`set${s}_load`] ?? ''
        }
        return mapped
      })
      try { window.homeworkoutsDetailId = null } catch {}
      renderWorkouts(items)
    } catch (e) {
      console.error('renderWorkoutsFromGenerated error', e)
    }
  }
} catch (e) {}

// Global timer utilities for both Strength and HIIT flows
let homeworkoutsTimerInterval = null
let homeworkoutsTimerState = { tEl: null, remaining: 0, initial: 0, paused: false, onComplete: null }
function beep3() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioCtx()
    const play = (offset) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 1200
      g.gain.value = 0.06
      o.connect(g)
      g.connect(ctx.destination)
      const t = ctx.currentTime + offset
      o.start(t)
      o.stop(t + 0.15)
    }
    play(0)
    play(0.25)
    play(0.5)
    setTimeout(() => { try { ctx.close() } catch {} }, 800)
  } catch {}
}
function startCountdown(tEl, secs, onComplete) {
  if (!tEl) return
  tEl.classList.remove('hidden')
  let remaining = parseInt(secs||0,10)
  const mm = tEl.querySelector('.mm')
  const ss = tEl.querySelector('.ss')
  const update = () => {
    const m = Math.floor(remaining/60)
    const s = remaining%60
    if (mm) mm.textContent = String(m).padStart(2,'0')
    if (ss) ss.textContent = String(s).padStart(2,'0')
  }
  update()
  if (homeworkoutsTimerInterval) clearInterval(homeworkoutsTimerInterval)
  homeworkoutsTimerState = { tEl, remaining, initial: remaining, paused: false, onComplete }
  homeworkoutsTimerInterval = setInterval(() => {
    remaining -= 1
    homeworkoutsTimerState.remaining = remaining
    if (remaining <= 0) {
      remaining = 0
      update()
      clearInterval(homeworkoutsTimerInterval)
      homeworkoutsTimerInterval = null
      homeworkoutsTimerState.paused = false
      beep3()
      setStatus('Timer complete')
      if (typeof onComplete === 'function') {
        try { onComplete() } catch {}
      }
    } else { update() }
  }, 1000)
}

// Helper to interpret various backend truthy values
function parseBool(v) {
  if (v === true || v === 1) return true
  try {
    const s = String(v || '').toLowerCase().trim()
    return s === 'true' || s === '1' || s === 'yes'
  } catch {
    return false
  }
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ''), 10)
  if (isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function getDefaultSetCount() {
  try {
    const n = parseInt(localStorage.getItem('homeworkouts_sets') || '', 10)
    if (!isNaN(n) && n > 0) return n
  } catch {}
  return 3
}

function getHiitLocalMinutes() {
  // Prefer the saved Setup object when present.
  try {
    const stored = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null')
    const prog = String(stored?.programType || '').toLowerCase()
    if (prog.includes('hiit') && stored?.durationMin != null) {
      const n = parseInt(String(stored.durationMin), 10)
      return isNaN(n) ? null : n
    }
  } catch {}
  // Fallback to migrated settings + legacy local keys.
  try {
    const n = getSettingInt('duration_min', null)
    if (n != null) return n
  } catch {}
  try {
    const raw = localStorage.getItem('homeworkouts_duration_min') || localStorage.getItem('homeworkouts_hiit_minutes')
    const n = raw ? parseInt(raw, 10) : NaN
    return isNaN(n) ? null : n
  } catch {}
  return null
}

function getHiitLocalWorkRest() {
  const work = getSettingInt('hiit_work_s', 40)
  const rest = getSettingInt('hiit_rest_s', 20)
  return {
    work: clampInt(work, 5, 600, 40),
    rest: clampInt(rest, 0, 600, 20)
  }
}

function pauseTimer() {
  if (homeworkoutsTimerInterval) {
    clearInterval(homeworkoutsTimerInterval)
    homeworkoutsTimerInterval = null
    homeworkoutsTimerState.paused = true
    setStatus('Paused')
  }
}
function resumeTimer() {
  if (homeworkoutsTimerState.paused && homeworkoutsTimerState.remaining > 0 && homeworkoutsTimerState.tEl) {
    setStatus('Resumed')
    startCountdown(homeworkoutsTimerState.tEl, homeworkoutsTimerState.remaining, homeworkoutsTimerState.onComplete)
  }
}
function rewindTimer(secs) {
  if (homeworkoutsTimerState.tEl) {
    setStatus('Rewound')
    startCountdown(homeworkoutsTimerState.tEl, parseInt(secs||homeworkoutsTimerState.initial,10), homeworkoutsTimerState.onComplete)
  }
}

function renderWorkouts(items) {
  const list = document.getElementById('workout-list')
  if (!list) return
  if (!items || items.length === 0) {
    list.innerHTML = '<p>No workouts yet.</p>'
    return
  }

  const inferSetCount = (it) => {
    const explicit = it.setCount ?? it.set_count ?? it.setsCount ?? it.sets_count
    const byKey = clampInt(explicit, 1, 50, null)
    if (byKey != null) return byKey
    // Fallback: look for setN fields on the item
    let maxSeen = 0
    try {
      for (const k of Object.keys(it || {})) {
        const m = String(k).match(/^set(\d+)_/)
        if (m) maxSeen = Math.max(maxSeen, parseInt(m[1], 10) || 0)
      }
    } catch {}
    if (maxSeen > 0) return maxSeen
    return getDefaultSetCount()
  }

  const renderSetRows = (it, setCount) => {
    const rows = []
    for (let s = 1; s <= setCount; s++) {
      const repsKey = `set${s}_reps`
      const loadKey = `set${s}_load`
      const repsVal = (it && it[repsKey] != null) ? it[repsKey] : ''
      const loadVal = (it && it[loadKey] != null) ? it[loadKey] : ''
      rows.push(`
          <div class="set-row">
            <label>Set ${s}</label>
            <input class="s${s}-reps" type="number" inputmode="numeric" placeholder="reps" value="${repsVal ?? ''}">
            <input class="s${s}-load" type="number" inputmode="decimal" placeholder="weight (lb)" value="${loadVal ?? ''}">
            <div class="set-row-actions"><label class="done-check"><input type="checkbox" class="chk-done-set" data-set="${s}"> Done</label> <select class="rest-select" data-set="${s}"><option value="60">60s</option><option value="90">90s</option><option value="120">120s</option></select></div>
          </div>`)
    }
    return rows.join('')
  }
  const detailId = window.homeworkoutsDetailId || null
  if (!detailId) {
    // Cards layout: render all exercises as expanded cards so sets/inputs are visible without clicking
    list.classList.remove('list-mode')
    list.innerHTML = items.map((it, idx) => {
      const id = it.id || ''
      const setCount = inferSetCount(it)
      const isCurrent = (window.homeworkoutsHiitCurrentId && window.homeworkoutsHiitCurrentId === id)
      const isIso = (it.work_s != null) || String(it.reps_text || '').toLowerCase().includes('tenir') || String(it.exercise||'').toLowerCase().includes('plank')
      const secs = it.work_s != null ? parseInt(it.work_s, 10) : guessIsoSeconds(String(it.reps_text||''))
      const exLabel = `Exercice ${idx+1}`
      const doneDot = (it.is_done === true) ? `<span class="done-dot done"></span>` : `<span class="done-dot"></span>`
      return `
        <div class="card ${isCurrent ? 'current-exercise' : ''} ${it.is_done ? 'done-exercise' : ''}" data-id="${id}" data-set-count="${setCount}" data-exercise="${escapeAttr(it.exercise || '')}" data-muscle-group="${escapeAttr(it.muscles || '')}" data-fatigue-str="${escapeAttr(it.fatigue_str || '')}">
          <div class="row">
            <div class="col">
              <strong>${doneDot}${escapeHtml(it.exercise || '')}</strong>
              <div class="muted">${exLabel} • ${escapeHtml(it.muscles||'')}</div>
              ${it.video_url ? `<div class="muted"><a href="${escapeAttr(it.video_url)}" target="_blank">YouTube</a></div>` : ''}
            </div>
            <div class="col actions">
              <button class="btn-save-sets" data-done="${it.is_done ? '1' : '0'}">${it.is_done ? 'Undo' : 'Done'}</button>
              <button data-id="${id}" data-equip="${escapeAttr(it.equipment || '')}" data-muscle="${escapeAttr(it.muscles || '')}" class="btn-replace" title="Shuffle exercise"><span class="icon-shuffle" aria-hidden="true">🔀</span> <span class="label">Swap</span></button>
            </div>
          </div>
        <div class="timer"><span class="mm">00</span>:<span class="ss">00</span></div>
        <div class="sets">
          ${renderSetRows(it, setCount)}
          <div class="set-actions">
            <button class="btn-start-timer">Start</button>
            <button class="btn-reset-timer">Reset</button>
            ${isIso ? `<button class="btn-timer" data-seconds="${secs}">Start ${secs}s</button><button class="btn-reset">Reset</button>` : ''}
          </div>
        </div>
      </div>`
    }).join('')
    // Append a Workout Complete / Save button under the list (avoid duplicates)
    try {
      const parent = list.parentElement
      if (parent) {
        const existing = parent.querySelector('.workout-actions')
        if (existing) existing.remove()
        const btnHtml = '<div class="workout-actions"><button id="btn-workout-complete">Workout complete</button><div id="queue-indicator" class="queue-indicator hidden" title="Pending batches"><span id="queue-count">0</span> queued</div></div>'
        parent.insertAdjacentHTML('beforeend', btnHtml)
        try { updateQueueIndicator() } catch (e) {}
        // Wire up click handler for batch save
        try {
          const btn = parent.querySelector('#btn-workout-complete')
          if (btn) {
            btn.onclick = async () => {
              const cards = Array.from(document.querySelectorAll('#workout-list .card'))
              if (!cards.length) return
              const email = getActiveEmail()
              // Build a batch first (no UI changes yet)
              const pending = loadPending() || {}
              const batch = { email, items: [] }
              for (const c of cards) {
                const gid = c.getAttribute('data-id') || ''
                if (!gid) continue
                const cardSets = []
                const setCount = clampInt(c.getAttribute('data-set-count'), 1, 50, getDefaultSetCount())
                for (let s = 1; s <= setCount; s++) {
                  const reps = c.querySelector(`.s${s}-reps`)?.value || ''
                  const load = c.querySelector(`.s${s}-load`)?.value || ''
                  const chk = c.querySelector(`.chk-done-set[data-set="${s}"]`)
                  const done = !!(chk && (chk.checked || chk.disabled))
                  const pset = (pending[gid] && pending[gid].sets) ? pending[gid].sets.find(x => x.setNumber === s) : null
                  const entry = { setNumber: s, reps: pset ? pset.reps || reps : reps, load: pset ? pset.load || load : load, done: pset ? !!pset.done : done }
                  if (entry.reps || entry.load || entry.done) cardSets.push(entry)
                }
                const prow = pending[gid] || {}
                const item = { glideId: gid, is_done: prow.is_done === undefined ? c.classList.contains('done-exercise') : !!prow.is_done, sets: cardSets }
                batch.items.push(item)
              }
              if (!batch.items.length) return
              const anyNotDone = batch.items.some(it => !it.is_done)
              const newState = !!anyNotDone

              const showConfirm = async (msg) => {
                try {
                  const modal = document.getElementById('confirm-modal')
                  const msgEl = document.getElementById('confirm-message')
                  const yes = document.getElementById('confirm-yes')
                  const no = document.getElementById('confirm-no')
                  if (!modal || !msgEl || !yes || !no) return true
                  msgEl.textContent = msg
                  modal.classList.remove('hidden')
                  try { modal.scrollIntoView({ block: 'center' }) } catch {}
                  return await new Promise((res) => {
                    const onYes = () => { cleanup(); res(true) }
                    const onNo = () => { cleanup(); res(false) }
                    const cleanup = () => { try { yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); modal.classList.add('hidden') } catch (e) {} }
                    yes.addEventListener('click', onYes)
                    no.addEventListener('click', onNo)
                  })
                } catch (e) { return true }
              }

              // Local fatigue history: append only when marking complete.
              try {
                if (newState) {
                  const histItems = cards.map(c => {
                    const setCount = clampInt(c.getAttribute('data-set-count'), 1, 50, 1)
                    const muscleGroup = c.getAttribute('data-muscle-group') || ''
                    const firstMuscle = String(muscleGroup || '').split(',')[0] || ''
                    return {
                      exercise: c.getAttribute('data-exercise') || (c.querySelector('strong')?.textContent || '').trim(),
                      muscleGroup,
                      muscle: firstMuscle,
                      setCount,
                      fatigueStr: c.getAttribute('data-fatigue-str') || ''
                    }
                  })
                  const fallbackMuscle = (histItems.find(x => x && x.muscle) || {}).muscle || ''
                  appendWorkoutHistory(email, histItems, new Date(), 'complete')
                  const fm = computeMuscleFatigueMap(loadHistory(email), new Date())
                  try {
                    const setup = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null')
                    const mg = normalizeMuscleKeyTitle(setup?.selectedType || '')
                    const block = makeHistorySummaryBlock(mg || fallbackMuscle || '', fm, new Date())
                    localStorage.setItem('homeworkouts_last_history_block', JSON.stringify(block))
                  } catch {}
                }
              } catch (e) { console.warn('fatigue history append failed', e) }

              setStatus(newState ? 'Marking workout complete…' : 'Unmarking workout…')
              try { window.showLoading && window.showLoading('Saving…') } catch {}
              // Optimistic UI now
              cards.forEach(c => {
                if (newState) c.classList.add('done-exercise')
                else c.classList.remove('done-exercise')
                const strong = c.querySelector('strong')
                if (newState) {
                  if (strong && !strong.querySelector('.done-dot')) strong.insertAdjacentHTML('afterbegin', '<span class="done-dot done"></span>')
                } else {
                  try { const d = strong && strong.querySelector('.done-dot'); if (d) d.remove() } catch {}
                }
              })
              try {
                // Always save locally first
                enqueueBatch(batch)
                if (!navigator.onLine) {
                  setStatus('Saved locally — queued for sync (offline)')
                } else {
                  setStatus('Saved locally — ready to sync')
                  const doSyncNow = await showConfirm(`Saved locally. Sync ${batch.items.length} exercises to Google Sheets now?`)
                  if (doSyncNow) {
                    try {
                      // Use unified flush with splash/progress when available
                      if (window && typeof window.showCompleteAndFlush === 'function') {
                        // Launch the complete-and-flush flow in background so UI can continue.
                        try { window.showCompleteAndFlush() } catch (e) { console.warn('background complete flush failed to start', e) }
                        // Immediately switch to Fatigue tab while sync runs in background
                        try { show && show('fatigue') } catch (e) {}
                        setStatus(newState ? 'Workout marked complete — syncing in background' : 'Workout unmarked — syncing in background')
                      } else {
                        // Fallback: perform immediate ops without splash
                        const ops = []
                        const p = loadPending() || {}
                        for (const item of batch.items) {
                          const gid = item.glideId
                          try { const rep = p[gid] && p[gid].replacement; if (rep) ops.push(replaceGlideExercise(gid, rep.equipment || '', rep.muscles || '')) } catch (e) {}
                          for (const s of item.sets || []) {
                            ops.push(syncSetToGlide(gid, s.setNumber, s.reps || '', s.load || ''))
                            if (s.done) ops.push(setDone(gid, s.setNumber, s.reps || '', s.load || '', email))
                          }
                          ops.push(setGlideWodState(gid, item.is_done, email))
                        }
                        await Promise.all(ops)
                        try { const p2 = loadPending(); for (const it of batch.items) delete p2[it.glideId]; savePending(p2) } catch (e) {}
                        setStatus(newState ? 'Workout marked complete' : 'Workout unmarked')
                      }
                    } catch (e) {
                      console.error('Failed to flush after enqueue', e)
                      setStatus('Sync failed — queued for retry')
                    }
                  } else {
                    setStatus('Saved locally — queued for sync')
                  }
                }
              } catch (e) {
                console.error('Failed batch save', e)
                enqueueBatch(batch)
                setStatus('Save failed — queued for retry')
                try { await loadWorkouts(email) } catch {}
              } finally {
                try { window.hideLoading && window.hideLoading() } catch {}
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  } else {
    // Detail mode: show a single expanded card
    list.classList.remove('list-mode')
    const it = items.find(r => (r.id||'') === detailId) || items[0]
    const idx = Math.max(0, items.findIndex(r => (r.id||'') === (it.id||'')))
    const id = it.id || ''
    const setCount = inferSetCount(it)
    const isIso = (it.work_s != null) || String(it.reps_text || '').toLowerCase().includes('tenir') || String(it.exercise||'').toLowerCase().includes('plank')
    const secs = it.work_s != null ? parseInt(it.work_s, 10) : guessIsoSeconds(String(it.reps_text||''))
    const exLabel = `Exercice ${idx+1}`
    const isCurrent = (window.homeworkoutsHiitCurrentId && window.homeworkoutsHiitCurrentId === id)
    list.innerHTML = `
    <div class="card ${isCurrent ? 'current-exercise' : ''}" data-id="${id}" data-set-count="${setCount}" data-exercise="${escapeAttr(it.exercise || '')}" data-muscle-group="${escapeAttr(it.muscles || '')}" data-fatigue-str="${escapeAttr(it.fatigue_str || '')}">
      <div class="row">
        <div class="col">
          <strong>${escapeHtml(it.exercise || '')}</strong>
          <div class="muted">${exLabel} • ${escapeHtml(it.muscles||'')}</div>
          ${it.video_url ? `<div class="muted"><a href="${escapeAttr(it.video_url)}" target="_blank">YouTube</a></div>` : ''}
        </div>
        <div class="col actions">
          <button class="btn-save-sets" data-done="${it.is_done ? '1' : '0'}">${it.is_done ? 'Undo' : 'Done'}</button>
          <button data-id="${id}" data-equip="${escapeAttr(it.equipment || '')}" data-muscle="${escapeAttr(it.muscles || '')}" class="btn-replace" title="Shuffle exercise"><span class="icon-shuffle" aria-hidden="true">🔀</span> <span class="label">Swap</span></button>
        </div>
      </div>
      <div class="timer"><span class="mm">00</span>:<span class="ss">00</span></div>
      <div class="sets">
        ${renderSetRows(it, setCount)}
        <div class="set-actions">
          <button class="btn-start-timer">Start</button>
          <button class="btn-reset-timer">Reset</button>
          ${isIso ? `<button class="btn-timer" data-seconds="${secs}">Start ${secs}s</button><button class="btn-reset">Reset</button>` : ''}
        </div>
      </div>
    </div>`
  }

  list.onclick = async (ev) => {
    const target = ev.target
    const card = target.closest('.card')
    if (!card) return
    const glideId = card.getAttribute('data-id') || ''
    if (!glideId) return
    const email = document.getElementById('user-email')?.textContent || ''

    // Strength list: open details when a list item is clicked so sets/inputs are editable
    if (target.closest('.card-list-item')) {
      window.homeworkoutsDetailId = glideId
      renderWorkouts(items)
      return
    }

    if (target.closest('.btn-replace')) {
      const btn = target.closest('.btn-replace')
      const equipment = btn.getAttribute('data-equip') || ''
      const muscle = btn.getAttribute('data-muscle') || ''
      setStatus('Replacing (local)…')
      try {
        // Prefer local replacement: pick a replacement exercise from the in-browser generator
        const genMod = await import('./generator.js')
        const ex = genMod.pickRandomExercise({ excludeIds: [], equipment: equipment || null, muscle: muscle || null })
        if (!ex) {
          setStatus('No replacement found locally')
          return
        }
        // Update DOM: title, muscles, video link, data attributes
        try {
          const strong = card.querySelector('strong')
          if (strong) {
            // preserve done-dot if present
            const hasDot = !!strong.querySelector('.done-dot')
            strong.innerHTML = `${hasDot ? '<span class="done-dot done"></span>' : ''}${escapeHtml(ex.name || '')}`
          }
          const muted = card.querySelector('.muted')
          if (muted) muted.textContent = ex.muscles ? (Array.isArray(ex.muscles) ? ex.muscles.join(', ') : ex.muscles) : ''
          btn.setAttribute('data-equip', Array.isArray(ex.equipment) ? ex.equipment.join(', ') : (ex.equipment || ''))
          btn.setAttribute('data-muscle', Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''))
          // update video link if present
          try {
            const link = card.querySelector('a')
            if (link) {
              if (ex.video) { link.href = ex.video; link.classList.remove('hidden') }
              else { link.remove() }
            } else if (ex.video) {
              const col = card.querySelector('.col')
              if (col) col.insertAdjacentHTML('beforeend', `<div class="muted"><a href="${escapeAttr(ex.video)}" target="_blank">YouTube</a></div>`)
            }
          } catch(e){}
        } catch(e){ console.warn('DOM update for swap failed', e) }

        // Persist replacement in pending store so it will be applied when batches are flushed
        try {
          const p = loadPending() || {}
          if (!p[glideId]) p[glideId] = { glideId, is_done: false, sets: [] }
          p[glideId].replacement = { name: ex.name || '', equipment: Array.isArray(ex.equipment) ? ex.equipment.join(', ') : (ex.equipment || ''), muscles: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''), video: ex.video || '' }
          savePending(p)
          try { updateQueueIndicator() } catch (e) {}
        } catch(e) { console.warn('failed to save replacement locally', e) }

        setStatus('Replaced (local)')
      } catch (e) { console.error('Local replace error', e); setStatus('Replace failed') }
      return
    }

    if (target.closest('.btn-save-sets')) {
      const btn = target.closest('.btn-save-sets')
      const isDoneNow = btn.getAttribute('data-done') === '1'
      const newState = !isDoneNow
      // Local-only: update UI and pending store, do NOT write to backend here
      btn.setAttribute('data-done', newState ? '1' : '0')
      if (newState) { card.classList.add('done-exercise') } else { card.classList.remove('done-exercise') }
      const strong = card.querySelector('strong')
      if (newState) {
        if (strong && !strong.querySelector('.done-dot')) {
          strong.insertAdjacentHTML('afterbegin', '<span class="done-dot done"></span>')
        }
      } else {
        try { const d = strong && strong.querySelector('.done-dot'); if (d) d.remove() } catch {}
      }
      setStatus(newState ? 'Marked (local)' : 'Unmarked (local)')
      // Persist pending state locally for this card
      try {
        const p = loadPending() || {}
        const gid = glideId || ('gen_' + Math.random().toString(36).slice(2,9))
        if (!p[gid]) p[gid] = { glideId: gid, is_done: !!newState, sets: [] }
        else p[gid].is_done = !!newState
        savePending(p)
      } catch (e) { console.warn('failed save pending', e) }
      return
    }

    const doneChk = target.closest('.chk-done-set')
    if (doneChk) {
      const sNum = parseInt(doneChk.getAttribute('data-set')||'0',10)
      const isChecked = doneChk.checked === true
      if (!isChecked) { return }
      const reps = card.querySelector(`.s${sNum}-reps`)?.value || ''
      const load = card.querySelector(`.s${sNum}-load`)?.value || ''
      const restSel = card.querySelector(`.rest-select[data-set="${sNum}"]`)
      const rest = parseInt(restSel?.value||'60',10)
      // Local-only: save this set as done to pending store; start timer and disable
      setStatus(`Set ${sNum} done (local). Starting ${rest}s rest…`)
      try {
        // Save pending
        const gid = glideId || ('gen_' + Math.random().toString(36).slice(2,9))
        const p = loadPending() || {}
        if (!p[gid]) p[gid] = { glideId: gid, is_done: false, sets: [] }
        p[gid].sets = p[gid].sets || []
        // Record or replace set entry
        const idx = p[gid].sets.findIndex(s => s.setNumber === sNum)
        const entry = { setNumber: sNum, reps: reps, load: load, done: true }
        if (idx >= 0) p[gid].sets[idx] = entry
        else p[gid].sets.push(entry)
        savePending(p)
        // Start timer & UI
        startCountdown(card.querySelector('.timer'), rest)
        doneChk.disabled = true
        // If all set checkboxes are now disabled/checked, mark the exercise card as done (local)
        try {
          const all = Array.from(card.querySelectorAll('.chk-done-set'))
          const allDone = all.length > 0 && all.every(c => c.checked === true || c.disabled === true)
          if (allDone) {
            card.classList.add('done-exercise')
            const strong = card.querySelector('strong')
            if (strong && !strong.querySelector('.done-dot')) {
              strong.insertAdjacentHTML('afterbegin', '<span class="done-dot done"></span>')
            }
            // mark row-level pending done
            p[gid].is_done = true
            savePending(p)
          }
        } catch {}
      } catch (e) { setStatus('Failed to save set locally') }
      return
    }

    if (target.closest('.btn-start-timer')) {
      const btn = target.closest('.btn-start-timer')
      const cardEl = btn.closest('.card')
      const tEl = cardEl ? cardEl.querySelector('.timer') : null
      let secs = 60
      const restSel = cardEl ? cardEl.querySelector('.rest-select') : null
      if (restSel) secs = parseInt(restSel.value || secs, 10) || secs
      try { startCountdown(tEl, secs, () => { setStatus('Timer complete') }) } catch (e) {}
      return
    }

    if (target.closest('.btn-reset-timer')) {
      const btn = target.closest('.btn-reset-timer')
      const cardEl = btn ? btn.closest('.card') : null
      try {
        if (homeworkoutsTimerInterval) { clearInterval(homeworkoutsTimerInterval); homeworkoutsTimerInterval = null }
        const tEl = cardEl ? cardEl.querySelector('.timer') : null
        if (tEl) { const mm = tEl.querySelector('.mm'); const ss = tEl.querySelector('.ss'); if (mm) mm.textContent = '00'; if (ss) ss.textContent = '00' }
        setStatus('Timer reset')
      } catch (e) {}
      return
    }

    if (target.closest('.btn-timer')) {
      const secs = parseInt(target.getAttribute('data-seconds')||'45',10)
      const tEl = card.querySelector('.timer')
      // Mark current exercise for HIIT highlighting
      const gid = card.getAttribute('data-id') || ''
      if (gid) window.homeworkoutsHiitCurrentId = gid
      startCountdown(tEl, secs)
      return
    }

    if (target.closest('.btn-reset')) {
      if (homeworkoutsTimerInterval) { clearInterval(homeworkoutsTimerInterval); homeworkoutsTimerInterval = null }
      const tEl = card.querySelector('.timer')
      if (tEl) {
        tEl.classList.remove('hidden')
        const mm = tEl.querySelector('.mm')
        const ss = tEl.querySelector('.ss')
        if (mm) mm.textContent = '00'
        if (ss) ss.textContent = '00'
      }
      return
    }
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return String(s || '').replace(/\"/g, '&quot;')
}

async function loadWorkouts(email) {
  setStatus('Loading…')
  try { window.showLoading && window.showLoading('Loading…') } catch {}
  try {
    const json = await getGlideWodSummary(email)
    if (json && json.status === 'ok') {
      // Normalize items to include a boolean `is_done` for Strength rows
      const items = (json.sample || []).map(r => {
        const raw = r || {}
        const v = (raw.Is_Done !== undefined) ? raw.Is_Done : (raw.is_done !== undefined ? raw.is_done : '')
        const isDoneFlag = parseBool(v)
        return Object.assign({}, raw, { is_done: isDoneFlag })
      })
      renderWorkouts(items)
      setStatus(`Rows: ${json.totalRows}`)
    } else {
      setStatus('Failed to load')
    }
  } catch (e) {
    setStatus('Network error')
  }
  try { window.hideLoading && window.hideLoading() } catch {}
}

async function loadHiitWorkouts(email) {
  setStatus('Loading HIIT…')
  try { window.showLoading && window.showLoading('Loading…') } catch {}
  try {
    console.debug('loadHiitWorkouts start for', email)
    const json = await getGlideHiitSummary(email)
    console.debug('getGlideHiitSummary result', json)
    if (json && json.status === 'ok') {
      // Map HIIT rows and include round/slot and rest
      let items = (json.sample || []).map((r, idx) => {
        const isDone = (r.is_done !== undefined && r.is_done !== null) ? parseBool(r.is_done) : false;
        const order = r.order || (idx + 1)
        const intervalId = `${email || 'local'}_HIIT_${order}`
        const glideId = r.id || ''
        const fallbackVideo = (r && r.exercise) ? ('https://www.youtube.com/results?search_query=' + encodeURIComponent(String(r.exercise))) : ''
        return {
          id: intervalId,
          glideId,
          order,
          round: (r.round != null ? r.round : null),
          slot: (r.slot_in_round != null ? r.slot_in_round : (r.slot != null ? r.slot : null)),
          exercise: r.exercise,
          muscles: r.interval_label || '',
          equipment: '',
          reps_text: `${r.work_s || 40}s`,
          work_s: r.work_s || 40,
          rest_s: r.rest_s || 20,
          video_url: r.video_url || fallbackVideo,
          image_url: r.image_url || r.img_url || '',
          is_done: isDone
        }
      })

      // Normalize missing round/slot using order so grouping is stable.
      try {
        const minutes = getHiitLocalMinutes()
        const uniqueCount = (minutes != null) ? Math.max(1, Math.min(5, Math.floor(minutes))) : Math.min(5, Math.max(1, items.length))
        const roundSize = Math.max(1, Math.min(5, uniqueCount || 5))
        let needsFix = false
        for (const it of items) {
          if (it.round == null || it.slot == null) { needsFix = true; break }
        }
        if (needsFix) {
          items = items.map((it) => {
            const ord = clampInt(it.order, 1, 99999, 1)
            const round = it.round != null ? it.round : (Math.floor((ord - 1) / roundSize) + 1)
            const slot = it.slot != null ? it.slot : (((ord - 1) % roundSize) + 1)
            return Object.assign({}, it, { round, slot })
          })
        }
      } catch {}

      // Clamp/expand to the requested duration.
      try {
        const minutes = getHiitLocalMinutes()
        const { work, rest } = getHiitLocalWorkRest()
        const cycle = Math.max(1, (Number(items[0]?.work_s ?? work) + Number(items[0]?.rest_s ?? rest)))
        const total = (minutes != null) ? Math.max(1, Math.floor((minutes * 60) / cycle)) : null
        const uniqueCount = (minutes != null) ? Math.max(1, Math.min(5, Math.floor(minutes))) : Math.min(5, Math.max(1, items.length))
        const roundSize = Math.max(1, Math.min(5, uniqueCount || 5))
        if (total && items.length > total) items = items.slice(0, total)
        if (total && items.length > 0 && items.length < total) {
          const uniques = items.slice(0, Math.min(roundSize, items.length))
          const expanded = []
          for (let i = 0; i < total; i++) {
            const src = uniques[i % uniques.length]
            expanded.push(Object.assign({}, src, {
              id: `${email || 'local'}_HIIT_${i + 1}`,
              glideId: src.glideId || src.id || '',
              order: i + 1,
              round: Math.floor(i / roundSize) + 1,
              slot: (i % roundSize) + 1
            }))
          }
          items = expanded
        }
      } catch {}
      // If no intervals exist, attempt to generate then reload
      if (!items.length) {
        setStatus('No HIIT yet. Generating…')
        try {
          console.debug('Calling generateHiit for', email)
          await generateHiit(email)
          console.debug('generateHiit completed')
          // Poll for generated results (best-effort)
          const maxAttempts = 8
          let attempt = 0
          let j2 = null
          while (attempt < maxAttempts) {
            attempt += 1
            await new Promise(r => setTimeout(r, 1000))
            try { j2 = await getGlideHiitSummary(email); console.debug('post-generate poll', attempt, j2); if (j2 && j2.status === 'ok' && Array.isArray(j2.sample) && j2.sample.length) break } catch (e) { console.warn('post-generate poll failed', e) }
          }
          if (j2 && j2.status === 'ok') {
            items = (j2.sample || []).map((r, idx) => {
              const order = r.order || (idx + 1)
              const intervalId = `${email || 'local'}_HIIT_${order}`
              const glideId = r.id || ''
              return {
              id: intervalId,
              glideId,
              order,
              round: r.round,
              slot: r.slot_in_round,
              exercise: r.exercise,
              muscles: r.interval_label || '',
              equipment: '',
              reps_text: `${r.work_s || 40}s`,
              work_s: r.work_s || 40,
              rest_s: r.rest_s || 20,
              video_url: r.video_url || '',
              image_url: r.image_url || r.img_url || ''
              }
            })
            try {
              const minutes = getHiitLocalMinutes()
              const { work, rest } = getHiitLocalWorkRest()
              const cycle = Math.max(1, (Number(items[0]?.work_s ?? work) + Number(items[0]?.rest_s ?? rest)))
              const total = (minutes != null) ? Math.max(1, Math.floor((minutes * 60) / cycle)) : null
              // If server returned more than needed, truncate.
              if (total && items.length > total) items = items.slice(0, total)
              // If server returned a short sample (e.g. 3) while the requested
              // total is larger (e.g. 60), expand the sample locally by cycling
              // the unique exercises (but keep at most 5 uniques per block).
              if (total && items.length > 0 && items.length < total) {
                try {
                  const uniqueCount = (minutes != null) ? Math.max(1, Math.min(5, Math.floor(minutes))) : Math.min(5, items.length)
                  const roundSize = Math.max(1, Math.min(5, uniqueCount || 5))
                  const uniques = items.slice(0, Math.min(roundSize, items.length))
                  const expanded = []
                  for (let i = 0; i < total; i++) {
                    const src = uniques[i % uniques.length]
                    expanded.push(Object.assign({}, src, {
                      id: `${email || 'local'}_HIIT_${i + 1}`,
                      glideId: src.glideId || src.id || '',
                      order: i + 1,
                      round: Math.floor(i / roundSize) + 1,
                      slot: (i % roundSize) + 1
                    }))
                  }
                  items = expanded
                } catch (e) {
                  // If expansion fails, keep the original sample
                  console.warn('HIIT sample expansion failed', e)
                }
              }
            } catch {}
          }
        } catch (e) { console.warn('generateHiit failed', e) }
      }
      renderHiitRounds(items)
      setStatus(items.length ? `HIIT intervals: ${items.length}` : 'HIIT ready')
    } else {
      // Fallback: derive intervals from profile or defaults
      try {
        const prof = await debugProfile(email)
        const minutes = (prof && prof.hiit && prof.hiit.minutes) ? parseInt(prof.hiit.minutes, 10) : 20
        const { work: defWork, rest: defRest } = getHiitLocalWorkRest()
        const work = (prof && prof.hiit && prof.hiit.workSeconds) ? parseInt(prof.hiit.workSeconds, 10) : defWork
        const rest = (prof && prof.hiit && prof.hiit.restSeconds) ? parseInt(prof.hiit.restSeconds, 10) : defRest
        const total = Math.max(1, Math.floor((minutes*60) / (work+rest)))
        const items = Array.from({length: total}, (_, i) => ({ id: `fallback_${i+1}`, order: i+1, round: Math.floor(i/5)+1, slot: (i%5)+1, exercise: `Exercise ${i+1}`, muscles: `${work}/${rest}`, work_s: work, rest_s: rest }))
        const itemsWithDone = items.map(it => ({ ...it, is_done: false }))
        renderHiitRounds(itemsWithDone)
        setStatus(`HIIT intervals (fallback): ${itemsWithDone.length}`)
      } catch {
        setStatus('Failed to load HIIT')
      }
    }
  } catch (e) { 
    console.warn('loadHiitWorkouts failed', e)
    // Offline/Network fallback: try to derive HIIT intervals using cached Exercices.json
    try {
      const minutes = getHiitLocalMinutes() ?? 20
      const { work, rest } = getHiitLocalWorkRest()
      const total = Math.max(1, Math.floor((minutes*60) / (work+rest)))

      // Try to use cached exercises for variety
      let items = []
      try {
        const cached = await getCachedResponse('/Exercices.json')
        if (cached) {
          const arr = await cached.json()
          if (Array.isArray(arr) && arr.length) {
            // Shuffle and pick `total` exercises (allow repeats if total > arr.length)
            const shuffled = arr.slice().sort(() => Math.random() - 0.5)
            for (let i = 0; i < total; i++) {
              const ex = shuffled[i % shuffled.length] || shuffled[0]
              items.push({ id: `offline_${i+1}`, order: i+1, round: Math.floor(i/5)+1, slot: (i%5)+1, exercise: ex.name || ex.exercise || `Exercise ${i+1}`, muscles: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''), work_s: work, rest_s: rest })
            }
            // Ensure is_done: false for all
            items = items.map(it => ({ ...it, is_done: false }))
            console.debug('Using cached exercises for offline HIIT', {minutes, work, rest, total, sample: items.slice(0,3)})
            renderHiitRounds(items)
            setStatus(`HIIT intervals (offline, cached): ${items.length}`)
            return
          }
        }
      } catch (e6) {
        console.warn('Failed to read cached exercises', e6)
      }

      // Fallback to simple placeholders
      items = Array.from({length: total}, (_, i) => ({ id: `offline_${i+1}`, order: i+1, round: Math.floor(i/5)+1, slot: (i%5)+1, exercise: `Exercise ${i+1}`, muscles: `${work}/${rest}`, work_s: work, rest_s: rest }))
      items = items.map(it => ({ ...it, is_done: false }))
      console.debug('Using offline HIIT placeholder fallback', {minutes, work, rest, total})
      renderHiitRounds(items)
      setStatus(`HIIT intervals (offline): ${items.length}`)
    } catch (e2) {
      console.warn('Offline HIIT fallback failed', e2)
      setStatus('Network error')
    }
  } finally {
    try { window.hideLoading && window.hideLoading() } catch {}
  }
}

function renderHiitRounds(items) {
  const list = document.getElementById('workout-list')
  if (!list) return
  if (!items || !items.length) { list.innerHTML = '<p>No HIIT yet.</p>'; window.hiitItems = items; return }
    // Store authoritative HIIT items globally for all handlers
    window.hiitItems = items

  // Normalize ids/rounds to prevent collisions (a single DONE must not affect all cards)
  try {
    const emailForIds = (document.getElementById('user-email')?.textContent || '').trim() || 'local'
    items.forEach((it, idx) => {
      const ord = clampInt(it?.order ?? (idx + 1), 1, 9999, idx + 1)
      it.order = ord
      if (!it.id) it.id = `${emailForIds}_HIIT_${ord}`
      if (it.round == null || it.round === '') it.round = Math.floor((ord - 1) / 5) + 1
      if (it.slot == null && it.slot_in_round == null) it.slot = ((ord - 1) % 5) + 1
    })
  } catch {}
  // Always merge local pending is_done state for rounds (force update)
  const pending = loadPending() || {}
  let mergeCount = 0;
  items.forEach(it => {
    const gid = it.id || ''
    if (pending[gid] && typeof pending[gid].is_done === 'boolean') {
      if (it.is_done !== pending[gid].is_done) mergeCount++;
      it.is_done = pending[gid].is_done
    }
  })
  console.debug('[HIIT RENDER] Merged pending state for', mergeCount, 'intervals. Pending:', JSON.stringify(pending));
  // Group by round
  const byRound = {}
  items.forEach(it => {
    const r = parseInt(it.round||1,10)
    if (!byRound[r]) byRound[r] = []
    byRound[r].push(it)
  })
  const rounds = Object.keys(byRound).map(n => parseInt(n,10)).sort((a,b)=>a-b)
  list.classList.remove('list-mode')
  const { work: defaultWork, rest: defaultRest } = getHiitLocalWorkRest()
  list.innerHTML = rounds.map(rn => {
    const rows = byRound[rn].slice().sort((a,b)=> (parseInt((a.slot ?? a.slot_in_round ?? 0),10) - parseInt((b.slot ?? b.slot_in_round ?? 0),10)));
    const label = `Set ${rn}`;
    const work = clampInt(rows[0]?.work_s ?? defaultWork, 5, 600, 40);
    const rest = clampInt(rows[0]?.rest_s ?? defaultRest, 0, 600, 20);
    // Debug: log is_done state for this round
    console.debug(`[RENDER HIIT] Round ${rn} is_done states:`, rows.map(it => ({id: it.id, is_done: it.is_done})));
    const isAllDone = rows.every(it => (it.is_done === true));
    const doneDotRound = isAllDone ? `<span class=\"done-dot done\"></span>` : `<span class=\"done-dot\"></span>`;
    // Always add 'disabled-card' if isAllDone (local optimistic)
    return `
    <div class=\"card hiit-round${isAllDone ? ' disabled-card' : ''}\" data-round=\"${rn}\">
      <div class=\"row\">
        <div class=\"col\">
          <strong>${doneDotRound}${label}</strong> <button type=\"button\" class=\"btn-done-round\" data-round=\"${rn}\" data-done=\"${isAllDone ? '1' : '0'}\">DONE</button>
          <div class=\"muted\">${work}/${rest} • ${rows.length} exercices</div>
        </div>
        <div class=\"col actions\">
          <button type=\"button\" class=\"btn-start-round\" data-round=\"${rn}\" data-work=\"${work}\" data-rest=\"${rest}\">Start</button>
          <button type=\"button\" class=\"btn-pause-round\" data-round=\"${rn}\">Pause</button>
          <button type=\"button\" class=\"btn-resume-round\" data-round=\"${rn}\">Resume</button>
          <button type=\"button\" class=\"btn-reset-round\" data-round=\"${rn}\">Reset</button>
        </div>
      </div>
      <ul class=\"hiit-ex-list\">
        ${rows.map((it, idx) => {
          const dot = (it.is_done === true) ? `<span class=\"done-dot done\"></span>` : `<span class=\"done-dot\"></span>`;
          const slot = it.slot ?? it.slot_in_round ?? '';
          const v = it.video_url || it.video || (it.exercise ? ('https://www.youtube.com/results?search_query=' + encodeURIComponent(String(it.exercise))) : '')
          return `<li class=\"hiit-ex\" data-id=\"${it.id}\" data-order=\"${it.order}\" data-slot=\"${slot}\">${dot}<span class=\"ex-name\">${idx+1}. ${escapeHtml(it.exercise||'')}</span>${v ? `<a class=\"ex-link\" href=\"${escapeAttr(v)}\" target=\"_blank\" title=\"YouTube\">YouTube ↗</a>` : ''}${it.image_url ? `<img class=\"ex-img\" src=\"${escapeAttr(it.image_url)}\" alt=\"Exercise image\">` : ''}</li>`;
        }).join('')}
      </ul>
      <div class=\"timer\"><span class=\"mm\">00</span>:<span class=\"ss\">00</span></div>
    </div>`;
  }).join('')
  // Inject Workout Complete button (always visible for HIIT)
  const parent = list.parentElement
  if (parent) {
    const existing = parent.querySelector('.workout-actions')
    if (existing) existing.remove()

    parent.insertAdjacentHTML('beforeend', '<div class="workout-actions"><button id="btn-workout-complete">Workout complete</button></div>')

    // HIIT completion: local-first enqueue + show splash.
    try {
      const btn = parent.querySelector('#btn-workout-complete')
      if (btn) {
        btn.type = 'button'
        btn.onclick = async (ev) => {
          try { ev?.preventDefault?.() } catch {}
          try {
              const email = getActiveEmail()
            const hiitItems = window.hiitItems || items || []
            const batch = { email, items: [] }
            for (const it of hiitItems) {
              const gid = it.id || ''
              if (!gid) continue
              batch.items.push({ glideId: gid, is_done: true, sets: [] })
            }
            if (batch.items.length) enqueueBatch(batch)

            // Append local history so calendar shows this day as a workout day.
            try {
              const histItems = hiitItems.map(it => {
                const mg = String(it.muscles || '').trim()
                const firstMuscle = mg.split(',')[0] || ''
                return {
                  exercise: it.exercise || '',
                  muscleGroup: mg,
                  muscle: firstMuscle,
                  setCount: 1,
                  fatigueStr: ''
                }
              })
              appendWorkoutHistory(email, histItems, new Date(), 'complete')
            } catch (e) { console.warn('HIIT history append failed', e) }

            setStatus('Workout complete — saved locally')
            // Always show completion splash; in offline mode it shows queued status.
            try { window.showCompleteAndFlush && window.showCompleteAndFlush() } catch (e) { console.warn('complete splash failed', e) }
          } catch (e) {
            console.error('HIIT complete failed', e)
            setStatus('Workout complete failed')
          }
        }
      }
    } catch {}
  }

  let seqState = { running: false, round: null, idx: 0, phase: 'work', work: 40, rest: 20, selectedIdx: null }
  function runAuto(card) {
    const itemsEls = Array.from(card.querySelectorAll('.hiit-ex'))
    const tEl = card.querySelector('.timer')
    const work = parseInt(seqState.work||40,10)
    const rest = parseInt(seqState.rest||20,10)
    const loop = () => {
      if (seqState.idx >= itemsEls.length) { seqState.running=false; setStatus('Round complete'); return }
      itemsEls.forEach(el => el.classList.remove('live'))
      const el = itemsEls[seqState.idx]
      el.classList.add('live')
      const gid = el.getAttribute('data-id')||''
      if (gid) window.homeworkoutsHiitCurrentId = gid
      seqState.phase = 'work'
      startCountdown(tEl, work, () => {
        seqState.phase = 'rest'
        startCountdown(tEl, rest, () => {
          seqState.idx += 1
          seqState.phase = 'work'
          loop()
        })
      })
    }
    seqState.running = true
    loop()
  }
  list.onclick = (ev) => {
    const t = ev.target
    const card = t.closest('.hiit-round')
    if (!card) return

    // Important: keep HIIT controls from submitting any surrounding <form>
    // (which can trigger a full refresh/regenerate and look like the workout "changes").
    if (t.closest('.btn-done-round, .btn-start-round, .btn-pause-round, .btn-resume-round, .btn-reset-round')) {
      try { ev.preventDefault() } catch {}
      try { ev.stopPropagation() } catch {}
    }

    const roundNum = parseInt(card.getAttribute('data-round')||'1',10)
    if (t.closest('.btn-reset-round')) {
      seqState = { running: false, round: null, idx: 0, phase: 'work', work: seqState.work, rest: seqState.rest }
      const tEl = card.querySelector('.timer')
      if (tEl) { const mm=tEl.querySelector('.mm'); const ss=tEl.querySelector('.ss'); if (mm) mm.textContent='00'; if (ss) ss.textContent='00' }
      card.querySelectorAll('.hiit-ex.live').forEach(el => el.classList.remove('live'))
      setStatus('Reset')
      return
    }
    if (t.closest('.btn-pause-round')) { pauseTimer(); return }
    if (t.closest('.btn-resume-round')) {
      const itemsEls = Array.from(card.querySelectorAll('.hiit-ex'))
      let startIdx = (seqState.selectedIdx != null) ? seqState.selectedIdx : seqState.idx
      startIdx = Math.max(0, Math.min(startIdx, itemsEls.length - 1))
      seqState.idx = startIdx
      // Continue auto-cycling from the selected/current index
      runAuto(card)
      return
    }
    if (t.closest('.btn-start-round')) {
      if (seqState.running) return
      const work = parseInt(t.getAttribute('data-work')||'40',10)
      const rest = parseInt(t.getAttribute('data-rest')||'20',10)
      seqState = { running: false, round: roundNum, idx: 0, phase: 'work', work, rest, selectedIdx: null }
      runAuto(card)
      return
    }

    // Toggle round done state and grey/un-grey the card (optimistic UI + per-interval fallback)
    if (t.closest('.btn-done-round')) {
      const email = document.getElementById('user-email')?.textContent || '';
      const btn = t.closest('.btn-done-round');
      const r = parseInt(btn.getAttribute('data-round')||'0',10);
      const isDoneNow = btn.getAttribute('data-done') === '1';
      const newState = !isDoneNow;
      if (!r) return;
      setStatus(newState ? 'Marking set done…' : 'Unmarking set…');
      // Always operate on authoritative HIIT items
      const hiitItems = window.hiitItems || items;
      try {
        const pending = loadPending() || {};
        let changed = 0;
        // Set all intervals in the round to newState (force integer comparison)
        hiitItems.forEach(it => {
          if (parseInt(it.round, 10) === r) {
            it.is_done = newState;
            const gid = it.id || '';
            if (!pending[gid]) pending[gid] = { glideId: gid, is_done: false, sets: [] };
            pending[gid].is_done = newState;
            changed++;
          }
        });
        savePending(pending);
        // Debug: log authoritative state after update
        console.debug('[HIIT DONE PATCH] After marking round', r, 'done:', newState, 'changed:', changed, 'pending:', JSON.stringify(pending));
        console.debug('[HIIT DONE PATCH] hiitItems state:', hiitItems.map(it => ({id: it.id, round: it.round, is_done: it.is_done})));
      } catch (e) { console.warn('failed to save HIIT round done state', e); }
      // Reload items from pending to ensure UI reflects latest state
      const pending2 = loadPending() || {};
      hiitItems.forEach(it => {
        const gid = it.id || '';
        if (pending2[gid] && typeof pending2[gid].is_done === 'boolean') {
          it.is_done = pending2[gid].is_done;
        }
      });
      // Force re-render with updated authoritative array
      renderHiitRounds(hiitItems);
      // Debug: log DOM state after render
      setTimeout(() => {
        const cards = Array.from(document.querySelectorAll('.hiit-round')).map(card => ({
          className: card.className,
          dataset: { ...card.dataset },
          html: card.outerHTML.slice(0, 200)
        }));
        console.debug('[HIIT DONE PATCH] Card states after render:', cards);
      }, 100);
      try { window.showLoading && window.showLoading(newState ? 'Marking…' : 'Updating…') } catch {}
      ;(async () => {
        try {
          if (!email) {
            setStatus(newState ? 'Set marked done' : 'Set unmarked')
            return
          }
          // Try round-level update first
          let ok = false
          try {
            const res = await setHiitRoundDone(email, r, newState)
            ok = !!(res && res.status === 'ok')
          } catch {}
          // Fallback: update each interval in the round individually
          if (!ok) {
            for (const it of items) {
              if (parseInt(it.round||1,10) === r) {
                const ord = parseInt(it.order||0,10)
                if (ord) {
                  try { await setHiitIsDone(email, ord, newState) } catch {}
                }
              }
            }
            ok = true // best-effort
          }
          setStatus(newState ? 'Set marked done' : 'Set unmarked')
          // Optionally reload from backend if strict sync needed
          // try { await loadHiitWorkouts(email) } catch {}
        } catch (e) {
          // Revert UI on error
          for (const it of items) {
            if (parseInt(it.round||1,10) === r) it.is_done = isDoneNow
          }
          renderHiitRounds(items)
          setStatus('Network error')
        }
        try { window.hideLoading && window.hideLoading() } catch {}
      })()
      return
    }

    // Selecting an exercise in the list: mark selection and prepare to start/resume there
    const li = t.closest('.hiit-ex')
    if (li) {
      const itemsEls = Array.from(card.querySelectorAll('.hiit-ex'))
      const idx = Math.max(0, itemsEls.indexOf(li))
      seqState.selectedIdx = idx
      itemsEls.forEach(el => el.classList.remove('live'))
      li.classList.add('live')
      const gid = li.getAttribute('data-id')||''
      if (gid) window.homeworkoutsHiitCurrentId = gid
      setStatus(`Selected exercise ${idx+1}`)
      return
    }
  }
}

// Expose HIIT renderer for local generator paths
try { window.renderHiitRounds = renderHiitRounds } catch {}

function guessIsoSeconds(hint) {
  const m = /([0-9]{1,3})\s*s/.exec(String(hint||''))
  if (m) return parseInt(m[1],10)
  return 40
}
