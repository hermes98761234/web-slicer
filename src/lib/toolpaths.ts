import { layerStack, sliceMesh } from './slice'
import type { Mesh } from './mesh'
import { bounds } from './mesh'
import { UM, area, clean, difference, dropSmall, intersect, offset, rectilinearFill, union, type Paths } from './poly'
import type { Settings } from './settings'

export type Kind = 'outer' | 'inner' | 'solid' | 'infill' | 'skirt'

/** One extrusion path: a polyline of mm coordinates (x, y pairs), optionally closed. */
export interface ToolPath {
  kind: Kind
  pts: number[]
  closed: boolean
}

export interface LayerPlan {
  /** Top of the layer, mm. */
  z: number
  height: number
  paths: ToolPath[]
}

export interface PlanResult {
  layers: LayerPlan[]
  openLoops: number
}

const loopToPts = (p: { x: number; y: number }[]): number[] => p.flatMap((q) => [q.x / UM, q.y / UM])

/** Greedy nearest-neighbour ordering. Closed loops start at the vertex nearest the current position. */
export function orderPaths(paths: ToolPath[], start: [number, number]): ToolPath[] {
  if (paths.length > 4000) return paths
  const left = paths.slice()
  const out: ToolPath[] = []
  let [cx, cy] = start
  while (left.length) {
    let best = 0
    let bestD = Infinity
    let bestAt = 0
    let bestRev = false
    for (let i = 0; i < left.length; i++) {
      const p = left[i].pts
      if (left[i].closed) {
        for (let v = 0; v < p.length; v += 2) {
          const d = (p[v] - cx) ** 2 + (p[v + 1] - cy) ** 2
          if (d < bestD) { bestD = d; best = i; bestAt = v; bestRev = false }
        }
      } else {
        const d0 = (p[0] - cx) ** 2 + (p[1] - cy) ** 2
        const d1 = (p[p.length - 2] - cx) ** 2 + (p[p.length - 1] - cy) ** 2
        if (d0 < bestD) { bestD = d0; best = i; bestAt = 0; bestRev = false }
        if (d1 < bestD) { bestD = d1; best = i; bestAt = 0; bestRev = true }
      }
    }
    const [pick] = left.splice(best, 1)
    let pts = pick.pts
    if (pick.closed && bestAt > 0) pts = [...pts.slice(bestAt), ...pts.slice(0, bestAt)]
    if (bestRev) {
      const r: number[] = []
      for (let v = pts.length - 2; v >= 0; v -= 2) r.push(pts[v], pts[v + 1])
      pts = r
    }
    out.push({ ...pick, pts })
    const last = pick.closed ? pts.slice(0, 2) : pts.slice(-2)
    ;[cx, cy] = [last[0], last[1]]
  }
  return out
}

/** Orders skirt and wall loops by proximity (per run of equal kind); fills keep their scan order. */
function orderRuns(loops: ToolPath[], fills: ToolPath[]): ToolPath[] {
  const out: ToolPath[] = []
  let pos: [number, number] = [0, 0]
  for (let i = 0; i < loops.length; ) {
    let j = i
    const group = loops[i].kind === 'skirt' ? 'skirt' : 'wall'
    while (j < loops.length && (loops[j].kind === 'skirt' ? 'skirt' : 'wall') === group) j++
    // Walls: inner walls first, then the outer ones.
    const run = loops.slice(i, j)
    const parts = group === 'skirt' ? [run] : [run.filter((p) => p.kind === 'inner'), run.filter((p) => p.kind === 'outer')]
    for (const part of parts) {
      if (!part.length) continue
      const ordered = orderPaths(part, pos)
      out.push(...ordered)
      pos = [ordered[ordered.length - 1].pts[0], ordered[ordered.length - 1].pts[1]]
    }
    i = j
  }
  return [...out, ...fills]
}

const rowsToPaths = (rows: number[][][], kind: Kind, minLen = 0): ToolPath[] => {
  const out: ToolPath[] = []
  rows.forEach((row, ri) => {
    for (const seg of ri % 2 === 0 ? row : row.slice().reverse()) {
      const [x1, y1, x2, y2] = seg
      if (Math.hypot(x2 - x1, y2 - y1) < minLen) continue // slivers along sloped walls: not worth a move
      out.push(ri % 2 === 0 ? { kind, pts: [x1 / UM, y1 / UM, x2 / UM, y2 / UM], closed: false } : { kind, pts: [x2 / UM, y2 / UM, x1 / UM, y1 / UM], closed: false })
    }
  })
  return out
}

/** Turns per-layer regions into extrusion paths: skirt, walls, solid skin and sparse infill. */
export function planLayers(regions: Paths[], tops: number[], s: Settings): LayerPlan[] {
  const w = s.lineWidth * UM
  const n = regions.length
  const wallCount = Math.max(1, Math.round(s.walls))
  // Where infill may go: just inside the innermost wall, overlapping it slightly.
  const infillArea = regions.map((r) => dropSmall(offset(r, -(wallCount - 0.15) * w), w * w))
  const layers: LayerPlan[] = []
  for (let i = 0; i < n; i++) {
    const region = regions[i]
    const paths: ToolPath[] = []
    const prevTop = i === 0 ? 0 : tops[i - 1]
    // Skirt around the first layer.
    if (i === 0 && s.skirtLoops > 0 && region.length) {
      for (let k = 0; k < s.skirtLoops; k++) {
        const ring = offset(union(region.filter((p) => area(p) > 0)), s.skirtDistance * UM + (k + 0.5) * w)
        for (const p of ring) if (area(p) > 0) paths.push({ kind: 'skirt', pts: loopToPts(p), closed: true })
      }
    }
    // Walls, innermost first so the outer wall is printed last.
    const walls: ToolPath[] = []
    for (let k = wallCount - 1; k >= 0; k--) {
      for (const p of offset(region, -(k + 0.5) * w).map((q) => clean(q, 8)).filter((q) => q.length >= 3)) walls.push({ kind: k === 0 ? 'outer' : 'inner', pts: loopToPts(p), closed: true })
    }
    // Skin: parts of this layer's infill area not covered by enough layers above and below.
    const inf = infillArea[i]
    let cover = inf
    for (let d = -s.bottomLayers; d <= s.topLayers && cover.length; d++) {
      if (d === 0) continue
      const j = i + d
      cover = j < 0 || j >= n ? [] : intersect(cover, infillArea[j])
    }
    const solid = dropSmall(difference(inf, cover), 4 * w * w)
    const sparse = s.infill >= 100 ? [] : dropSmall(difference(inf, solid), 4 * w * w)
    const angle = i % 2 === 0 ? 45 : 135
    const fills: ToolPath[] = []
    const solidFull = s.infill >= 100 ? inf : solid
    if (solidFull.length) fills.push(...rowsToPaths(rectilinearFill(solidFull, w, angle), 'solid', 2 * w))
    if (s.infill > 0 && s.infill < 100 && sparse.length) {
      fills.push(...rowsToPaths(rectilinearFill(sparse, w / (s.infill / 100), angle), 'infill', 2 * w))
    }
    const heightHere = tops[i] - prevTop
    layers.push({ z: tops[i], height: heightHere, paths: orderRuns([...paths, ...walls], fills) })
  }
  return layers
}

export interface SliceJob {
  plan: PlanResult
  /** Part size in mm after placement. */
  size: [number, number, number]
}

/** Full pipeline: mesh -> layers -> toolpaths. `onProgress` gets values 0..1. */
export function slicePlan(mesh: Mesh, s: Settings, onProgress?: (f: number) => void): SliceJob {
  const bb = bounds(mesh)
  const height = bb.max[2] - bb.min[2]
  const { top, mid } = layerStack(height, s.firstLayerHeight, s.layerHeight)
  const zs = mid.map((m) => m + bb.min[2])
  onProgress?.(0.05)
  const sliced = sliceMesh(mesh, zs)
  onProgress?.(0.4)
  const layers = planLayers(sliced.layers, top, s)
  onProgress?.(0.8)
  return {
    plan: { layers, openLoops: sliced.openLoops },
    size: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], height],
  }
}
