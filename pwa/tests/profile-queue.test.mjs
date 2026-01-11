import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enqueueProfile, flushAllPending } from '../src/auth.js'
import * as backend from '../src/backend.js'
import { removeSetting, getSetting } from '../src/settings.js'

beforeEach(() => {
  try { removeSetting('pending_profile') } catch {}
})

describe('profile queue', () => {
  it('enqueueProfile stores profile locally', () => {
    const prof = { programType: 'Strength', durationMin: 30 }
    const ok = enqueueProfile(prof)
    expect(ok).toBe(true)
    const raw = getSetting('pending_profile')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw)
    expect(parsed.profile).toBeDefined()
    expect(parsed.profile.programType).toBe('Strength')
    expect(parsed.profile.durationMin).toBe(30)
  })

  it('flushAllPending calls backend.setUserSetup and clears pending', async () => {
    const prof = { programType: 'Strength', durationMin: 30 }
    enqueueProfile(prof)
    const spy = vi.spyOn(backend, 'setUserSetup').mockImplementation(async () => ({ status: 'ok' }))
    const res = await flushAllPending({ onProgress: () => {} })
    expect(spy).toHaveBeenCalled()
    const raw = getSetting('pending_profile')
    expect(raw === null || raw === '{}' || raw === 'null').toBeTruthy()
    spy.mockRestore()
  })

  it('flushAllPending rethrows when backend fails', async () => {
    const prof = { programType: 'Strength', durationMin: 30 }
    enqueueProfile(prof)
    const spy = vi.spyOn(backend, 'setUserSetup').mockImplementation(async () => { throw new Error('boom') })
    const spy2 = vi.spyOn(backend, 'setUserDureePost').mockImplementation(async () => { throw new Error('boom2') })
    await expect(flushAllPending({ onProgress: () => {} })).rejects.toThrow()
    spy.mockRestore()
    spy2.mockRestore()
  })
})
