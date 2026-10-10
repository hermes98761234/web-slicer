import { useEffect, useRef, useState } from 'react'

/** Canvas sized to its box (device-pixel aware); `draw` runs on resize, theme change and when `deps` change. */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(c)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setTick((t) => t + 1)
    mq.addEventListener('change', on)
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', on)
    }
  }, [])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    if (!w || !h) return
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx, w, h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  return ref
}
