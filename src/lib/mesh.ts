/** A triangle soup: 9 floats (three xyz vertices) per triangle, in millimetres. */
export interface Mesh {
  tris: Float32Array
}

export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export const triCount = (m: Mesh) => m.tris.length / 9

export function bounds(m: Mesh): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const t = m.tris
  for (let i = 0; i < t.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = t[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  return { min, max }
}

/** Parses binary or ASCII STL. Throws on files with no triangles. */
export function parseSTL(buf: ArrayBuffer): Mesh {
  if (buf.byteLength >= 84) {
    const n = new DataView(buf).getUint32(80, true)
    if (84 + n * 50 === buf.byteLength && n > 0) {
      const dv = new DataView(buf)
      const tris = new Float32Array(n * 9)
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12
        for (let k = 0; k < 9; k++) tris[i * 9 + k] = dv.getFloat32(o + k * 4, true)
      }
      return { tris }
    }
  }
  const text = new TextDecoder().decode(buf)
  const out: number[] = []
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(+m[1], +m[2], +m[3])
  if (out.length < 9 || out.length % 9 !== 0 || out.some((v) => !Number.isFinite(v))) throw new Error('Not a valid STL file')
  return { tris: Float32Array.from(out) }
}

/** Binary STL. */
export function writeSTL(m: Mesh): ArrayBuffer {
  const n = triCount(m)
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, n, true)
  const t = m.tris
  for (let i = 0; i < n; i++) {
    const b = i * 9
    const ux = t[b + 3] - t[b], uy = t[b + 4] - t[b + 1], uz = t[b + 5] - t[b + 2]
    const vx = t[b + 6] - t[b], vy = t[b + 7] - t[b + 1], vz = t[b + 8] - t[b + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    const o = 84 + i * 50
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true)
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, t[b + k], true)
  }
  return buf
}

/** Signed volume in mm^3 (positive for outward-facing triangles). */
export function volume(m: Mesh): number {
  const t = m.tris
  let v = 0
  for (let i = 0; i < t.length; i += 9) {
    v += t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])
  }
  return v / 6
}

export interface Transform {
  /** Uniform scale in percent. */
  scale: number
  /** Rotations in degrees about X, Y, Z (applied in that order). */
  rx: number
  ry: number
  rz: number
}

export const IDENTITY: Transform = { scale: 100, rx: 0, ry: 0, rz: 0 }

/**
 * Scales and rotates the mesh, then drops it on the bed: centred on (cx, cy), lowest point at z = 0.
 */
export function placeOnBed(m: Mesh, xf: Transform, cx: number, cy: number): Mesh {
  const s = xf.scale / 100
  const [a, b, c] = [xf.rx, xf.ry, xf.rz].map((d) => (d * Math.PI) / 180)
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  const t = m.tris
  const out = new Float32Array(t.length)
  for (let i = 0; i < t.length; i += 3) {
    let x = t[i] * s, y = t[i + 1] * s, z = t[i + 2] * s
    let y2 = y * ca - z * sa
    let z2 = y * sa + z * ca
    y = y2; z = z2
    const x2 = x * cb + z * sb
    z2 = -x * sb + z * cb
    x = x2; z = z2
    const x3 = x * cc - y * sc
    y2 = x * sc + y * cc
    out[i] = x3; out[i + 1] = y2; out[i + 2] = z
  }
  const bb = bounds({ tris: out })
  const dx = cx - (bb.min[0] + bb.max[0]) / 2
  const dy = cy - (bb.min[1] + bb.max[1]) / 2
  const dz = -bb.min[2]
  for (let i = 0; i < out.length; i += 3) {
    out[i] += dx; out[i + 1] += dy; out[i + 2] += dz
  }
  return { tris: out }
}
