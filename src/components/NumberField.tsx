interface Props {
  label: string
  value: number
  unit?: string
  step?: number
  bad?: boolean
  onChange: (v: number) => void
}

export default function NumberField({ label, value, unit, step, bad, onChange }: Props) {
  return (
    <label className="field">
      <span>
        {label}
        {unit ? <span className="unit"> ({unit})</span> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        className={bad ? 'bad' : undefined}
        aria-invalid={bad || undefined}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </label>
  )
}
