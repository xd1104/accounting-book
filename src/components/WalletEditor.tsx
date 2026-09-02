import { useState } from 'react'
import type { Wallet, WalletKind } from '../lib/types'
import { PALETTE } from '../lib/defaults'
import { Sheet } from './Sheet'
import { EmojiField } from './EmojiField'
import { ColorPicker } from './pickers'
import { BankPicker } from './BankPicker'
import { IconTrash } from './icons'

const KINDS: Array<[WalletKind, string, string, string]> = [
  ['cash', '現金', '💵', '錢包裡的現鈔、零錢'],
  ['bank', '戶頭', '🏦', '銀行、電子支付、卡片'],
]

export function WalletEditor({
  target,
  onClose,
  onSave,
  onDelete,
  seed = 0,
}: {
  target: Wallet | 'new' | null
  onClose: () => void
  onSave: (v: Omit<Wallet, 'id' | 'order'>) => void
  onDelete?: () => void
  seed?: number
}) {
  const isNew = target === 'new'
  const w = target && target !== 'new' ? target : null
  const defaultColor = PALETTE[(seed * 5 + 3) % PALETTE.length]

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏦')
  const [color, setColor] = useState(defaultColor)
  const [kind, setKind] = useState<WalletKind>('bank')
  const [picking, setPicking] = useState<WalletKind | null>(null)
  /** New items start on the preset list; the detail form appears once something is chosen. */
  const [chosen, setChosen] = useState(false)
  const [key, setKey] = useState('')

  const targetKey = w?.id ?? (isNew ? `new-${seed}` : '')
  if (targetKey && targetKey !== key) {
    setKey(targetKey)
    setName(w?.name ?? '')
    setEmoji(w?.emoji ?? '🏦')
    setColor(w?.color ?? defaultColor)
    setKind(w?.kind ?? 'bank')
    setChosen(!isNew)
    setPicking(null)
  }

  const startKind = (k: WalletKind) => {
    setKind(k)
    setPicking(k)
  }

  return (
    <>
      <Sheet
        open={target != null && picking == null}
        onClose={onClose}
        title={isNew ? '新增存放處' : '編輯存放處'}
        footer={
          chosen ? (
            <div className="flex gap-2">
              {!isNew && onDelete && (
                <button
                  onClick={() => confirm('刪除這個存放處？已使用的會保留在舊記錄裡。') && onDelete()}
                  className="w-12 h-12 grid place-items-center rounded-2xl bg-surface2 text-bad"
                  aria-label="刪除"
                >
                  <IconTrash className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={() => name.trim() && onSave({ name: name.trim(), emoji, color, kind })}
                disabled={!name.trim()}
                className="flex-1 h-12 rounded-2xl bg-brand text-on-brand font-semibold disabled:bg-surface2 disabled:text-muted disabled:shadow-none active:scale-[0.98] transition"
              >
                儲存
              </button>
            </div>
          ) : undefined
        }
      >
        {!chosen ? (
          // Step 1 — what kind of place is this? Each choice opens its preset list.
          <div className="pb-4">
            <p className="text-sm text-muted mb-3">這筆錢放在哪一種地方？</p>
            <div className="space-y-2">
              {KINDS.map(([k, label, ico, hint]) => (
                <button
                  key={k}
                  onClick={() => startKind(k)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface2 text-left active:scale-[0.99] transition"
                >
                  <span className="w-12 h-12 shrink-0 grid place-items-center rounded-full bg-surface text-2xl">
                    {ico}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                  <span className="text-faint">›</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Step 2 — the preset filled everything in; tweak if wanted.
          <div className="space-y-4 pb-2">
            <div className="flex items-center gap-3">
              <EmojiField value={emoji} color={color} onChange={setEmoji} />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="名稱"
                className="flex-1 min-w-0 h-12 px-3 rounded-2xl bg-surface2 outline-none placeholder:text-faint"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">
                {kind === 'cash' ? '現金' : '戶頭'}
                <span className="text-faint"> · 名稱可以自己改，例如「國泰-薪轉」</span>
              </span>
              <button
                onClick={() => setPicking(kind)}
                className="px-3 h-8 rounded-xl bg-surface2 text-xs font-medium text-brand active:scale-95 transition"
              >
                重新選擇
              </button>
            </div>

            <ColorPicker value={color} onChange={setColor} />
          </div>
        )}
      </Sheet>

      <BankPicker
        open={picking != null}
        kind={picking ?? 'bank'}
        onClose={() => {
          setPicking(null)
          // Backing out of the list on a fresh item returns to the kind choice.
          if (!chosen) setChosen(false)
        }}
        onPick={(p) => {
          setName(p.name)
          setEmoji(p.emoji)
          setColor(p.color)
          setPicking(null)
          setChosen(true)
        }}
        onManual={() => {
          setPicking(null)
          setChosen(true)
          if (!name) {
            setEmoji(kind === 'cash' ? '💵' : '🏦')
            setColor(defaultColor)
          }
        }}
      />
    </>
  )
}
