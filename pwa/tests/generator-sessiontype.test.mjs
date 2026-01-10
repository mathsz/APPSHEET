import './setup.js'
import { describe, it, expect } from 'vitest'
import * as gen from '../src/generator.js'

describe('parseFocusMusclesFromType', () => {
  it('parses "Core Back" to ["core","abs","back"]', () => {
    const out = gen.parseFocusMusclesFromType('Core Back')
    expect(out).toEqual(expect.arrayContaining(['core','back','abs']))
  })
  it('parses "Upper Back & Shoulders" to include back and shoulders', () => {
    const out = gen.parseFocusMusclesFromType('Upper Back & Shoulders')
    expect(out).toEqual(expect.arrayContaining(['back','shoulders']))
  })
})
