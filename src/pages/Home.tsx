import { useMemo } from 'react'
import { useStore } from '../store'
import { summarize, txnsInPeriod } from '../lib/budget'
import { currentPeriod, formatFullDate, today } from '../lib/date'
import { money } from '../lib/format'
import { Ring, budgetColor } from '../components/Ring'
import { TxnRow } from '../components/TxnRow'
import { IconChevronR, IconCheck, IconWallet } from '../components/icons'
import { push } from '../router'
import { BackupBanner } from '../components/BackupBanner'

export function Home({ onEditTxn }: { onEditTxn: (id: string) => void }) {
  const { data } = useStore()
  const sym = data.settings.currencySymbol
  const month = currentPeriod(data.settings.monthStartDay)
  const s = useMemo(() => summarize(data, month), [data, month])
  const t = today()

  const todayTxns = useMemo(
    () => txnsInPeriod(data, month).filter((x) => x.date === t),
    [data, month, t],
  )

  const hasBudget = s.dailyAllowance > 0
  const over = s.todayRemaining < 0

  /**
   * How much of today's allowance is used up, for the ring's colour.
   *
   * Not simply spentToday / todayBudget: with rollover on, an earlier
   * overspend makes todayBudget itself negative, and then today's zero
   * spending divides out to 0% and paints the ring green while the number
   * inside it reads 今天超支. Once the budget is gone the day starts over the
   * line regardless of what has been spent since.
   */
  const progress = !hasBudget
    ? 0
    : s.todayBudget > 0
      ? s.spentToday / s.todayBudget
      : over
        ? 1.4
        : 1
  const color = hasBudget ? budgetColor(progress) : 'var(--brand)'

  const doneCount = s.plan?.allocations.filter((a) => a.done).length ?? 0
  const totalCount = s.plan?.allocations.length ?? 0

  return (
    <div className="px-4 pb-6 space-y-4">
      <div className="pt-1 text-center text-sm text-muted">{formatFullDate(t)}</div>

      <BackupBanner />

      {/* hero ring */}
      <div className="flex flex-col items-center pt-1">
        <Ring progress={hasBudget ? progress : 0} color={color}>
          {hasBudget ? (
            <>
              {/* Nothing spent today means the shortfall was carried in from
                  earlier days — "今天超支" would blame the wrong day. */}
              <div className="text-xs text-muted mb-1">
                {over ? (s.spentToday > 0 ? '今天超支' : '累積超支') : '今天還能花'}
              </div>
              <div className="text-[40px] font-bold leading-none" style={{ color }}>
                {money(Math.abs(s.todayRemaining), sym)}
              </div>
              <div className="text-xs text-muted mt-2 tnum">
                額度 {money(s.todayBudget, sym)}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-muted mb-1">今天已花</div>
              <div className="text-[40px] font-bold leading-none">
                {money(s.spentToday, sym)}
              </div>
              <div className="text-xs text-faint mt-2">尚未設定額度</div>
            </>
          )}
        </Ring>

        {hasBudget && (
          <div className="mt-3 text-xs text-muted tnum">
            今天已花 {money(s.spentToday, sym)}
            {s.incomeToday > 0 && (
              <span className="text-ok-ink"> · 收入 +{money(s.incomeToday, sym)}</span>
            )}
            {s.plan?.rollover && s.todayBudget > s.dailyAllowance && (
              <span className="text-ok-ink">
                {' '}
                · 含結餘 +{money(s.todayBudget - s.dailyAllowance, sym)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="本月零用錢" value={money(s.allowanceTotal, sym)} />
        <Tile
          label="剩餘可用"
          value={money(s.allowanceLeft, sym)}
          tone={s.allowanceLeft < 0 ? 'bad' : undefined}
        />
        <Tile
          label={s.daysLeft > 0 ? `剩 ${s.daysLeft} 天 · 每天` : '本期結束'}
          value={s.daysLeft > 0 ? money(s.suggestedDaily, sym) : money(s.spentAllowance, sym)}
          tone={s.suggestedDaily < 0 ? 'bad' : undefined}
        />
      </div>

      {/* salary allocation */}
      <button
        onClick={() => push('/plan')}
        className="w-full text-left bg-surface rounded-3xl p-4 active:scale-[0.99] transition"
      >
        <div className="flex items-center gap-2 mb-3">
          <IconWallet className="w-5 h-5 text-brand" />
          <span className="font-semibold flex-1">本月薪水分配</span>
          {totalCount > 0 && (
            <span
              className={`text-xs px-2 py-1 rounded-full tnum ${
                s.allocationComplete ? 'bg-ok/15 text-ok-ink' : 'bg-surface2 text-muted'
              }`}
            >
              {s.allocationComplete ? '已完成' : `${doneCount}/${totalCount} 已轉`}
            </span>
          )}
          <IconChevronR className="w-4 h-4 text-faint" />
        </div>

        {totalCount === 0 ? (
          <div className="text-sm text-muted">
            還沒設定這個月的分配 — 設定後就會自動算出每天可以花多少 →
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-2 tnum">
              <span className="text-2xl font-bold">{money(s.income, sym)}</span>
              <span className="text-xs text-muted">
                已分配 {money(s.allocated, sym)}
                {s.unallocated !== 0 && (
                  <span className={s.unallocated < 0 ? 'text-bad' : 'text-warn-ink'}>
                    {' '}
                    · {s.unallocated > 0 ? '未分配' : '超出'} {money(Math.abs(s.unallocated), sym)}
                  </span>
                )}
              </span>
            </div>
            <div className="space-y-1.5">
              {s.plan!.allocations.slice(0, 4).map((a) => {
                const acc = data.accounts.find((x) => x.id === a.accountId)
                return (
                  <div key={a.accountId} className="flex items-center gap-2 text-sm">
                    <span
                      className={`w-4 h-4 shrink-0 grid place-items-center rounded-full ${
                        a.done ? 'bg-ok text-on-ok' : 'border-2 border-line'
                      }`}
                    >
                      {a.done && <IconCheck className="w-2.5 h-2.5" />}
                    </span>
                    <span className={`flex-1 truncate ${a.done ? 'text-muted line-through' : ''}`}>
                      {acc?.emoji} {acc?.name ?? '（已刪除）'}
                    </span>
                    <span className="tnum text-muted">{money(a.amount, sym)}</span>
                  </div>
                )
              })}
              {s.plan!.allocations.length > 4 && (
                <div className="text-xs text-faint pl-6">
                  還有 {s.plan!.allocations.length - 4} 筆…
                </div>
              )}
            </div>
          </>
        )}
      </button>

      {/* today's records */}
      <div className="bg-surface rounded-3xl p-2">
        <div className="flex items-center justify-between px-2 pt-2 pb-1">
          <span className="font-semibold text-sm">今天的記錄</span>
          <span className="text-xs text-muted tnum">
            {todayTxns.length > 0 ? `${todayTxns.length} 筆` : ''}
          </span>
        </div>
        {todayTxns.length === 0 ? (
          <div className="py-8 text-center text-sm text-faint">
            今天還沒記帳
            <br />
            <span className="text-xs">按下方 ＋ 記一筆</span>
          </div>
        ) : (
          <div>
            {todayTxns.map((x) => (
              <TxnRow key={x.id} txn={x} data={data} onClick={() => onEditTxn(x.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="bg-surface rounded-2xl p-3 text-center">
      <div className="text-[11px] text-muted mb-1 truncate">{label}</div>
      <div className={`text-base font-bold tnum ${tone === 'bad' ? 'text-bad' : ''}`}>{value}</div>
    </div>
  )
}
