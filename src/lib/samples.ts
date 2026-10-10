import type { Mesh } from './mesh'

/** Builds a triangle soup from quads/triangles given as vertex lists. */
class Builder {
  t: number[] = []
  tri(a: number[], b: number[], c: number[]) {
    this.t.push(...a, ...b, ...c)
  }
  quad(a: number[], b: number[], c: number[], d: number[]) {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }
  mesh(): Mesh {
    return { tris: Float32Array.from(this.t) }
  }
}

export function box(sx: number, sy: number, sz: number): Mesh {
  const b = new Builder()
  const x = sx / 2, y = sy / 2
  const v = (i: number, j: number, k: number) => [i ? x : -x, j ? y : -y, k ? sz : 0]
  b.quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0))
  b.quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1))
  b.quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1))
  b.quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1))
  b.quad(v(1, 1, 0), v(0, 1, 0), v(0, 1, 1), v(1, 1, 1))
  b.quad(v(0, 1, 0), v(0, 0, 0), v(0, 0, 1), v(0, 1, 1))
  return b.mesh()
}

/**
 * Surface of revolution about Z. `profile` is a closed loop of (r, z) points (r >= 0), counter-clockwise
 * in the (r, z) plane so that normals face outwards.
 */
export function lathe(profile: [number, number][], segments = 64): Mesh {
  const b = new Builder()
  const n = profile.length
  for (let i = 0; i < n; i++) {
    const [r1, z1] = profile[i]
    const [r2, z2] = profile[(i + 1) % n]
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * 2 * Math.PI
      const a1 = ((s + 1) / segments) * 2 * Math.PI
      const p = (r: number, z: number, a: number) => [r * Math.cos(a), r * Math.sin(a), z]
      if (r1 === 0 && r2 === 0) continue
      if (r1 === 0) b.tri(p(0, z1, 0), p(r2, z2, a0), p(r2, z2, a1))
      else if (r2 === 0) b.tri(p(r1, z1, a0), p(0, z2, 0), p(r1, z1, a1))
      else b.quad(p(r1, z1, a0), p(r2, z2, a0), p(r2, z2, a1), p(r1, z1, a1))
    }
  }
  return b.mesh()
}

export const cylinder = (r: number, h: number, segments = 64): Mesh =>
  lathe([[0, 0], [r, 0], [r, h], [0, h]], segments)

export function sphere(r: number, segments = 48): Mesh {
  const prof: [number, number][] = [[0, 0]]
  const rings = segments / 2
  for (let i = 1; i < rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * Math.PI
    prof.push([r * Math.cos(a), r + r * Math.sin(a)])
  }
  prof.push([0, 2 * r])
  return lathe(prof, segments)
}

export function torus(R: number, r: number, segments = 64): Mesh {
  const prof: [number, number][] = []
  const n = 24
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    prof.push([R + r * Math.cos(a), r + r * Math.sin(a)])
  }
  return lathe(prof, segments)
}

/** An open-topped vase: closed floor, curved wall, constant wall thickness. */
export function vase(segments = 64): Mesh {
  const outer: [number, number][] = []
  const N = 24
  const H = 50
  const rad = (z: number) => 15 + 6 * Math.sin((z / H) * Math.PI * 1.4)
  for (let i = 0; i <= N; i++) outer.push([rad((i / N) * H), (i / N) * H])
  const wall = 2.4
  const prof: [number, number][] = [[0, 0]]
  prof.push(...outer)
  for (let i = N; i >= 0; i--) {
    const z = (i / N) * H
    if (z >= 3) prof.push([rad(z) - wall, z])
  }
  prof.push([0, 3])
  return lathe(prof, segments)
}

export const SAMPLES: { id: string; name: string; make: () => Mesh }[] = [
  { id: 'cube', name: 'Calibration cube 20 mm', make: () => box(20, 20, 20) },
  { id: 'vase', name: 'Vase (hollow, open top)', make: () => vase() },
  { id: 'sphere', name: 'Sphere 30 mm', make: () => sphere(15) },
  { id: 'torus', name: 'Torus', make: () => torus(14, 5) },
  { id: 'cylinder', name: 'Cylinder 30 x 25 mm', make: () => cylinder(15, 25) },
]
