import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { summarize, txnsInPeriod } from '../lib/budget'
import { addMonths, currentPeriod, formatDateLabel, formatMonthLabel } from '../lib/date'
import { money } from '../lib/format'
import { TxnRow } from '../components/TxnRow'
import { IconChevronL, IconChevronR } from '../components/icons'
import type { Txn } from '../lib/types'

type Filter = 'all' | 'expense' | 'income'

export function Records({ onEditTxn }: { onEditTxn: (id: string) => void }) {
  const { data } = useStore()
  const sym = data.settings.currencySymbol
  const [month, setMonth] = useState(() => currentPeriod(data.settings.monthStartDay))
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const s = useMemo(() => summarize(data, month), [data, month])

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = txnsInPeriod(data, month).filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false
      if (!query) return true
      const cat = data.categories.find((c) => c.id === t.categoryId)?.name ?? ''
      return t.note.toLowerCase().includes(query) || cat.toLowerCase().includes(query)
    })
    const map = new Map<string, Txn[]>()
    for (const t of list) {
      const arr = map.get(t.date)
      if (arr) arr.push(t)
      else map.set(t.date, [t])
    }
    return [...map.entries()]
  }, [data, month, filter, q])

  return (
    <div className="px-4 pb-6 space-y-3">
      {/* month switcher */}
      <div className="flex items-center justify-center gap-1 pt-1">
        <button
          onClick={() => setMonth(addMonths(month, -1))}
          className="w-9 h-9 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="上個月"
        >
          <IconChevronL className="w-5 h-5" />
        </button>
        <div className="font-semibold min-w-24 text-center">{formatMonthLabel(month)}</div>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="w-9 h-9 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="下個月"
        >
          <IconChevronR className="w-5 h-5" />
        </button>
      </div>

      {/* month summary */}
      <div className="bg-surface rounded-3xl p-4 grid grid-cols-3 text-center">
        <div>
          <div className="text-[11px] text-muted mb-1">收入</div>
          <div className="font-bold tnum text-ok">{money(s.incomeTotal, sym)}</div>
        </div>
        <div className="border-x border-line">
          <div className="text-[11px] text-muted mb-1">支出</div>
          <div className="font-bold tnum">{money(s.expenseTotal, sym)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted mb-1">結餘</div>
          <div className={`font-bold tnum ${s.net < 0 ? 'text-bad' : ''}`}>{money(s.net, sym)}</div>
        </div>
      </div>

      {/* filters */}
      <div className="flex gap-2">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface2 flex-1">
          {(['all', 'expense', 'income'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-8 rounded-xl text-xs font-semibold transition ${
                filter === f ? 'bg-surface text-ink shadow-sm' : 'text-muted'
              }`}
            >
              {f === 'all' ? '全部' : f === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋"
          className="w-28 h-10 px-3 rounded-2xl bg-surface2 text-sm outline-none placeholder:text-faint"
        />
      </div>

      {/* grouped list */}
      {groups.length === 0 ? (
        <div className="py-16 text-center text-sm text-faint">
          這個月還沒有符合的記錄
        </div>
      ) : (
        groups.map(([date, items]) => {
          const dayExpense = items.filter((t) => t.type === 'expense').reduce((a, b) => a + b.amount, 0)
          const dayIncome = items.filter((t) => t.type === 'income').reduce((a, b) => a + b.amount, 0)
          return (
            <div key={date} className="bg-surface rounded-3xl p-2">
              <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
                <span className="text-sm font-semibold">{formatDateLabel(date)}</span>
                <span className="text-xs text-muted tnum">
                  {dayIncome > 0 && <span className="text-ok">+{money(dayIncome, sym)} </span>}
                  {dayExpense > 0 && <>−{money(dayExpense, sym)}</>}
                </span>
              </div>
              {items.map((t) => (
                <TxnRow key={t.id} txn={t} data={data} onClick={() => onEditTxn(t.id)} />
              ))}
            </div>
          )
        })
      )}
    </div>
  )
}
