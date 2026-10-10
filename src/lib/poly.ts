import ClipperLib from 'clipper-lib'

/** A point in integer micrometres (Clipper works on integers). */
export type Pt = { x: number; y: number }
export type Poly = Pt[]
export type Paths = Poly[]

/** Micrometres per millimetre. */
export const UM = 1000

const P = (p: Paths): ClipperLib.Paths => p.map((q) => q.map((v) => ({ X: v.x, Y: v.y })))
const R = (p: ClipperLib.Paths): Paths => p.map((q) => q.map((v) => ({ x: v.X, y: v.Y })))

function boolOp(type: number, a: Paths, b: Paths, fill: number): Paths {
  const c = new ClipperLib.Clipper()
  c.AddPaths(P(a), ClipperLib.PolyType.ptSubject, true)
  if (b.length) c.AddPaths(P(b), ClipperLib.PolyType.ptClip, true)
  const sol: ClipperLib.Paths = []
  c.Execute(type, sol, fill, fill)
  return tidy(R(sol))
}

/** Signed area in um^2: positive for counter-clockwise (outer) loops, negative for holes. */
export function area(p: Poly): number {
  let a = 0
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[(i + 1) % n]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return a / 2
}

/** Net area of a region (outers minus holes) in um^2. */
export const areaPaths = (ps: Paths): number => ps.reduce((s, p) => s + area(p), 0)

/**
 * Removes repeated and (nearly) collinear vertices. Duplicate points make Clipper's offsetting misbehave,
 * and meshes triangulated with diagonals produce many collinear ones.
 */
export function clean(p: Poly, tol = 2): Poly {
  let pts = p.filter((q, i) => {
    const prev = p[(i + p.length - 1) % p.length]
    return q.x !== prev.x || q.y !== prev.y
  })
  for (let pass = 0; pass < 4 && pts.length >= 3; pass++) {
    const n = pts.length
    const out: Poly = []
    let prevRemoved = false
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n]
      const b = pts[i]
      const c = pts[(i + 1) % n]
      const acx = c.x - a.x, acy = c.y - a.y
      const len = Math.hypot(acx, acy)
      // Perpendicular distance of b from the line a-c, and b must lie between a and c.
      const collinear =
        len > 0 &&
        Math.abs((b.x - a.x) * acy - (b.y - a.y) * acx) / len <= tol &&
        (b.x - a.x) * acx + (b.y - a.y) * acy >= 0 &&
        (c.x - b.x) * acx + (c.y - b.y) * acy >= 0
      if (collinear && !prevRemoved) prevRemoved = true
      else {
        prevRemoved = false
        out.push(b)
      }
    }
    if (out.length === pts.length) break
    pts = out
  }
  return pts.length >= 3 ? pts : []
}

const tidy = (ps: Paths): Paths => ps.map((p) => clean(p)).filter((p) => p.length >= 3)

/** Even-odd union: merges loops into a region of outer loops (CCW) and holes (CW). */
export const union = (ps: Paths): Paths => (ps.length ? boolOp(ClipperLib.ClipType.ctUnion, tidy(ps), [], ClipperLib.PolyFillType.pftEvenOdd) : [])
export const intersect = (a: Paths, b: Paths): Paths => (a.length && b.length ? boolOp(ClipperLib.ClipType.ctIntersection, a, b, ClipperLib.PolyFillType.pftNonZero) : [])
export const difference = (a: Paths, b: Paths): Paths => (a.length ? (b.length ? boolOp(ClipperLib.ClipType.ctDifference, a, b, ClipperLib.PolyFillType.pftNonZero) : a) : [])

/** Offsets a region; negative delta (um) shrinks it. Rounded joins. */
export function offset(ps: Paths, delta: number): Paths {
  if (!ps.length) return []
  const co = new ClipperLib.ClipperOffset(2, 10)
  co.AddPaths(P(tidy(ps)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const sol: ClipperLib.Paths = []
  co.Execute(sol, delta)
  return tidy(R(sol))
}

/** Drops regions smaller than minArea (um^2); holes are kept only when they are big enough too. */
export const dropSmall = (ps: Paths, minArea: number): Paths => ps.filter((p) => Math.abs(area(p)) >= minArea)

/**
 * Rectilinear fill: parallel lines `spacing` apart at `angleDeg`, clipped to the region (even-odd).
 * Lines sit on a global grid so successive layers line up. Returns rows of segments [x1,y1,x2,y2].
 */
export function rectilinearFill(region: Paths, spacing: number, angleDeg: number): number[][][] {
  if (!region.length || spacing <= 0) return []
  const a = (-angleDeg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  // Rotate into the frame where lines are horizontal.
  const rot = region.map((p) => p.map((q) => ({ x: q.x * c - q.y * s, y: q.x * s + q.y * c })))
  let minY = Infinity
  let maxY = -Infinity
  for (const p of rot) for (const q of p) {
    if (q.y < minY) minY = q.y
    if (q.y > maxY) maxY = q.y
  }
  const rows: number[][][] = []
  const back = (x: number, y: number): [number, number] => [x * c + y * s, -x * s + y * c]
  const first = Math.ceil(minY / spacing)
  for (let k = first; k * spacing <= maxY; k++) {
    const y = k * spacing + 0.37
    const xs: number[] = []
    for (const p of rot) {
      for (let i = 0, n = p.length; i < n; i++) {
        const u = p[i]
        const v = p[(i + 1) % n]
        if ((u.y <= y && v.y > y) || (v.y <= y && u.y > y)) xs.push(u.x + ((y - u.y) / (v.y - u.y)) * (v.x - u.x))
      }
    }
    if (xs.length < 2) continue
    xs.sort((m, n) => m - n)
    const row: number[][] = []
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 1) continue
      const [x1, y1] = back(xs[i], y)
      const [x2, y2] = back(xs[i + 1], y)
      row.push([x1, y1, x2, y2])
    }
    if (row.length) rows.push(row)
  }
  return rows
}
