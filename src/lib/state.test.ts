import { describe, expect, it } from 'vitest'
import { parseState, defaultState } from './state'
import { DEFAULTS } from './settings'

describe('state persistence', () => {
  it('restores defaults for junk', () => {
    expect(parseState(null).settings).toEqual(DEFAULTS)
    expect(parseState('x').xf.scale).toBe(100)
  })
  it('keeps valid stored values', () => {
    const s = parseState({ settings: { infill: 40 }, lang: 'uk', theme: 'dark', xf: { scale: 150, rz: 30 }, sample: 'torus' })
    expect(s.settings.infill).toBe(40)
    expect(s.lang).toBe('uk')
    expect(s.theme).toBe('dark')
    expect(s.xf).toEqual({ scale: 150, rx: 0, ry: 0, rz: 30 })
    expect(s.sample).toBe('torus')
  })
  it('rejects unknown language and theme', () => {
    const s = parseState({ lang: 'xx', theme: 'blue' })
    expect(s.lang).toBe(defaultState().lang)
    expect(s.theme).toBe('auto')
  })
})
