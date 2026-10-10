import { bounds, type Mesh } from './mesh'
import type { Settings } from './settings'

/** Human-readable problems with placing the part on the printer. Keys are translated in the UI. */
export function placementWarnings(mesh: Mesh, s: Settings): string[] {
  const b = bounds(mesh)
  const out: string[] = []
  if (b.max[0] - b.min[0] > s.bedX || b.max[1] - b.min[1] > s.bedY) out.push('The part is larger than the bed.')
  if (b.max[2] > s.bedZ) out.push('The part is taller than the build height.')
  if (b.max[2] - b.min[2] < s.layerHeight) out.push('The part is thinner than one layer.')
  return out
}

/** "1 h 23 min" style duration. */
export function fmtTime(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
