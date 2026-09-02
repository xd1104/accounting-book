import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { categoryTotals, dailyTotals, summarize } from '../lib/budget'
import { addMonths, currentPeriod, formatMonthLabel, parseISODate } from '../lib/date'
import { compact, money, percent } from '../lib/format'
import { IconChevronL, IconChevronR } from '../components/icons'

const MAX_SLICES = 7

export function Stats() {
  const { data } = useStore()
  const sym = data.settings.currencySymbol
  const [month, setMonth] = useState(() => currentPeriod(data.settings.monthStartDay))
  const [type, setType] = useState<'expense' | 'income'>('expense')

  const s = useMemo(() => summarize(data, month), [data, month])
  const daily = useMemo(() => dailyTotals(data, month), [data, month])
  const cats = useMemo(() => categoryTotals(data, month, type), [data, month, type])

  // Cap the number of colour classes; the tail becomes one grey "其他" row.
  const ranked = useMemo(() => {
    if (cats.length <= MAX_SLICES + 1) return cats
    const head = cats.slice(0, MAX_SLICES)
    const tail = cats.slice(MAX_SLICES)
    return [
      ...head,
      {
        categoryId: '__other__',
        name: `其他 ${tail.length} 類`,
        emoji: '✨',
        color: '#6b7280',
        total: tail.reduce((a, b) => a + b.total, 0),
        count: tail.reduce((a, b) => a + b.count, 0),
        share: tail.reduce((a, b) => a + b.share, 0),
      },
    ]
  }, [cats])

  const months = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)),
    [month],
  )
  const monthlyTotals = useMemo(
    () => months.map((m) => ({ month: m, total: summarize(data, m).expenseTotal })),
    [data, months],
  )

  return (
    <div className="px-4 pb-6 space-y-3">
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

      <DailyChart
        data={daily}
        allowance={s.dailyAllowance}
        symbol={sym}
        expenseTotal={s.expenseTotal}
      />

      {/* category breakdown */}
      <div className="bg-surface rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">
            {type === 'expense' ? '支出' : '收入'}分類
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface2">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 h-8 rounded-lg text-[13px] font-semibold transition ${
                  type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                }`}
              >
                {t === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
        </div>

        {ranked.length === 0 ? (
          <div className="py-8 text-center text-sm text-faint">這個月沒有資料</div>
        ) : (
          <div className="space-y-2.5">
            {ranked.map((c) => (
              <div key={c.categoryId}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm">{c.emoji}</span>
                  <span className="text-sm flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted tnum">{percent(c.share)}</span>
                  <span className="text-sm font-semibold tnum w-20 text-right">
                    {money(c.total, sym)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(c.share * 100, 1.5)}%`,
                      background: c.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6-period comparison */}
      <div className="bg-surface rounded-3xl p-4">
        <div className="font-semibold text-sm mb-1">近 6 期支出</div>
        <div className="text-xs text-muted mb-4">每一欄是一個記帳週期的總支出</div>
        <MonthlyChart items={monthlyTotals} symbol={sym} current={month} />
      </div>
    </div>
  )
}

/** Daily spend columns with the daily-allowance threshold drawn across them. */
function DailyChart({
  data,
  allowance,
  symbol,
  expenseTotal,
}: {
  data: Array<{ date: string; expense: number }>
  allowance: number
  symbol: string
  expenseTotal: number
}) {
  const [sel, setSel] = useState<number | null>(null)
  // 30 天的長條每根只有 8.9px 寬，手指點不準。改成在整張圖上左右滑動選日期：
  // 落點除以容器寬度換算成索引，個別長條就不需要各自可點了。
  const chartRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ on: boolean; startX: number }>({ on: false, startX: 0 })
  const maxSpend = Math.max(...data.map((d) => d.expense), 0)
  const top = Math.max(maxSpend, allowance) * 1.15 || 1
  const peakIndex = maxSpend > 0 ? data.findIndex((d) => d.expense === maxSpend) : -1
  const active = sel != null ? data[sel] : null

  const indexAt = (clientX: number) => {
    const el = chartRef.current
    if (!el || data.length === 0) return null
    const r = el.getBoundingClientRect()
    if (r.width === 0) return null
    const i = Math.floor(((clientX - r.left) / r.width) * data.length)
    return Math.min(data.length - 1, Math.max(0, i))
  }

  return (
    <div className="bg-surface rounded-3xl p-4">
      <div className="flex items-baseline justify-between mb-1">
        <div className="font-semibold text-sm">每日支出</div>
        <div className="text-sm font-semibold">{money(expenseTotal, symbol)}</div>
      </div>
      <div className="h-5 text-xs text-muted mb-2 tnum">
        {active ? (
          <>
            {active.date.slice(5).replace('-', '/')} · {money(active.expense, symbol)}
            {allowance > 0 && active.expense > allowance && (
              <span className="text-bad"> · 超出額度</span>
            )}
          </>
        ) : allowance > 0 ? (
          <>虛線為每日額度 {money(allowance, symbol)}，超過的日子標紅</>
        ) : (
          <>左右滑動看每天金額</>
        )}
      </div>

      <div
        ref={chartRef}
        role="img"
        aria-label={`每日支出長條圖，${data.length} 天，最高 ${money(maxSpend, symbol)}。左右滑動選擇日期。`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          const i = indexAt(e.clientX)
          if (i == null) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { on: true, startX: e.clientX }
          setSel(sel === i ? null : i)
        }}
        onPointerMove={(e) => {
          // 位移小於 6px 當成點擊，不要把「再點一次取消」又選回來
          if (!drag.current.on || Math.abs(e.clientX - drag.current.startX) < 6) return
          const i = indexAt(e.clientX)
          if (i != null) setSel(i)
        }}
        onPointerUp={() => (drag.current.on = false)}
        onPointerCancel={() => (drag.current.on = false)}
        className="relative h-32"
      >
        {/* threshold — dashed because it is a limit, not a gridline */}
        {allowance > 0 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-muted/50 z-10"
            style={{ bottom: `${(allowance / top) * 100}%` }}
          />
        )}
        {/* baseline */}
        <div className="absolute left-0 right-0 bottom-0 border-t border-line" />

        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const over = allowance > 0 && d.expense > allowance
            const h = (d.expense / top) * 100
            return (
              <div key={d.date} className="flex-1 h-full flex items-end min-w-0">
                <span
                  className="block w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${Math.max(h, d.expense > 0 ? 2 : 0)}%`,
                    background: over ? 'var(--bad)' : 'var(--brand)',
                    opacity: sel == null || sel === i ? 1 : 0.35,
                  }}
                />
              </div>
            )
          })}
        </div>

        {sel != null && data.length > 0 && (
          <div
            className="absolute bottom-0 h-[3px] rounded-full bg-brand pointer-events-none"
            style={{ left: `${(sel / data.length) * 100}%`, width: `${100 / data.length}%` }}
          />
        )}

        {/* label only the peak — never a number on every bar */}
        {peakIndex >= 0 && sel == null && (
          <div
            className="absolute text-[10px] text-muted tnum -translate-x-1/2 pointer-events-none"
            style={{
              left: `${((peakIndex + 0.5) / data.length) * 100}%`,
              bottom: `calc(${(maxSpend / top) * 100}% + 2px)`,
            }}
          >
            {compact(maxSpend)}
          </div>
        )}
      </div>

      <div className="flex justify-between text-[10px] text-faint mt-1 tnum">
        <span>{data[0] && `${parseISODate(data[0].date).getMonth() + 1}/${parseISODate(data[0].date).getDate()}`}</span>
        <span>
          {data.at(-1) &&
            `${parseISODate(data.at(-1)!.date).getMonth() + 1}/${parseISODate(data.at(-1)!.date).getDate()}`}
        </span>
      </div>
    </div>
  )
}

function MonthlyChart({
  items,
  symbol,
  current,
}: {
  items: Array<{ month: string; total: number }>
  symbol: string
  current: string
}) {
  const max = Math.max(...items.map((i) => i.total), 1)
  return (
    <div className="flex items-end gap-2 h-32">
      {items.map((it) => {
        const isCurrent = it.month === current
        return (
          <div key={it.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] text-muted tnum">
              {it.total > 0 ? compact(it.total) : ''}
            </span>
            <span
              className="w-full max-w-6 rounded-t transition-all duration-500"
              style={{
                height: `${Math.max((it.total / max) * 100, it.total > 0 ? 2 : 0)}%`,
                background: isCurrent ? 'var(--brand)' : 'var(--surface-2)',
              }}
              title={money(it.total, symbol)}
            />
            <span className={`text-[10px] tnum ${isCurrent ? 'text-ink font-semibold' : 'text-faint'}`}>
              {Number(it.month.slice(5))}月
            </span>
          </div>
        )
      })}
    </div>
  )
}
