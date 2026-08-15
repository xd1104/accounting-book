import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Account } from '../lib/types'
import { ACCOUNT_KINDS, KIND_LABEL } from '../lib/defaults'
import { AccountEditor } from '../components/AccountEditor'
import { IconPlus } from '../components/icons'

export function Accounts() {
  const { data, addAccount, updateAccount, deleteAccount } = useStore()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)

  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )

  const groups = ACCOUNT_KINDS.map((kind) => ({
    kind,
    items: accounts.filter((a) => a.kind === kind),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="px-4 pb-6 space-y-3">
      <p className="text-xs text-muted px-1 pt-1">
        薪水分配的項目 — 名稱自己取，類型決定它算哪一種錢。
        設為「日常零用錢」的項目，會拿來算每天可以花多少。
      </p>

      {groups.map((g) => (
        <div key={g.kind}>
          <div className="text-xs text-muted px-4 pb-1.5">{KIND_LABEL[g.kind]}</div>
          <div className="bg-surface rounded-3xl p-2">
            <div className="divide-y divide-line">
              {g.items.map((a) => (
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
                  <span className="flex-1 font-medium">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditing('new')}
        className="w-full h-12 rounded-2xl bg-surface text-sm font-medium text-brand flex items-center justify-center gap-1 active:scale-[0.99] transition"
      >
        <IconPlus className="w-4 h-4" /> 新增分配項目
      </button>

      <AccountEditor
        target={editing}
        seed={data.accounts.length}
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
