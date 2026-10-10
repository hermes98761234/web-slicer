import { useRef, useState } from 'react'
import type { SliceOutput } from '../useSlicer'
import type { Settings } from '../lib/settings'
import { KIND_COLOR, makeProjector, readPalette } from '../lib/view3d'
import { useCanvas } from './useCanvas'
import type { T } from '../i18n'

interface Props {
  result: SliceOutput | null
  settings: Settings
  layer: number
  mode: 'layer' | 'stack'
  theme: string
  t: T
}

export default function LayerView({ result, settings, layer, mode, theme, t }: Props) {
  const [view, setView] = useState({ yaw: -0.6, pitch: 0.9 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const canvas = useCanvas(
    (ctx, w, h) => {
      const pal = readPalette(ctx.canvas)
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, w, h)
      const { bedX, bedY } = settings
      if (mode === 'layer') {
        const pad = 14
        // Zoom to the part (it is centred on the bed), keeping the skirt in view; whole bed when nothing is sliced.
        const [px, py] = result ? result.size : [bedX, bedY]
        const margin = settings.skirtLoops > 0 ? settings.skirtDistance + settings.skirtLoops * settings.lineWidth + 4 : 4
        const hx = Math.min(bedX / 2, Math.max(px / 2 + margin, 12)), hy = Math.min(bedY / 2, Math.max(py / 2 + margin, 12))
        const sc = Math.min((w - 2 * pad) / (2 * hx), (h - 2 * pad) / (2 * hy))
        const X = (x: number) => w / 2 + (x - bedX / 2) * sc
        const Y = (y: number) => h / 2 - (y - bedY / 2) * sc
        ctx.lineWidth = 1
        const gx0 = Math.max(0, Math.ceil((bedX / 2 - w / 2 / sc) / 10) * 10), gx1 = Math.min(bedX, bedX / 2 + w / 2 / sc)
        const gy0 = Math.max(0, Math.ceil((bedY / 2 - h / 2 / sc) / 10) * 10), gy1 = Math.min(bedY, bedY / 2 + h / 2 / sc)
        for (let g = gx0; g <= gx1; g += 10) {
          ctx.strokeStyle = g % 50 === 0 ? pal.gridStrong : pal.grid
          ctx.beginPath(); ctx.moveTo(X(g), Y(gy0)); ctx.lineTo(X(g), Y(gy1)); ctx.stroke()
        }
        for (let g = gy0; g <= gy1; g += 10) {
          ctx.strokeStyle = g % 50 === 0 ? pal.gridStrong : pal.grid
          ctx.beginPath(); ctx.moveTo(X(gx0), Y(g)); ctx.lineTo(X(gx1), Y(g)); ctx.stroke()
        }
        ctx.strokeStyle = pal.fg
        ctx.strokeRect(X(0), Y(bedY), bedX * sc, bedY * sc)
        if (!result) return
        const lw = Math.max(1, settings.lineWidth * sc)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const trace = (pts: Float32Array, closed: boolean) => {
          ctx.beginPath()
          ctx.moveTo(X(pts[0]), Y(pts[1]))
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i]), Y(pts[i + 1]))
          if (closed) ctx.closePath()
          ctx.stroke()
        }
        if (layer > 0) {
          ctx.globalAlpha = 0.3
          ctx.strokeStyle = pal.muted
          ctx.lineWidth = lw
          for (const p of result.layers[layer - 1].paths) trace(p.pts, p.closed)
          ctx.globalAlpha = 1
        }
        ctx.lineWidth = lw
        for (const p of result.layers[layer].paths) {
          ctx.strokeStyle = KIND_COLOR[p.kind]
          trace(p.pts, p.closed)
        }
      } else {
        // Stack: outlines of every layer up to the current one, in 3D.
        const [sx, sy, sz] = result?.size ?? [bedX / 2, bedY / 2, 20]
        const cx = bedX / 2, cy = bedY / 2
        const r = Math.hypot(sx, sy, sz) / 2 || 1
        const proj = makeProjector({ ...view, cx, cy, cz: sz / 2, scale: (0.42 * Math.min(w, h)) / r, w, h })
        ctx.strokeStyle = pal.gridStrong
        ctx.beginPath()
        for (const [x, y] of [[0, 0], [bedX, 0], [bedX, bedY], [0, bedY]]) {
          const [u, v] = proj(x, y, 0)
          if (x === 0 && y === 0) ctx.moveTo(u, v)
          else ctx.lineTo(u, v)
        }
        ctx.closePath()
        ctx.stroke()
        if (!result) return
        ctx.lineWidth = 1
        for (let li = 0; li <= layer; li++) {
          const l = result.layers[li]
          for (const p of l.paths) {
            if (p.kind === 'solid' || p.kind === 'infill') continue
            ctx.strokeStyle = KIND_COLOR[p.kind]
            ctx.globalAlpha = li === layer ? 1 : 0.55
            ctx.beginPath()
            for (let i = 0; i < p.pts.length; i += 2) {
              const [u, v] = proj(p.pts[i], p.pts[i + 1], l.z)
              if (i === 0) ctx.moveTo(u, v)
              else ctx.lineTo(u, v)
            }
            if (p.closed) ctx.closePath()
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
    },
    [result, settings.bedX, settings.bedY, settings.lineWidth, settings.skirtLoops, settings.skirtDistance, layer, mode, view, theme],
  )

  return (
    <div className="canvas-box">
      <canvas
        ref={canvas}
        className={mode === 'stack' ? 'grab' : undefined}
        role="img"
        aria-label={t('Layer preview')}
        onPointerDown={(e) => {
          if (mode !== 'stack') return
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
