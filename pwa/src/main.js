import './style.css'
import { initAuth } from './auth.js'

const root = document.querySelector('#app')

root.innerHTML = `
  <header>
    <h1>Fitbook</h1>
    <nav>
      <button id="nav-workouts">Workouts</button>
      <button id="nav-hiit">HIIT Timer</button>
      <button id="nav-settings">Settings</button>
    </nav>
    <div id="user-info">
      <span id="user-email">Not signed in</span>
      <button id="btn-signin">Sign in</button>
      <button id="btn-signout" class="hidden">Sign out</button>
    </div>
  </header>

  <main>
    <section id="view-workouts">
      <h2>Workouts (Glide_Wod)</h2>
      <div id="workout-list" class="cards"></div>
      <div id="status" class="status"></div>
    </section>

    <section id="view-hiit" class="hidden">
      <h2>HIIT Timer</h2>
      <iframe id="hiit-frame" title="HIIT Timer" style="width:100%;height:640px;border:0;border-radius:12px;background:#111827"></iframe>
      <div class="status" id="hiit-status"></div>
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
        </div>
      </div>
      <div class="status" id="settings-status"></div>
    </section>
  </main>
  <footer>
    <small>Fitbook PWA • Offline-ready</small>
  </footer>

  <div id="toast" class="toast hidden"></div>
`

initAuth()

function show(viewId) {
  const vW = document.getElementById('view-workouts')
  const vH = document.getElementById('view-hiit')
  const vS = document.getElementById('view-settings')
  if (!vW || !vH) return
  vW.classList.toggle('hidden', viewId !== 'workouts')
  vH.classList.toggle('hidden', viewId !== 'hiit')
  if (vS) vS.classList.toggle('hidden', viewId !== 'settings')
  try { localStorage.setItem('fitbook_last_view', viewId) } catch {}
}

document.getElementById('nav-workouts')?.addEventListener('click', () => show('workouts'))
document.getElementById('nav-hiit')?.addEventListener('click', () => {
  show('hiit')
  const email = document.getElementById('user-email')?.textContent || ''
  const frame = document.getElementById('hiit-frame')
  const base = readOverride('fitbook_exec_url') || 'https://script.google.com/macros/s/AKfycbyb6d6YBVgn1awJ7W/exec'
  if (frame) {
    const url = `${base}?page=timerhiit&email=${encodeURIComponent(email)}`
    frame.src = url
    document.getElementById('hiit-status').textContent = 'Loading timer…'
  }
})

document.getElementById('nav-settings')?.addEventListener('click', () => {
  show('settings')
  // Populate form from overrides or defaults
  document.getElementById('cfg-exec-url').value = readOverride('fitbook_exec_url') || 'https://script.google.com/macros/s/AKfycbyb6d6YBVgn1awJ7W/exec'
  document.getElementById('cfg-token').value = readOverride('fitbook_token') || 'TEMP_CREATE_SETS_TOKEN_20260101'
  document.getElementById('cfg-proxy').value = readOverride('fitbook_proxy_base') || 'https://snowy-union-763c.mathieuvalotaire.workers.dev/'
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
