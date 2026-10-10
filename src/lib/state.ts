import { IDENTITY, type Transform } from './mesh'
import { DEFAULTS, mergeSettings, type Settings } from './settings'

export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'

export interface AppState {
  settings: Settings
  presetId: string
  lang: Lang
  theme: Theme
  xf: Transform
  sample: string
}

const KEY = 'web-slicer:v1'

export function defaultState(): AppState {
  const uk = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk')
  return { settings: { ...DEFAULTS }, presetId: 'standard', lang: uk ? 'uk' : 'en', theme: 'auto', xf: { ...IDENTITY }, sample: 'sphere' }
}

export function parseState(raw: unknown): AppState {
  const d = defaultState()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, unknown>
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
  const xf = (r.xf ?? {}) as Record<string, unknown>
  return {
    settings: mergeSettings(r.settings),
    presetId: typeof r.presetId === 'string' ? r.presetId : d.presetId,
    lang: r.lang === 'uk' || r.lang === 'en' ? r.lang : d.lang,
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'auto' ? r.theme : d.theme,
    xf: { scale: num(xf.scale, 100), rx: num(xf.rx, 0), ry: num(xf.ry, 0), rz: num(xf.rz, 0) },
    sample: typeof r.sample === 'string' ? r.sample : d.sample,
  }
}

export function loadState(): AppState {
  try {
    return parseState(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return defaultState()
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage may be unavailable (private mode); settings just won't persist
  }
}
