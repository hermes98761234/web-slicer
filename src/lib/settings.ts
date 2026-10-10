export interface Settings {
  layerHeight: number
  firstLayerHeight: number
  lineWidth: number
  walls: number
  topLayers: number
  bottomLayers: number
  /** Sparse infill density, percent. */
  infill: number
  nozzleTemp: number
  bedTemp: number
  /** mm/s */
  outerSpeed: number
  innerSpeed: number
  infillSpeed: number
  firstLayerSpeed: number
  travelSpeed: number
  /** Part cooling fan, percent, from layer `fanFromLayer` (1-based). */
  fan: number
  fanFromLayer: number
  filamentDiameter: number
  /** g/cm^3 */
  filamentDensity: number
  /** Flow multiplier, percent. */
  flow: number
  retraction: number
  retractSpeed: number
  retractMinTravel: number
  skirtLoops: number
  skirtDistance: number
  bedX: number
  bedY: number
  bedZ: number
}

export const DEFAULTS: Settings = {
  layerHeight: 0.2,
  firstLayerHeight: 0.3,
  lineWidth: 0.45,
  walls: 2,
  topLayers: 4,
  bottomLayers: 4,
  infill: 20,
  nozzleTemp: 210,
  bedTemp: 60,
  outerSpeed: 40,
  innerSpeed: 60,
  infillSpeed: 70,
  firstLayerSpeed: 20,
  travelSpeed: 150,
  fan: 100,
  fanFromLayer: 3,
  filamentDiameter: 1.75,
  filamentDensity: 1.24,
  flow: 100,
  retraction: 4,
  retractSpeed: 35,
  retractMinTravel: 1.5,
  skirtLoops: 2,
  skirtDistance: 4,
  bedX: 220,
  bedY: 220,
  bedZ: 250,
}

export interface Preset {
  id: string
  name: string
  patch: Partial<Settings>
}

export const PRESETS: Preset[] = [
  { id: 'draft', name: 'Draft 0.3 mm (PLA)', patch: { layerHeight: 0.3, firstLayerHeight: 0.3, lineWidth: 0.5, walls: 2, topLayers: 3, bottomLayers: 3, infill: 10, outerSpeed: 50, innerSpeed: 70, infillSpeed: 90 } },
  { id: 'standard', name: 'Standard 0.2 mm (PLA)', patch: { layerHeight: 0.2, firstLayerHeight: 0.3, lineWidth: 0.45, walls: 2, topLayers: 4, bottomLayers: 4, infill: 20, nozzleTemp: 210, bedTemp: 60, outerSpeed: 40, innerSpeed: 60, infillSpeed: 70 } },
  { id: 'fine', name: 'Fine 0.12 mm (PLA)', patch: { layerHeight: 0.12, firstLayerHeight: 0.2, lineWidth: 0.4, walls: 3, topLayers: 6, bottomLayers: 5, infill: 20, outerSpeed: 30, innerSpeed: 45, infillSpeed: 55 } },
  { id: 'petg', name: 'PETG 0.2 mm', patch: { layerHeight: 0.2, firstLayerHeight: 0.3, lineWidth: 0.45, walls: 3, topLayers: 4, bottomLayers: 4, infill: 25, nozzleTemp: 235, bedTemp: 80, outerSpeed: 30, innerSpeed: 45, infillSpeed: 50, fan: 50, filamentDensity: 1.27 } },
]

type Range = [number, number]
export const RANGES: Record<keyof Settings, Range> = {
  layerHeight: [0.04, 1],
  firstLayerHeight: [0.04, 1],
  lineWidth: [0.1, 2],
  walls: [1, 10],
  topLayers: [0, 30],
  bottomLayers: [0, 30],
  infill: [0, 100],
  nozzleTemp: [0, 450],
  bedTemp: [0, 150],
  outerSpeed: [1, 500],
  innerSpeed: [1, 500],
  infillSpeed: [1, 500],
  firstLayerSpeed: [1, 500],
  travelSpeed: [1, 1000],
  fan: [0, 100],
  fanFromLayer: [1, 100],
  filamentDiameter: [1, 4],
  filamentDensity: [0.5, 3],
  flow: [50, 150],
  retraction: [0, 20],
  retractSpeed: [1, 200],
  retractMinTravel: [0, 50],
  skirtLoops: [0, 10],
  skirtDistance: [0, 30],
  bedX: [20, 2000],
  bedY: [20, 2000],
  bedZ: [10, 2000],
}

/** Keys whose value is missing or out of range. */
export function invalidKeys(s: Settings): Set<keyof Settings> {
  const bad = new Set<keyof Settings>()
  for (const k of Object.keys(RANGES) as (keyof Settings)[]) {
    const [lo, hi] = RANGES[k]
    if (!Number.isFinite(s[k]) || s[k] < lo || s[k] > hi) bad.add(k)
  }
  if (Number.isInteger(s.walls) === false) bad.add('walls')
  return bad
}

/** Merges stored values over the defaults, ignoring unknown keys and non-numbers. */
export function mergeSettings(stored: unknown): Settings {
  const out = { ...DEFAULTS }
  if (stored && typeof stored === 'object') {
    for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      const v = (stored as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
  }
  return out
}
