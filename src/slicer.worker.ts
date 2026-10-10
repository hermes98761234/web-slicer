import { generateGcode } from './lib/gcode'
import { slicePlan } from './lib/toolpaths'
import type { SliceOutput, WorkerRequest, WorkerResponse } from './useSlicer'

const ctx = self as unknown as { postMessage(m: WorkerResponse, t?: Transferable[]): void }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { tris, settings } = e.data
  let msg: WorkerResponse
  const transfer: ArrayBuffer[] = []
  try {
    const job = slicePlan({ tris }, settings, (progress) => ctx.postMessage({ progress }))
    const { gcode, stats } = generateGcode(job.plan.layers, settings)
    const out: SliceOutput = {
      layers: job.plan.layers.map((l) => ({
        z: l.z,
        height: l.height,
        paths: l.paths.map((p) => {
          const pts = Float32Array.from(p.pts)
          transfer.push(pts.buffer)
          return { kind: p.kind, closed: p.closed, pts }
        }),
      })),
      gcode,
      stats,
      size: job.size,
      openLoops: job.plan.openLoops,
    }
    msg = { result: out }
  } catch (err) {
    msg = { error: err instanceof Error ? err.message : String(err) }
  }
  ctx.postMessage(msg, transfer)
}
