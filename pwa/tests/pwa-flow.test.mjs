import './setup.js'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { loadHistory, appendWorkoutHistory, computeMuscleFatigueMap } from '../src/fatigue.js'

function setSelectValue(id, val) {
  const el = document.getElementById(id)
  if (!el) throw new Error('Missing element #' + id)
  el.value = String(val)
  el.dispatchEvent(new window.Event('change', { bubbles: true }))
}

async function flushPromises(times = 10) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

async function waitForCondition(predicate, { tries = 50 } = {}) {
  let lastErr = null
  for (let i = 0; i < tries; i++) {
    try {
      await flushPromises(5)
      const v = predicate()
      if (v) return v
    } catch (e) {
      lastErr = e
    }
  }
  if (lastErr) throw lastErr
  throw new Error('Condition not met')
}

describe('PWA cohesive flows (local)', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    try { localStorage.clear() } catch {}

    // Provide stable email for history keys.
    localStorage.setItem('homeworkouts_user_email', 'tester@example.com')

    // Keep the app offline for tests so it uses local enqueue/flows.
    try {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    } catch {}

    // Import main to build DOM and wire handlers.
    await import('../src/main.js')

    // Ensure auth renderers are available.
    await import('../src/auth.js')

    // Ensure UI has the same email.
    const ue = document.getElementById('user-email')
    if (ue) ue.textContent = 'tester@example.com'
  })

  it('Strength 60min (Upper Body): generates expected card count; set completion marks card done; workout complete writes history and enables fatigue/calendar', async () => {
    // Setup Strength Upper Body 60 minutes, 3 sets.
    setSelectValue('setup-program-select', 'Strength')
    setSelectValue('setup-session-select', 'Upper Body')
    setSelectValue('setup-duration-select', '60')
    const setsEl = document.getElementById('setup-sets')
    setsEl.value = '3'

    // Trigger save + local generation.
    document.getElementById('btn-save').click()

    await waitForCondition(() => document.querySelectorAll('#workout-list .card').length > 0)

    // Should render workouts view with Strength cards.
    const list = document.getElementById('workout-list')
    expect(list).toBeTruthy()

    // Expected count follows set-timing formula: exercises = floor((D*60)/(S*(30+60))).
    const expected = 13

    const cards = Array.from(document.querySelectorAll('#workout-list .card'))
    expect(cards.length).toBe(expected)

    // Mark first card sets done with 20lb.
    const first = cards[0]
    expect(first.classList.contains('done-exercise')).toBe(false)
    for (let s = 1; s <= 3; s++) {
      const load = first.querySelector(`.s${s}-load`)
      const reps = first.querySelector(`.s${s}-reps`)
      const chk = first.querySelector(`.chk-done-set[data-set="${s}"]`)
      expect(load).toBeTruthy()
      expect(reps).toBeTruthy()
      expect(chk).toBeTruthy()
      load.value = '20'
      reps.value = '10'
      chk.checked = true
      chk.dispatchEvent(new window.Event('click', { bubbles: true }))
    }
    expect(first.classList.contains('done-exercise')).toBe(true)

    // Complete workout → should append local history.
    const completeBtn = document.getElementById('btn-workout-complete')
    expect(completeBtn).toBeTruthy()
    completeBtn.click()

    // In offline mode, completion should be local-first with no required modal.
    // If a modal happens to appear (online/dev), confirm it so the handler can proceed.
    try {
      const m = document.getElementById('confirm-modal')
      if (m && !m.classList.contains('hidden')) {
        document.getElementById('confirm-yes')?.click()
      }
    } catch {}

    await waitForCondition(() => (loadHistory('tester@example.com') || []).length > 0)

    const rows = loadHistory('tester@example.com')
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)

    // Navigate to Fatigue view and ensure it renders levels.
    document.getElementById('nav-fatigue').click()
    const fatigueGrid = document.getElementById('fatigue-grid')
    expect(fatigueGrid).toBeTruthy()
    // With history present, should render at least one card.
    const fatigueCards = Array.from(fatigueGrid.querySelectorAll('.card'))
    expect(fatigueCards.length).toBeGreaterThan(0)

    // Calendar toggle should display calendar with at least one workout day.
    document.getElementById('btn-fatigue-calendar').click()
    const cal = document.getElementById('fatigue-calendar')
    expect(cal.classList.contains('hidden')).toBe(false)
    expect(cal.querySelectorAll('.cal-day.workout').length).toBeGreaterThan(0)
  })

  it('HIIT: generates correct interval cards, buttons exist, timer ticks, and DONE marks round as complete', async () => {
    vi.useFakeTimers()

    // Setup HIIT 15 minutes.
    setSelectValue('setup-program-select', 'HIIT')
    setSelectValue('setup-duration-select', '15')
    // Ensure predictable work/rest.
    localStorage.setItem('homeworkouts_hiit_work_s', '40')
    localStorage.setItem('homeworkouts_hiit_rest_s', '20')

    document.getElementById('btn-save').click()

    await waitForCondition(() => document.querySelectorAll('#workout-list .hiit-ex').length > 0)

    // Interval count = floor((15*60)/(40+20)) = 15
    const exEls = Array.from(document.querySelectorAll('#workout-list .hiit-ex'))
    expect(exEls.length).toBe(15)
    const rounds = Array.from(document.querySelectorAll('#workout-list .hiit-round'))
    expect(rounds.length).toBe(3)

    // Buttons exist on first round.
    const r1 = rounds[0]
    expect(r1.querySelector('.btn-start-round')).toBeTruthy()
    expect(r1.querySelector('.btn-pause-round')).toBeTruthy()
    expect(r1.querySelector('.btn-resume-round')).toBeTruthy()
    expect(r1.querySelector('.btn-reset-round')).toBeTruthy()
    expect(r1.querySelector('.btn-done-round')).toBeTruthy()

    // Selecting an exercise should mark it live.
    exEls[0].click()
    expect(exEls[0].classList.contains('live')).toBe(true)

    // Start round and verify timer ticks down.
    r1.querySelector('.btn-start-round').click()
    const tEl = r1.querySelector('.timer')
    const ss = tEl.querySelector('.ss')
    expect(ss.textContent).toBe('40')
    vi.advanceTimersByTime(1000)
    expect(ss.textContent).toBe('39')

    // Mark round 1 done and verify UI state toggles.
    r1.querySelector('.btn-done-round').click()
    await Promise.resolve()
    expect(document.querySelector('#workout-list .hiit-round[data-round="1"]').classList.contains('disabled-card')).toBe(true)

    // Mark all rounds done so the Workout complete button appears.
    document.querySelector('#workout-list .hiit-round[data-round="2"] .btn-done-round').click()
    await Promise.resolve()
    document.querySelector('#workout-list .hiit-round[data-round="3"] .btn-done-round').click()
    await Promise.resolve()

    const completeBtn = document.getElementById('btn-workout-complete')
    expect(completeBtn).toBeTruthy()
    completeBtn.click()
    await Promise.resolve()

    // Enqueues the HIIT batch locally.
    const batches = JSON.parse(localStorage.getItem('homeworkouts_pending_batches') || '[]')
    expect(Array.isArray(batches)).toBe(true)
    expect(batches.length).toBeGreaterThan(0)

    // Shows completion splash immediately.
    const cm = document.getElementById('complete-modal')
    expect(cm).toBeTruthy()
    expect(cm.classList.contains('hidden')).toBe(false)
  })

  it('Regeneration uses fatigue to suggest a fresher focus muscle for Upper Body', async () => {
    // Seed history so Chest is fatigued.
    appendWorkoutHistory('tester@example.com', [
      { exercise: 'Bench', muscle: 'Chest', setCount: 3, fatigueStr: 'Chest:1' },
      { exercise: 'Pushup', muscle: 'Chest', setCount: 3, fatigueStr: 'Chest:1' }
    ], new Date(), 'complete')

    const fm = computeMuscleFatigueMap(loadHistory('tester@example.com'), new Date())
    expect(Math.round(fm.Chest || 0)).toBeGreaterThan(0)

    // Setup Strength Upper Body 60 minutes; app should suggest a fresher muscle and focus generation.
    setSelectValue('setup-program-select', 'Strength')
    setSelectValue('setup-session-select', 'Upper Body')
    setSelectValue('setup-duration-select', '60')
    document.getElementById('setup-sets').value = '3'

    document.getElementById('btn-save').click()

    await waitForCondition(() => document.getElementById('setup-status')?.textContent?.includes('Generated locally'))

    // Status should contain suggestion message.
    const setupStatus = document.getElementById('setup-status')
    expect(setupStatus.textContent).toMatch(/suggestion:/i)

    // The generated workout should be focused on the suggested muscle (not necessarily Chest).
    // We assert at least one card's muscle group is NOT Chest when chest is fatigued.
    const muscleAttrs = Array.from(document.querySelectorAll('#workout-list .card'))
      .map(c => String(c.getAttribute('data-muscle-group') || ''))
      .join(' | ')
      .toLowerCase()
    expect(muscleAttrs.includes('chest')).toBe(false)
  })
})
