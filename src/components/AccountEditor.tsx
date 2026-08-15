import { useState } from 'react'
import type { Account, AccountKind, Wallet } from '../lib/types'
import {
  ACCOUNT_KINDS,
  KIND_EMOJI,
  KIND_HINT,
  KIND_LABEL,
  PALETTE,
  WALLET_KIND_LABEL,
} from '../lib/defaults'
import { Sheet } from './Sheet'
import { EmojiField } from './EmojiField'
import { ColorPicker } from './pickers'
import { WalletEditor } from './WalletEditor'
import { IconPlus, IconTrash } from './icons'

/**
 * Create or edit one salary-allocation item. Shared by the settings screen and the
 * plan screen, so a new item can be made right where it is being allocated.
 */
export function AccountEditor({
  target,
  onClose,
  onSave,
  onDelete,
  wallets,
  onAddWallet,
  /** How many items already exist — used to give a new one an unused-looking colour. */
  seed = 0,
}: {
  target: Account | 'new' | null
  onClose: () => void
  onSave: (v: Omit<Account, 'id' | 'order'>) => void
  onDelete?: () => void
  wallets: Wallet[]
  /** Lets a new place to keep money be added without leaving this sheet. */
  onAddWallet?: (w: Omit<Wallet, 'id' | 'order'>) => string
  seed?: number
}) {
  const isNew = target === 'new'
  const a = target && target !== 'new' ? target : null

  // Step by 5 so consecutive items land on clearly different hues, not neighbours.
  const defaultColor = PALETTE[(seed * 5) % PALETTE.length]

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(KIND_EMOJI.saving)
  const [color, setColor] = useState(defaultColor)
  const [kind, setKind] = useState<AccountKind>('saving')
  const [walletId, setWalletId] = useState<string | null>(null)
  const [emojiPicked, setEmojiPicked] = useState(false)
  const [addingWallet, setAddingWallet] = useState(false)
  const [key, setKey] = useState('')

  const defaultWallet = wallets.find((w) => w.kind === 'bank')?.id ?? wallets[0]?.id ?? null

  // Re-seed the form whenever a different item is opened.
  const targetKey = a?.id ?? (isNew ? `new-${seed}` : '')
  if (targetKey && targetKey !== key) {
    setKey(targetKey)
    setName(a?.name ?? '')
    setEmoji(a?.emoji ?? KIND_EMOJI[a?.kind ?? 'saving'])
    setColor(a?.color ?? defaultColor)
    setKind(a?.kind ?? 'saving')
    setWalletId(a ? a.walletId : defaultWallet)
    setEmojiPicked(!isNew)
  }

  /** Until the icon is chosen by hand, it follows the type — 房貸 shouldn't default to ✈️. */
  const chooseKind = (k: AccountKind) => {
    setKind(k)
    if (!emojiPicked) setEmoji(KIND_EMOJI[k])
  }

  const chooseEmoji = (e: string) => {
    setEmoji(e)
    setEmojiPicked(true)
  }

  return (
    <>
    <Sheet
      open={target != null && !addingWallet}
      onClose={onClose}
      title={isNew ? '新增分配項目' : '編輯項目'}
      footer={
        <div className="flex gap-2">
          {!isNew && onDelete && (
            <button
              onClick={() => confirm('刪除這個項目？已使用的會保留在舊記錄裡。') && onDelete()}
              className="w-12 h-12 grid place-items-center rounded-2xl bg-surface2 text-bad"
              aria-label="刪除"
            >
              <IconTrash className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => name.trim() && onSave({ name: name.trim(), emoji, color, kind, walletId })}
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
          <EmojiField value={emoji} color={color} onChange={chooseEmoji} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="項目名稱，例如：房租、學貸、旅遊基金"
            autoFocus={isNew}
            className="flex-1 min-w-0 h-12 px-3 rounded-2xl bg-surface2 outline-none placeholder:text-faint"
          />
        </div>

        <div>
          <div className="text-sm text-muted mb-2">這個項目是什麼類型？</div>
          <div className="space-y-1.5">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => chooseKind(k)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition ${
                  kind === k ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface2'
                }`}
              >
                <span
                  className={`w-4 h-4 shrink-0 rounded-full border-2 ${
                    kind === k ? 'border-brand bg-brand' : 'border-line'
                  }`}
                />
                <span className="min-w-0">
                  <span className={`block text-sm ${kind === k ? 'font-semibold text-brand' : ''}`}>
                    {KIND_LABEL[k]}
                  </span>
                  <span className="block text-[11px] text-muted">{KIND_HINT[k]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm text-muted mb-2">
            這筆錢放在哪裡？
            <span className="block text-[11px] text-faint">
              轉帳時要轉進哪個戶頭，或直接留成現金
            </span>
          </div>

          {(['cash', 'bank'] as const).map((k) => {
            const group = wallets.filter((w) => w.kind === k)
            if (!group.length) return null
            return (
              <div key={k} className="mb-2">
                <div className="text-[11px] text-faint px-1 pb-1">{WALLET_KIND_LABEL[k]}</div>
                <div className="grid grid-cols-2 gap-2">
                  {group.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setWalletId(w.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-2xl text-left transition ${
                        walletId === w.id ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface2'
                      }`}
                    >
                      <span
                        className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base"
                        style={{ background: `${w.color}22` }}
                      >
                        {w.emoji}
                      </span>
                      <span className="text-sm truncate">{w.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="grid grid-cols-2 gap-2">
            {onAddWallet && (
              <button
                onClick={() => setAddingWallet(true)}
                className="flex items-center gap-2 p-2.5 rounded-2xl bg-surface2 text-left text-brand active:scale-[0.98] transition"
              >
                <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full border-2 border-dashed border-line">
                  <IconPlus className="w-4 h-4" />
                </span>
                <span className="text-sm font-medium">新增</span>
              </button>
            )}
            <button
              onClick={() => setWalletId(null)}
              className={`flex items-center gap-2 p-2.5 rounded-2xl text-left transition ${
                walletId === null ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface2'
              }`}
            >
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base bg-surface">
                ❓
              </span>
              <span className="text-sm">不指定</span>
            </button>
          </div>
        </div>

        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Sheet>

    {onAddWallet && (
      <WalletEditor
        target={addingWallet ? 'new' : null}
        seed={wallets.length}
        onClose={() => setAddingWallet(false)}
        onSave={(v) => {
          setWalletId(onAddWallet(v))
          setAddingWallet(false)
        }}
      />
    )}
    </>
  )
}
