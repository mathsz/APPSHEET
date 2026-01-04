import './style.css'
import { initAuth } from './auth.js'

const root = document.querySelector('#app')

root.innerHTML = `
  <header>
    <h1>Fitbook</h1>
    <div id="user-info">
      <span id="user-email">Not signed in</span>
      <button id="btn-signin">Sign in</button>
      <button id="btn-signout" class="hidden">Sign out</button>
    </div>
  </header>

  <main>
    <section>
      <h2>Workouts (Glide_Wod)</h2>
      <div id="workout-list" class="cards"></div>
      <div id="status" class="status"></div>
    </section>
  </main>
  <footer>
    <small>Fitbook PWA • Offline-ready</small>
  </footer>
`

initAuth()
