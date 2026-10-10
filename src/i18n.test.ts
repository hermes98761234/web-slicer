import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { UK, tr } from './i18n'
import { SAMPLES } from './lib/samples'
import { PRESETS } from './lib/settings'

describe('i18n', () => {
  it('interpolates placeholders', () => {
    expect(tr('en', 'Layer {0} of {1}, z = {2} mm', 3, 10, 0.5)).toBe('Layer 3 of 10, z = 0.5 mm')
    expect(tr('uk', 'Layer {0} of {1}, z = {2} mm', 3, 10, 0.5)).toBe('Шар 3 з 10, z = 0.5 мм')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'No such string')).toBe('No such string')
  })
  it('translates every sample and preset name', () => {
    for (const n of [...SAMPLES.map((s) => s.name), ...PRESETS.map((p) => p.name)]) expect(UK[n], n).toBeTruthy()
  })
  it('translates every literal t() string in App.tsx', () => {
    const src = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
    const keys = [...src.matchAll(/\bt\((['"])((?:(?!\1).)+)\1/g)].map((m) => m[2])
    // nf('key', 'Label', ...) labels are passed to t() inside the helper.
    for (const m of src.matchAll(/\bnf\('\w+', '([^']+)'/g)) keys.push(m[1])
    expect(keys.length).toBeGreaterThan(40)
    for (const k of keys) expect(UK[k], k).toBeTruthy()
  })
})
