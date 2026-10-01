import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { summarize, txnsInPeriod } from '../lib/budget'
import { currentPeriod, formatHomeDate, today } from '../lib/date'
import { money } from '../lib/format'
import { Ring, budgetColor } from '../components/Ring'
import { TxnRow } from '../components/TxnRow'
import { useDeleteTxn } from '../lib/useDeleteTxn'
import { IconGear } from '../components/icons'
import { push } from '../router'
import { BackupChip, BackupPanel } from '../components/BackupBanner'

export function Home({ onEditTxn }: { onEditTxn: (id: string) => void }) {
  const removeTxn = useDeleteTxn()
  const { data } = useStore()
  const sym = data.settings.currencySymbol
  const month = currentPeriod(data.settings.monthStartDay)
  const s = useMemo(() => summarize(data, month), [data, month])
  const t = today()
  const { md, weekday } = formatHomeDate(t)
  const [backupOpen, setBackupOpen] = useState(false)

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

  return (
    <div className="px-4 pb-6 space-y-4">
      {/* 頂列：日期＋備份 chip 合成一行，取代原本「首頁」＋日期兩行。 */}
      <div className="flex items-center gap-2 pt-3 pb-1 min-h-11">
        <div className="flex-1 text-[17px] font-bold">
          {md} <span className="text-muted font-semibold">{weekday}</span>
        </div>
        <BackupChip onOpen={() => setBackupOpen(true)} />
        {/* 設定從分頁列移到這裡（2026-10-01，分頁列讓位給「分配」），iPhone App 常見的位置 */}
        <button
          onClick={() => push('/settings')}
          aria-label="設定"
          className="w-11 h-11 -mr-2 shrink-0 grid place-items-center rounded-full text-muted active:bg-surface2"
        >
          <IconGear className="w-6 h-6" />
        </button>
      </div>
      <BackupPanel open={backupOpen} onClose={() => setBackupOpen(false)} />

      {/* 今日卡：環 + 今天可花 + 剩餘可用 / 本月零用錢，取代原本「環 + 環下那行 + 三個 tile」四塊 */}
      <div className={`rounded-[22px] transition-colors ${over ? 'bg-tint-bad' : 'bg-surface'}`}>
        <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
          <div className="flex-1 min-w-0">
            {hasBudget ? (
              <>
                <div className="text-[13px] text-muted font-semibold">
                  {over ? (s.spentToday > 0 ? '今天超支' : '累積超支') : '今天還能花'}
                </div>
                <div
                  className="text-[44px] font-extrabold leading-none tnum mt-0.5"
                  style={{ color }}
                >
                  {money(Math.abs(s.todayRemaining), sym)}
                </div>
                <div className="text-xs text-muted mt-2 tnum">
                  額度 {money(s.todayBudget, sym)} · 已花 {money(s.spentToday, sym)}
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
              </>
            ) : (
              <>
                <div className="text-[13px] text-muted font-semibold">今天已花</div>
                <div className="text-[44px] font-extrabold leading-none tnum mt-0.5">
                  {money(s.spentToday, sym)}
                </div>
                <div className="text-xs text-faint mt-2">尚未設定額度</div>
              </>
            )}
          </div>
          <Ring progress={hasBudget ? progress : 0} color={color} size={62} stroke={6}>
            <span className="text-[15px]">{hasBudget ? (over ? '⚠️' : '🙂') : '💳'}</span>
          </Ring>
        </div>

        <div className="h-px bg-line mx-4" />

        <div className="flex items-end gap-3 px-4 pt-3 pb-3.5 tnum">
          <div className="flex-1 min-w-0">
            <div className="text-[11.5px] text-muted">剩餘可用</div>
            <div
              className={`text-[21px] font-extrabold leading-tight mt-0.5 ${
                s.allowanceLeft < 0 ? 'text-bad' : ''
              }`}
            >
              {money(s.allowanceLeft, sym)}
            </div>
          </div>
          <div className="shrink-0 text-right text-xs text-muted leading-[1.7]">
            <div>
              本月零用錢 <b className="text-ink font-bold">{money(s.allowanceTotal, sym)}</b>
            </div>
            <div>
              {s.daysLeft > 0 ? (
                <>
                  剩 {s.daysLeft} 天 · 每天{' '}
                  <b className="text-ink font-bold">{money(s.suggestedDaily, sym)}</b>
                </>
              ) : (
                <>
                  本期結束 <b className="text-ink font-bold">{money(s.spentAllowance, sym)}</b>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

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
              <TxnRow
                  key={x.id}
                  txn={x}
                  data={data}
                  onClick={() => onEditTxn(x.id)}
                  onDelete={() => removeTxn(x.id)}
                />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
