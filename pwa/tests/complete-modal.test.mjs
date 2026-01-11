import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { removeSetting } from '../src/settings.js'

beforeEach(async () => {
  // ensure DOM and localStorage are available before importing main
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.localStorage = dom.window.localStorage
  try { removeSetting('pending_batches') } catch {}
  try { removeSetting('pending_profile') } catch {}
  // clean up modal if exists
  try { const el = document.getElementById('complete-modal'); if (el) el.remove() } catch (e) {}
  // import main after DOM is ready
  await import('../src/main.js')
})

describe('complete modal flow', () => {
  it('shows progress and final success UI when flushAllPending resolves', async () => {
    // mock lottie
    window.lottie = {
      loadAnimation: (opts) => {
        return { destroy: () => {}, play: () => {}, stop: () => {} }
      }
    }
    window.COMPLETE_LOTTIE_URL = 'about:blank'

    // mock flushAllPending to simulate progress
    window.flushAllPending = async ({ onProgress } = {}) => {
      onProgress && onProgress({ step: 'profile', status: 'started' })
      onProgress && onProgress({ step: 'profile', status: 'done' })
      onProgress && onProgress({ step: 'batches', status: 'started' })
      onProgress && onProgress({ step: 'batches', status: 'in-progress', index: 1, total: 1 })
      onProgress && onProgress({ step: 'batches', status: 'item-done', index: 1, total: 1 })
      return { profile: 'sent', batches: { success: 1, failed: 0 } }
    }

    await window.showCompleteAndFlush()

    const modal = document.getElementById('complete-modal')
    expect(modal).toBeTruthy()
    expect(modal.classList.contains('hidden')).toBe(false)

    const txt = document.getElementById('complete-progress')
    expect(txt).toBeTruthy()
    // final text should indicate success (either new happy string or counts)
    expect(txt.textContent).toMatch(/All synced|Sync complete/)

    const fill = document.getElementById('complete-fill')
    expect(fill).toBeTruthy()
    expect(fill.style.width === '100%' || fill.style.width === '100%').toBeTruthy()

    const close = document.getElementById('complete-close')
    expect(close).toBeTruthy()
    // close should be visible for success
    expect(close.classList.contains('hidden')).toBe(false)
  })
})