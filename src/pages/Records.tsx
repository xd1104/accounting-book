import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { allowanceByWallet, summarize, txnsInPeriod } from '../lib/budget'
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
  const walletRows = useMemo(() => allowanceByWallet(data, month), [data, month])

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
          className="w-11 h-11 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="上個月"
        >
          <IconChevronL className="w-5 h-5" />
        </button>
        <div className="font-semibold min-w-24 text-center">{formatMonthLabel(month)}</div>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="w-11 h-11 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="下個月"
        >
          <IconChevronR className="w-5 h-5" />
        </button>
      </div>

      {/* month summary — the allowance balance is the number that matters day to day;
          income is just the salary every month, so it earns no space here. */}
      <div className="bg-surface rounded-3xl p-4">
        <div className="grid grid-cols-2 text-center">
          <div className="border-r border-line">
            <div className="text-[11px] text-muted mb-1">零用錢結餘</div>
            <div
              className={`text-xl font-bold tnum ${s.allowanceLeft < 0 ? 'text-bad' : 'text-ok-ink'}`}
            >
              {money(s.allowanceLeft, sym)}
            </div>
            <div className="text-[10px] text-faint mt-0.5 tnum">
              分配 {money(s.allowanceTotal, sym)}
              {s.incomeAllowance > 0 && (
                <span className="text-ok-ink"> + 收入 {money(s.incomeAllowance, sym)}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted mb-1">本月支出</div>
            <div className="text-xl font-bold tnum">{money(s.expenseTotal, sym)}</div>
            {s.daysLeft > 0 && (
              <div className="text-[10px] text-faint mt-0.5 tnum">
                剩 {s.daysLeft} 天 · 每天 {money(s.suggestedDaily, sym)}
              </div>
            )}
          </div>
        </div>

        {walletRows.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line space-y-1.5">
            {walletRows.map((r) => (
              <div key={r.walletId ?? 'none'} className="flex items-center gap-2 text-sm">
                <span
                  className="w-6 h-6 shrink-0 grid place-items-center rounded-full text-xs"
                  style={{ background: `${r.color}22` }}
                >
                  {r.emoji}
                </span>
                <span className="flex-1 min-w-0 truncate text-muted">{r.name}</span>
                {r.allocated > 0 || r.income > 0 || r.carriedIn !== 0 ? (
                  <>
                    <span className="text-[11px] text-faint tnum">
                      {r.carriedIn !== 0 && (
                        <span className={r.carriedIn > 0 ? 'text-ok-ink' : 'text-bad'}>
                          結轉 {r.carriedIn > 0 ? '+' : ''}
                          {money(r.carriedIn, sym)}{' · '}
                        </span>
                      )}
                      已花 {money(r.spent, sym)}
                      {r.income > 0 && (
                        <span className="text-ok-ink"> +{money(r.income, sym)}</span>
                      )}{' '}
                      /{' '}
                    </span>
                    <span className={`tnum font-semibold ${r.left < 0 ? 'text-bad' : ''}`}>
                      {money(r.left, sym)}
                    </span>
                  </>
                ) : (
                  // Nothing was allocated here, so there is no balance to report —
                  // showing a negative one would read as an error.
                  <span className="text-[11px] text-faint tnum">已花 {money(r.spent, sym)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* filters */}
      <div className="flex gap-2">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface2 flex-1">
          {(['all', 'expense', 'income'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-9 rounded-xl text-[13px] font-semibold transition ${
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
          className="w-32 h-10 px-3 rounded-2xl bg-surface2 text-sm outline-none placeholder:text-faint"
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
                  {dayIncome > 0 && <span className="text-ok-ink">+{money(dayIncome, sym)} </span>}
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
