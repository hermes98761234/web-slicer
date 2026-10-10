import { describe, expect, it } from 'vitest'
import { IDENTITY, bounds, parseSTL, placeOnBed, triCount, volume, writeSTL } from './mesh'
import { areaPaths, offset, rectilinearFill, UM, area, union } from './poly'
import { box, cylinder, sphere, torus, vase } from './samples'
import { joinSegments, layerStack, sliceMesh } from './slice'
import { DEFAULTS, invalidKeys, mergeSettings } from './settings'
import { planLayers, slicePlan } from './toolpaths'
import { extrusion, generateGcode, moveTime } from './gcode'

const mm2 = (um2: number) => um2 / (UM * UM)

describe('mesh and STL', () => {
  it('box has 12 triangles and volume = sx*sy*sz', () => {
    const m = box(10, 20, 30)
    expect(triCount(m)).toBe(12)
    expect(Math.abs(volume(m))).toBeCloseTo(6000, 3)
  })
  it('binary STL round trips', () => {
    const m = box(10, 20, 30)
    const back = parseSTL(writeSTL(m))
    expect(Array.from(back.tris)).toEqual(Array.from(m.tris))
  })
  it('parses ASCII STL', () => {
    const txt = `solid t
facet normal 0 0 1
 outer loop
  vertex 0 0 0
  vertex 1 0 0
  vertex 0 1e0 0
 endloop
endfacet
endsolid`
    const m = parseSTL(new TextEncoder().encode(txt).buffer as ArrayBuffer)
    expect(triCount(m)).toBe(1)
    expect(m.tris[4]).toBe(0)
    expect(m.tris[7]).toBe(1)
  })
  it('rejects garbage', () => {
    expect(() => parseSTL(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow()
  })
  it('sphere volume approaches 4/3 pi r^3', () => {
    expect(Math.abs(volume(sphere(10, 96)))).toBeCloseTo((4 / 3) * Math.PI * 1000, -1.5)
  })
  it('placeOnBed centres the part and drops it to z = 0', () => {
    const m = placeOnBed(box(10, 10, 10), { ...IDENTITY, scale: 200 }, 110, 100)
    const b = bounds(m)
    expect(b.min[2]).toBeCloseTo(0)
    expect(b.max[2]).toBeCloseTo(20)
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(110)
    expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(100)
  })
  it('rotating a box 90 degrees about X swaps height and depth', () => {
    const m = placeOnBed(box(10, 20, 30), { ...IDENTITY, rx: 90 }, 0, 0)
    const b = bounds(m)
    expect(b.max[2] - b.min[2]).toBeCloseTo(20)
    expect(b.max[1] - b.min[1]).toBeCloseTo(30)
  })
})

describe('layer stack', () => {
  it('uses the first layer height then constant layers', () => {
    const { top, mid } = layerStack(20, 0.3, 0.2)
    expect(top[0]).toBeCloseTo(0.3)
    expect(top[1]).toBeCloseTo(0.5)
    expect(top.length).toBe(Math.round((20 - 0.3) / 0.2) + 1)
    expect(mid[0]).toBeCloseTo(0.15)
    expect(mid[1]).toBeCloseTo(0.4)
  })
})

describe('slicing', () => {
  it('a 20 mm cube slices to 400 mm2 squares', () => {
    const { layers, openLoops } = sliceMesh(box(20, 20, 20), [0.1, 10, 19.9])
    expect(openLoops).toBe(0)
    for (const l of layers) {
      expect(l).toHaveLength(1)
      expect(mm2(areaPaths(l))).toBeCloseTo(400, 3)
      expect(l[0]).toHaveLength(4)
    }
  })
  it('outside the model gives empty layers', () => {
    const { layers } = sliceMesh(box(20, 20, 20), [-1, 21])
    expect(layers.map((l) => l.length)).toEqual([0, 0])
  })
  it('cylinder cross-section matches the inscribed polygon area', () => {
    const n = 64
    const { layers } = sliceMesh(cylinder(10, 10, n), [5])
    expect(mm2(areaPaths(layers[0]))).toBeCloseTo(0.5 * n * 100 * Math.sin((2 * Math.PI) / n), 1)
  })
  it('sphere equator radius is r', () => {
    const { layers } = sliceMesh(sphere(15, 96), [15])
    const a = mm2(areaPaths(layers[0]))
    expect(a).toBeGreaterThan(Math.PI * 225 * 0.995)
    expect(a).toBeLessThan(Math.PI * 225)
  })
  it('torus mid-plane is an annulus: outer loop plus a hole', () => {
    const { layers } = sliceMesh(torus(14, 5, 96), [5])
    const l = layers[0]
    expect(l).toHaveLength(2)
    expect(l.filter((p) => area(p) < 0)).toHaveLength(1)
    expect(mm2(areaPaths(l))).toBeCloseTo(Math.PI * (19 * 19 - 9 * 9), -1)
  })
  it('vase cross-section is a ring and the floor is solid', () => {
    const { layers } = sliceMesh(vase(), [1, 25])
    expect(layers[0]).toHaveLength(1)
    expect(layers[1]).toHaveLength(2)
  })
  it('joins shuffled segments into one loop and reports open chains', () => {
    const sq = [0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0]
    expect(joinSegments(sq).loops).toHaveLength(1)
    expect(joinSegments([0, 0, 5, 0, 5, 0, 5, 5]).open).toBe(1)
  })
})

describe('polygon operations', () => {
  const square = (s: number) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }]
  it('offsetting a 20 mm square inward by 1 mm gives 18 mm', () => {
    const r = offset([square(20 * UM)], -UM)
    expect(mm2(areaPaths(r))).toBeCloseTo(324, 3)
  })
  it('outward offset rounds the corners', () => {
    const r = offset([square(20 * UM)], UM)
    const a = mm2(areaPaths(r))
    expect(a).toBeCloseTo(400 + 4 * 20 + Math.PI, 0)
  })
  it('union with even-odd turns a nested loop into a hole', () => {
    const inner = square(5 * UM).map((p) => ({ x: p.x + 5 * UM, y: p.y + 5 * UM }))
    const r = union([square(20 * UM), inner])
    expect(mm2(areaPaths(r))).toBeCloseTo(400 - 25, 3)
  })
  it('rectilinear fill spacing and coverage', () => {
    const rows = rectilinearFill([square(20 * UM)], 2 * UM, 0)
    expect(rows.length).toBeGreaterThanOrEqual(9)
    expect(rows.length).toBeLessThanOrEqual(11)
    for (const row of rows) {
      expect(row).toHaveLength(1)
      const [x1, , x2] = row[0]
      expect(Math.abs(x2 - x1)).toBeCloseTo(20 * UM, -1)
    }
  })
  it('rectilinear fill skips holes', () => {
    const hole = square(10 * UM).map((p) => ({ x: p.x + 5 * UM, y: p.y + 5 * UM })).reverse()
    const rows = rectilinearFill([square(20 * UM), hole], 1 * UM, 0)
    const middle = rows.find((r) => r.length === 2)
    expect(middle).toBeDefined()
    const total = rows.flat().reduce((s, [x1, , x2]) => s + Math.abs(x2 - x1), 0)
    // Filled length ~ area / spacing.
    expect(total / UM).toBeCloseTo((400 - 100) / 1, -1.3)
  })
  it('diagonal fill stays inside the region', () => {
    const rows = rectilinearFill([square(10 * UM)], 1 * UM, 45)
    for (const row of rows) for (const [x1, y1, x2, y2] of row) for (const v of [x1, y1, x2, y2]) {
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThanOrEqual(10 * UM + 2)
    }
  })
})

describe('toolpaths', () => {
  const s = { ...DEFAULTS }
  const cube = placeOnBed(box(20, 20, 20), IDENTITY, 110, 110)
  const { plan, size } = slicePlan(cube, s)
  it('has the expected layer count and part size', () => {
    expect(size[2]).toBeCloseTo(20)
    expect(plan.layers).toHaveLength(Math.round((20 - 0.3) / 0.2) + 1)
    expect(plan.openLoops).toBe(0)
  })
  it('layer 0 has skirt, 2 wall loops and a full solid skin', () => {
    const l0 = plan.layers[0]
    expect(l0.paths.filter((p) => p.kind === 'skirt')).toHaveLength(2)
    expect(l0.paths.filter((p) => p.kind === 'outer')).toHaveLength(1)
    expect(l0.paths.filter((p) => p.kind === 'inner')).toHaveLength(1)
    expect(l0.paths.some((p) => p.kind === 'solid')).toBe(true)
    expect(l0.paths.some((p) => p.kind === 'infill')).toBe(false)
  })
  it('outer wall centreline sits half a line width inside the surface', () => {
    const outer = plan.layers[10].paths.find((p) => p.kind === 'outer')!
    const xs = outer.pts.filter((_, i) => i % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(100 + 0.225, 2)
    expect(Math.max(...xs)).toBeCloseTo(120 - 0.225, 2)
  })
  it('middle layers have sparse infill only, top layers are solid', () => {
    const mid = plan.layers[50]
    expect(mid.paths.some((p) => p.kind === 'infill')).toBe(true)
    expect(mid.paths.some((p) => p.kind === 'solid')).toBe(false)
    const top = plan.layers[plan.layers.length - 1]
    expect(top.paths.some((p) => p.kind === 'solid')).toBe(true)
    expect(top.paths.some((p) => p.kind === 'infill')).toBe(false)
    // top skin = topLayers layers
    const solidTop = plan.layers.slice(-s.topLayers).every((l) => l.paths.some((p) => p.kind === 'solid'))
    expect(solidTop).toBe(true)
    expect(plan.layers[plan.layers.length - 1 - s.topLayers].paths.some((p) => p.kind === 'solid')).toBe(false)
  })
  it('sparse infill line length matches the density', () => {
    const mid = plan.layers[50]
    const len = mid.paths.filter((p) => p.kind === 'infill').reduce((a, p) => a + Math.hypot(p.pts[2] - p.pts[0], p.pts[3] - p.pts[1]), 0)
    // inner region ~ (20 - 2*0.45*2 + 0.15*.45*2)^2, lines every lw/0.2 mm
    const side = 20 - 2 * (2 - 0.15) * 0.45
    expect(len).toBeCloseTo((side * side) / (0.45 / 0.2), -1)
  })
  it('100 % infill is solid everywhere and 0 % has no infill', () => {
    const full = planLayers(sliceMesh(cube, [10]).layers, [10], { ...s, infill: 100 })
    expect(full[0].paths.some((p) => p.kind === 'solid')).toBe(true)
    const none = planLayers(sliceMesh(cube, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((z) => z)).layers, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], { ...s, infill: 0, topLayers: 1, bottomLayers: 1 })
    expect(none[5].paths.some((p) => p.kind === 'infill')).toBe(false)
  })
  it('a hollow vase gets walls on both surfaces', () => {
    const v = slicePlan(placeOnBed(vase(), IDENTITY, 110, 110), s)
    const l = v.plan.layers[100]
    expect(l.paths.filter((p) => p.kind === 'outer')).toHaveLength(2)
  })
})

describe('G-code', () => {
  it('extrusion matches the volume-conservation formula', () => {
    // 10 mm line, 0.2 x 0.4 mm cross-section, 1.75 mm filament
    expect(extrusion(10, 0.2, { lineWidth: 0.4, filamentDiameter: 1.75, flow: 100 })).toBeCloseTo((10 * 0.2 * 0.4) / (Math.PI * 0.875 ** 2), 6)
    expect(extrusion(10, 0.2, { lineWidth: 0.4, filamentDiameter: 1.75, flow: 100 })).toBeCloseTo(0.3326, 3)
    expect(extrusion(10, 0.2, { lineWidth: 0.4, filamentDiameter: 2.85, flow: 50 })).toBeCloseTo(0.0627, 3)
  })
  it('trapezoid move time', () => {
    expect(moveTime(100, 50, 1000)).toBeCloseTo(2.05, 3)
    expect(moveTime(1, 100, 1000)).toBeCloseTo(2 * Math.sqrt(0.001), 6)
  })
  const s = { ...DEFAULTS }
  const cube = placeOnBed(box(20, 20, 20), IDENTITY, 110, 110)
  const { plan } = slicePlan(cube, s)
  const { gcode, stats } = generateGcode(plan.layers, s)
  it('has header, one marker per layer, temps and fan', () => {
    expect(gcode).toContain('M109 S210')
    expect(gcode).toContain('M190 S60')
    expect(gcode.match(/^;LAYER:/gm)).toHaveLength(plan.layers.length)
    expect(gcode).toContain('M106 S255')
    expect(gcode.trimEnd().endsWith('M84 ; motors off')).toBe(true)
  })
  it('keeps every move inside the bed', () => {
    for (const m of gcode.split('G91')[0].matchAll(/^G[01] X([\d.]+) Y([\d.]+)/gm)) {
      expect(+m[1]).toBeGreaterThan(80)
      expect(+m[1]).toBeLessThan(140)
      expect(+m[2]).toBeGreaterThan(80)
      expect(+m[2]).toBeLessThan(140)
    }
  })
  it('filament use is consistent with the extruded volume', () => {
    const sum = [...gcode.matchAll(/^G1 X[\d.]+ Y[\d.]+ E([\d.]+)/gm)].reduce((a, m) => a + +m[1], 0)
    expect(sum).toBeCloseTo(stats.filament, 0)
    // a 20 mm cube at 20 % infill with 2 walls: a few grams of PLA, in a sane range
    expect(stats.mass).toBeGreaterThan(2)
    expect(stats.mass).toBeLessThan(8)
    expect(stats.time).toBeGreaterThan(600)
  })
  it('retracts before long travels and primes again', () => {
    expect(gcode).toContain('G1 E-4 F2100')
    expect(gcode).toContain('G1 E4 F2100')
  })
})

describe('settings', () => {
  it('defaults are valid', () => expect(invalidKeys(DEFAULTS).size).toBe(0))
  it('flags out-of-range and NaN values', () => {
    const bad = invalidKeys({ ...DEFAULTS, layerHeight: 0, infill: 120, walls: NaN })
    expect([...bad].sort()).toEqual(['infill', 'layerHeight', 'walls'])
  })
  it('merges stored values, ignoring junk', () => {
    const m = mergeSettings({ infill: 35, layerHeight: 'x', nope: 1 })
    expect(m.infill).toBe(35)
    expect(m.layerHeight).toBe(DEFAULTS.layerHeight)
  })
})
