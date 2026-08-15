import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { emptyPlan, getPlan, summarize } from '../lib/budget'
import { addMonths, currentPeriod, formatMonthLabel, periodRange } from '../lib/date'
import { money } from '../lib/format'
import type { Allocation, MonthPlan } from '../lib/types'
import { IconCheck, IconChevronL, IconChevronR, IconPlus, IconTrash } from '../components/icons'
import { Sheet } from '../components/Sheet'

export function Plan() {
  const { data, savePlan, toggleAllocation } = useStore()
  const sym = data.settings.currencySymbol
  const [month, setMonth] = useState(() => currentPeriod(data.settings.monthStartDay))
  const [picking, setPicking] = useState(false)

  const plan = getPlan(data, month)
  const s = useMemo(() => summarize(data, month), [data, month])
  const range = periodRange(month, data.settings.monthStartDay)

  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )

  const write = (patch: Partial<MonthPlan>) => {
    const base = plan ?? emptyPlan(month, accounts.find((a) => a.kind === 'allowance')?.id ?? null)
    savePlan({ ...base, ...patch })
  }

  const setAllocation = (accountId: string, amount: number) => {
    const base = plan ?? emptyPlan(month, accounts.find((a) => a.kind === 'allowance')?.id ?? null)
    const exists = base.allocations.some((a) => a.accountId === accountId)
    const allocations: Allocation[] = exists
      ? base.allocations.map((a) => (a.accountId === accountId ? { ...a, amount } : a))
      : [...base.allocations, { accountId, amount, done: false }]
    savePlan({ ...base, allocations })
  }

  const removeAllocation = (accountId: string) => {
    if (!plan) return
    savePlan({ ...plan, allocations: plan.allocations.filter((a) => a.accountId !== accountId) })
  }

  const copyLastMonth = () => {
    const prev = getPlan(data, addMonths(month, -1))
    if (!prev) return
    savePlan({
      ...prev,
      month,
      allocations: prev.allocations.map((a) => ({ ...a, done: false, doneAt: undefined })),
    })
  }

  const unused = accounts.filter((a) => !plan?.allocations.some((x) => x.accountId === a.id))
  const prevPlanExists = !!getPlan(data, addMonths(month, -1))

  return (
    <div className="px-4 pb-6 space-y-4">
      {/* month switcher */}
      <div className="flex items-center justify-center gap-1 pt-1">
        <button
          onClick={() => setMonth(addMonths(month, -1))}
          className="w-9 h-9 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="上個月"
        >
          <IconChevronL className="w-5 h-5" />
        </button>
        <div className="text-center min-w-36">
          <div className="font-semibold">{formatMonthLabel(month)}</div>
          <div className="text-[11px] text-faint tnum">
            {range.start.slice(5).replace('-', '/')} – {range.end.slice(5).replace('-', '/')}
          </div>
        </div>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="w-9 h-9 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="下個月"
        >
          <IconChevronR className="w-5 h-5" />
        </button>
      </div>

      {/* income */}
      <div className="bg-surface rounded-3xl p-4">
        <label className="block text-sm text-muted mb-2">本月收入</label>
        <div className="flex items-center gap-2">
          <span className="text-2xl text-faint">{sym}</span>
          <input
            type="number"
            inputMode="numeric"
            value={plan?.income || ''}
            placeholder="0"
            onChange={(e) => write({ income: Number(e.target.value) || 0 })}
            className="flex-1 bg-transparent text-3xl font-bold tnum outline-none min-w-0 placeholder:text-faint"
          />
        </div>
        {!plan && prevPlanExists && (
          <button
            onClick={copyLastMonth}
            className="mt-3 w-full h-10 rounded-xl bg-brand-soft text-brand text-sm font-semibold active:scale-[0.98] transition"
          >
            沿用上個月的分配
          </button>
        )}
      </div>

      {/* allocations */}
      <div className="bg-surface rounded-3xl p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="font-semibold text-sm">分配到帳戶</span>
          <span className="text-xs tnum text-muted">
            {s.allocated > 0 && `已分配 ${money(s.allocated, sym)}`}
          </span>
        </div>

        {(plan?.allocations.length ?? 0) === 0 ? (
          <div className="py-6 text-center text-sm text-faint">
            還沒有分配
            <br />
            <span className="text-xs">按下方「新增分配」把薪水配到各帳戶</span>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {plan!.allocations.map((a) => {
              const acc = accounts.find((x) => x.id === a.accountId)
              return (
                <div key={a.accountId} className="flex items-center gap-2 px-2 py-2.5">
                  <button
                    onClick={() => toggleAllocation(month, a.accountId)}
                    aria-label={a.done ? '標記為未轉帳' : '標記為已轉帳'}
                    className={`w-7 h-7 shrink-0 grid place-items-center rounded-full transition active:scale-90 ${
                      a.done ? 'bg-ok text-white' : 'border-2 border-line text-transparent'
                    }`}
                  >
                    <IconCheck className="w-3.5 h-3.5" />
                  </button>

                  <span className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base"
                    style={{ background: `${acc?.color ?? '#6b7280'}22` }}>
                    {acc?.emoji ?? '💼'}
                  </span>

                  <span className={`flex-1 min-w-0 text-sm truncate ${a.done ? 'text-muted' : ''}`}>
                    {acc?.name ?? '（帳戶已刪除）'}
                    {plan!.allowanceAccountId === a.accountId && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-soft text-brand align-middle">
                        零用錢
                      </span>
                    )}
                  </span>

                  <input
                    type="number"
                    inputMode="numeric"
                    value={a.amount || ''}
                    placeholder="0"
                    onChange={(e) => setAllocation(a.accountId, Number(e.target.value) || 0)}
                    className="w-24 h-9 px-2 text-right rounded-lg bg-surface2 tnum text-sm outline-none"
                  />
                  <button
                    onClick={() => removeAllocation(a.accountId)}
                    aria-label="移除"
                    className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-faint active:text-bad"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {unused.length > 0 && (
          <button
            onClick={() => setPicking(true)}
            className="w-full h-11 mt-1 rounded-2xl text-sm font-medium text-brand flex items-center justify-center gap-1 active:bg-surface2"
          >
            <IconPlus className="w-4 h-4" /> 新增分配
          </button>
        )}
      </div>

      {/* unallocated banner */}
      {plan && plan.income > 0 && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm flex items-center justify-between ${
            s.unallocated === 0
              ? 'bg-ok/12 text-ok'
              : s.unallocated < 0
                ? 'bg-bad/12 text-bad'
                : 'bg-warn/12 text-warn'
          }`}
        >
          <span className="font-medium">
            {s.unallocated === 0 ? '✓ 全部分配完畢' : s.unallocated > 0 ? '還沒分配' : '超出收入'}
          </span>
          <span className="tnum font-bold">{money(Math.abs(s.unallocated), sym)}</span>
        </div>
      )}

      {/* allowance settings */}
      <div className="bg-surface rounded-3xl p-4 space-y-4">
        <div className="font-semibold text-sm">零用錢設定</div>

        <label className="flex items-center gap-3">
          <span className="text-sm text-muted flex-1">零用錢來源</span>
          <select
            value={plan?.allowanceAccountId ?? ''}
            onChange={(e) => write({ allowanceAccountId: e.target.value || null })}
            className="h-10 px-3 rounded-xl bg-surface2 text-sm outline-none max-w-44"
          >
            <option value="">全部支出都算</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm text-muted flex-1">
            每日額度
            <span className="block text-[11px] text-faint">
              {plan?.dailyAllowanceOverride == null
                ? `自動：${money(s.allowanceTotal, sym)} ÷ ${s.totalDays} 天`
                : '手動指定'}
            </span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={plan?.dailyAllowanceOverride ?? ''}
            placeholder={String(Math.round(s.dailyAllowance) || 0)}
            onChange={(e) =>
              write({ dailyAllowanceOverride: e.target.value === '' ? null : Number(e.target.value) })
            }
            className="w-28 h-10 px-3 text-right rounded-xl bg-surface2 tnum text-sm outline-none"
          />
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm text-muted flex-1">
            結餘累積
            <span className="block text-[11px] text-faint">
              今天沒花完的，明天可以繼續花
            </span>
          </span>
          <Toggle
            on={plan?.rollover ?? true}
            onChange={(v) => write({ rollover: v })}
          />
        </label>

        <div className="pt-1 border-t border-line flex items-baseline justify-between">
          <span className="text-sm text-muted">每天可以花</span>
          <span className="text-2xl font-bold tnum text-brand">
            {money(s.dailyAllowance, sym)}
          </span>
        </div>
      </div>

      {/* account picker */}
      <Sheet open={picking} onClose={() => setPicking(false)} title="要分配到哪個帳戶？">
        <div className="pb-4 space-y-1">
          {unused.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setAllocation(a.id, 0)
                setPicking(false)
              }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl text-left active:bg-surface2"
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
      </Sheet>
    </div>
  )
}

export const KIND_LABEL: Record<string, string> = {
  allowance: '日常零用錢',
  fixed: '固定支出',
  saving: '存起來',
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`w-12 h-7 shrink-0 rounded-full p-0.5 transition ${on ? 'bg-ok' : 'bg-line'}`}
    >
      <span
        className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}
