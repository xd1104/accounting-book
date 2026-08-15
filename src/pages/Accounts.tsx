import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Account, AccountKind } from '../lib/types'
import { Sheet } from '../components/Sheet'
import { CATEGORY_EMOJIS, PALETTE } from '../lib/defaults'
import { IconPlus, IconTrash } from '../components/icons'
import { KIND_LABEL } from './Plan'

const KINDS: AccountKind[] = ['allowance', 'fixed', 'saving']

export function Accounts() {
  const { data, addAccount, updateAccount, deleteAccount } = useStore()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)

  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )

  return (
    <div className="px-4 pb-6 space-y-3">
      <p className="text-xs text-muted px-1 pt-1">
        帳戶是「薪水要放到哪裡」的分類 — 例如不同銀行、現金、信用卡。
        設為「日常零用錢」的帳戶，會用來計算每天可以花多少。
      </p>

      <div className="bg-surface rounded-3xl p-2">
        <div className="divide-y divide-line">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setEditing(a)}
              className="w-full flex items-center gap-3 p-3 text-left active:bg-surface2 rounded-2xl"
            >
              <span
                className="w-10 h-10 grid place-items-center rounded-full text-lg"
                style={{ background: `${a.color}22` }}
              >
                {a.emoji}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{a.name}</span>
                <span className="block text-xs text-muted">{KIND_LABEL[a.kind]}</span>
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing('new')}
          className="w-full h-11 mt-1 rounded-2xl text-sm font-medium text-brand flex items-center justify-center gap-1 active:bg-surface2"
        >
          <IconPlus className="w-4 h-4" /> 新增帳戶
        </button>
      </div>

      <AccountEditor
        target={editing}
        onClose={() => setEditing(null)}
        onSave={(v) => {
          if (editing === 'new') addAccount(v)
          else if (editing) updateAccount(editing.id, v)
          setEditing(null)
        }}
        onDelete={() => {
          if (editing && editing !== 'new') deleteAccount(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}

function AccountEditor({
  target,
  onClose,
  onSave,
  onDelete,
}: {
  target: Account | 'new' | null
  onClose: () => void
  onSave: (v: Omit<Account, 'id' | 'order'>) => void
  onDelete: () => void
}) {
  const isNew = target === 'new'
  const a = target && target !== 'new' ? target : null

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏦')
  const [color, setColor] = useState(PALETTE[10])
  const [kind, setKind] = useState<AccountKind>('saving')
  const [key, setKey] = useState('')

  // Re-seed the form whenever a different account is opened.
  const targetKey = a?.id ?? (isNew ? 'new' : '')
  if (targetKey && targetKey !== key) {
    setKey(targetKey)
    setName(a?.name ?? '')
    setEmoji(a?.emoji ?? '🏦')
    setColor(a?.color ?? PALETTE[10])
    setKind(a?.kind ?? 'saving')
  }

  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title={isNew ? '新增帳戶' : '編輯帳戶'}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <button
              onClick={() => confirm('刪除這個帳戶？已使用的會保留在舊記錄裡。') && onDelete()}
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
          <span
            className="w-14 h-14 shrink-0 grid place-items-center rounded-2xl text-2xl"
            style={{ background: `${color}22` }}
          >
            {emoji}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="帳戶名稱，例如：台銀活存"
            className="flex-1 h-12 px-3 rounded-2xl bg-surface2 outline-none placeholder:text-faint"
          />
        </div>

        <div>
          <div className="text-sm text-muted mb-2">用途</div>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface2">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`h-9 rounded-xl text-xs font-semibold transition ${
                  kind === k ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <EmojiPicker value={emoji} onChange={setEmoji} />
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Sheet>
  )
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">圖示</div>
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

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">顏色</div>
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
