import { PALETTE } from '../lib/defaults'

export function ColorPicker({
  value,
  onChange,
  label = '顏色',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">{label}</div>
      {/* px-2：選中的色塊有 scale-110 + ring-offset-2，六欄時最右一格會撐出容器 3px */}
      <div className="grid grid-cols-6 gap-2 px-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={c}
            className={`aspect-square rounded-full transition ${
              value === c ? 'ring-2 ring-offset-2 ring-ink ring-offset-surface scale-110' : ''
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}
