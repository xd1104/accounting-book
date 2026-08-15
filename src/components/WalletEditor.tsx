import { useState } from 'react'
import type { Wallet, WalletKind } from '../lib/types'
import { PALETTE } from '../lib/defaults'
import { Sheet } from './Sheet'
import { EmojiField } from './EmojiField'
import { ColorPicker } from './pickers'
import { IconTrash } from './icons'

const KINDS: Array<[WalletKind, string, string, string]> = [
  ['cash', '現金', '💵', '錢包裡的現鈔、零錢'],
  ['bank', '戶頭', '🏦', '銀行帳戶、電子支付、信用卡'],
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
  const [emojiPicked, setEmojiPicked] = useState(false)
  const [key, setKey] = useState('')

  const targetKey = w?.id ?? (isNew ? `new-${seed}` : '')
  if (targetKey && targetKey !== key) {
    setKey(targetKey)
    setName(w?.name ?? '')
    setEmoji(w?.emoji ?? '🏦')
    setColor(w?.color ?? defaultColor)
    setKind(w?.kind ?? 'bank')
    setEmojiPicked(!isNew)
  }

  const chooseKind = (k: WalletKind) => {
    setKind(k)
    if (!emojiPicked) setEmoji(k === 'cash' ? '💵' : '🏦')
  }

  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title={isNew ? '新增存放處' : '編輯存放處'}
      footer={
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
            className="flex-1 h-12 rounded-2xl bg-brand text-white font-semibold disabled:opacity-40 active:scale-[0.98] transition"
          >
            儲存
          </button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3">
          <EmojiField
            value={emoji}
            color={color}
            onChange={(e) => {
              setEmoji(e)
              setEmojiPicked(true)
            }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名稱，例如：錢包、中信活存、悠遊卡"
            autoFocus={isNew}
            className="flex-1 min-w-0 h-12 px-3 rounded-2xl bg-surface2 outline-none placeholder:text-faint"
          />
        </div>

        <div>
          <div className="text-sm text-muted mb-2">這是現金還是戶頭？</div>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map(([k, label, ico, hint]) => (
              <button
                key={k}
                onClick={() => chooseKind(k)}
                className={`p-3 rounded-2xl text-left transition ${
                  kind === k ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface2'
                }`}
              >
                <span className="block text-xl mb-1">{ico}</span>
                <span className={`block text-sm ${kind === k ? 'font-semibold text-brand' : ''}`}>
                  {label}
                </span>
                <span className="block text-[11px] text-muted leading-tight mt-0.5">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Sheet>
  )
}
