import './style.css'
import { initAuth } from './auth.js'

const root = document.querySelector('#app')

root.innerHTML = `
  <header>
    <h1>HomeWorkouts</h1>
    <nav>
      <button id="nav-setup">Workout Setup</button>
      <button id="nav-workouts">Workout</button>
      <button id="nav-fatigue">Fatigue</button>
      <button id="nav-settings">Settings</button>
    </nav>
    <div id="user-info">
      <span id="user-email">Not signed in</span>
      <button id="btn-signin">Sign in</button>
      <button id="btn-signout" class="hidden">Sign out</button>
    </div>
  </header>
  <div id="alias-banner" class="alias-banner hidden">
    <span id="alias-text"></span>
    <button id="alias-edit" title="Edit alias">Edit</button>
  </div>

  <main>
    <section id="view-setup" class="hidden">
      <h2>Workout Setup</h2>
      <div id="setup-profile" class="cards"></div>
      <div class="card">
        <div class="row">
          <div class="col">
            <strong>Program</strong>
            <div class="muted">Strength or HIIT</div>
          </div>
          <div class="col">
            <select id="setup-program-select">
              <option value="Strength">Strength</option>
              <option value="HIIT">HIIT</option>
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
              ${[15,20,25,30,35,40,45,50,55,60].map(m=>`<option value="${m}">${m}</option>`).join('')}
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
            <input id="setup-sets" type="number" min="1" max="6" value="3" style="width:96px">
          </div>
        </div>
      </div>
      <div class="setup-actions">
        <button id="btn-save">Save</button>
      </div>
      <div class="status" id="setup-status"></div>
    </section>
    <section id="view-workouts">
      <h2>Workout</h2>
      <div class="set-actions" style="margin-bottom:0.5rem">
        <button id="btn-mode-strength">Strength</button>
        <button id="btn-mode-hiit">HIIT</button>
      </div>
      <div id="workout-list" class="cards"></div>
      <div id="status" class="status"></div>
    </section>

    <section id="view-fatigue" class="hidden">
      <h2>Fatigue</h2>
      <div id="fatigue-grid" class="cards"></div>
      <div class="status" id="fatigue-status"></div>
    </section>

    <section id="view-settings" class="hidden">
      <h2>Settings</h2>
      <div class="settings-grid">
        <label>
          <span>Backend Exec URL</span>
          <input id="cfg-exec-url" type="text" placeholder="https://script.google.com/macros/s/.../exec" />
        </label>
        <label>
          <span>Token</span>
          <input id="cfg-token" type="text" placeholder="TEMP_CREATE_SETS_TOKEN_..." />
        </label>
        <label>
          <span>Proxy Base (optional)</span>
          <input id="cfg-proxy" type="text" placeholder="https://your-worker.example.dev/" />
        </label>
        <div class="settings-actions">
          <button id="cfg-save">Save</button>
          <button id="cfg-reset">Reset to defaults</button>
          <button id="cfg-test">Test backend</button>
        </div>
      </div>
      <div class="status" id="settings-status"></div>
    </section>
  </main>
  <footer>
    <small>Fitbook PWA • Offline-ready</small>
  </footer>

  <div id="toast" class="toast hidden"></div>
  <div id="loading" class="loading hidden"><div class="spinner"></div><div id="loading-text" class="loading-text">Loading…</div></div>
`

initAuth()

function show(viewId) {
  const vW = document.getElementById('view-workouts')
  const vS = document.getElementById('view-setup')
  const vF = document.getElementById('view-fatigue')
  const vSet = document.getElementById('view-settings')
  if (!vW || !vS) return
  vW.classList.toggle('hidden', viewId !== 'workouts')
  if (vS) vS.classList.toggle('hidden', viewId !== 'setup')
  if (vF) vF.classList.toggle('hidden', viewId !== 'fatigue')
  if (vSet) vSet.classList.toggle('hidden', viewId !== 'settings')
  try { localStorage.setItem('fitbook_last_view', viewId) } catch {}
}

document.getElementById('nav-setup')?.addEventListener('click', async () => {
  show('setup')
  const email = document.getElementById('user-email')?.textContent || ''
  const statusEl = document.getElementById('setup-status')
  statusEl.textContent = 'Loading profile…'
  try {
    const { debugProfile } = await import('./backend.js')
    if (email) {
      const prof = await debugProfile(email)
      const box = document.getElementById('setup-profile')
      const p = prof || {}
      const aliasVal = p.alias || ''
      box.innerHTML = `
        <div class="card" id="profile-card">
          <div>Email: ${email}</div>
          <div class="alias-row ${aliasVal ? 'hidden' : ''}"><input id="setup-alias" type="text" placeholder="Pseudo (optional)" value="${aliasVal}"> <button id="setup-save-alias">Save Pseudo</button></div>
        </div>`
      // Preselect equipment checkboxes only for Strength; always clear for HIIT
      const group = document.getElementById('setup-equip-group')
      const pgSel = document.getElementById('setup-program-select')
      const currentProgram = String(pgSel?.value || '').toLowerCase()
      const isStrength = currentProgram.includes('strength')
      if (group) {
        if (isStrength && p.rawEquipText) {
          const vals = String(p.rawEquipText).split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(Boolean)
          group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = vals.includes(cb.value.toLowerCase())
          })
        } else {
          // Ensure clear state for non-Strength programs (HIIT/Yoga/Pilates)
          group.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false })
        }
      }
      // Program
      const pg = (p.programType || '')
      if (pgSel && pg) {
        const opts = Array.from(pgSel.options || [])
        const targetLower = String(pg).toLowerCase()
        const match = opts.find(o => String(o.value || '').toLowerCase() === targetLower)
        pgSel.value = match ? match.value : 'Strength'
      }
      // Disable equipment when Program != Strength
      function updateEquipDisabled() {
        const val = (document.getElementById('setup-program-select')?.value || '').toLowerCase()
        const shouldDisable = !val.includes('strength')
        const grp = document.getElementById('setup-equip-group')
        if (grp) {
          grp.classList.toggle('disabled', !!shouldDisable)
          grp.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            // Ensure clearing happens even if disabled styling is applied
            if (shouldDisable) cb.checked = false
            cb.disabled = !!shouldDisable
          })
          const card = grp.closest('.card')
          if (card) card.classList.toggle('disabled-card', !!shouldDisable)
        }
      }
      updateEquipDisabled()
      document.getElementById('setup-program-select')?.addEventListener('change', () => {
        updateEquipDisabled()
        const val = (document.getElementById('setup-program-select')?.value || '').toLowerCase()
        // Always enforce Full Body on non-Strength programs (UI only; save happens when clicking Save)
        const stSel2 = document.getElementById('setup-session-select')
        if (!val.includes('strength') && stSel2) stSel2.value = 'Full Body'
      })
      // Session type: always default to Full Body
      const stSel = document.getElementById('setup-session-select')
      if (stSel) stSel.value = 'Full Body'
      // Duration / sets
      const dur = (p.hiit && p.hiit.minutes) || null
      const dSel = document.getElementById('setup-duration-select')
      if (dSel && dur) dSel.value = String(dur)
      if (p.setCount) { const s = document.getElementById('setup-sets'); if (s) s.value = String(p.setCount) }
      // Alias banner
      const banner = document.getElementById('alias-banner')
      const text = document.getElementById('alias-text')
      if (banner && text) {
        if (aliasVal) { text.textContent = aliasVal; banner.classList.remove('hidden') } else { text.textContent = ''; banner.classList.add('hidden') }
      }
      statusEl.textContent = 'Ready'
    } else { statusEl.textContent = 'Sign in to load profile.' }
  } catch { statusEl.textContent = 'Failed to load profile.' }
})

// Manual save only; duration changes are applied when clicking Save

document.getElementById('btn-save')?.addEventListener('click', async () => {
  const email = document.getElementById('user-email')?.textContent || ''
  const statusEl = document.getElementById('setup-status')
  if (!email) { statusEl.textContent = 'Sign in first.'; return }
  const program = document.getElementById('setup-program-select')?.value || 'Strength'
  let session = document.getElementById('setup-session-select')?.value || 'Full Body'
  if (!String(program).toLowerCase().includes('strength')) {
    session = 'Full Body'
  }
  const duration = parseInt(document.getElementById('setup-duration-select')?.value || '30', 10)
  const sets = parseInt(document.getElementById('setup-sets')?.value || '3', 10)
  // Gather equipment (empty when not Strength)
  const group = document.getElementById('setup-equip-group')
  const vals = Array.from(group?.querySelectorAll('input[type="checkbox"]') || [])
    .filter(cb => cb.checked)
    .map(cb => cb.value)
  const equipment = String(program).toLowerCase().includes('strength') ? vals.join(', ') : ''
  statusEl.textContent = 'Saving setup…'
  // Show splash/loading immediately upon Save
  showLoading('Saving…')
  try {
    const { setUserSetup, setUserDuree, setUserDureePost, setUserEquipment, setUserAlias, generateHiit, triggerRegenerate } = await import('./backend.js')
    await setUserSetup(email, { programType: program, selectedType: session, setCount: sets, durationMin: duration })
    // Extra reliability: push Durée alone as a fallback
    try { await setUserDuree(email, duration) } catch {}
    await setUserEquipment(email, equipment)
    // Record email into profile (alias as email for now)
    try { await setUserAlias(email, email) } catch {}
    try { localStorage.setItem('fitbook_program_type', program) } catch {}
    try { if (String(program).toLowerCase().includes('hiit')) localStorage.setItem('fitbook_hiit_minutes', String(duration)) } catch {}
    // Trigger generation and navigate to Workout with overlay
    statusEl.textContent = 'Generating…'
    showLoading('Generating…')
    if (!String(program).toLowerCase().includes('strength')) {
      await generateHiit(email)
    } else {
      await triggerRegenerate(email)
      // Ensure DUREE persists for Strength after generation
      try { await setUserDureePost(email, duration) } catch {}
    }
    statusEl.textContent = 'Opening Workout…'
    show('workouts')
    // Load appropriate workout list
    try {
      if (window.autoLoadByProgram) {
        const r = window.autoLoadByProgram(email)
        if (r && typeof r.then === 'function') await r
      } else {
        const isStrength = String(program).toLowerCase().includes('strength')
        if (isStrength && window.fitbookLoadStrength) {
          const r2 = window.fitbookLoadStrength()
          if (r2 && typeof r2.then === 'function') await r2
        } else if (!isStrength && window.fitbookLoadHiit) {
          const r3 = window.fitbookLoadHiit()
          if (r3 && typeof r3.then === 'function') await r3
        }
      }
    } catch {}
    hideLoading()
  } catch {
    statusEl.textContent = 'Save/Generate failed.'
    hideLoading()
  }
})

// Save alias
document.getElementById('setup-save-alias')?.addEventListener('click', async () => {
  const email = document.getElementById('user-email')?.textContent || ''
  const statusEl = document.getElementById('setup-status')
  const alias = document.getElementById('setup-alias')?.value || ''
  if (!email) { statusEl.textContent = 'Sign in first.'; return }
  try {
    const { setUserAlias } = await import('./backend.js')
    const res = await setUserAlias(email, alias)
    statusEl.textContent = (res && res.status === 'ok') ? 'Alias saved.' : 'Alias save failed.'
    const banner = document.getElementById('alias-banner')
    const text = document.getElementById('alias-text')
    if (banner && text) {
      if (alias) { text.textContent = alias; banner.classList.remove('hidden') } else { text.textContent = ''; banner.classList.add('hidden') }
    }
  } catch { statusEl.textContent = 'Save failed.' }
})

// Alias edit button in banner
document.getElementById('alias-edit')?.addEventListener('click', () => {
  show('setup')
  setTimeout(() => {
    const row = document.querySelector('#profile-card .alias-row')
    if (row) row.classList.remove('hidden')
    document.getElementById('setup-alias')?.focus()
  }, 50)
})

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

document.getElementById('nav-workouts')?.addEventListener('click', () => {
  show('workouts')
  const email = document.getElementById('user-email')?.textContent || ''
  if (email && window.fitbookLoadStrength && window.fitbookLoadHiit) {
    // Defer to program-based auto-load
    if (window.autoLoadByProgram) {
      try { window.autoLoadByProgram(email) } catch {}
    }
  }
})

document.getElementById('nav-fatigue')?.addEventListener('click', async () => {
  show('fatigue')
  const statusEl = document.getElementById('fatigue-status')
  statusEl.textContent = 'Loading…'
  try {
    const { dumpRecoveryDash } = await import('./backend.js')
    const j = await dumpRecoveryDash()
    const grid = document.getElementById('fatigue-grid')
    const rows = Array.isArray(j.rows) ? j.rows.slice(0, 8) : []
    grid.innerHTML = rows.map((r) => {
      const name = String(r[1] || '')
      const val = Math.min(100, Math.max(0, parseFloat(r[3] || 0)))
      return `<div class="card"><div class="row"><div class="col"><strong>${name}</strong></div><div class="col"><div class="bar"><div class="bar-fill" style="width:${val}%"></div></div><span class="muted">${val}%</span></div></div></div>`
    }).join('')
    statusEl.textContent = 'Ready'
  } catch { statusEl.textContent = 'Failed to load' }
})

// Workout mode toggles
document.getElementById('btn-mode-strength')?.addEventListener('click', () => {
  if (window.fitbookLoadStrength) window.fitbookLoadStrength()
})
document.getElementById('btn-mode-hiit')?.addEventListener('click', () => {
  if (window.fitbookLoadHiit) window.fitbookLoadHiit()
})

document.getElementById('nav-settings')?.addEventListener('click', () => {
  show('settings')
  // Populate form from overrides or defaults
  document.getElementById('cfg-exec-url').value = readOverride('fitbook_exec_url') || 'https://script.google.com/macros/s/AKfycbzVxQkTF811m77pO-4GlADGp_O-1KscdD23kaDFbZqYaD21-uR16LCSxeutJq8Ga3Mqfg/exec'
  document.getElementById('cfg-token').value = readOverride('fitbook_token') || 'TEMP_CREATE_SETS_TOKEN_20260101'
  document.getElementById('cfg-proxy').value = readOverride('fitbook_proxy_base') || 'https://dawn-dream-8eb0.mathieuvalotaire.workers.dev/'
})

document.getElementById('cfg-save')?.addEventListener('click', () => {
  const execUrl = document.getElementById('cfg-exec-url').value || ''
  const token = document.getElementById('cfg-token').value || ''
  const proxy = document.getElementById('cfg-proxy').value || ''
  try {
    localStorage.setItem('fitbook_exec_url', execUrl)
    localStorage.setItem('fitbook_token', token)
    localStorage.setItem('fitbook_proxy_base', proxy)
    toast('Settings saved')
    document.getElementById('settings-status').textContent = 'Saved.'
  } catch { toast('Failed to save settings') }
})

document.getElementById('cfg-reset')?.addEventListener('click', () => {
  try {
    localStorage.removeItem('fitbook_exec_url')
    localStorage.removeItem('fitbook_token')
    localStorage.removeItem('fitbook_proxy_base')
    toast('Settings reset to defaults')
    document.getElementById('settings-status').textContent = 'Reset to defaults.'
  } catch {}
})

// Test backend connectivity via proxy using current or remembered email
import { testBackend } from './backend.js'
document.getElementById('cfg-test')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('settings-status')
  const emailText = document.getElementById('user-email')?.textContent || ''
  const remembered = readOverride('fitbook_user_email')
  const email = (emailText && emailText.includes('@')) ? emailText : (remembered || '')
  statusEl.textContent = 'Testing…'
  try {
    const res = await testBackend(email)
    if (res.ok) {
      statusEl.textContent = `OK (${res.status}). Preview: ${res.preview}`
      toast('Backend OK')
    } else {
      statusEl.textContent = `Error: ${res.error || res.status}`
      toast('Backend error')
    }
  } catch (e) {
    statusEl.textContent = 'Test failed.'
    toast('Test failed')
  }
})

// Restore last view on load
try {
  const last = localStorage.getItem('fitbook_last_view')
  if (last) show(last)
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
