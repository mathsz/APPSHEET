// Simple HTML escape helper for safe rendering
function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
import './style.css'
import { initAuth } from './auth.js'
import { enableWakeLock, releaseWakeLock } from './wakelock.js'
import { getSettingString, getSettingInt, setSetting, runSettingsMigrationOnce } from './settings.js'
import { classifyFatigue, computeMuscleFatigueMap, getDashboardMuscleList, loadHistory, makeHistorySummaryBlock, normalizeMuscleKeyTitle, pickSuggestedMuscle } from './fatigue.js'
import { resolveFetchUrl, getCachedResponse } from './fetch-utils.js'

// Ensure a global `window.setStatus` exists early so any module can call it safely.
if (typeof window !== 'undefined' && !window.setStatus) {
  window.setStatus = function(msg) {
    try {
      const el = document.getElementById('status')
      if (el) el.textContent = msg || ''
    } catch (e) {}
  }
}

// Module-scoped helper that always delegates to the current `window.setStatus`.
const setStatus = (msg) => {
  try {
    if (typeof window !== 'undefined' && typeof window.setStatus === 'function') {
      return window.setStatus(msg)
    }
    const el = document.getElementById('status')
    if (el) el.textContent = msg || ''
  } catch (e) { /* ignore */ }
}

(async function(){
  // Ensure legacy keys are migrated early so subsequent raw reads don't bypass helpers
  try { runSettingsMigrationOnce() } catch (e) {}
  try {
    const cfgUrl = (location && location.origin ? location.origin : '') + '/config.json'
    const res = await fetch(cfgUrl, { cache: 'no-store' })
    if (!res || !res.ok) return
    const cfg = await res.json()
    const setIfEmpty = (key, val) => {
      try {
        const cur = localStorage.getItem(key)
        if ((!cur || cur === 'null') && val) localStorage.setItem(key, val)
      } catch {}
    }
    setIfEmpty('homeworkouts_exec_url', cfg.execUrl || '')
    setIfEmpty('homeworkouts_token', cfg.token || '')
    setIfEmpty('homeworkouts_proxy_base', cfg.proxyBase || '')
  } catch (e) {
    // ignore failures — app will fall back to built-in defaults or saved overrides
  }
})()

const root = document.querySelector('#app')

root.innerHTML = `
  <header>
    <h1>HomeWorkouts</h1>
    <nav>
      <button id="nav-setup">Workout Setup</button>
      <button id="nav-workouts">Workout</button>
      <button id="nav-fatigue">Fatigue</button>
      <button id="nav-timer">Timer</button>
      <button id="nav-settings">Settings</button>
    </nav>
  </header>
  

  <main>
    <section id="view-setup" class="view hidden">
      <h2>Workout Setup</h2>
      <div id="setup-profile" class="cards"></div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Program</strong>
            <div class="muted">Strength, HIIT or Pilates</div>
          </div>
          <div class="col">
            <select id="setup-program-select">
              <option value="Strength">Strength</option>
              <option value="HIIT">HIIT</option>
              <option value="Pilates">Pilates</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Equipment</strong>
            <div class="muted">Select preferred gear</div>
          </div>
          <div class="col equip-group" id="setup-equip-group">
            <label class="equip-chip"><input type="checkbox" value="Bodyweight"> Bodyweight</label>
            <label class="equip-chip"><input type="checkbox" value="Bench"> Bench</label>
            <label class="equip-chip"><input type="checkbox" value="Dumbbells"> Dumbbells</label>
            <label class="equip-chip"><input type="checkbox" value="Kettlebell"> Kettlebell</label>
            <label class="equip-chip"><input type="checkbox" value="Band"> Band</label>
            <label class="equip-chip"><input type="checkbox" value="TRX"> TRX</label>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Type de séance voulue</strong>
            <div class="muted">Upper / Lower / Full Body</div>
          </div>
          <div class="col">
            <select id="setup-session-select">
              <option value="Upper Body">Upper Body</option>
              <option value="Lower Body">Lower Body</option>
              <option value="Full Body" selected>Full Body</option>
              <option value="Pilates">Pilates</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Durée</strong>
            <div class="muted">Minutes</div>
          </div>
          <div class="col">
            <select id="setup-duration-select">
              ${[5,10,15,20,25,30,35,40,45,50,55,60].map(m=>`<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Sets (Strength)</strong>
            <div class="muted">Default: 3</div>
          </div>
          <div class="col">
            <input id="setup-sets" type="number" min="1" max="12" value="3" style="width:96px">
          </div>
        </div>
      </div>
      <div class="setup-actions">
        <button id="btn-save">Save</button>
        <span id="setup-saved-indicator" class="muted" style="margin-left:0.75rem"></span>
      </div>
      <div class="status" id="setup-status"></div>
      <div id="setup-user-info" class="setup-user-info hidden">
        <div class="setup-user-row">
          <div class="setup-email">
            <div class="setup-email-label">Email:</div>
            <div id="user-email" class="setup-email-value">Not signed in</div>
          </div>
          <button id="btn-signin">Sign in</button>
          <button id="btn-signout" class="hidden">Sign out</button>
        </div>
      </div>
    </section>
    <section id="view-workouts" class="view">
      <h2>Workout</h2>
      <div class="set-actions" style="margin-bottom:0.5rem">
          <span class="muted-inline" style="margin-left:1rem; margin-right:0.5rem">Don't like the workout?</span>
          <button id="btn-regenerate-workout">Regenerate workout</button>
          <button id="btn-generate-local" class="hidden">Generate Local</button>
        </div>
      <div id="workout-list" class="cards"></div>
      <div id="status" class="status"></div>
    </section>

    <section id="view-fatigue" class="view hidden">
      <h2>Fatigue</h2>
      <div class="fatigue-actions">
        <button id="btn-fatigue-levels" class="active">Levels</button>
        <button id="btn-fatigue-calendar">Calendar</button>
      </div>
      <div id="fatigue-grid" class="cards"></div>
      <div id="fatigue-calendar" class="calendar hidden"></div>
      <div class="status" id="fatigue-status"></div>
    </section>

    <section id="view-timer" class="view hidden">
      <h2>Timer</h2>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Duration (seconds)</strong>
            <div class="muted">Enter seconds and start</div>
          </div>
          <div class="col">
            <input id="timer-seconds" type="number" min="1" value="60" style="width:120px">
          </div>
        </div>
        <div class="row" style="margin-top:0.5rem">
          <div class="col">
            <div id="app-timer" class="timer"><span class="mm">00</span>:<span class="ss">00</span></div>
          </div>
          <div class="col">
            <button id="btn-timer-start">Start</button>
            <button id="btn-timer-pause">Pause</button>
            <button id="btn-timer-reset">Reset</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Settings removed from inline Setup page to avoid accidental edits -->
  </main>
  <footer>
    <small>Homeworkouts PWA • Offline-ready</small>
  </footer>

  <div id="toast" class="toast hidden"></div>
  <div id="loading" class="loading hidden"><div class="spinner"></div><div id="loading-text" class="loading-text">Loading…</div></div>

  <div id="fatigue-splash" class="splash hidden" role="status" aria-live="polite">
    <div class="card splash-card">
      <div class="splash-title">Workout created based on muscle fatigue.</div>
      <div class="splash-sub">If you prefer to generate as per selection, please press : regenerate workout</div>
    </div>
  </div>

  <!-- Confirmation modal -->
  <div id="confirm-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="modal-content">
      <h3 id="confirm-title">Confirm action</h3>
      <div id="confirm-message">Are you sure?</div>
      <div class="modal-actions">
        <button id="confirm-yes">Confirm</button>
        <button id="confirm-no" class="secondary">Cancel</button>
      </div>
    </div>
  </div>
`

initAuth()

// setStatus is defined at module top to avoid race conditions; the auth
// module may overwrite `window.setStatus` with a richer implementation.

// Register service worker for offline exercises.json caching and auto-refresh
try {
  const isDev = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  const isProd = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD)

  if ('serviceWorker' in navigator) {
    if (isDev) {
      // Avoid SW during `vite dev` (can cause cached/proxy issues).
      navigator.serviceWorker.getRegistrations?.().then(regs => {
        try { regs.forEach(r => r.unregister()) } catch {}
      })
    }

    if (isProd) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('SW registered', reg.scope)
      }).catch(e => console.warn('SW register failed', e))
      navigator.serviceWorker.addEventListener('message', (ev) => {
        try {
          if (ev.data && ev.data.type === 'exercises-updated') {
            console.log('Exercises updated — reloading to use latest data')
            // Auto-refresh page to pick up latest data
            window.location.reload(true)
          }
        } catch (e) {}
      })
    }
  }
} catch (e) {}

// Settings view: visible only to two admin emails; hidden for everyone else
;(function(){
  const allowed = ['mathieuvalotaire@gmail.com']
  function updateSettingsAccess(){
    const email = (document.getElementById('user-email')?.textContent || '').trim().toLowerCase()
    const authorized = allowed.includes(email)
    // Toggle nav button visibility
    const navBtn = document.getElementById('nav-settings')
    if (navBtn) navBtn.style.display = authorized ? '' : 'none'
    // Ensure the settings view is hidden for unauthorized users
    const vSet = document.getElementById('view-settings')
    if (vSet) vSet.classList.toggle('hidden', !authorized)
    // Also disable inputs/buttons as an extra safety
    const inputs = Array.from(document.querySelectorAll('#view-settings input'))
    inputs.forEach(i => { try { i.disabled = !authorized } catch {} })
    const saveBtn = document.getElementById('cfg-save')
    const resetBtn = document.getElementById('cfg-reset')
    if (saveBtn) saveBtn.disabled = !authorized
    if (resetBtn) resetBtn.disabled = !authorized
    // Keep Test available for all users
    const status = document.getElementById('settings-status')
    if (!authorized && status) status.textContent = 'Settings are available to admins only.'
  }
  // Run on startup and poll for auth changes (auth module updates #user-email)
  updateSettingsAccess()
  setInterval(updateSettingsAccess, 1000)
})()

function show(viewId) {
  const vW = document.getElementById('view-workouts')
  const vS = document.getElementById('view-setup')
  const vF = document.getElementById('view-fatigue')
  const vT = document.getElementById('view-timer')
  const vSet = document.getElementById('view-settings')
  const views = { workouts: vW, setup: vS, fatigue: vF, timer: vT, settings: vSet }
  const next = views[viewId]
  if (!next) return

  // Find current visible view
  const current = Object.values(views).find(el => el && !el.classList.contains('hidden')) || null
  if (current === next) return

  const D = 240
  // Prepare next view
  next.classList.remove('hidden')
  next.classList.remove('view-exit', 'view-exit-active', 'view-enter', 'view-enter-active')
  next.classList.add('view-enter')

  // Prepare current view exit
  if (current) {
    current.classList.remove('view-enter', 'view-enter-active')
    current.classList.add('view-exit')
  }

  const raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 0)

  // Trigger transitions on next paint
  raf(() => {
    next.classList.add('view-enter-active')
    if (current) current.classList.add('view-exit-active')
  })

  // Cleanup after transition
  setTimeout(() => {
    try {
      next.classList.remove('view-enter', 'view-enter-active')
      if (current) {
        current.classList.add('hidden')
        current.classList.remove('view-exit', 'view-exit-active')
      }
    } catch {}
  }, D + 20)

  // Show `setup-user-info` (email / sign in/out) only on the Setup view
  try {
    const ui = document.getElementById('setup-user-info')
    if (ui) ui.classList.toggle('hidden', viewId !== 'setup')
  } catch {}
  try { localStorage.setItem('homeworkouts_last_view', viewId) } catch {}
  // Manage screen wake lock: enable when viewing workouts, release otherwise
  try {
    if (viewId === 'workouts') enableWakeLock()
    else releaseWakeLock()
  } catch {}
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

async function ensureHiitRendererReady(timeoutMs = 2000) {
  try {
    if (typeof window !== 'undefined' && typeof window.renderHiitRounds === 'function') return true
  } catch {}
  // In rare cases (SW churn / early clicks), wait briefly for auth.js to expose the renderer.
  try { await import('./auth.js') } catch {}
  const start = Date.now()
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (typeof window !== 'undefined' && typeof window.renderHiitRounds === 'function') return true
    } catch {}
    await sleep(50)
  }
  return false
}

async function showFatigueSplashFor2s() {
  const el = document.getElementById('fatigue-splash')
  if (!el) return
  try {
    el.classList.remove('hidden')
    await sleep(2000)
  } finally {
    try { el.classList.add('hidden') } catch {}
  }
}

function ymdLocal(d) {
  const dt = (d instanceof Date) ? d : new Date(d)
  if (isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let fatigueCalendarMonthDelta = 0

function renderFatigueCalendar({ now = new Date(), historyRows = [], monthDelta = 0 } = {}) {
  const host = document.getElementById('fatigue-calendar')
  if (!host) return

  const today = (now instanceof Date) ? now : new Date(now)

  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthDelta, 1)
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startWeekday = monthStart.getDay() // 0..6 (Sun..Sat)

  const workoutDays = new Set()
  for (const r of (Array.isArray(historyRows) ? historyRows : [])) {
    const dt = new Date(r?.date || r?.timestamp || r?.ts || '')
    const key = ymdLocal(dt)
    if (key) workoutDays.add(key)
  }

  const title = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Build cells (6-week grid like typical month pickers: 42 cells)
  const cells = []
  // Leading days from previous month
  const prevMonthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0)
  for (let i = 0; i < startWeekday; i++) {
    const day = prevMonthEnd.getDate() - (startWeekday - 1 - i)
    const dt = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), day)
    const key = ymdLocal(dt)
    cells.push({ kind: 'day', day, key, muted: true, isToday: key === ymdLocal(today), isWorkout: workoutDays.has(key) })
  }

  // Current month days
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const dt = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
    const key = ymdLocal(dt)
    cells.push({
      kind: 'day',
      day,
      key,
      isToday: key === ymdLocal(today),
      isWorkout: workoutDays.has(key),
      muted: false
    })
  }

  // Trailing days from next month to fill 42
  while (cells.length < 42) {
    const idx = cells.length - (startWeekday + monthEnd.getDate())
    const day = idx + 1
    const dt = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, day)
    const key = ymdLocal(dt)
    cells.push({ kind: 'day', day, key, muted: true, isToday: key === ymdLocal(today), isWorkout: workoutDays.has(key) })
  }

  host.innerHTML = `
    <div class="calendar-header">
      <button id="cal-prev" aria-label="Previous month">‹</button>
      <div class="calendar-title">${escapeHtml(title)}</div>
      <button id="cal-next" aria-label="Next month">›</button>
    </div>
    <div class="calendar-frame">
      <div class="calendar-grid">
        ${weekdays.map(w => `<div class="calendar-weekday">${escapeHtml(w)}</div>`).join('')}
        ${cells.map(c => {
          const cls = ['cal-day']
          if (c.muted) cls.push('muted')
          if (c.isToday) cls.push('today')
          if (c.isWorkout) cls.push('workout')
          return `<div class="${cls.join(' ')}">${c.day}</div>`
        }).join('')}
      </div>
    </div>
  `.trim()

  // Wire month navigation
  try {
    host.querySelector('#cal-prev')?.addEventListener('click', () => {
      fatigueCalendarMonthDelta -= 1
      renderFatigueCalendar({ now: today, historyRows, monthDelta: fatigueCalendarMonthDelta })
    })
    host.querySelector('#cal-next')?.addEventListener('click', () => {
      fatigueCalendarMonthDelta += 1
      renderFatigueCalendar({ now: today, historyRows, monthDelta: fatigueCalendarMonthDelta })
    })
  } catch {}
}

document.getElementById('nav-setup')?.addEventListener('click', async () => {
  show('setup')
  const email = document.getElementById('user-email')?.textContent || ''
  const statusEl = document.getElementById('setup-status')
  statusEl.textContent = 'Ready'
  try {
  const box = document.getElementById('setup-profile')
  box.innerHTML = `<div class="card" id="profile-card"><div>Email: ${email || 'Not signed in'}</div></div>`
    // Populate UI from localStorage (no backend calls)
    const program = getSettingString('program_type', 'Strength')
    const equipmentText = getSettingString('equipment', '')
    const sets = localStorage.getItem('homeworkouts_sets') || '3'
    const duration = localStorage.getItem('homeworkouts_duration_min') || localStorage.getItem('homeworkouts_hiit_minutes') || '30'
    const pgSel = document.getElementById('setup-program-select')
    const group = document.getElementById('setup-equip-group')
    const dSel = document.getElementById('setup-duration-select')
    const sEl = document.getElementById('setup-sets')
    if (pgSel) pgSel.value = program
    if (dSel) dSel.value = String(duration)
    if (sEl) sEl.value = String(sets)
    if (group) {
      const vals = String(equipmentText || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean)
      group.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = vals.includes(cb.value.toLowerCase()) })
    }
    // Ensure UI rules for equipment/program state
    function updateEquipDisabled(val) {
      const raw = (val != null) ? String(val) : (document.getElementById('setup-program-select')?.value || '')
      const valNorm = String(raw).toLowerCase()
      const shouldDisable = !valNorm.includes('strength')
      const grp = document.getElementById('setup-equip-group')
      if (grp) {
        grp.classList.toggle('disabled', !!shouldDisable)
        grp.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.disabled = !!shouldDisable
        })
        const card = grp.closest('.card')
        if (card) card.classList.toggle('disabled-card', !!shouldDisable)
      }
    }
    // Recompute derived exercise count immediately when inputs change
    function recalcExerciseCount() {
      try {
        const prog = (document.getElementById('setup-program-select')?.value || getSettingString('program_type', 'Strength')).toLowerCase()
        const duration = parseInt(document.getElementById('setup-duration-select')?.value || String(getSettingInt('duration_min', 0)), 10)
        const setsInput = parseInt(document.getElementById('setup-sets')?.value || String(getSettingInt('sets', 0)), 10)
        let derived = null
        if (prog.includes('hiit')) {
          if (!isNaN(duration) && duration > 0) {
            derived = Math.max(1, Math.min(5, Math.floor(duration)))
          } else {
            derived = (setsInput && setsInput > 0) ? setsInput : (getSettingInt('sets', 8) || 8)
          }
        } else {
          // Strength/default: match Apps Script SET_USER_SETUP logic.
          // minutesPerExercise = max(3, round(((setCount*60)+60)/60))
          // targetCount = max(1, floor(durationMin / minutesPerExercise))
          const sc = (setsInput && setsInput > 0) ? setsInput : (getSettingInt('sets', 3) || 3)
          const dm = (!isNaN(duration) && duration > 0) ? duration : 0
          const minutesPerExercise = Math.max(3, Math.round(((sc * 60) + 60) / 60))
          derived = dm > 0 ? Math.max(1, Math.floor(dm / minutesPerExercise)) : 8
        }
        const ind = document.getElementById('setup-saved-indicator')
        let savedText = ''
        try { const stored = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null'); if (stored && stored.savedAt) savedText = 'Saved: ' + (new Date(stored.savedAt).toLocaleString()) } catch (e) {}
        if (ind) {
          ind.textContent = (savedText ? savedText + ' • ' : '') + 'Derived exercises: ' + String(derived)
        }
        return derived
      } catch (e) { return null }
    }

    // Duration and sets are independent; derived exercise count depends on both.
    updateEquipDisabled()
    try { recalcExerciseCount() } catch {}
    document.getElementById('setup-program-select')?.addEventListener('change', (ev) => {
      const val = (ev && ev.target && ev.target.value) ? ev.target.value : (document.getElementById('setup-program-select')?.value || '')
      updateEquipDisabled(val)
      try { recalcExerciseCount() } catch (e) {}
      const stSel2 = document.getElementById('setup-session-select')
      if (!String(val).toLowerCase().includes('strength') && stSel2) stSel2.value = 'Full Body'
    })
    // Wire duration and sets inputs to recalc immediately
    document.getElementById('setup-duration-select')?.addEventListener('change', () => {
      try { recalcExerciseCount() } catch (e) {}
    })
    document.getElementById('setup-sets')?.addEventListener('input', () => {
      try { recalcExerciseCount() } catch (e) {}
    })
    // Update saved indicator from temporary setup store
    try {
      const ind = document.getElementById('setup-saved-indicator')
      const stored = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null')
      if (ind) {
        if (stored && stored.savedAt) ind.textContent = 'Saved: ' + (new Date(stored.savedAt).toLocaleString())
        else ind.textContent = ''
      }
    } catch (e) { /* ignore */ }
  } catch (e) { statusEl.textContent = 'Ready (local)'; console.warn('setup populate local failed', e) }
})

// Manual save handled by local-only override further down; network save removed.

// Save alias
// alias UI/handlers removed (pseudo removed)

// alias edit removed

// Old generate button removed in favor of Save & Generate → Workout


// Manual save only; equipment changes are persisted when clicking Save

// Defensive: block clicks on equipment when HIIT/Tabata is selected
document.getElementById('setup-equip-group')?.addEventListener('click', (ev) => {
  const program = String(document.getElementById('setup-program-select')?.value || '').toLowerCase()
  const isNonStrength = !program.includes('strength')
  if (!isNonStrength) return
  const t = ev.target
  if (t && t.tagName === 'INPUT' && t.type === 'checkbox') {
    try { t.checked = false } catch {}
    ev.preventDefault()
    ev.stopPropagation()
    return false
  }
}, true)

// Inline nav used; no sidebar/hamburger behavior required

document.getElementById('nav-workouts')?.addEventListener('click', () => {
  show('workouts')
  // Do not auto-generate on nav — user can regenerate explicitly
})

// Wire regenerate button to reuse existing local generator logic
document.getElementById('btn-regenerate-workout')?.addEventListener('click', () => {
  ;(async () => {
    try {
      // Always regenerate the whole structure and then reload the appropriate view.
      try { window.homeworkoutsDetailId = null } catch {}
      try { window.homeworkoutsHiitCurrentId = null } catch {}

      // IMPORTANT: Regenerate must use the *current* Workout Setup selections.
      // Save writes local-only setup; without syncing here, Regenerate can fall back
      // to stale/default settings and appear to bypass the user's selections.
      const pgSel = document.getElementById('setup-program-select')
      const stSel = document.getElementById('setup-session-select')
      const dSel = document.getElementById('setup-duration-select')
      const setsEl = document.getElementById('setup-sets')
      const group = document.getElementById('setup-equip-group')
      const stored = (() => { try { return JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null') } catch { return null } })()

      const programRaw = (pgSel && pgSel.value) ? pgSel.value : ((stored && stored.programType) ? stored.programType : getSettingString('program_type', 'Strength'))
      const selectedTypeRaw = (stSel && stSel.value) ? stSel.value : ((stored && stored.selectedType) ? stored.selectedType : getSettingString('selectedType', 'Full Body'))
      const durationRaw = (dSel && dSel.value) ? dSel.value : ((stored && stored.durationMin != null) ? stored.durationMin : (localStorage.getItem('homeworkouts_duration_min') || localStorage.getItem('homeworkouts_hiit_minutes') || '30'))
      const setsRaw = (setsEl && setsEl.value) ? setsEl.value : ((stored && stored.setCount != null) ? stored.setCount : (localStorage.getItem('homeworkouts_sets') || '3'))

      const program = String(programRaw || 'Strength').trim()
      const selectedType = String(selectedTypeRaw || 'Full Body').trim()
      const duration = parseInt(String(durationRaw || '30'), 10)
      const sets = parseInt(String(setsRaw || '3'), 10)

      const isPilates = program.toLowerCase().includes('pilates') || selectedType.toLowerCase().includes('pilates')
      const programLower = program.toLowerCase()

      // Apps Script parity: equipment is ignored outside Strength.
      // Pilates behaves like Strength rendering and is effectively bodyweight.
      let equipment = ''
      if (isPilates) {
        equipment = 'Bodyweight'
      } else if (programLower.includes('strength')) {
        const vals = Array.from(group?.querySelectorAll('input[type="checkbox"]') || []).filter(cb => cb.checked).map(cb => cb.value)
        equipment = vals.join(', ')
      } else {
        equipment = 'Bodyweight'
      }

      const setupObj = {
        programType: program,
        selectedType,
        setCount: (isNaN(sets) ? 3 : sets),
        durationMin: (isNaN(duration) ? 30 : duration),
        equipment,
        savedAt: new Date().toISOString()
      }

      // Persist for both generator and fallback/local backend.
      try { localStorage.setItem('homeworkouts_setup_temp', JSON.stringify(setupObj)) } catch {}
      try { setSetting('program_type', setupObj.programType) } catch {}
      try { localStorage.setItem('homeworkouts_duration_min', String(setupObj.durationMin)) } catch {}
      try { localStorage.setItem('homeworkouts_sets', String(setupObj.setCount)) } catch {}
      try { setSetting('duration_min', setupObj.durationMin) } catch (e) {}
      try { setSetting('sets', setupObj.setCount) } catch (e) {}
      try { setSetting('equipment', setupObj.equipment) } catch {}
      const email = document.getElementById('user-email')?.textContent || ''

      // Prefer the backend/fallback generators so IDs/round structure match the app.
      try {
        const { setUserSetup, setUserEquipment, triggerRegenerate } = await import('./backend.js')
        try { await setUserSetup(email, { programType: setupObj.programType, selectedType: setupObj.selectedType, setCount: setupObj.setCount, durationMin: setupObj.durationMin }) } catch (e) {}
        try { await setUserEquipment(email, setupObj.equipment) } catch (e) {}
        await triggerRegenerate(email)
      } catch (e) {
        console.warn('triggerRegenerate failed; falling back to local generator', e)
      }

      // Pilates always renders in Strength mode.
      if (isPilates) {
        if (window.homeworkoutsLoadStrength) return window.homeworkoutsLoadStrength()
      } else if (programLower.includes('hiit') || programLower.includes('tabata')) {
        if (window.homeworkoutsLoadHiit) return window.homeworkoutsLoadHiit()
      } else {
        if (window.homeworkoutsLoadStrength) return window.homeworkoutsLoadStrength()
      }

      // Fallback: regenerate locally if loaders are not available
      try { document.getElementById('btn-generate-local')?.click() } catch {}
    } catch (e) {
      console.warn('regenerate failed', e)
      try { document.getElementById('btn-generate-local')?.click() } catch {}
    }
  })()
})

document.getElementById('nav-timer')?.addEventListener('click', () => {
  show('timer')
})

// Dev: client-side generator integration for local testing
document.getElementById('btn-generate-local')?.addEventListener('click', async () => {
  // Local safe status helper to avoid runtime errors when a stale cookie of code
  // defines or omits `window.setStatus` (defensive, helps during SW cache churn)
  const safeSetStatus = (msg) => {
    try {
      if (typeof window !== 'undefined' && typeof window.setStatus === 'function') return window.setStatus(msg)
      const el = document.getElementById('status')
      if (el) el.textContent = msg || ''
      else console.log('status:', msg)
    } catch (e) { console.log('status fallback:', msg) }
  }
  safeSetStatus('Loading exercises…')
  try {
    let j
    // Try network first; on failure (offline, CORS, etc.) fall back to the cache
    try {
      const url = resolveFetchUrl('/Exercices.json')
      const res = await fetch(url, { cache: 'no-store' })
      if (res && res.ok) {
        j = await res.json()
      } else {
        throw new Error('Network fetch failed')
      }
    } catch (netErr) {
      console.warn('Network fetch failed, trying cache:', netErr)
      const cached = await getCachedResponse('/Exercices.json')
      if (cached) {
        j = await cached.json()
      } else {
        console.warn('No cached Exercices.json found in any cache')
        throw netErr
      }
    }

    const genMod = await import('./generator.js')
    genMod.loadExercises(j)
    try { const dbg = document.getElementById('status'); if (dbg) dbg.textContent = `Loaded exercises: ${Array.isArray(j)?j.length:0}` } catch {}
    // Use saved setup if present
    let stored = null
    try { stored = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null') } catch {}
    const use = stored || {
      programType: getSettingString('program_type', 'Strength'),
      selectedType: (document.getElementById('setup-session-select')?.value || getSettingString('selectedType', 'Full Body')),
      setCount: parseInt(localStorage.getItem('homeworkouts_sets') || '3',10) || 3,
      equipment: getSettingString('equipment', '')
    }
    // Use local setup defaults (sets/equipment) when available
    let mapped = []
    const isPilates = String(use.programType || '').toLowerCase().includes('pilates') || String(use.selectedType || '').toLowerCase().includes('pilates')
    const isHiit = String(use.programType).toLowerCase().includes('hiit') && !isPilates
    if (isHiit) {
      // Follow Apps Script logic: unique exercises = clamp(1, min(5, durationMinutes))
      const durationMin = (use.durationMin != null) ? Number(use.durationMin) : Number(localStorage.getItem('homeworkouts_duration_min') || 0)
      const uniqueCount = (durationMin && !isNaN(durationMin) && durationMin > 0) ? Math.max(1, Math.min(5, Math.floor(durationMin))) : (use.setCount || getSettingInt('sets', 8) || 8)
      const emailForIds = localStorage.getItem('homeworkouts_user_email') || document.getElementById('user-email')?.textContent || ''
      const workS = Number(localStorage.getItem('homeworkouts_hiit_work_s') || getSettingInt('hiit_work_s', 40) || 40)
      const restS = Number(localStorage.getItem('homeworkouts_hiit_rest_s') || getSettingInt('hiit_rest_s', 20) || 20)
      const totalSeconds = Math.max(1, Number(durationMin || 0)) * 60
      const cycleSeconds = Math.max(1, (Number(workS) + Number(restS)))
      const intervalCount = Math.max(1, Math.floor(totalSeconds / cycleSeconds))

      const uniques = await Promise.resolve(genMod.generateWorkout({ count: uniqueCount }))
      const pool = (Array.isArray(uniques) && uniques.length) ? uniques : [{ id: '', name: 'Exercise', exercise: 'Exercise', muscles: '' }]
      // Expand to intervals by cycling uniques
      const sample = []
      for (let order = 1; order <= intervalCount; order++) {
        const slotIdx = (order - 1) % pool.length
        const ex = pool[slotIdx]
        sample.push({
          id: `${emailForIds || 'local'}_HIIT_${order}`,
          glideId: ex.id || '',
          order: order,
          round: Math.floor((order - 1) / pool.length) + 1,
          slot_in_round: ((order - 1) % pool.length) + 1,
          exercise: ex.name || ex.exercise || '',
          interval_label: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''),
          work_s: (ex.value && ex.value.seconds) ? ex.value.seconds : workS,
          rest_s: restS,
          video_url: ex.video || ex.video_url || ''
        })
      }
      mapped = sample
    } else {
      const w = genMod.generateWorkout({ count: use.setCount, constraints: { equipment: use.equipment || null } })
      mapped = w.map(it => ({
        id: it.id || ('gen_' + Math.random().toString(36).slice(2,9)),
        exercise: it.name || it.exercise || '',
        muscles: Array.isArray(it.muscles) ? it.muscles.join(', ') : (it.muscles || ''),
        set1_reps: it.value && it.value.reps ? it.value.reps : '',
        set1_load: it.value && it.value.load ? it.value.load : '',
        set2_reps: '', set2_load: '', set3_reps: '', set3_load: '',
        is_done: false,
        video_url: it.video || ''
      }))
    }
    // Use the app's renderer to display generated workouts with full interactions
    try { const dbg = document.getElementById('status'); if (dbg) dbg.textContent = `Loaded exercises: ${Array.isArray(j)?j.length:0} • Generated: ${mapped.length}` } catch {}
    if (isHiit) {
      window.homeworkoutsDetailId = null
      const ok = await ensureHiitRendererReady()
      if (ok && window.renderHiitRounds) {
        window.renderHiitRounds(mapped)
        safeSetStatus('Generated ' + mapped.length + ' HIIT intervals')
      } else {
        safeSetStatus('HIIT view not ready — please retry')
      }
    } else if (window.renderWorkoutsFromGenerated) {
      window.homeworkoutsDetailId = null // ensure list/card mode
      window.renderWorkoutsFromGenerated(mapped)
      try {
        const info = genMod.lastGenerateInfo && genMod.lastGenerateInfo()
        if (info && info.fallback) safeSetStatus('Generated ' + mapped.length + ' exercises — fallback used (no exact equipment matches)')
        else safeSetStatus('Generated ' + mapped.length + ' exercises')
      } catch (e) { safeSetStatus('Generated ' + mapped.length + ' exercises') }
    } else if (window.renderWorkouts) {
      window.homeworkoutsDetailId = null // ensure list/card mode
      window.renderWorkouts(mapped)
      try {
        const info = genMod.lastGenerateInfo && genMod.lastGenerateInfo()
        if (info && info.fallback) safeSetStatus('Generated ' + mapped.length + ' exercises — fallback used (no exact equipment matches)')
        else safeSetStatus('Generated ' + mapped.length + ' exercises')
      } catch (e) { safeSetStatus('Generated ' + mapped.length + ' exercises') }
    } else {
      // Fallback: simple render
      const list = document.getElementById('workout-list')
      list.innerHTML = `<div class="muted" style="margin-bottom:0.5rem">Exercises generated: ${mapped.length}</div>` +
        mapped.map((it, idx) => `
          <div class="card">
            <div class="row">
              <div class="col"><strong>${escapeHtml(it.exercise)}</strong><div class="muted">${escapeHtml(it.muscles)}</div></div>
            </div>
          </div>
        `).join('')
      try {
        const info = genMod.lastGenerateInfo && genMod.lastGenerateInfo()
        if (info && info.fallback) safeSetStatus('Generated ' + mapped.length + ' exercises — fallback used (no exact equipment matches)')
        else safeSetStatus('Generated ' + mapped.length + ' exercises')
      } catch (e) { safeSetStatus('Generated ' + mapped.length + ' exercises') }
    }
  } catch (e) {
    console.error(e)
    safeSetStatus('Generate failed')
  }
})

document.getElementById('nav-fatigue')?.addEventListener('click', async () => {
  show('fatigue')
  const statusEl = document.getElementById('fatigue-status')
  statusEl.textContent = 'Loading…'
  try {
    const email = localStorage.getItem('homeworkouts_user_email') || document.getElementById('user-email')?.textContent || ''
    const rows = loadHistory(email)
    const fatigueMap = computeMuscleFatigueMap(rows, new Date())
    const muscles = getDashboardMuscleList(Object.keys(fatigueMap || {}))
    const grid = document.getElementById('fatigue-grid')
    const top = muscles.slice(0, 12)
    grid.innerHTML = top.length ? top.map((name) => {
      const val = Math.min(100, Math.max(0, Math.round(Number(fatigueMap?.[name] || 0))))
      const cls = classifyFatigue(val)
      return `<div class="card"><div class="row"><div class="col"><strong>${escapeHtml(name)}</strong><div class="muted">${escapeHtml(cls.label)}</div></div><div class="col"><div class="bar"><div class="bar-fill" style="width:${val}%"></div></div><span class="muted">${val}%</span></div></div></div>`
    }).join('') : `<div class="card"><div class="muted">No workout history yet. Complete a workout to see fatigue levels.</div></div>`

    // Render calendar for the current month (blue layout)
    try { fatigueCalendarMonthDelta = 0 } catch {}
    try { renderFatigueCalendar({ now: new Date(), historyRows: rows, monthDelta: fatigueCalendarMonthDelta }) } catch (e) { console.warn('calendar render failed', e) }

    // Default to Levels view
    try {
      document.getElementById('fatigue-grid')?.classList.remove('hidden')
      document.getElementById('fatigue-calendar')?.classList.add('hidden')
      document.getElementById('btn-fatigue-levels')?.classList.add('active')
      document.getElementById('btn-fatigue-calendar')?.classList.remove('active')
    } catch {}
    statusEl.textContent = 'Ready'
  } catch (e) {
    console.error('Fatigue view failed', e)
    statusEl.textContent = 'Failed to load'
  }
})

// Fatigue view toggle buttons (top bar)
try {
  document.getElementById('btn-fatigue-levels')?.addEventListener('click', () => {
    try {
      document.getElementById('fatigue-grid')?.classList.remove('hidden')
      document.getElementById('fatigue-calendar')?.classList.add('hidden')
      document.getElementById('btn-fatigue-levels')?.classList.add('active')
      document.getElementById('btn-fatigue-calendar')?.classList.remove('active')
    } catch {}
  })
  document.getElementById('btn-fatigue-calendar')?.addEventListener('click', () => {
    try {
      document.getElementById('fatigue-grid')?.classList.add('hidden')
      document.getElementById('fatigue-calendar')?.classList.remove('hidden')
      document.getElementById('btn-fatigue-calendar')?.classList.add('active')
      document.getElementById('btn-fatigue-levels')?.classList.remove('active')
    } catch {}
  })
} catch {}

// Workout mode toggles removed (mode buttons pruned)

// Settings UI removed from inline pages; settings remain manageable via admin-only bookmarklet or external admin route.

// Always open the Setup view on startup (ignore previous last view).
// Trigger the nav handler so the Setup populate logic (which wires UI rules)
// runs the same way as a user click — this ensures equipment disabling is set.
try {
  const nav = document.getElementById('nav-setup')
  if (nav && typeof nav.click === 'function') nav.click()
  else show('setup')
} catch {}

function readOverride(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

function toast(msg) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.classList.remove('hidden')
  t.classList.add('show')
  setTimeout(() => {
    t.classList.remove('show')
    t.classList.add('hidden')
  }, 1800)
}

function showLoading(msg) {
  const el = document.getElementById('loading')
  const tx = document.getElementById('loading-text')
  if (!el) return
  if (tx) tx.textContent = msg || 'Loading…'
  el.classList.remove('hidden')
}

function hideLoading() {
  const el = document.getElementById('loading')
  if (!el) return
  el.classList.add('hidden')
}

// Expose loading helpers globally for other modules
try {
  window.showLoading = showLoading
  window.hideLoading = hideLoading
} catch {}

// Timer controls: wire to global timer utilities exposed by auth.js
try {
  document.getElementById('btn-timer-start')?.addEventListener('click', () => {
    try {
      const secs = parseInt(document.getElementById('timer-seconds')?.value || '60', 10) || 60
      const tEl = document.getElementById('app-timer')
      // startCountdown is defined in auth.js and attached at runtime
      if (window.startCountdown) window.startCountdown(tEl, secs, () => { window.setStatus && window.setStatus('Timer complete') })
    } catch (e) { console.warn('start timer failed', e) }
  })
  document.getElementById('btn-timer-pause')?.addEventListener('click', () => { try { if (window.pauseTimer) window.pauseTimer() } catch (e) {} })
  document.getElementById('btn-timer-reset')?.addEventListener('click', () => { try { if (window.rewindTimer) window.rewindTimer(); const tEl = document.getElementById('app-timer'); if (tEl) { tEl.querySelector('.mm').textContent = '00'; tEl.querySelector('.ss').textContent = '00' } } catch (e) {} })
} catch (e) {}

// Override Setup Save to store locally and generate in PWA (no immediate backend writes)
try {
  const btn = document.getElementById('btn-save')
  if (btn) {
    btn.onclick = async (ev) => {
      ev && ev.preventDefault && ev.preventDefault()
      const statusEl = document.getElementById('setup-status')
      const program = document.getElementById('setup-program-select')?.value || 'Strength'
      const selectedType = document.getElementById('setup-session-select')?.value || 'Full Body'
      let duration = parseInt(document.getElementById('setup-duration-select')?.value || '30', 10)
      const sets = parseInt(document.getElementById('setup-sets')?.value || '3', 10)
      // Strength: duration and sets are independent inputs.
      // Exercise count depends on both (see generator logic).
      const group = document.getElementById('setup-equip-group')
      const vals = Array.from(group?.querySelectorAll('input[type="checkbox"]') || []).filter(cb => cb.checked).map(cb => cb.value)
      // Preserve selected equipment regardless of program type so generator can use it
      const equipment = String(program || '').toLowerCase().includes('pilates') ? 'Bodyweight' : vals.join(', ')
      statusEl.textContent = 'Saved locally — generating…'
      showLoading('Generating…')
      try {
        const setupObj = { programType: program, selectedType, setCount: sets, durationMin: duration, equipment, savedAt: new Date().toISOString() }
        try { localStorage.setItem('homeworkouts_setup_temp', JSON.stringify(setupObj)) } catch {}
        try { localStorage.setItem('homeworkouts_setup_saved_at', setupObj.savedAt) } catch {}
        try { const ind = document.getElementById('setup-saved-indicator'); if (ind) ind.textContent = 'Saved: ' + (new Date(setupObj.savedAt)).toLocaleString() } catch (e) {}
        // Keep legacy keys for compatibility
        try { setSetting('program_type', program) } catch {}
        try { localStorage.setItem('homeworkouts_duration_min', String(duration)) } catch {}
        try { localStorage.setItem('homeworkouts_sets', String(sets)) } catch {}
        try { setSetting('duration_min', duration) } catch (e) {}
        try { setSetting('sets', sets) } catch (e) {}
        try { setSetting('equipment', equipment) } catch {}
        // enqueue profile update locally for later flush (store the same object)
        try { window.enqueueProfile(setupObj) } catch (e) { console.warn('enqueueProfile failed', e) }
        // generate using cached Exercices.json
        let j
        try {
          const url = resolveFetchUrl('/Exercices.json')
          const res = await fetch(url, { cache: 'no-store' })
          if (res && res.ok) j = await res.json()
          else throw new Error('fetch failed')
        } catch (e) {
          const cached = await getCachedResponse('/Exercices.json')
          if (cached) j = await cached.json()
          else throw e
        }
        const genMod = await import('./generator.js')
        genMod.loadExercises(j)
        // Load setup from local temp store to drive generation
        let stored = null
        try { stored = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null') } catch {}
        const use = stored || { programType: program, selectedType, setCount: sets, durationMin: duration, equipment }

        // Fatigue (7-day rolling history) — used for suggestion + display.
        const emailForFatigue = localStorage.getItem('homeworkouts_user_email') || document.getElementById('user-email')?.textContent || ''
        const fatigueRows = loadHistory(emailForFatigue)
        const fatigueMap = computeMuscleFatigueMap(fatigueRows, new Date())
        let effectiveSelectedType = use.selectedType || selectedType
        let fatigueSuggestionNote = ''

        const isPilates = String(use.programType || '').toLowerCase().includes('pilates') || String(effectiveSelectedType || '').toLowerCase().includes('pilates')
        const isHiit = String(use.programType || '').toLowerCase().includes('hiit') && !isPilates

        try {
          const isStrength = (!isHiit && !isPilates)
          if (isStrength) {
      // If the user selected a session type (Upper/Lower/Full Body), translate it to
      // a muscle candidate set and suggest the freshest focus.
      let candidates = []
      try {
        if (genMod && typeof genMod.parseFocusMusclesFromType === 'function') {
          candidates = genMod.parseFocusMusclesFromType(effectiveSelectedType)
        }
      } catch {}
      if (!Array.isArray(candidates) || !candidates.length) {
        candidates = [normalizeMuscleKeyTitle(effectiveSelectedType)]
      }
      const info = pickSuggestedMuscle(candidates, fatigueMap)
      // When the requested group is fatigued, focus generation on a fresher muscle.
      if (info.isRequestedFatigued && info.suggested && info.suggested !== normalizeMuscleKeyTitle(effectiveSelectedType)) {
        effectiveSelectedType = info.suggested
        fatigueSuggestionNote = `Selection fatigued → suggestion: ${info.suggested} (${Math.round(info.suggestedFatigue)}%). ` +
          `Use “Regenerate workout” to ignore.`
      }
          }
        } catch {}
        if (isHiit) {
          // HIIT: match Apps Script (uniqueCount = clamp(1..5, minutes)) and cycle to intervals.
          const durationMin = (use.durationMin != null) ? Number(use.durationMin) : Number(localStorage.getItem('homeworkouts_duration_min') || 0)
          const uniqueCount = (durationMin && !isNaN(durationMin) && durationMin > 0) ? Math.max(1, Math.min(5, Math.floor(durationMin))) : 5
          const workS = Number(localStorage.getItem('homeworkouts_hiit_work_s') || getSettingInt('hiit_work_s', 40) || 40)
          const restS = Number(localStorage.getItem('homeworkouts_hiit_rest_s') || getSettingInt('hiit_rest_s', 20) || 20)
          const totalSeconds = Math.max(1, Number(durationMin || 0)) * 60
          const cycleSeconds = Math.max(1, (Number(workS) + Number(restS)))
          const intervalCount = Math.max(1, Math.floor(totalSeconds / cycleSeconds))

          const emailForIds = localStorage.getItem('homeworkouts_user_email') || document.getElementById('user-email')?.textContent || ''

          const allowJumps = String(localStorage.getItem('homeworkouts_hiit_allow_jumps') || getSettingString('hiit_allow_jumps', '') || '').toLowerCase()
          const allow = (allowJumps === 'true' || allowJumps === '1' || allowJumps === 'yes' || allowJumps === 'y')

          // Pick unique exercises using generator's HIIT logic (discipline + allowJumps)
          const uniques = await Promise.resolve(genMod.generateWorkout({ count: uniqueCount, constraints: { programType: 'HIIT', durationMin, allowJumps: allow } }))
          const pool = (Array.isArray(uniques) && uniques.length) ? uniques : [{ id: '', name: 'Exercise', exercise: 'Exercise', muscles: '' }]
          const sample = []
          for (let i = 0; i < intervalCount; i++) {
            const ex = pool[i % pool.length]
            sample.push({
              id: `${emailForIds || 'local'}_HIIT_${i + 1}`,
              glideId: ex.id || '',
              order: i + 1,
              round: Math.floor(i / pool.length) + 1,
              slot_in_round: (i % pool.length) + 1,
              exercise: ex.name || ex.exercise || '',
              interval_label: Array.isArray(ex.muscles) ? ex.muscles.join(', ') : (ex.muscles || ''),
              work_s: (ex.value && ex.value.seconds) ? ex.value.seconds : workS,
              rest_s: restS,
              video_url: ex.video || ex.video_url || ''
            })
          }
          window.homeworkoutsDetailId = null
          const ok = await ensureHiitRendererReady()
          if (ok && window.renderHiitRounds) {
            window.renderHiitRounds(sample)
          } else {
            statusEl.textContent = 'HIIT view not ready — please retry (or press Regenerate workout)'
          }
        } else {
          // Strength: pass all criteria to generator; keep the existing expandable card layout.
          const w = genMod.generateWorkout({ constraints: { programType: (isPilates ? 'Pilates' : 'Strength'), selectedType: effectiveSelectedType, durationMin: use.durationMin, setCount: use.setCount, equipment: (isPilates ? 'Bodyweight' : (use.equipment || null)) } })
          if (window.renderWorkoutsFromGenerated) {
            window.homeworkoutsDetailId = null
            window.renderWorkoutsFromGenerated(w)
          } else if (window.renderWorkouts) {
            window.homeworkoutsDetailId = null
            window.renderWorkouts(w)
          }
          try {
            const info = genMod.lastGenerateInfo && genMod.lastGenerateInfo()
            if (info && info.fallback) statusEl.textContent = 'Generated locally. (Fallback used — no exact equipment matches)'
          } catch (e) {}
        }

        // Required JSON block returned after generation.
        try {
          const block = makeHistorySummaryBlock(effectiveSelectedType, fatigueMap, new Date())
          localStorage.setItem('homeworkouts_last_history_block_generated', JSON.stringify(block))
          statusEl.textContent = 'Generated locally. Press "Workout complete" to save to Sheets.' +
            (fatigueSuggestionNote ? (' ' + fatigueSuggestionNote) : '') +
            ' Log: ' + JSON.stringify(block)
        } catch (e) {
          statusEl.textContent = 'Generated locally. Press "Workout complete" to save to Sheets.' + (fatigueSuggestionNote ? (' ' + fatigueSuggestionNote) : '')
        }
        // Workout mode buttons pruned; no toggle UI.
        // 2s splash after Strength generation (per UX request)
        try {
          if (!isHiit) await showFatigueSplashFor2s()
        } catch {}
        show('workouts')

      } catch (e) { console.error('Local generate failed', e); statusEl.textContent = 'Generate failed — see console.' }
      try { window.hideLoading && window.hideLoading() } catch {}
    }
  }
} catch (e) {}

// Ensure complete modal exists and provide a helper to show it and flush pending items
try {
  function ensureCompleteModal() {
    if (document.getElementById('complete-modal')) return
    const html = `
      <div id="complete-modal" class="hidden">
        <div class="card">
          <div id="lottie-wrap" style="width:360px; height:360px; margin:0 auto"></div>
          <div class="progress" id="complete-progress">Preparing to sync…</div>
          <div class="progress-bar"><div class="fill" id="complete-fill"></div></div>
          <button id="complete-close" class="close hidden">Close</button>
        </div>
      </div>`
    document.body.insertAdjacentHTML('beforeend', html)
    const close = document.getElementById('complete-close')
    if (close) close.addEventListener('click', () => { try { document.getElementById('complete-modal').classList.add('hidden'); window._completeAnim && window._completeAnim.stop() } catch {} })
  }

  window.showCompleteAndFlush = async function() {
    try {
      ensureCompleteModal()
      const modal = document.getElementById('complete-modal')
      const wrap = document.getElementById('lottie-wrap')
      const txt = document.getElementById('complete-progress')
      const fill = document.getElementById('complete-fill')
      const close = document.getElementById('complete-close')
      if (!modal || !wrap || !txt || !fill) return
      modal.classList.remove('hidden')
      txt.textContent = 'Starting…'
      fill.style.width = '0%'
      close.classList.add('hidden')

      // Never trap the user behind this overlay.
      // Reveal Close shortly after start so they can keep using the app.
      const revealCloseTimer = setTimeout(() => {
        try {
          document.getElementById('complete-close')?.classList.remove('hidden')
          const t = document.getElementById('complete-progress')
          if (t && String(t.textContent || '').includes('Starting')) {
            t.textContent = 'Syncing… (you can close this and keep using the app)'
          }
        } catch {}
      }, 1500)

      const autoClose = (delayMs = 1200) => {
        setTimeout(() => {
          try {
            document.getElementById('complete-modal')?.classList.add('hidden')
            window._completeAnim && window._completeAnim.stop()
          } catch {}
        }, delayMs)
      }

      // Offline: we still show a success splash, but do not attempt network sync.
      try {
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
          try { clearTimeout(revealCloseTimer) } catch {}
          txt.textContent = 'Saved locally — queued for sync (offline)'
          fill.style.width = '100%'
          try { document.getElementById('complete-close')?.classList.remove('hidden') } catch {}
          autoClose(1200)
          return
        }
      } catch {}

      try { window._completeAnim && window._completeAnim.destroy() } catch {}
      try {
        if (window.lottie && window.COMPLETE_LOTTIE_URL) {
          window._completeAnim = window.lottie.loadAnimation({ container: wrap, renderer: 'svg', loop: true, autoplay: true, path: window.COMPLETE_LOTTIE_URL })
        }
      } catch (e) { console.warn('lottie play failed', e) }

      try {
        const res = await window.flushAllPending({ onProgress: (info) => {
          try {
            if (info.step === 'profile') {
              if (info.status === 'started') { txt.textContent = 'Syncing profile…' }
              else if (info.status === 'done') { txt.textContent = 'Profile synced' }
              else if (info.status === 'error') { txt.textContent = 'Profile error: ' + (info.error || '') }
            } else if (info.step === 'batches') {
              if (info.status === 'started') { txt.textContent = 'Syncing workouts…' }
              else if (info.status === 'in-progress') { txt.textContent = `Syncing batch ${info.index} / ${info.total}`; fill.style.width = String(Math.round((info.index / info.total) * 100)) + '%' }
              else if (info.status === 'item-done') { txt.textContent = `Batches progress: ${info.index}/${info.total}`; fill.style.width = String(Math.round((info.index / info.total) * 100)) + '%' }
              else if (info.status === 'done') { txt.textContent = 'All batches synced' }
              else if (info.status === 'error') { txt.textContent = 'Batch error: ' + (info.error || '') }
            }
          } catch (e) { console.warn('progress update failed', e) }
        }})
        // Finalize UI and play celebratory animation on full success
        try {
          try { clearTimeout(revealCloseTimer) } catch {}
          fill.style.width = '100%'
          if (res && res.batches && (res.batches.failed || 0) === 0) {
            txt.textContent = 'All synced — 🎉'
            try { window._completeAnim && window._completeAnim.destroy() } catch {}
            try { wrap.style.width = '480px'; wrap.style.height = '480px' } catch {}
            try {
              if (window.lottie && window.COMPLETE_LOTTIE_URL) {
                window._completeAnim = window.lottie.loadAnimation({ container: wrap, renderer: 'svg', loop: false, autoplay: true, path: window.COMPLETE_LOTTIE_URL })
              }
            } catch (e) { console.warn('final lottie failed', e) }
            // Reveal close immediately for happy path
            try { document.getElementById('complete-close')?.classList.remove('hidden') } catch {}
            // Auto-close after a short pause.
            autoClose(1400)
          } else {
            txt.textContent = 'Sync complete — success: ' + (res.batches.success || 0) + ', failed: ' + (res.batches.failed || 0)
            // Keep playing looped animation; reveal close after short delay
            setTimeout(() => { try { document.getElementById('complete-close')?.classList.remove('hidden') } catch {} }, 500)
            autoClose(1800)
          }
        } catch (e) { console.warn('finalize UI failed', e) }
      } catch (e) {
        try { clearTimeout(revealCloseTimer) } catch {}
        txt.textContent = 'Sync failed: ' + (e && e.message ? e.message : String(e))
        try { document.getElementById('complete-close')?.classList.remove('hidden') } catch {}
      } finally {
        try { window._completeAnim && window._completeAnim.play() } catch {}
      }

    } catch (e) { console.error('showCompleteAndFlush failed', e) }
  }
} catch (e) { console.warn('complete modal init failed', e) }

