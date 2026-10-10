import { useRef, useState } from 'react'
import { bounds, type Mesh } from '../lib/mesh'
import type { Settings } from '../lib/settings'
import { makeProjector, readPalette } from '../lib/view3d'
import { useCanvas } from './useCanvas'
import type { T } from '../i18n'

const MAX_TRIS = 60000

export default function ModelView({ mesh, settings, theme, t }: { mesh: Mesh | null; settings: Settings; theme: string; t: T }) {
  const [view, setView] = useState({ yaw: -0.6, pitch: 0.7 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const canvas = useCanvas(
    (ctx, w, h) => {
      const pal = readPalette(ctx.canvas)
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, w, h)
      const { bedX, bedY } = settings
      const bb = mesh ? bounds(mesh) : { min: [0, 0, 0], max: [bedX / 2, bedY / 2, 20] }
      const sz = bb.max[2] - bb.min[2]
      const r = Math.max(Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], sz) / 2, 1)
      const proj = makeProjector({ ...view, cx: bedX / 2, cy: bedY / 2, cz: sz / 2, scale: (0.42 * Math.min(w, h)) / r, w, h })
      // Bed outline plus a local grid under the part.
      ctx.strokeStyle = pal.gridStrong
      ctx.beginPath()
      const m = Math.max(r * 1.2, 20)
      const x0 = Math.max(0, bedX / 2 - m), x1 = Math.min(bedX, bedX / 2 + m)
      const y0 = Math.max(0, bedY / 2 - m), y1 = Math.min(bedY, bedY / 2 + m)
      for (let g = Math.ceil(x0 / 10) * 10; g <= x1; g += 10) {
        const [a, b] = proj(g, y0, 0), [c, d] = proj(g, y1, 0)
        ctx.moveTo(a, b); ctx.lineTo(c, d)
      }
      for (let g = Math.ceil(y0 / 10) * 10; g <= y1; g += 10) {
        const [a, b] = proj(x0, g, 0), [c, d] = proj(x1, g, 0)
        ctx.moveTo(a, b); ctx.lineTo(c, d)
      }
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
      if (!mesh) return
      const tr = mesh.tris
      const n = tr.length / 9
      const step = Math.max(1, Math.ceil(n / MAX_TRIS))
      const items: { i: number; d: number }[] = []
      for (let i = 0; i < n; i += step) {
        const b = i * 9
        items.push({ i: b, d: proj.depth((tr[b] + tr[b + 3] + tr[b + 6]) / 3, (tr[b + 1] + tr[b + 4] + tr[b + 7]) / 3, (tr[b + 2] + tr[b + 5] + tr[b + 8]) / 3) })
      }
      items.sort((a, b) => b.d - a.d)
      const light = [0.4, -0.5, 0.75]
      const ll = Math.hypot(...light)
      const dark = getComputedStyle(ctx.canvas).colorScheme === 'dark'
      for (const { i: b } of items) {
        const ux = tr[b + 3] - tr[b], uy = tr[b + 4] - tr[b + 1], uz = tr[b + 5] - tr[b + 2]
        const vx = tr[b + 6] - tr[b], vy = tr[b + 7] - tr[b + 1], vz = tr[b + 8] - tr[b + 2]
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl; ny /= nl; nz /= nl
        const lit = Math.abs(nx * light[0] + ny * light[1] + nz * light[2]) / ll
        const k = 0.25 + 0.75 * lit
        ctx.fillStyle = dark ? `rgb(${Math.round(70 * k + 20)},${Math.round(130 * k + 20)},${Math.round(230 * k + 10)})` : `rgb(${Math.round(60 * k + 30)},${Math.round(110 * k + 30)},${Math.round(220 * k + 20)})`
        ctx.strokeStyle = ctx.fillStyle
        ctx.lineWidth = 0.6
        ctx.beginPath()
        const [a, c] = proj(tr[b], tr[b + 1], tr[b + 2])
        ctx.moveTo(a, c)
        for (let q = 3; q < 9; q += 3) {
          const [u, v] = proj(tr[b + q], tr[b + q + 1], tr[b + q + 2])
          ctx.lineTo(u, v)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    },
    [mesh, settings.bedX, settings.bedY, view, theme],
  )
  return (
    <div className="canvas-box">
      <canvas
        ref={canvas}
        className="grab"
        role="img"
        aria-label={t('Model preview')}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y
          drag.current = { x: e.clientX, y: e.clientY }
          setView((v) => ({ yaw: v.yaw + dx * 0.01, pitch: Math.max(0.05, Math.min(1.5, v.pitch + dy * 0.01)) }))
        }}
        onPointerUp={() => (drag.current = null)}
      />
    </div>
  )
}
