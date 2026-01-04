import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { FITBOOK_CONFIG } from './config.js'
import { getGlideWodSummary, replaceGlideExercise } from './backend.js'

let app, auth

function setStatus(msg) {
  const el = document.getElementById('status')
  if (el) el.textContent = msg || ''
}

function renderUser(user) {
  const emailEl = document.getElementById('user-email')
  const btnIn = document.getElementById('btn-signin')
  const btnOut = document.getElementById('btn-signout')
  if (!emailEl || !btnIn || !btnOut) return
  if (user && user.email) {
    emailEl.textContent = user.email
    btnIn.classList.add('hidden')
    btnOut.classList.remove('hidden')
    try { localStorage.setItem('fitbook_user_email', user.email) } catch {}
    loadWorkouts(user.email)
  } else {
    emailEl.textContent = 'Not signed in'
    btnIn.classList.remove('hidden')
    btnOut.classList.add('hidden')
    renderWorkouts([])
  }
}

export function initAuth() {
  app = initializeApp(FITBOOK_CONFIG.firebase)
  auth = getAuth(app)
  const provider = new GoogleAuthProvider()

  const btnIn = document.getElementById('btn-signin')
  const btnOut = document.getElementById('btn-signout')
  if (btnIn) btnIn.onclick = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      setStatus('Sign-in failed')
    }
  }
  if (btnOut) btnOut.onclick = async () => {
    try { await signOut(auth) } catch {}
  }

  onAuthStateChanged(auth, (user) => {
    renderUser(user || null)
  })
}

function renderWorkouts(items) {
  const list = document.getElementById('workout-list')
  if (!list) return
  if (!items || items.length === 0) {
    list.innerHTML = '<p>No workouts yet.</p>'
    return
  }
  list.innerHTML = items.map((it) => (
    `<div class="card">
      <div class="row">
        <div class="col">
          <strong>${escapeHtml(it.exercise || '')}</strong>
          <div class="muted">Order: ${it.order ?? ''}</div>
        </div>
        <div class="col actions">
          <button data-id="${it.id || ''}" data-equip="${escapeAttr(it.equipment || '')}" data-muscle="${escapeAttr(it.muscles || '')}" class="btn-replace">Replace</button>
        </div>
      </div>
    </div>`
  )).join('')

  list.onclick = async (ev) => {
    const btn = ev.target.closest('.btn-replace')
    if (!btn) return
    const glideId = btn.getAttribute('data-id') || ''
    const equipment = btn.getAttribute('data-equip') || ''
    const muscle = btn.getAttribute('data-muscle') || ''
    if (!glideId) return
    setStatus('Replacing…')
    try {
      const res = await replaceGlideExercise(glideId, equipment, muscle)
      if (res && res.status === 'ok') {
        setStatus('Replaced. Refreshing…')
        const email = document.getElementById('user-email')?.textContent || ''
        if (email) await loadWorkouts(email)
      } else {
        setStatus('Replace failed')
      }
    } catch (e) {
      setStatus('Network error')
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
  try {
    const json = await getGlideWodSummary(email)
    if (json && json.status === 'ok') {
      renderWorkouts(json.sample || [])
      setStatus(`Rows: ${json.totalRows}`)
    } else {
      setStatus('Failed to load')
    }
  } catch (e) {
    setStatus('Network error')
  }
}
