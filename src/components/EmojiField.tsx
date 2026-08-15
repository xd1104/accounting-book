import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { ALL_EMOJIS, EMOJI_GROUPS, searchEmojis } from '../lib/emoji'

/**
 * A single swatch that opens the full icon library — the grid used to be laid out
 * inline, which pushed everything else off the screen once it got big.
 */
export function EmojiField({
  value,
  color,
  onChange,
}: {
  value: string
  color: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-14 h-14 shrink-0 grid place-items-center rounded-2xl text-2xl relative active:scale-95 transition"
        style={{ background: `${color}22` }}
        aria-label="選擇圖示"
      >
        {value}
        <span className="absolute -bottom-1 -right-1 w-5 h-5 grid place-items-center rounded-full bg-brand text-white text-[10px] shadow">
          ✎
        </span>
      </button>

      <EmojiPickerSheet
        open={open}
        value={value}
        onClose={() => setOpen(false)}
        onPick={(e) => {
          onChange(e)
          setOpen(false)
        }}
      />
    </>
  )
}

function EmojiPickerSheet({
  open,
  value,
  onClose,
  onPick,
}: {
  open: boolean
  value: string
  onClose: () => void
  onPick: (e: string) => void
}) {
  const [q, setQ] = useState('')

  // Start from the full library each time rather than last session's search.
  useEffect(() => {
    if (open) setQ('')
  }, [open])

  const results = q.trim() ? searchEmojis(q) : null

  const Cell = ({ e }: { e: string }) => (
    <button
      onClick={() => onPick(e)}
      className={`aspect-square rounded-xl text-2xl grid place-items-center transition active:scale-90 ${
        value === e ? 'bg-brand-soft ring-2 ring-brand' : 'active:bg-surface2'
      }`}
    >
      {e}
    </button>
  )

  return (
    <Sheet open={open} onClose={onClose} title="選擇圖示" full>
      <div className="sticky top-0 z-10 bg-surface pb-2 -mx-4 px-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋，例如：餐、車、房、投資"
          className="w-full h-11 px-3 rounded-xl bg-surface2 text-sm outline-none placeholder:text-faint"
        />
      </div>

      {results ? (
        results.length === 0 ? (
          <div className="py-10 text-center text-sm text-faint">
            找不到「{q}」
            <br />
            <span className="text-xs">試試「吃」「車」「房」「錢」這類的字</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1 pb-4">
            {results.map((e) => (
              <Cell key={e} e={e} />
            ))}
          </div>
        )
      ) : (
        <div className="pb-4 space-y-3">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.name}>
              <div className="text-[11px] text-muted px-1 pb-1 sticky top-[52px] bg-surface">
                {g.name}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {g.items.map(([e]) => (
                  <Cell key={`${g.name}-${e}`} e={e} />
                ))}
              </div>
            </div>
          ))}
          <div className="text-[11px] text-faint text-center pt-2">
            共 {ALL_EMOJIS.length} 個圖示
          </div>
        </div>
      )}
    </Sheet>
  )
}
