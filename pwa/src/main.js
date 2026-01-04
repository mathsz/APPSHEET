import './style.css'
import { initAuth } from './auth.js'

const root = document.querySelector('#app')

root.innerHTML = `
  <header>
    <h1>Fitbook</h1>
    <nav>
      <button id="nav-workouts">Workouts</button>
      <button id="nav-hiit">HIIT Timer</button>
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
  </main>
  <footer>
    <small>Fitbook PWA • Offline-ready</small>
  </footer>
`

initAuth()

function show(viewId) {
  const vW = document.getElementById('view-workouts')
  const vH = document.getElementById('view-hiit')
  if (!vW || !vH) return
  vW.classList.toggle('hidden', viewId !== 'workouts')
  vH.classList.toggle('hidden', viewId !== 'hiit')
}

document.getElementById('nav-workouts')?.addEventListener('click', () => show('workouts'))
document.getElementById('nav-hiit')?.addEventListener('click', () => {
  show('hiit')
  const email = document.getElementById('user-email')?.textContent || ''
  const frame = document.getElementById('hiit-frame')
  const base = 'https://script.google.com/macros/s/AKfycbyb6d6YBVgn1awJ7W/exec'
  if (frame) {
    const url = `${base}?page=timerhiit&email=${encodeURIComponent(email)}`
    frame.src = url
    document.getElementById('hiit-status').textContent = 'Loading timer…'
  }
})
