import { CATEGORY_EMOJIS, PALETTE } from '../lib/defaults'

export function EmojiPicker({
  value,
  onChange,
  label = '圖示',
}: {
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">{label}</div>
      <div className="grid grid-cols-8 gap-1.5">
        {CATEGORY_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onChange(e)}
            className={`aspect-square rounded-xl text-xl grid place-items-center transition ${
              value === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface2'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

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
      <div className="grid grid-cols-9 gap-1.5">
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
