import type { AppData, Txn } from '../lib/types'
import { money } from '../lib/format'

export function TxnRow({
  txn,
  data,
  onClick,
  showDate,
}: {
  txn: Txn
  data: AppData
  onClick?: () => void
  showDate?: boolean
}) {
  const cat = data.categories.find((c) => c.id === txn.categoryId)
  const acc = data.accounts.find((a) => a.id === txn.accountId)
  const sym = data.settings.currencySymbol

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-2xl text-left transition active:bg-surface2"
    >
      <span
        className="w-10 h-10 shrink-0 grid place-items-center rounded-full text-lg"
        style={{ background: `${cat?.color ?? '#6b7280'}22` }}
      >
        {cat?.emoji ?? '✨'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate">
          {txn.note || cat?.name || '未分類'}
        </span>
        <span className="block text-xs text-muted truncate">
          {txn.note ? `${cat?.name ?? '未分類'} · ` : ''}
          {acc ? acc.name : '未指定帳戶'}
          {showDate ? ` · ${txn.date.slice(5).replace('-', '/')}` : ''}
        </span>
      </span>
      <span
        className={`shrink-0 tnum font-semibold ${txn.type === 'income' ? 'text-ok' : 'text-ink'}`}
      >
        {txn.type === 'income' ? '+' : '−'}
        {money(txn.amount, sym).replace('-', '')}
      </span>
    </button>
  )
}
