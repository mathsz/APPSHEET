import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { FITBOOK_CONFIG } from './config.js'
import { getGlideWodSummary, replaceGlideExercise, syncSetToGlide, setDone, getGlideHiitSummary, generateHiit, debugProfile, setHiitRoundDone, setHiitIsDone } from './backend.js'

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
    autoLoadByProgram(user.email)
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

  // Expose loaders for Workout mode toggles
  window.fitbookLoadStrength = () => {
    const email = document.getElementById('user-email')?.textContent || ''
    if (email) loadWorkouts(email)
  }
  window.fitbookLoadHiit = () => {
    const email = document.getElementById('user-email')?.textContent || ''
    if (email) loadHiitWorkouts(email)
  }
}

async function autoLoadByProgram(email) {
  setStatus('Loading profile…')
  try {
    const localProg = (() => { try { return localStorage.getItem('fitbook_program_type') || '' } catch { return '' } })()
    const prof = await debugProfile(email)
    const program = String(localProg || prof?.profile?.programType || '').toLowerCase()
    if (program.includes('hiit') || program.includes('tabata')) {
      setStatus('Program: HIIT')
      document.getElementById('btn-mode-hiit')?.classList.add('active')
      document.getElementById('btn-mode-strength')?.classList.remove('active')
      document.getElementById('btn-mode-strength')?.classList.add('hidden')
      document.getElementById('btn-mode-hiit')?.classList.remove('hidden')
      try { window.showLoading && window.showLoading('Loading…') } catch {}
      await loadHiitWorkouts(email)
      try { window.hideLoading && window.hideLoading() } catch {}
    } else {
      setStatus('Program: Strength')
      document.getElementById('btn-mode-strength')?.classList.add('active')
      document.getElementById('btn-mode-hiit')?.classList.remove('active')
      document.getElementById('btn-mode-hiit')?.classList.add('hidden')
      document.getElementById('btn-mode-strength')?.classList.remove('hidden')
      try { window.showLoading && window.showLoading('Loading…') } catch {}
      await loadWorkouts(email)
      try { window.hideLoading && window.hideLoading() } catch {}
    }
  } catch {
    // Fallback to strength
    const localProg = (() => { try { return localStorage.getItem('fitbook_program_type') || '' } catch { return '' } })()
    if (String(localProg).toLowerCase().includes('hiit')) {
      await loadHiitWorkouts(email)
    } else {
      await loadWorkouts(email)
    }
  }
}

// Expose for navigation auto-load
try { window.autoLoadByProgram = autoLoadByProgram } catch {}

// Global timer utilities for both Strength and HIIT flows
let fitbookTimerInterval = null
let fitbookTimerState = { tEl: null, remaining: 0, initial: 0, paused: false, onComplete: null }
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
  if (fitbookTimerInterval) clearInterval(fitbookTimerInterval)
  fitbookTimerState = { tEl, remaining, initial: remaining, paused: false, onComplete }
  fitbookTimerInterval = setInterval(() => {
    remaining -= 1
    fitbookTimerState.remaining = remaining
    if (remaining <= 0) {
      remaining = 0
      update()
      clearInterval(fitbookTimerInterval)
      fitbookTimerInterval = null
      fitbookTimerState.paused = false
      beep3()
      setStatus('Timer complete')
      if (typeof onComplete === 'function') {
        try { onComplete() } catch {}
      }
    } else { update() }
  }, 1000)
}

function pauseTimer() {
  if (fitbookTimerInterval) {
    clearInterval(fitbookTimerInterval)
    fitbookTimerInterval = null
    fitbookTimerState.paused = true
    setStatus('Paused')
  }
}
function resumeTimer() {
  if (fitbookTimerState.paused && fitbookTimerState.remaining > 0 && fitbookTimerState.tEl) {
    setStatus('Resumed')
    startCountdown(fitbookTimerState.tEl, fitbookTimerState.remaining, fitbookTimerState.onComplete)
  }
}
function rewindTimer(secs) {
  if (fitbookTimerState.tEl) {
    setStatus('Rewound')
    startCountdown(fitbookTimerState.tEl, parseInt(secs||fitbookTimerState.initial,10), fitbookTimerState.onComplete)
  }
}

function renderWorkouts(items) {
  const list = document.getElementById('workout-list')
  if (!list) return
  if (!items || items.length === 0) {
    list.innerHTML = '<p>No workouts yet.</p>'
    return
  }
  const detailId = window.fitbookDetailId || null
  if (!detailId) {
    // List mode: show compact list of exercises
    list.classList.add('list-mode')
    const currentId = window.fitbookHiitCurrentId || null
    list.innerHTML = items.map((it, idx) => {
      const id = it.id || ''
      const exLabel = `Exercice ${idx+1}`
      const isCurrent = currentId && currentId === id
      return `
      <div class="card card-list-item ${isCurrent ? 'current-exercise' : ''}" data-id="${id}" title="Open details">
        <div class="row">
          <div class="col">
            <strong>${escapeHtml(it.exercise || '')}</strong>
            <div class="muted">${exLabel} • ${escapeHtml(it.muscles||'')}</div>
          </div>
          <div class="col actions"><span class="muted">›</span></div>
        </div>
      </div>`
    }).join('')
  } else {
    // Detail mode: show a single expanded card
    list.classList.remove('list-mode')
    const it = items.find(r => (r.id||'') === detailId) || items[0]
    const idx = Math.max(0, items.findIndex(r => (r.id||'') === (it.id||'')))
    const id = it.id || ''
    const isIso = (it.work_s != null) || String(it.reps_text || '').toLowerCase().includes('tenir') || String(it.exercise||'').toLowerCase().includes('plank')
    const secs = it.work_s != null ? parseInt(it.work_s, 10) : guessIsoSeconds(String(it.reps_text||''))
    const exLabel = `Exercice ${idx+1}`
    const isCurrent = (window.fitbookHiitCurrentId && window.fitbookHiitCurrentId === id)
    list.innerHTML = `
    <div class="card ${isCurrent ? 'current-exercise' : ''}" data-id="${id}">
      <div class="row">
        <div class="col">
          <strong>${escapeHtml(it.exercise || '')}</strong>
          <div class="muted">${exLabel} • ${escapeHtml(it.muscles||'')}</div>
          ${it.video_url ? `<div class="muted"><a href="${escapeAttr(it.video_url)}" target="_blank">YouTube</a></div>` : ''}
        </div>
        <div class="col actions">
          <button class="btn-back" title="Back to list">← Back</button>
          <button data-id="${id}" data-equip="${escapeAttr(it.equipment || '')}" data-muscle="${escapeAttr(it.muscles || '')}" class="btn-replace" title="Shuffle exercise"><span class="icon-shuffle" aria-hidden="true">🔀</span> <span class="label">Swap</span></button>
        </div>
      </div>
      <div class="timer"><span class="mm">00</span>:<span class="ss">00</span></div>
      <div class="sets">
        <div class="set-row">
          <label>Set 1</label>
          <input class="s1-reps" type="number" inputmode="numeric" placeholder="reps" value="${it.set1_reps ?? ''}">
          <input class="s1-load" type="number" inputmode="decimal" placeholder="weight (lb)" value="${it.set1_load ?? ''}">
          <div class="set-row-actions"><label class="done-check"><input type="checkbox" class="chk-done-set" data-set="1"> Done</label> <select class="rest-select" data-set="1"><option value="60">60s</option><option value="90">90s</option><option value="120">120s</option></select></div>
        </div>
        <div class="set-row">
          <label>Set 2</label>
          <input class="s2-reps" type="number" inputmode="numeric" placeholder="reps" value="${it.set2_reps ?? ''}">
          <input class="s2-load" type="number" inputmode="decimal" placeholder="weight (lb)" value="${it.set2_load ?? ''}">
          <div class="set-row-actions"><label class="done-check"><input type="checkbox" class="chk-done-set" data-set="2"> Done</label> <select class="rest-select" data-set="2"><option value="60">60s</option><option value="90">90s</option><option value="120">120s</option></select></div>
        </div>
        <div class="set-row">
          <label>Set 3</label>
          <input class="s3-reps" type="number" inputmode="numeric" placeholder="reps" value="${it.set3_reps ?? ''}">
          <input class="s3-load" type="number" inputmode="decimal" placeholder="weight (lb)" value="${it.set3_load ?? ''}">
          <div class="set-row-actions"><label class="done-check"><input type="checkbox" class="chk-done-set" data-set="3"> Done</label> <select class="rest-select" data-set="3"><option value="60">60s</option><option value="90">90s</option><option value="120">120s</option></select></div>
        </div>
        <div class="set-actions">
          <button class="btn-save-sets">Save Sets</button>
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

    // Open details from list
    if (target.closest('.card-list-item')) {
      window.fitbookDetailId = glideId
      renderWorkouts(items)
      return
    }

    // Back to list
    if (target.closest('.btn-back')) {
      window.fitbookDetailId = null
      renderWorkouts(items)
      return
    }

    if (target.closest('.btn-replace')) {
      const btn = target.closest('.btn-replace')
      const equipment = btn.getAttribute('data-equip') || ''
      const muscle = btn.getAttribute('data-muscle') || ''
      setStatus('Replacing…')
      try {
        const res = await replaceGlideExercise(glideId, equipment, muscle)
        if (res && res.status === 'ok') {
          setStatus('Replaced. Refreshing…')
          if (email) {
            // Stay in detail view on refresh
            window.fitbookDetailId = glideId
            await loadWorkouts(email)
          }
        } else {
          setStatus('Replace failed')
        }
      } catch (e) { setStatus('Network error') }
      return
    }

    if (target.closest('.btn-save-sets')) {
      setStatus('Saving sets…')
      const s1r = card.querySelector('.s1-reps')?.value || ''
      const s1w = card.querySelector('.s1-load')?.value || ''
      const s2r = card.querySelector('.s2-reps')?.value || ''
      const s2w = card.querySelector('.s2-load')?.value || ''
      const s3r = card.querySelector('.s3-reps')?.value || ''
      const s3w = card.querySelector('.s3-load')?.value || ''
      try {
        if (s1r || s1w) await syncSetToGlide(glideId, 1, s1r, s1w)
        if (s2r || s2w) await syncSetToGlide(glideId, 2, s2r, s2w)
        if (s3r || s3w) await syncSetToGlide(glideId, 3, s3r, s3w)
        setStatus('Sets saved')
      } catch { setStatus('Save failed') }
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
      setStatus(`Set ${sNum} done. Starting ${rest}s rest…`)
      try {
        if (reps || load) await syncSetToGlide(glideId, sNum, reps, load)
        await setDone(glideId, sNum, reps, load, email)
        startCountdown(card.querySelector('.timer'), rest)
        doneChk.disabled = true
      } catch { setStatus('Failed to log set') }
      return
    }

    if (target.closest('.btn-timer')) {
      const secs = parseInt(target.getAttribute('data-seconds')||'45',10)
      const tEl = card.querySelector('.timer')
      // Mark current exercise for HIIT highlighting
      const gid = card.getAttribute('data-id') || ''
      if (gid) window.fitbookHiitCurrentId = gid
      startCountdown(tEl, secs)
      return
    }

    if (target.closest('.btn-reset')) {
      if (fitbookTimerInterval) { clearInterval(fitbookTimerInterval); fitbookTimerInterval = null }
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
      renderWorkouts(json.sample || [])
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
    const json = await getGlideHiitSummary(email)
    if (json && json.status === 'ok') {
      // Map HIIT rows and include round/slot and rest
      let items = (json.sample || []).map(r => ({
        id: r.id,
        order: r.order,
        round: r.round,
        slot: r.slot_in_round,
        exercise: r.exercise,
        muscles: r.interval_label || '',
        equipment: '',
        reps_text: `${r.work_s || 40}s`,
        work_s: r.work_s || 40,
        rest_s: r.rest_s || 20,
        video_url: r.video_url || '',
        image_url: r.image_url || r.img_url || '',
        is_done: (String(r.is_done).toLowerCase() === 'true' || r.is_done === true || r.is_done === 1)
      }))
      // Clamp to computed total based on selected duration if backend over-generates
      try {
        const minutesLS = localStorage.getItem('fitbook_hiit_minutes')
        const minutes = minutesLS ? parseInt(minutesLS,10) : null
        const work = items[0]?.work_s || 40
        const rest = items[0]?.rest_s || 20
        const total = minutes ? Math.max(1, Math.floor((minutes*60) / (work+rest))) : null
        if (total && items.length > total) items = items.slice(0, total)
      } catch {}
      // If no intervals exist, attempt to generate then reload
      if (!items.length) {
        setStatus('No HIIT yet. Generating…')
        try { await generateHiit(email) } catch {}
        try {
          const j2 = await getGlideHiitSummary(email)
          if (j2 && j2.status === 'ok') {
            items = (j2.sample || []).map(r => ({
              id: r.id,
              order: r.order,
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
            }))
            try {
              const minutesLS = localStorage.getItem('fitbook_hiit_minutes')
              const minutes = minutesLS ? parseInt(minutesLS,10) : null
              const work = items[0]?.work_s || 40
              const rest = items[0]?.rest_s || 20
              const total = minutes ? Math.max(1, Math.floor((minutes*60) / (work+rest))) : null
              if (total && items.length > total) items = items.slice(0, total)
            } catch {}
          }
        } catch {}
      }
      renderHiitRounds(items)
      setStatus(items.length ? `HIIT intervals: ${items.length}` : 'HIIT ready')
    } else {
      // Fallback: derive intervals from profile or defaults
      try {
        const prof = await debugProfile(email)
        const minutes = (prof && prof.hiit && prof.hiit.minutes) ? parseInt(prof.hiit.minutes, 10) : 20
        const work = (prof && prof.hiit && prof.hiit.workSeconds) ? parseInt(prof.hiit.workSeconds, 10) : 40
        const rest = (prof && prof.hiit && prof.hiit.restSeconds) ? parseInt(prof.hiit.restSeconds, 10) : 20
        const total = Math.max(1, Math.floor((minutes*60) / (work+rest)))
        const items = Array.from({length: total}, (_, i) => ({ id: `fallback_${i+1}`, order: i+1, round: Math.floor(i/5)+1, slot: (i%5)+1, exercise: `Exercise ${i+1}`, muscles: `${work}/${rest}`, work_s: work, rest_s: rest }))
        renderHiitRounds(items)
        setStatus(`HIIT intervals (fallback): ${items.length}`)
      } catch {
        setStatus('Failed to load HIIT')
      }
    }
    } catch (e) { setStatus('Network error') }
}
  try { window.hideLoading && window.hideLoading() } catch {}

function renderHiitRounds(items) {
  const list = document.getElementById('workout-list')
  if (!list) return
  if (!items || !items.length) { list.innerHTML = '<p>No HIIT yet.</p>'; return }
  // Group by round
  const byRound = {}
  items.forEach(it => {
    const r = parseInt(it.round||1,10)
    if (!byRound[r]) byRound[r] = []
    byRound[r].push(it)
  })
  const rounds = Object.keys(byRound).map(n => parseInt(n,10)).sort((a,b)=>a-b)
  list.classList.remove('list-mode')
  list.innerHTML = rounds.map(rn => {
    const rows = byRound[rn].slice().sort((a,b)=> (parseInt(a.slot||0,10) - parseInt(b.slot||0,10)))
    const label = `Set ${rn}`
    const work = 40
    const rest = 20
    const isAllDone = rows.every(it => (it.is_done === true))
    return `
    <div class="card hiit-round ${isAllDone ? 'disabled-card' : ''}" data-round="${rn}">
      <div class="row">
        <div class="col">
          <strong>${label}</strong> <button class="btn-done-round" data-round="${rn}" data-done="${isAllDone ? '1' : '0'}">DONE</button>
          <div class="muted">${work}/${rest} • ${rows.length} exercices</div>
        </div>
        <div class="col actions">
          <button class="btn-start-round" data-round="${rn}" data-work="${work}" data-rest="${rest}">Start</button>
          <button class="btn-pause-round" data-round="${rn}">Pause</button>
          <button class="btn-resume-round" data-round="${rn}">Resume</button>
          <button class="btn-reset-round" data-round="${rn}">Reset</button>
        </div>
      </div>
      <ul class="hiit-ex-list">
        ${rows.map((it, idx) => `<li class="hiit-ex" data-id="${it.id}" data-order="${it.order}" data-slot="${it.slot}"><span class="ex-name">${idx+1}. ${escapeHtml(it.exercise||'')}</span>${it.video_url ? `<a class="ex-link" href="${escapeAttr(it.video_url)}" target="_blank" title="YouTube">YouTube ↗</a>` : ''}${it.image_url ? `<img class="ex-img" src="${escapeAttr(it.image_url)}" alt="Exercise image">` : ''}</li>`).join('')}
      </ul>
      <div class="timer"><span class="mm">00</span>:<span class="ss">00</span></div>
    </div>`
  }).join('')

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
      if (gid) window.fitbookHiitCurrentId = gid
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
      const email = document.getElementById('user-email')?.textContent || ''
      const btn = t.closest('.btn-done-round')
      const r = parseInt(btn.getAttribute('data-round')||'0',10)
      const isDoneNow = btn.getAttribute('data-done') === '1'
      const newState = !isDoneNow
      if (!email || !r) return
      setStatus(newState ? 'Marking set done…' : 'Unmarking set…')
      // Optimistic UI
      btn.setAttribute('data-done', newState ? '1' : '0')
      if (newState) { card.classList.add('disabled-card') } else { card.classList.remove('disabled-card') }
      try { window.showLoading && window.showLoading(newState ? 'Marking…' : 'Updating…') } catch {}
      ;(async () => {
        try {
          // Try round-level update first
          let ok = false
          try {
            const res = await setHiitRoundDone(email, r, newState)
            ok = !!(res && res.status === 'ok')
          } catch {}
          // Fallback: update each interval in the round individually
          if (!ok) {
            const liEls = Array.from(card.querySelectorAll('.hiit-ex'))
            for (const li of liEls) {
              const ord = parseInt(li.getAttribute('data-order')||'0',10)
              if (ord) {
                try { await setHiitIsDone(email, ord, newState) } catch {}
              }
            }
            ok = true // best-effort
          }
          setStatus(newState ? 'Set marked done' : 'Set unmarked')
          // Reload HIIT list to reflect backend state
          try { await loadHiitWorkouts(email) } catch {}
        } catch (e) {
          // Revert UI on error
          btn.setAttribute('data-done', isDoneNow ? '1' : '0')
          if (isDoneNow) { card.classList.add('disabled-card') } else { card.classList.remove('disabled-card') }
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
      if (gid) window.fitbookHiitCurrentId = gid
      setStatus(`Selected exercise ${idx+1}`)
      return
    }
  }
}

function guessIsoSeconds(hint) {
  const m = /([0-9]{1,3})\s*s/.exec(String(hint||''))
  if (m) return parseInt(m[1],10)
  return 40
}
