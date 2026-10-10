import type { Mesh } from './mesh'
import { UM, union, type Paths, type Poly } from './poly'

/** Layer heights: the first layer is `first` thick, the rest `h`. Returns top z and mid-plane z of each layer. */
export function layerStack(height: number, first: number, h: number): { top: number[]; mid: number[] } {
  const top: number[] = []
  const mid: number[] = []
  if (height <= 0) return { top, mid }
  const n = Math.max(1, Math.round((height - first) / h) + 1)
  let prev = 0
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? first : first + i * h
    top.push(t)
    mid.push((prev + t) / 2)
    prev = t
  }
  return { top, mid }
}

export interface SliceResult {
  /** Per layer: region as outer loops (CCW) and holes (CW), in micrometres. */
  layers: Paths[]
  /** Loops that could not be closed (non-watertight mesh), summed over all layers. */
  openLoops: number
}


/**
 * Slices a triangle mesh at each z in `zs` (triangle-plane intersection), joins the segments into
 * closed loops and merges them into regions with an even-odd union.
 */
export function sliceMesh(mesh: Mesh, zs: number[]): SliceResult {
  const t = mesh.tris
  const nTri = t.length / 9
  const layerSegs: number[][] = zs.map(() => [])
  // For each triangle find the layer range it spans (zs ascending) and add its segment to each.
  for (let i = 0; i < nTri; i++) {
    const b = i * 9
    const za = t[b + 2], zb = t[b + 5], zc = t[b + 8]
    const lo = Math.min(za, zb, zc)
    const hi = Math.max(za, zb, zc)
    if (lo === hi) continue
    let l = lowerBound(zs, lo)
    for (; l < zs.length && zs[l] <= hi; l++) {
      const z = zs[l]
      // Vertices at or above the plane count as "above": consistent for shared vertices.
      const a0 = za >= z, a1 = zb >= z, a2 = zc >= z
      if (a0 === a1 && a1 === a2) continue
      const pts: number[] = []
      const edge = (p: number, q: number) => {
        let pi = b + p * 3, qi = b + q * 3
        // Canonical vertex order so both triangles sharing an edge compute identical coordinates.
        if (t[pi] > t[qi] || (t[pi] === t[qi] && (t[pi + 1] > t[qi + 1] || (t[pi + 1] === t[qi + 1] && t[pi + 2] > t[qi + 2])))) [pi, qi] = [qi, pi]
        const f = (z - t[pi + 2]) / (t[qi + 2] - t[pi + 2])
        pts.push(Math.round((t[pi] + f * (t[qi] - t[pi])) * UM), Math.round((t[pi + 1] + f * (t[qi + 1] - t[pi + 1])) * UM))
      }
      if (a0 !== a1) edge(0, 1)
      if (a1 !== a2) edge(1, 2)
      if (a2 !== a0) edge(2, 0)
      if (pts.length === 4 && (pts[0] !== pts[2] || pts[1] !== pts[3])) layerSegs[l].push(...pts)
    }
  }
  let openLoops = 0
  const layers = layerSegs.map((segs) => {
    const { loops, open } = joinSegments(segs)
    openLoops += open
    return union(loops)
  })
  return { layers, openLoops }
}

function lowerBound(a: number[], v: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m] < v) lo = m + 1
    else hi = m
  }
  return lo
}

/** Joins undirected segments [x1,y1,x2,y2,...] into closed loops. */
export function joinSegments(segs: number[]): { loops: Paths; open: number } {
  const n = segs.length / 4
  const ends = new Map<string, number[]>()
  const k = (x: number, y: number) => x + ',' + y
  for (let i = 0; i < n; i++) {
    for (const o of [0, 2]) {
      const kk = k(segs[i * 4 + o], segs[i * 4 + o + 1])
      const l = ends.get(kk)
      if (l) l.push(i)
      else ends.set(kk, [i])
    }
  }
  const used = new Uint8Array(n)
  const loops: Paths = []
  let open = 0
  for (let s = 0; s < n; s++) {
    if (used[s]) continue
    used[s] = 1
    const startX = segs[s * 4], startY = segs[s * 4 + 1]
    const poly: Poly = [{ x: startX, y: startY }]
    let cx = segs[s * 4 + 2], cy = segs[s * 4 + 3]
    let closed = false
    for (;;) {
      if (cx === startX && cy === startY) {
        closed = true
        break
      }
      poly.push({ x: cx, y: cy })
      const cand = ends.get(k(cx, cy))?.find((j) => !used[j])
      if (cand === undefined) break
      used[cand] = 1
      if (segs[cand * 4] === cx && segs[cand * 4 + 1] === cy) {
        cx = segs[cand * 4 + 2]
        cy = segs[cand * 4 + 3]
      } else {
        cx = segs[cand * 4]
        cy = segs[cand * 4 + 1]
      }
    }
    if (closed && poly.length >= 3) loops.push(poly)
    else open++
  }
  return { loops, open }
}
