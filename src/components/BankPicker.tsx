import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { BANKS, CASH_PRESETS, EWALLETS, searchPresets } from '../lib/banks'
import type { BankPreset } from '../lib/banks'
import type { WalletKind } from '../lib/types'

/**
 * Picking a bank fills in the name, icon and brand colour in one tap — typing all
 * three by hand was the tedious part of adding a place to keep money.
 */
export function BankPicker({
  open,
  kind,
  onClose,
  onPick,
  onManual,
}: {
  open: boolean
  kind: WalletKind
  onClose: () => void
  onPick: (p: BankPreset) => void
  onManual: () => void
}) {
  const [q, setQ] = useState('')

  // A query left over from last time would silently filter the new list to nothing.
  useEffect(() => {
    if (open) setQ('')
  }, [open, kind])

  const sections =
    kind === 'cash'
      ? [{ title: '常見的', items: searchPresets(CASH_PRESETS, q) }]
      : [
          { title: '銀行', items: searchPresets(BANKS, q) },
          { title: '電子支付・卡片', items: searchPresets(EWALLETS, q) },
        ]

  const empty = sections.every((s) => s.items.length === 0)

  const Row = ({ p }: { p: BankPreset }) => (
    <button
      onClick={() => onPick(p)}
      className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left active:bg-surface2"
    >
      <span
        className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg"
        style={{ background: `${p.color}22` }}
      >
        {p.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium truncate">{p.name}</span>
        {p.code && <span className="block text-[11px] text-faint tnum">代碼 {p.code}</span>}
      </span>
      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
    </button>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === 'cash' ? '選擇現金放哪' : '選擇銀行或支付方式'}
      full
    >
      <div className="sticky top-0 z-10 bg-surface pb-2 -mx-4 px-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === 'cash' ? '搜尋' : '搜尋銀行名稱或代碼，例如：822、玉山'}
          className="w-full h-11 px-3 rounded-xl bg-surface2 text-sm outline-none placeholder:text-faint"
        />
      </div>

      {empty ? (
        <div className="py-8 text-center text-sm text-faint">
          清單裡沒有「{q}」
          <br />
          <span className="text-xs">可以直接自己輸入名稱</span>
        </div>
      ) : (
        sections.map(
          (s) =>
            s.items.length > 0 && (
              <div key={s.title} className="pb-2">
                <div className="text-[11px] text-muted px-1 pb-1">{s.title}</div>
                {s.items.map((p) => (
                  <Row key={p.name} p={p} />
                ))}
              </div>
            ),
        )
      )}

      <button
        onClick={onManual}
        className="w-full h-12 mt-2 mb-4 rounded-2xl bg-surface2 text-sm font-medium text-brand active:scale-[0.98] transition"
      >
        找不到？自己輸入名稱
      </button>
    </Sheet>
  )
}
