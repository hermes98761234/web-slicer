import { useEffect, useState } from 'react'
import type { Mesh } from './lib/mesh'
import type { PrintStats } from './lib/gcode'
import type { Settings } from './lib/settings'
import type { Kind } from './lib/toolpaths'

export interface PreviewPath {
  kind: Kind
  closed: boolean
  pts: Float32Array
}
export interface PreviewLayer {
  z: number
  height: number
  paths: PreviewPath[]
}
export interface SliceOutput {
  layers: PreviewLayer[]
  gcode: string
  stats: PrintStats
  size: [number, number, number]
  openLoops: number
}

export type WorkerRequest = { tris: Float32Array; settings: Settings }
export type WorkerResponse = { progress: number } | { result: SliceOutput } | { error: string }

export type SliceState =
  | { status: 'idle' }
  | { status: 'working'; progress: number }
  | { status: 'done'; result: SliceOutput }
  | { status: 'error'; message: string }

const DEBOUNCE_MS = 350

/**
 * Slices in a Web Worker whenever the mesh or settings change; a change terminates the running job.
 * Results are tagged with the inputs they belong to, so stale results are never shown.
 */
export function useSlicer(mesh: Mesh | null, settings: Settings, enabled: boolean): SliceState {
  const [res, setRes] = useState<{ mesh: Mesh; settings: Settings; state: SliceState } | null>(null)
  const [progress, setProgress] = useState<{ mesh: Mesh; settings: Settings; value: number } | null>(null)

  useEffect(() => {
    if (!enabled || !mesh) return
    let worker: Worker | undefined
    const timer = window.setTimeout(() => {
      worker = new Worker(new URL('./slicer.worker.ts', import.meta.url), { type: 'module' })
      const finish = (state: SliceState) => {
        worker?.terminate()
        setRes({ mesh, settings, state })
      }
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const d = e.data
        if ('progress' in d) setProgress({ mesh, settings, value: d.progress })
        else if ('result' in d) finish({ status: 'done', result: d.result })
        else finish({ status: 'error', message: d.error })
      }
      worker.onerror = (e) => finish({ status: 'error', message: e.message || 'worker failed' })
      const msg: WorkerRequest = { tris: mesh.tris, settings }
      worker.postMessage(msg)
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      worker?.terminate()
    }
  }, [mesh, settings, enabled])

  if (!enabled || !mesh) return { status: 'idle' }
  if (res && res.mesh === mesh && res.settings === settings) return res.state
  const p = progress && progress.mesh === mesh && progress.settings === settings ? progress.value : 0
  return { status: 'working', progress: p }
}
