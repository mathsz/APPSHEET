/** @vitest-environment jsdom */
import { beforeEach, test, expect } from 'vitest'

// Minimal copy of updateQueueIndicator logic for unit testing DOM behavior
function getPendingBatchCount() {
  try { const arr = JSON.parse(localStorage.getItem('homeworkouts_pending_batches') || '[]'); return Array.isArray(arr) ? arr.length : 0 } catch { return 0 }
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
    }
  } catch (e) { /* ignore */ }
}

beforeEach(() => {
  // Reset DOM
  document.body.innerHTML = `<div id="queue-indicator" class="queue-indicator hidden" title="Pending batches"><span id="queue-count">0</span> queued</div>`
  localStorage.removeItem('homeworkouts_pending_batches')
})

test('indicator hidden when no pending batches', () => {
  localStorage.setItem('homeworkouts_pending_batches', JSON.stringify([]))
  updateQueueIndicator()
  const el = document.getElementById('queue-indicator')
  const cnt = document.getElementById('queue-count')
  expect(cnt.textContent).toBe('0')
  expect(el.classList.contains('hidden')).toBe(true)
})

test('indicator shows count when pending batches present', () => {
  localStorage.setItem('homeworkouts_pending_batches', JSON.stringify([{id:1},{id:2}]))
  updateQueueIndicator()
  const el = document.getElementById('queue-indicator')
  const cnt = document.getElementById('queue-count')
  expect(cnt.textContent).toBe('2')
  expect(el.classList.contains('hidden')).toBe(false)
})