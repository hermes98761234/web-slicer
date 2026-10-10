import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IDENTITY, bounds, parseSTL, placeOnBed, triCount, type Mesh } from './lib/mesh'
import { SAMPLES } from './lib/samples'
import { PRESETS, invalidKeys, type Settings } from './lib/settings'
import { loadState, saveState, type AppState } from './lib/state'
import { fmtTime, placementWarnings } from './lib/project'
import { tr, type T } from './i18n'
import { useSlicer } from './useSlicer'
import NumberField from './components/NumberField'
import LayerView from './components/LayerView'
import ModelView from './components/ModelView'

const REPO = 'https://github.com/hermes98761234/web-slicer'

function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const { settings, xf, lang, theme } = state
  const t: T = (s, ...a) => tr(lang, s, ...a)
  const [source, setSource] = useState<{ name: string; mesh: Mesh } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<'layers' | 'stack' | 'model'>('layers')
  const [layerSel, setLayerSel] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }))
  const setSetting = (k: keyof Settings, v: number) => setState((s) => ({ ...s, presetId: 'custom', settings: { ...s.settings, [k]: v } }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    root.lang = lang
  }, [theme, lang])

  // Built-in sample unless a file has been opened.
  const sampleDef = SAMPLES.find((s) => s.id === state.sample) ?? SAMPLES[0]
  const sampleMesh = useMemo(() => sampleDef.make(), [sampleDef])
  const base = source ?? { name: t(sampleDef.name), mesh: sampleMesh }

  const bad = useMemo(() => invalidKeys(settings), [settings])
  const xfBad = !(xf.scale >= 1 && xf.scale <= 5000) || ![xf.rx, xf.ry, xf.rz].every(Number.isFinite)
  const valid = bad.size === 0 && !xfBad && settings.bedX > 0
  const placed = useMemo(() => (valid ? placeOnBed(base.mesh, xf, settings.bedX / 2, settings.bedY / 2) : null), [valid, base.mesh, xf, settings.bedX, settings.bedY])
  const warnings = useMemo(() => (placed ? placementWarnings(placed, settings) : []), [placed, settings])
  const sliceState = useSlicer(placed, settings, valid)
  const result = sliceState.status === 'done' ? sliceState.result : null

  const layerCount = result?.layers.length ?? 0
  // Until the user picks a layer, show one below the middle: walls, skin and infill are all visible there.
  const layer = layerCount ? Math.min(layerSel ?? Math.round((layerCount - 1) * 0.45), layerCount - 1) : 0

  useEffect(() => {
    if (!playing || !layerCount) return
    const id = window.setInterval(() => {
      setLayerSel((cur) => {
        const next = (cur ?? Math.round((layerCount - 1) * 0.45)) + Math.max(1, Math.round(layerCount / 150))
        if (next >= layerCount - 1) {
          setPlaying(false)
          return layerCount - 1
        }
        return next
      })
    }, 40)
    return () => window.clearInterval(id)
  }, [playing, layerCount])

  async function openFile(f: File | undefined) {
    if (!f) return
    try {
      const mesh = parseSTL(await f.arrayBuffer())
      if (triCount(mesh) === 0) throw new Error('empty')
      setSource({ name: f.name, mesh })
      patch({ xf: { ...IDENTITY } })
      setLayerSel(null)
      setLoadError('')
    } catch {
      setLoadError(t("Couldn't read that file. Use a binary or ASCII STL."))
    }
  }

  function download() {
    if (!result) return
    const blob = new Blob([result.gcode], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = base.name.replace(/\.stl$/i, '').replace(/[^\w.-]+/g, '_') + '.gcode'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const nf = (k: keyof Settings, label: string, unit?: string, step?: number) => (
    <NumberField key={k} label={t(label)} unit={unit} step={step} bad={bad.has(k)} value={settings[k]} onChange={(v) => setSetting(k, v)} />
  )

  const bb = placed ? bounds(placed) : null

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void openFile(e.dataTransfer.files[0])
      }}
    >
      <header className="toolbar">
        <span className="brand">{t('Web Slicer')}</span>
        <span className="hint">{t('Load an STL, get G-code. Everything runs in your browser.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}
          <select value={lang} onChange={(e) => patch({ lang: e.target.value as AppState['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}
          <select value={theme} onChange={(e) => patch({ theme: e.target.value as AppState['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>
      <div className="body">
        <aside className="side">
          <div className="panel">
            <Section title={t('Model')} open>
              <div className={'drop' + (dragOver ? ' over' : '')}>
                <button type="button" onClick={() => fileRef.current?.click()}>
                  {t('Open STL…')}
                </button>
                <span className="hint">{t('or drop a file here')}</span>
                <input ref={fileRef} type="file" accept=".stl,model/stl,application/sla" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              {loadError && <p className="err-text">{loadError}</p>}
              <label className="field">
                <span>{t('Built-in sample')}</span>
                <select
                  value={source ? '' : sampleDef.id}
                  onChange={(e) => {
                    setSource(null)
                    setLayerSel(null)
                    patch({ sample: e.target.value, xf: { ...IDENTITY } })
                  }}
                >
                  {source && <option value="">{source.name}</option>}
                  {SAMPLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid2">
                <NumberField label={t('Scale')} unit="%" bad={!(xf.scale >= 1 && xf.scale <= 5000)} value={xf.scale} onChange={(v) => patch({ xf: { ...xf, scale: v } })} />
                <NumberField label={t('Rotate Z')} unit="°" value={xf.rz} onChange={(v) => patch({ xf: { ...xf, rz: v } })} />
              </div>
              <div className="row">
                <button type="button" className="small" onClick={() => patch({ xf: { ...xf, rx: (xf.rx + 90) % 360 } })}>
                  {t('Rotate X 90°')}
                </button>
                <button type="button" className="small" onClick={() => patch({ xf: { ...xf, ry: (xf.ry + 90) % 360 } })}>
                  {t('Rotate Y 90°')}
                </button>
                <button type="button" className="small" onClick={() => patch({ xf: { ...IDENTITY } })}>
                  {t('Reset')}
                </button>
              </div>
              <p className="hint">{t('The part is centred on the bed and placed on its lowest point.')}</p>
            </Section>
            <Section title={t('Print profile')} open>
              <label className="field">
                <span>{t('Preset')}</span>
                <select
                  value={state.presetId}
                  onChange={(e) => {
                    const p = PRESETS.find((x) => x.id === e.target.value)
                    if (p) setState((s) => ({ ...s, presetId: p.id, settings: { ...s.settings, ...p.patch } }))
                  }}
                >
                  {state.presetId === 'custom' && <option value="custom">{t('Custom')}</option>}
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t(p.name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid3">
                {nf('layerHeight', 'Layer height', 'mm', 0.02)}
                {nf('firstLayerHeight', 'First layer', 'mm', 0.02)}
                {nf('lineWidth', 'Line width', 'mm', 0.05)}
              </div>
              <div className="grid3">
                {nf('walls', 'Walls', undefined, 1)}
                {nf('topLayers', 'Top layers', undefined, 1)}
                {nf('bottomLayers', 'Bottom layers', undefined, 1)}
              </div>
              {nf('infill', 'Infill density', '%', 5)}
            </Section>
            <Section title={t('Temperature and speed')}>
              <div className="grid2">
                {nf('nozzleTemp', 'Nozzle', '°C', 5)}
                {nf('bedTemp', 'Bed', '°C', 5)}
                {nf('outerSpeed', 'Outer wall', 'mm/s', 5)}
                {nf('innerSpeed', 'Inner walls', 'mm/s', 5)}
                {nf('infillSpeed', 'Infill', 'mm/s', 5)}
                {nf('firstLayerSpeed', 'First layer', 'mm/s', 5)}
                {nf('travelSpeed', 'Travel', 'mm/s', 10)}
                {nf('fan', 'Fan', '%', 5)}
                {nf('fanFromLayer', 'Fan from layer', undefined, 1)}
              </div>
            </Section>
            <Section title={t('Filament and retraction')}>
              <div className="grid2">
                {nf('filamentDiameter', 'Diameter', 'mm', 0.05)}
                {nf('filamentDensity', 'Density', 'g/cm³', 0.01)}
                {nf('flow', 'Flow', '%', 1)}
                {nf('retraction', 'Retraction', 'mm', 0.5)}
                {nf('retractSpeed', 'Retract speed', 'mm/s', 5)}
                {nf('retractMinTravel', 'Min. travel to retract', 'mm', 0.5)}
              </div>
            </Section>
            <Section title={t('Skirt and printer')}>
              <div className="grid2">
                {nf('skirtLoops', 'Skirt loops', undefined, 1)}
                {nf('skirtDistance', 'Skirt distance', 'mm', 1)}
                {nf('bedX', 'Bed X', 'mm', 10)}
                {nf('bedY', 'Bed Y', 'mm', 10)}
                {nf('bedZ', 'Max height', 'mm', 10)}
              </div>
            </Section>
          </div>
        </aside>
        <main className="main">
          <div className="box">
            <div className="tabs" role="tablist">
              {(['layers', 'stack', 'model'] as const).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
                  {t(k === 'layers' ? 'Layer' : k === 'stack' ? '3D layers' : 'Model')}
                </button>
              ))}
              <span className="spacer" />
              <span className="hint status">
                {!valid
                  ? t('Fix the highlighted fields.')
                  : sliceState.status === 'working'
                    ? t('Slicing… {0}%', Math.round(sliceState.progress * 100))
                    : sliceState.status === 'error'
                      ? t('Error: {0}', sliceState.message)
                      : ''}
              </span>
            </div>
            {tab === 'model' ? (
              <ModelView mesh={placed} settings={settings} theme={theme} t={t} />
            ) : (
              <LayerView result={result} settings={settings} layer={layer} mode={tab === 'stack' ? 'stack' : 'layer'} theme={theme} t={t} />
            )}
            {tab !== 'model' && (
              <div className="row layer-row">
                <button type="button" className="small" disabled={!result} onClick={() => setPlaying((p) => !p)}>
                  {playing ? t('Pause') : t('Play')}
                </button>
                <button type="button" className="small" disabled={!result || layer <= 0} onClick={() => { setPlaying(false); setLayerSel(layer - 1) }} aria-label={t('Previous layer')}>
                  −
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, layerCount - 1)}
                  value={layer}
                  disabled={!result}
                  aria-label={t('Layer')}
                  onChange={(e) => { setPlaying(false); setLayerSel(+e.target.value) }}
                />
                <button type="button" className="small" disabled={!result || layer >= layerCount - 1} onClick={() => { setPlaying(false); setLayerSel(layer + 1) }} aria-label={t('Next layer')}>
                  +
                </button>
                <span className="hint nowrap">
                  {result ? t('Layer {0} of {1}, z = {2} mm', layer + 1, layerCount, +result.layers[layer].z.toFixed(2)) : ''}
                </span>
              </div>
            )}
            {tab !== 'model' && (
              <div className="legend">
                {(['outer', 'inner', 'solid', 'infill', 'skirt'] as const).map((k) => (
                  <span key={k} className={'chip ' + k}>
                    {t(k === 'outer' ? 'Outer wall' : k === 'inner' ? 'Inner walls' : k === 'solid' ? 'Top/bottom skin' : k === 'infill' ? 'Infill' : 'Skirt')}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="box">
            <h3>{t('Result')}</h3>
            {warnings.map((w) => (
              <p key={w} className="warn-text">{t(w)}</p>
            ))}
            {result && result.openLoops > 0 && <p className="warn-text">{t('The mesh has holes ({0} open outlines were ignored). Repair it for best results.', result.openLoops)}</p>}
            {result ? (
              <>
                <table className="data">
                  <tbody>
                    <tr><td>{t('Part size')}</td><td>{result.size.map((v) => v.toFixed(1)).join(' × ')} mm</td></tr>
                    <tr><td>{t('Layers')}</td><td>{result.stats.layers}</td></tr>
                    <tr><td>{t('Estimated print time')}</td><td>{fmtTime(result.stats.time)}</td></tr>
                    <tr><td>{t('Filament')}</td><td>{(result.stats.filament / 1000).toFixed(2)} m, {result.stats.mass.toFixed(1)} g</td></tr>
                    <tr><td>{t('Triangles')}</td><td>{bb && placed ? triCount(placed).toLocaleString() : ''}</td></tr>
                    <tr><td>{t('G-code')}</td><td>{result.stats.lines.toLocaleString()} {t('lines')}, {(result.gcode.length / 1024).toFixed(0)} KB</td></tr>
                  </tbody>
                </table>
                <div className="row">
                  <button type="button" className="primary" onClick={download}>
                    {t('Download G-code')}
                  </button>
                </div>
                <details>
                  <summary>{t('G-code preview')}</summary>
                  <pre className="gcode">{result.gcode.split('\n').slice(0, 80).join('\n')}</pre>
                </details>
              </>
            ) : (
              <p className="hint">{valid ? t('Slicing…') : t('Fix the highlighted fields.')}</p>
            )}
          </div>
        </main>
      </div>
      <p className="hint foot">
        {t('Simplified FDM slicer: no supports or bridging. Check the G-code in a viewer before printing.')}{' '}
        <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
