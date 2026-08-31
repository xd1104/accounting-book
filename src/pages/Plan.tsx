import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { emptyPlan, resolvePlan, summarize } from '../lib/budget'
import { addMonths, currentPeriod, formatMonthLabel, periodRange } from '../lib/date'
import { money } from '../lib/format'
import { ACCOUNT_KINDS, KIND_LABEL, WALLET_KIND_LABEL } from '../lib/defaults'
import type { Account, Allocation, AllocationSplit, MonthPlan } from '../lib/types'
import { allocationByWallet, allowanceByWallet } from '../lib/budget'
import { IconCheck, IconChevronL, IconChevronR, IconPlus, IconTrash } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { Toggle } from '../components/Toggle'
import { AccountEditor } from '../components/AccountEditor'

export function Plan() {
  const { data, savePlan, addAccount, updateAccount, addWallet, updateSettings } = useStore()
  const sym = data.settings.currencySymbol
  const [month, setMonth] = useState(() => currentPeriod(data.settings.monthStartDay))
  const [picking, setPicking] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)

  const { plan, carried, from } = useMemo(() => resolvePlan(data, month), [data, month])
  const s = useMemo(() => summarize(data, month), [data, month])
  const range = periodRange(month, data.settings.monthStartDay)

  const accounts = useMemo(
    () => data.accounts.filter((a) => !a.archived).sort((a, b) => a.order - b.order),
    [data.accounts],
  )

  const base = () => plan ?? emptyPlan(month, accounts.find((a) => a.kind === 'allowance')?.id ?? null)

  const write = (patch: Partial<MonthPlan>) => savePlan({ ...base(), ...patch })

  const setAllocation = (accountId: string, amount: number) => {
    const b = base()
    const exists = b.allocations.some((a) => a.accountId === accountId)
    const allocations: Allocation[] = exists
      ? b.allocations.map((a) => (a.accountId === accountId ? { ...a, amount } : a))
      : [...b.allocations, { accountId, amount, done: false }]
    savePlan({ ...b, allocations })
  }

  const removeAllocation = (accountId: string) => {
    const b = base()
    savePlan({ ...b, allocations: b.allocations.filter((a) => a.accountId !== accountId) })
  }

  /** Ticking a carried-over plan is also what writes it down for this month. */
  const toggleDone = (accountId: string) => {
    const b = base()
    savePlan({
      ...b,
      allocations: b.allocations.map((a) =>
        a.accountId === accountId
          ? { ...a, done: !a.done, doneAt: !a.done ? new Date().toISOString() : undefined }
          : a,
      ),
    })
  }

  const wallets = useMemo(
    () => data.wallets.filter((w) => !w.archived).sort((a, b) => a.order - b.order),
    [data.wallets],
  )

  const unused = accounts.filter((a) => !plan?.allocations.some((x) => x.accountId === a.id))

  const allowanceAlloc = plan?.allocations.find((a) => a.accountId === plan.allowanceAccountId)
  const walletRows = useMemo(() => allowanceByWallet(data, month), [data, month])
  /**
   * The same plan, totalled by destination — the list to work from on transfer
   * day. Cash is left out: it is not somewhere you transfer money to, and how
   * much of the allowance is held as cash already has its own section below.
   */
  const transferRows = useMemo(
    () => allocationByWallet(data, month).filter((r) => r.kind !== 'cash'),
    [data, month],
  )
  const transferTotal = transferRows.reduce((n, r) => n + r.total, 0)
  const transferLeft = transferRows.reduce((n, r) => n + (r.total - r.done), 0)

  /** Split the allowance across wallets — part cash in the wallet, part in the bank. */
  const setSplit = (walletId: string, amount: number) => {
    const b = base()
    const id = b.allowanceAccountId
    if (!id) return
    savePlan({
      ...b,
      allocations: b.allocations.map((a) => {
        if (a.accountId !== id) return a
        const existing: AllocationSplit[] =
          a.splits ?? (a.amount > 0 ? [{ walletId: homeWalletOf(id), amount: a.amount }] : [])
        const next = existing.some((s) => s.walletId === walletId)
          ? existing.map((s) => (s.walletId === walletId ? { ...s, amount } : s))
          : [...existing, { walletId, amount }]
        const cleaned = next.filter((s) => s.amount !== 0)
        const total = cleaned.reduce((n, s) => n + s.amount, 0)
        // The split is the source of truth once used, so keep the headline in step.
        return { ...a, splits: cleaned.length ? cleaned : undefined, amount: cleaned.length ? total : a.amount }
      }),
    })
  }

  const clearSplits = () => {
    const b = base()
    const id = b.allowanceAccountId
    if (!id) return
    savePlan({
      ...b,
      allocations: b.allocations.map((a) => (a.accountId === id ? { ...a, splits: undefined } : a)),
    })
  }

  function homeWalletOf(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.walletId ?? wallets[0]?.id ?? ''
  }

  /**
   * The allowance source having no money allocated this month is an easy trap —
   * the daily budget silently reads 0 with nothing explaining why.
   */
  const allowanceUnfunded = useMemo(() => {
    const id = plan?.allowanceAccountId
    if (!id || plan?.dailyAllowanceOverride != null) return null
    const alloc = plan?.allocations.find((a) => a.accountId === id)
    if (alloc && alloc.amount > 0) return null
    return accounts.find((a) => a.id === id) ?? null
  }, [plan, accounts])

  // Group the allocations by type — with many items this is what keeps the list readable.
  const groups = useMemo(() => {
    const rows = (plan?.allocations ?? []).map((a) => ({
      alloc: a,
      account: accounts.find((x) => x.id === a.accountId) ?? null,
    }))
    return ACCOUNT_KINDS.map((kind) => ({
      kind,
      rows: rows.filter((r) => (r.account?.kind ?? 'other') === kind),
    }))
      .filter((g) => g.rows.length > 0)
      .concat(
        rows.some((r) => !r.account)
          ? [{ kind: 'other' as const, rows: rows.filter((r) => !r.account) }]
          : [],
      )
  }, [plan, accounts])

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
      </div>

      {carried && from && (
        <div className="rounded-2xl px-4 py-3 bg-brand-soft text-brand text-xs flex items-center gap-2">
          <span className="text-base">↻</span>
          <span>
            自動沿用 <b>{formatMonthLabel(from)}</b> 的分配。改金額或打勾之後，就會存成這個月的。
          </span>
        </div>
      )}

      {/* allocations, grouped by type */}
      <div className="bg-surface rounded-3xl p-2">
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="font-semibold text-sm">分配項目</span>
          <span className="text-xs tnum text-muted">
            {s.allocated > 0 && `已分配 ${money(s.allocated, sym)}`}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="py-6 text-center text-sm text-faint">
            還沒有分配
            <br />
            <span className="text-xs">按下方「新增分配項目」開始</span>
          </div>
        ) : (
          groups.map((g) => {
            const subtotal = g.rows.reduce((n, r) => n + r.alloc.amount, 0)
            return (
              <div key={g.kind} className="pt-2">
                <div className="flex items-baseline justify-between px-3 pb-1">
                  <span className="text-[11px] font-semibold text-muted">{KIND_LABEL[g.kind]}</span>
                  <span className="text-[11px] text-faint tnum">{money(subtotal, sym)}</span>
                </div>
                <div className="divide-y divide-line">
                  {g.rows.map(({ alloc: a, account: acc }) => (
                    <div key={a.accountId} className="flex items-center gap-2 px-2 py-2.5">
                      <button
                        onClick={() => toggleDone(a.accountId)}
                        aria-label={a.done ? '標記為未轉帳' : '標記為已轉帳'}
                        className={`w-7 h-7 shrink-0 grid place-items-center rounded-full transition active:scale-90 ${
                          a.done ? 'bg-ok text-white' : 'border-2 border-line text-transparent'
                        }`}
                      >
                        <IconCheck className="w-3.5 h-3.5" />
                      </button>

                      {/* tapping the name edits the item itself */}
                      <button
                        onClick={() => acc && setEditingAccount(acc)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left active:opacity-60"
                      >
                        <span
                          className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base"
                          style={{ background: `${acc?.color ?? '#6b7280'}22` }}
                        >
                          {acc?.emoji ?? '💼'}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm truncate ${a.done ? 'text-muted' : ''}`}>
                            {acc?.name ?? '（項目已刪除）'}
                            {plan?.allowanceAccountId === a.accountId && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-soft text-brand align-middle">
                                零用錢
                              </span>
                            )}
                          </span>
                          <span className="block text-[10px] text-faint truncate">
                            {a.splits?.length
                              ? a.splits
                                  .map(
                                    (s) =>
                                      wallets.find((w) => w.id === s.walletId)?.name ?? '未指定',
                                  )
                                  .join(' + ')
                              : (wallets.find((w) => w.id === acc?.walletId)?.name ?? '未指定存放處')}
                          </span>
                        </span>
                      </button>

                      {/* Once split across wallets the total is derived, so editing it
                          here would just contradict the split below. */}
                      <input
                        type="number"
                        inputMode="numeric"
                        value={a.amount || ''}
                        placeholder="0"
                        readOnly={!!a.splits?.length}
                        title={a.splits?.length ? '由下方「零用錢放在哪」的金額加總' : undefined}
                        onChange={(e) => setAllocation(a.accountId, Number(e.target.value) || 0)}
                        className={`w-24 h-9 px-2 text-right rounded-lg tnum text-sm outline-none ${
                          a.splits?.length ? 'bg-transparent text-muted' : 'bg-surface2'
                        }`}
                      />
                      <button
                        onClick={() => removeAllocation(a.accountId)}
                        aria-label="移除"
                        className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-faint active:text-bad"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}

        <button
          onClick={() => (unused.length > 0 ? setPicking(true) : setEditingAccount('new'))}
          className="w-full h-11 mt-1 rounded-2xl text-sm font-medium text-brand flex items-center justify-center gap-1 active:bg-surface2"
        >
          <IconPlus className="w-4 h-4" /> 新增分配項目
        </button>
      </div>

      {/* totals by destination */}
      {transferRows.length > 0 && (
        <div className="bg-surface rounded-3xl p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-sm">各存放處合計</span>
            <span className="text-[11px] text-faint">
              {transferLeft > 0 ? `還要轉 ${money(transferLeft, sym)}` : '✓ 都轉好了'}
            </span>
          </div>
          <p className="text-[11px] text-faint -mt-1">
            上面是照用途分的，這裡是照「錢要進哪個戶頭」加總 — 轉帳時照這張對就好。現金不列入。
          </p>

          <div className="space-y-2">
            {transferRows.map((r) => {
              const left = r.total - r.done
              return (
                <div key={r.walletId ?? 'none'} className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base"
                    style={{ background: `${r.color}22` }}
                  >
                    {r.emoji}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{r.name}</span>
                    <span className="block text-[10px] text-faint">
                      {r.kind === 'unset' ? '尚未指定' : WALLET_KIND_LABEL[r.kind]} · {r.items} 項
                      {left > 0 ? ` · 還要轉 ${money(left, sym)}` : ' · 已轉完'}
                    </span>
                  </span>
                  <span className={`tnum font-semibold ${left > 0 ? '' : 'text-ok'}`}>
                    {money(r.total, sym)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="pt-2 border-t border-line flex items-baseline justify-between">
            <span className="text-sm text-muted">要轉的合計</span>
            <span className="text-lg font-bold tnum">{money(transferTotal, sym)}</span>
          </div>
        </div>
      )}

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

        {allowanceUnfunded && (
          <div className="rounded-2xl px-3 py-2.5 bg-warn/12 text-warn text-xs">
            零用錢來源「{allowanceUnfunded.name}」這個月還沒分配到錢，所以每日額度是 0。
            上面把金額填進去就會自動算出來。
          </div>
        )}

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
            每日結餘累積
            <span className="block text-[11px] text-faint">今天沒花完的，明天可以繼續花</span>
          </span>
          <Toggle on={plan?.rollover ?? true} onChange={(v) => write({ rollover: v })} />
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm text-muted flex-1">
            現金結轉下個月
            <span className="block text-[11px] text-faint">
              月底錢包裡沒花完的現金，加進下個月的零用錢。戶頭裡的不結轉
            </span>
          </span>
          <Toggle
            on={data.settings.carryCash !== false}
            onChange={(v) => updateSettings({ carryCash: v })}
          />
        </label>

        <div className="pt-1 border-t border-line flex items-baseline justify-between">
          <span className="text-sm text-muted">每天可以花</span>
          <span className="text-2xl font-bold tnum text-brand">{money(s.dailyAllowance, sym)}</span>
        </div>
      </div>

      {/* where the allowance physically sits */}
      {plan?.allowanceAccountId && allowanceAlloc && (
        <div className="bg-surface rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">零用錢放在哪</div>
            {allowanceAlloc.splits?.length ? (
              <button onClick={clearSplits} className="text-xs text-muted active:text-bad">
                取消拆分
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-faint -mt-1">
            一部分放錢包當現金、一部分留在戶頭的話，在這裡填。記帳時選付款來源，就能分開算結餘。
          </p>

          <div className="space-y-2">
            {wallets.map((w) => {
              const split = allowanceAlloc.splits?.find((s) => s.walletId === w.id)
              const implied =
                !allowanceAlloc.splits?.length &&
                (accounts.find((a) => a.id === plan.allowanceAccountId)?.walletId ?? null) === w.id
                  ? allowanceAlloc.amount
                  : 0
              const row = walletRows.find((r) => r.walletId === w.id)
              return (
                <div key={w.id} className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 shrink-0 grid place-items-center rounded-full text-base"
                    style={{ background: `${w.color}22` }}
                  >
                    {w.emoji}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{w.name}</span>
                    <span className="block text-[10px] text-faint">
                      {WALLET_KIND_LABEL[w.kind]}
                      {row && row.carriedIn !== 0 && (
                        <span className={row.carriedIn > 0 ? 'text-ok' : 'text-bad'}>
                          {' '}
                          · 上期結轉 {row.carriedIn > 0 ? '+' : ''}
                          {money(row.carriedIn, sym)}
                        </span>
                      )}
                      {row && row.spent > 0 && ` · 已花 ${money(row.spent, sym)}`}
                    </span>
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={split?.amount ?? implied ?? ''}
                    placeholder="0"
                    onChange={(e) => setSplit(w.id, Number(e.target.value) || 0)}
                    className="w-24 h-9 px-2 text-right rounded-lg bg-surface2 tnum text-sm outline-none"
                  />
                </div>
              )
            })}
          </div>

          {walletRows.length > 0 && (
            <div className="pt-2 border-t border-line space-y-1.5">
              {walletRows.map((r) => (
                <div key={r.walletId ?? 'none'} className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {r.emoji} {r.name} {r.allocated > 0 || r.income > 0 ? '還剩' : '已花'}
                  </span>
                  <span
                    className={`tnum font-semibold ${
                      r.allocated > 0 || r.income > 0 ? (r.left < 0 ? 'text-bad' : '') : 'text-muted'
                    }`}
                  >
                    {money(r.allocated > 0 || r.income > 0 ? r.left : r.spent, sym)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* pick an existing item, or make a new one */}
      <Sheet open={picking} onClose={() => setPicking(false)} title="加入哪個項目？">
        <div className="pb-4 space-y-1">
          <button
            onClick={() => {
              setPicking(false)
              setEditingAccount('new')
            }}
            className="w-full flex items-center gap-3 p-3 rounded-2xl text-left active:bg-surface2 text-brand"
          >
            <span className="w-10 h-10 grid place-items-center rounded-full border-2 border-dashed border-line">
              <IconPlus className="w-5 h-5" />
            </span>
            <span className="font-medium">建立新項目</span>
          </button>

          {unused.length > 0 && (
            <div className="text-[11px] text-muted px-3 pt-3 pb-1">已建立的項目</div>
          )}
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

      <AccountEditor
        target={editingAccount}
        seed={data.accounts.length}
        wallets={wallets}
        onAddWallet={addWallet}
        onClose={() => setEditingAccount(null)}
        onSave={(v) => {
          if (editingAccount === 'new') {
            // Creating from here also drops it straight into this month's plan.
            const id = addAccount(v)
            setAllocation(id, 0)
          } else if (editingAccount) {
            updateAccount(editingAccount.id, v)
          }
          setEditingAccount(null)
        }}
      />
    </div>
  )
}
