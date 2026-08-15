import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Category, TxnType } from '../lib/types'
import { Sheet } from '../components/Sheet'
import { PALETTE } from '../lib/defaults'
import { IconPlus, IconTrash } from '../components/icons'
import { ColorPicker, EmojiPicker } from '../components/pickers'

export function Categories() {
  const { data, addCategory, updateCategory, deleteCategory } = useStore()
  const [type, setType] = useState<TxnType>('expense')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const list = useMemo(
    () =>
      data.categories
        .filter((c) => c.type === type && !c.archived)
        .sort((a, b) => a.order - b.order),
    [data.categories, type],
  )

  return (
    <div className="px-4 pb-6 space-y-3">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface2 mt-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`h-9 rounded-xl text-sm font-semibold transition ${
              type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {t === 'expense' ? '支出' : '收入'}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-3xl p-2">
        <div className="grid grid-cols-4 gap-1 p-1">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setEditing(c)}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl active:bg-surface2"
            >
              <span
                className="w-11 h-11 grid place-items-center rounded-full text-xl"
                style={{ background: `${c.color}22` }}
              >
                {c.emoji}
              </span>
              <span className="text-[11px] truncate max-w-full px-1">{c.name}</span>
            </button>
          ))}
          <button
            onClick={() => setEditing('new')}
            className="flex flex-col items-center gap-1 py-3 rounded-2xl active:bg-surface2 text-brand"
          >
            <span className="w-11 h-11 grid place-items-center rounded-full border-2 border-dashed border-line">
              <IconPlus className="w-5 h-5" />
            </span>
            <span className="text-[11px]">新增</span>
          </button>
        </div>
      </div>

      <CategoryEditor
        target={editing}
        type={type}
        onClose={() => setEditing(null)}
        onSave={(v) => {
          if (editing === 'new') addCategory(v)
          else if (editing) updateCategory(editing.id, v)
          setEditing(null)
        }}
        onDelete={() => {
          if (editing && editing !== 'new') deleteCategory(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}

function CategoryEditor({
  target,
  type,
  onClose,
  onSave,
  onDelete,
}: {
  target: Category | 'new' | null
  type: TxnType
  onClose: () => void
  onSave: (v: Omit<Category, 'id' | 'order'>) => void
  onDelete: () => void
}) {
  const isNew = target === 'new'
  const c = target && target !== 'new' ? target : null

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✨')
  const [color, setColor] = useState(PALETTE[0])
  const [key, setKey] = useState('')

  const targetKey = c?.id ?? (isNew ? 'new' : '')
  if (targetKey && targetKey !== key) {
    setKey(targetKey)
    setName(c?.name ?? '')
    setEmoji(c?.emoji ?? '✨')
    setColor(c?.color ?? PALETTE[0])
  }

  return (
    <Sheet
      open={target != null}
      onClose={onClose}
      title={isNew ? '新增分類' : '編輯分類'}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <button
              onClick={() => confirm('刪除這個分類？已使用的會保留在舊記錄裡。') && onDelete()}
              className="w-12 h-12 grid place-items-center rounded-2xl bg-surface2 text-bad"
              aria-label="刪除"
            >
              <IconTrash className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() =>
              name.trim() && onSave({ name: name.trim(), emoji, color, type: c?.type ?? type })
            }
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
            placeholder="分類名稱"
            className="flex-1 h-12 px-3 rounded-2xl bg-surface2 outline-none placeholder:text-faint"
          />
        </div>
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Sheet>
  )
}
