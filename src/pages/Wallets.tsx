import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Wallet } from '../lib/types'
import { WALLET_KIND_LABEL } from '../lib/defaults'
import { WalletEditor } from '../components/WalletEditor'
import { IconPlus } from '../components/icons'

export function Wallets() {
  const { data, addWallet, updateWallet, deleteWallet } = useStore()
  const [editing, setEditing] = useState<Wallet | 'new' | null>(null)

  const wallets = useMemo(
    () => data.wallets.filter((w) => !w.archived).sort((a, b) => a.order - b.order),
    [data.wallets],
  )

  const groups = (['cash', 'bank'] as const)
    .map((kind) => ({ kind, items: wallets.filter((w) => w.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="px-4 pb-6 space-y-3">
      <p className="text-xs text-muted px-1 pt-1">
        錢實際放在哪裡。記一筆支出時選其中一個，就能分別算出「錢包還剩多少」和「戶頭還剩多少」。
      </p>

      {groups.map((g) => (
        <div key={g.kind}>
          <div className="text-xs text-muted px-4 pb-1.5">{WALLET_KIND_LABEL[g.kind]}</div>
          <div className="bg-surface rounded-3xl p-2">
            <div className="divide-y divide-line">
              {g.items.map((w) => {
                const usedBy = data.accounts.filter((a) => a.walletId === w.id && !a.archived)
                return (
                  <button
                    key={w.id}
                    onClick={() => setEditing(w)}
                    className="w-full flex items-center gap-3 p-3 text-left active:bg-surface2 rounded-2xl"
                  >
                    <span
                      className="w-10 h-10 grid place-items-center rounded-full text-lg"
                      style={{ background: `${w.color}22` }}
                    >
                      {w.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium">{w.name}</span>
                      {usedBy.length > 0 && (
                        <span className="block text-xs text-muted truncate">
                          {usedBy.map((a) => a.name).join('、')}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={() => setEditing('new')}
        className="w-full h-12 rounded-2xl bg-surface text-sm font-medium text-brand flex items-center justify-center gap-1 active:scale-[0.99] transition"
      >
        <IconPlus className="w-4 h-4" /> 新增存放處
      </button>

      <WalletEditor
        target={editing}
        seed={data.wallets.length}
        onClose={() => setEditing(null)}
        onSave={(v) => {
          if (editing === 'new') addWallet(v)
          else if (editing) updateWallet(editing.id, v)
          setEditing(null)
        }}
        onDelete={() => {
          if (editing && editing !== 'new') deleteWallet(editing.id)
          setEditing(null)
        }}
      />
    </div>
  )
}
