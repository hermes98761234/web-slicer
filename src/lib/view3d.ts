/** A tiny orthographic projector for the canvas previews. Z is up; yaw spins about Z, pitch tilts the view. */
export interface Projector {
  (x: number, y: number, z: number): [number, number]
  /** Depth: larger is farther from the viewer. */
  depth(x: number, y: number, z: number): number
}

export function makeProjector(opts: { yaw: number; pitch: number; cx: number; cy: number; cz: number; scale: number; w: number; h: number }): Projector {
  const { yaw, pitch, cx, cy, cz, scale, w, h } = opts
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  const p = ((x: number, y: number, z: number): [number, number] => {
    const dx = x - cx, dy = y - cy, dz = z - cz
    const rx = dx * cyaw - dy * syaw
    const ry = dx * syaw + dy * cyaw
    return [w / 2 + rx * scale, h / 2 - (ry * sp + dz * cp) * scale]
  }) as Projector
  p.depth = (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz
    const ry = dx * syaw + dy * cyaw
    return ry * cp - dz * sp
  }
  return p
}

export interface Palette {
  bg: string
  grid: string
  gridStrong: string
  fg: string
  muted: string
}

/** Reads the chart colours from the page's CSS variables. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return { bg: v('--chart-bg'), grid: v('--grid'), gridStrong: v('--grid-strong'), fg: v('--chart-fg'), muted: v('--muted') }
}

export const KIND_COLOR: Record<string, string> = {
  outer: '#ef4444',
  inner: '#f59e0b',
  solid: '#3b82f6',
  infill: '#22c55e',
  skirt: '#94a3b8',
}
