import './setup.js'
import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  try { localStorage.clear() } catch (e) {}
  document.body.innerHTML = `
    <div id="app">
      <select id="setup-program-select">
        <option value="Strength">Strength</option>
        <option value="HIIT">HIIT</option>
      </select>
      <select id="setup-duration-select">
        <option value="15">15</option>
        <option value="30">30</option>
        <option value="45">45</option>
      </select>
      <input id="setup-sets" type="number" min="1" max="12" value="3">
      <div id="setup-equip-group"></div>
      <button id="btn-save">Save</button>
      <div id="status"></div>
    </div>
  `
})

describe('Smoke: duration -> sets interaction', () => {
  it('clicking Save with duration 30 and default sets should store sets and duration; check if sets become 6', async () => {
    // Import main to attach handlers
    await import('../src/main.js')
    // ensure program is Strength
    document.getElementById('setup-program-select').value = 'Strength'
    // user clicks duration 30
    document.getElementById('setup-duration-select').value = '30'
    // leave sets as default 3
    document.getElementById('setup-sets').value = '3'

    // Click Save
    document.getElementById('btn-save').click()

    // Check stored values
    const storedSetup = JSON.parse(localStorage.getItem('homeworkouts_setup_temp') || 'null')
    const storedSets = localStorage.getItem('homeworkouts_sets')
    const storedDuration = localStorage.getItem('homeworkouts_duration_min')

    // Report expectations
    // If app enforces T = S*5 on save, duration will be set to sets*5 (3*5=15) and sets remain 3.
    // If app enforces S=floor(T/5) on save, sets would be 6.

    expect(storedSetup).not.toBeNull()
    expect(storedSetup.programType).toBe('Strength')

    // Validate what the app actually stored
    expect(Number(storedDuration)).toBe(Number(storedSetup.durationMin))
    expect(Number(storedSets)).toBe(Number(storedSetup.setCount))

    // Duration and sets should remain independent
    expect(Number(storedDuration)).toBe(30)
    expect(Number(storedSets)).toBe(3)
  })
})
