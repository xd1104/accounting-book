import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { emptyPlan, resolvePlan, summarize } from '../lib/budget'
import { addMonths, currentPeriod, formatMonthLabel, periodRange } from '../lib/date'
import { money } from '../lib/format'
import { KIND_LABEL, WALLET_KIND_LABEL } from '../lib/defaults'
import type { Account, Allocation, AllocationSplit, MonthPlan } from '../lib/types'
import { allocationByWallet, allowanceByWallet } from '../lib/budget'
import { IconCheck, IconChevronL, IconChevronR, IconPlus, IconTrash, IconX } from '../components/icons'
import { Sheet } from '../components/Sheet'
import { Toggle } from '../components/Toggle'
import { AccountEditor } from '../components/AccountEditor'
import { Ring } from '../components/Ring'
import { SwipeRow } from '../components/SwipeRow'
import { WalletBadge } from '../components/WalletBadge'
import { showUndo } from '../lib/undo'

/** 分配項目在某個存放處裡的一筆——拆分過的項目在每個存放處各出現一筆，金額只算那一份。 */
interface ListRow {
  alloc: Allocation
  account: Account | null
  amount: number
  split: boolean
}

/** 合併清單的一組：一個存放處，底下是要放進去的分配項目。 */
interface ListGroup {
  walletId: string | null
  name: string
  emoji: string
  color: string
  /** 現金不是轉帳目的地：不算進「還要轉」，標頭也不寫「還要轉」。 */
  cash: boolean
  rows: ListRow[]
  total: number
  done: number
  allDone: boolean
}

export function Plan() {
  const { data, savePlan, restoreAllocation, restoreSplit, addAccount, updateAccount, addWallet, updateSettings } =
    useStore()
  const sym = data.settings.currencySymbol
  const [month, setMonth] = useState(() => currentPeriod(data.settings.monthStartDay))
  const [picking, setPicking] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)
  /** Reveals the per-row remove buttons — twelve of them on show is all noise. */
  const [editing, setEditing] = useState(false)
  /** P2：「轉好了」的戶頭卡預設收合，點開才看到細項（可以反悔取消打勾）。 */
  const [openDone, setOpenDone] = useState<Set<string>>(new Set())
  /** 「零用錢」底下兩條摺疊列各自的展開狀態——畫面狀態，不寫進 IndexedDB。 */
  const [openSection, setOpenSection] = useState<Set<string>>(new Set())

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

  /**
   * 刪掉一個分配項目，底部給 5 秒復原（全 App 共用的 UndoToast）。
   * 復原會放回原本的位置，連打勾、拆分一起還原——不是重新加一個 0 元的項目。
   * 用 store 的 restoreAllocation 而不是這裡的 base()：按復原時可能已經換了月份。
   */
  const removeAllocation = (accountId: string) => {
    const b = base()
    const index = b.allocations.findIndex((a) => a.accountId === accountId)
    if (index < 0) return
    const alloc = b.allocations[index]
    savePlan({ ...b, allocations: b.allocations.filter((a) => a.accountId !== accountId) })
    showUndo({
      label: `已刪除「${data.accounts.find((x) => x.id === accountId)?.name ?? '項目'}」`,
      undo: () => restoreAllocation(b.month, alloc, index),
    })
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

  const toggleOpenDone = (key: string) =>
    setOpenDone((v) => {
      const next = new Set(v)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleSection = (key: string) =>
    setOpenSection((v) => {
      const next = new Set(v)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const wallets = useMemo(
    () => data.wallets.filter((w) => !w.archived).sort((a, b) => a.order - b.order),
    [data.wallets],
  )

  const unused = accounts.filter((a) => !plan?.allocations.some((x) => x.accountId === a.id))

  const allowanceAlloc = plan?.allocations.find((a) => a.accountId === plan.allowanceAccountId)
  /** Wallets the user added to the split by hand this session. */
  const [shownSplits, setShownSplits] = useState<string[]>([])
  /**
   * 這次明確按過「移除」的存放處。只為了一種情況：那裡還有結轉或花費（照理會當成
   * 「有錢的地方」列出來），使用者剛按了移除卻還留著一列 0，看起來就像沒移除成功。
   */
  const [removedSplits, setRemovedSplits] = useState<string[]>([])
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
  const transferDoneRatio = transferTotal > 0 ? (transferTotal - transferLeft) / transferTotal : 0

  /**
   * 合併清單：「還要轉」與「本月分配」原本是同一份 allocations 列兩次，現在只列一次，
   * 依「錢要放去哪個存放處」分組，每列同時能打勾、改金額、點名稱編輯。
   * 分組規則跟 allocationByWallet 一致（拆分項目在每個存放處各一列、金額只算那一份），
   * 但金額 0 的項目也要列出來——剛加進來的項目就是 0，不列就沒地方填。
   */
  const listGroups = useMemo(() => {
    const map = new Map<string | null, ListRow[]>()
    const push = (walletId: string | null, row: ListRow) =>
      map.set(walletId, [...(map.get(walletId) ?? []), row])
    for (const a of plan?.allocations ?? []) {
      const account = data.accounts.find((x) => x.id === a.accountId) ?? null
      // 有拆分就照拆分列，**金額 0 的那格也列**（歸零不等於移除，見 setSplit）。
      // 不能退回「整筆一列」：那一列的金額欄可以改，改的是 amount、拆分卻還是 0，
      // 每日額度（照拆分算）就會跟畫面上的數字對不起來。
      if (a.splits?.length) {
        for (const sp of a.splits) push(sp.walletId, { alloc: a, account, amount: sp.amount, split: true })
      } else {
        push(account?.walletId ?? null, { alloc: a, account, amount: a.amount, split: false })
      }
    }
    const order = (id: string | null) => {
      const i = data.wallets.findIndex((w) => w.id === id)
      return i < 0 ? 99 : i
    }
    return [...map]
      .map(([walletId, rows]): ListGroup => {
        const w = walletId ? data.wallets.find((x) => x.id === walletId) : undefined
        return {
          walletId,
          name: w?.name ?? '未指定存放處',
          emoji: w?.emoji ?? '❓',
          color: w?.color ?? '#6b7280',
          cash: w?.kind === 'cash',
          rows,
          total: rows.reduce((n, r) => n + r.amount, 0),
          done: rows.reduce((n, r) => n + (r.alloc.done ? r.amount : 0), 0),
          allDone: rows.every((r) => r.alloc.done),
        }
      })
      .sort((x, y) => order(x.walletId) - order(y.walletId))
  }, [plan, data.accounts, data.wallets])

  const openGroups = listGroups.filter((g) => !g.allDone)
  const doneGroups = listGroups.filter((g) => g.allDone)
  const pendingTransfer = listGroups.filter((g) => !g.cash && g.total - g.done > 0)
  const pendingItemCount = pendingTransfer.reduce(
    (n, g) => n + g.rows.filter((r) => !r.alloc.done && r.amount).length,
    0,
  )

  /**
   * Which wallets the split section lists: the ones actually holding some of
   * this month's allowance, plus any the user just added. The rest are offered
   * as chips, because a column of zeroes is not information.
   */
  const splitRows = useMemo(() => {
    if (!plan?.allowanceAccountId || !allowanceAlloc) return []
    const listed = new Set(allowanceAlloc.splits?.map((s) => s.walletId) ?? [])
    const home = accounts.find((a) => a.id === plan.allowanceAccountId)?.walletId ?? null
    return wallets
      .map((w) => {
        const split = allowanceAlloc.splits?.find((x) => x.walletId === w.id)
        const implied = !allowanceAlloc.splits?.length && home === w.id ? allowanceAlloc.amount : 0
        const row = walletRows.find((r) => r.walletId === w.id)
        return { wallet: w, amount: split?.amount ?? implied, row }
      })
      .filter(
        (r) =>
          // 在拆分裡的一律列出——就算填成 0 也留著，要拿掉得明確按「移除」
          listed.has(r.wallet.id) ||
          r.amount !== 0 ||
          shownSplits.includes(r.wallet.id) ||
          (!removedSplits.includes(r.wallet.id) && r.row && (r.row.carriedIn !== 0 || r.row.spent > 0)),
      )
  }, [plan, allowanceAlloc, accounts, wallets, walletRows, shownSplits, removedSplits])

  const restWallets = useMemo(
    () => wallets.filter((w) => !splitRows.some((r) => r.wallet.id === w.id)),
    [wallets, splitRows],
  )

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
        // ⚠️ 填成 0 **不會**拿掉那一格（Benson 2026-10-01：歸零不要直接移除，刪除另外做）。
        // 以前會把 0 濾掉：打字中把數字刪光，那一列就整個消失；兩格都歸零時還會退回
        // 「沒有拆分」，整筆零用錢又跑回原本的戶頭。拿掉一格請走 removeSplit。
        const total = next.reduce((n, s) => n + s.amount, 0)
        // The split is the source of truth once used, so keep the headline in step.
        return { ...a, splits: next, amount: total }
      }),
    })
  }

  /** 明確移除「零用錢放在哪」的一格；金額不是 0 的給 5 秒復原。 */
  const removeSplit = (walletId: string) => {
    const b = base()
    const id = b.allowanceAccountId
    if (!id) return
    const a = b.allocations.find((x) => x.accountId === id)
    // 還沒拆分時畫面上那一格是「整筆放在原本的戶頭」推出來的，先把它變成真的一格再拿掉
    const existing: AllocationSplit[] =
      a?.splits ?? (a && a.amount > 0 ? [{ walletId: homeWalletOf(id), amount: a.amount }] : [])
    const index = existing.findIndex((s) => s.walletId === walletId)
    setShownSplits((v) => v.filter((x) => x !== walletId))
    setRemovedSplits((v) => (v.includes(walletId) ? v : [...v, walletId]))
    if (index < 0) return // 只是使用者剛加出來、還沒填過的空列
    const removed = existing[index]
    const next = existing.filter((s) => s.walletId !== walletId)
    savePlan({
      ...b,
      allocations: b.allocations.map((x) =>
        x.accountId === id
          ? { ...x, splits: next.length ? next : undefined, amount: next.reduce((n, s) => n + s.amount, 0) }
          : x,
      ),
    })
    if (removed.amount !== 0) {
      showUndo({
        label: `已移除「${wallets.find((w) => w.id === walletId)?.name ?? '存放處'}」${money(removed.amount, sym)}`,
        undo: () => {
          setRemovedSplits((v) => v.filter((x) => x !== walletId))
          restoreSplit(b.month, id, removed, index)
        },
      })
    }
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

  const totalCount = plan?.allocations.length ?? 0
  const transferAllDone = transferRows.length > 0 && transferLeft <= 0
  const splitParts = splitRows.filter((r) => r.amount !== 0)
  const splitSummary = splitParts.length ? (
    <span className="inline-flex items-center gap-1.5">
      {splitParts.map((r, i) => (
        <span key={r.wallet.id} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-faint">·</span>}
          <WalletBadge name={r.wallet.name} emoji={r.wallet.emoji} color={r.wallet.color} size={16} />
          {money(r.amount, sym)}
        </span>
      ))}
    </span>
  ) : null

  return (
    <div className="px-4 pb-6 space-y-4">
      {/* month switcher — 一行：月份＋日期範圍，不再是佔兩行的置中大字 */}
      <div className="flex items-center justify-center gap-1 pt-3 pb-1">
        <button
          onClick={() => setMonth(addMonths(month, -1))}
          className="w-11 h-11 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="上個月"
        >
          <IconChevronL className="w-5 h-5" />
        </button>
        <div className="text-[15px] font-semibold tnum">
          {formatMonthLabel(month)}{' '}
          <span className="text-[11px] font-normal text-faint">
            {range.start.slice(5).replace('-', '/')}–{range.end.slice(5).replace('-', '/')}
          </span>
        </div>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="w-11 h-11 grid place-items-center rounded-full text-muted active:bg-surface2"
          aria-label="下個月"
        >
          <IconChevronR className="w-5 h-5" />
        </button>
      </div>

      {carried && from && (
        <div className="rounded-2xl px-4 py-3 bg-brand-soft text-brand text-xs flex items-center gap-2">
          <span className="text-base">↻</span>
          <span>
            自動沿用 <b>{formatMonthLabel(from)}</b> 的分配。改金額或打勾之後，就會存成這個月的。
          </span>
        </div>
      )}

      {/* hero：這個月還要轉多少；底下那行的本月收入直接在這裡改 */}
      <div className="bg-surface rounded-[22px]">
        {totalCount === 0 ? (
          <div className="px-4 pt-4 pb-3.5 text-sm text-muted">
            這個月還沒有分配 — 填好收入，再按下面「新增分配項目」開始
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
            <div className="flex-1 min-w-0">
              {transferRows.length === 0 ? (
                <>
                  <div className="text-[13px] text-muted font-semibold">這個月不用轉帳</div>
                  <div className="text-xs text-muted mt-2">分配都在錢包現金，不用轉去銀行</div>
                </>
              ) : transferAllDone ? (
                <>
                  <div className="text-[13px] text-muted font-semibold">這個月都轉完了</div>
                  <div className="text-[40px] font-extrabold leading-none tnum mt-0.5 text-ok-ink">
                    全部轉好 🎉
                  </div>
                  <div className="text-xs text-muted mt-2 tnum">
                    {transferRows.reduce((n, r) => n + r.items, 0)} 筆都打勾了
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] text-muted font-semibold">這個月還要轉</div>
                  <div className="text-[40px] font-extrabold leading-none tnum mt-0.5">
                    {money(transferLeft, sym)}
                  </div>
                  <div className="text-xs text-muted mt-2 tnum">
                    {pendingItemCount} 筆 · {pendingTransfer.length} 個戶頭
                  </div>
                </>
              )}
            </div>
            {transferRows.length > 0 && (
              <Ring progress={transferDoneRatio} color="var(--brand)" size={62} stroke={6}>
                <span className="text-[13px] font-bold tnum">{Math.round(transferDoneRatio * 100)}%</span>
              </Ring>
            )}
          </div>
        )}

        <div className="h-px bg-line mx-4" />
        {/* 收入原本藏在「本月分配」摺疊區裡、這裡只唯讀顯示一次——兩處合成一處。 */}
        <div className="flex items-center justify-between gap-2 px-4 py-1.5 text-[12.5px]">
          <label className="flex items-center min-w-0 text-muted">
            <span className="shrink-0">本月收入</span>
            <span className="ml-1.5 text-faint">{sym}</span>
            {/* type=text 才能顯示千分位。輸入時把非數字都濾掉。
                字級不能低於 16px：iOS 會自動放大（見 index.css 那條無層級規則）。 */}
            <input
              type="text"
              inputMode="numeric"
              aria-label="本月收入"
              value={plan?.income ? plan.income.toLocaleString('en-US') : ''}
              placeholder="0"
              onChange={(e) => write({ income: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              className="w-[7.5rem] h-10 px-1 rounded-lg bg-transparent font-bold text-ink tnum outline-none focus:bg-surface2 placeholder:text-faint"
            />
          </label>
          {totalCount > 0 && (
            <span
              className={`shrink-0 font-semibold tnum ${
                s.unallocated === 0 ? 'text-ok-ink' : s.unallocated < 0 ? 'text-bad' : 'text-warn-ink'
              }`}
            >
              {s.unallocated === 0
                ? '✓ 分配完畢'
                : `${s.unallocated > 0 ? '還沒分配' : '超出收入'} ${money(Math.abs(s.unallocated), sym)}`}
            </span>
          )}
        </div>
      </div>

      {/* 本月分配：原本的「還要轉」與「本月分配」是同一份資料列兩次，合成一份依存放處分組的清單。
          平常點列＝打勾；按「編輯」之後點名稱才開項目編輯器、才出現垃圾桶。 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pl-1">
          <span className="text-[12.5px] font-bold text-muted">
            本月分配
            {totalCount > 0 && (
              <span className="ml-1.5 text-faint font-normal tnum">
                {editing ? '點名稱可以改項目' : `${totalCount} 項 · 點一下打勾，往左滑刪除`}
              </span>
            )}
          </span>
          {totalCount > 0 && (
            <button
              onClick={() => setEditing((v) => !v)}
              className={`h-8 px-3 rounded-full text-xs font-semibold active:scale-95 transition ${
                editing ? 'bg-brand text-on-brand' : 'text-brand active:bg-surface2'
              }`}
            >
              {editing ? '完成' : '編輯'}
            </button>
          )}
        </div>

        {openGroups.map((g) => {
          const left = g.total - g.done
          const doneCount = g.rows.filter((r) => r.alloc.done).length
          return (
            <div key={g.walletId ?? 'none'} className="bg-surface rounded-3xl p-2">
              <div className="flex items-center gap-2 px-2 pt-2">
                <WalletBadge name={g.name} emoji={g.emoji} color={g.color} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold truncate">{g.name}</div>
                  {/* 一項都還沒轉時也要出一行字。留空白會讓卡片看起來像少載了東西。 */}
                  <div className="text-[11px] text-muted tnum truncate">
                    {g.cash
                      ? '現金，不用轉帳'
                      : !g.walletId
                        ? '按「編輯」點名稱，指定要放哪'
                        : doneCount > 0
                          ? `已轉 ${doneCount} 項 · ${money(g.done, sym)}`
                          : '這個戶頭還沒開始轉'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-muted">{g.cash ? '合計' : '還要轉'}</div>
                  <div className={`text-[16px] font-extrabold tnum ${g.cash ? '' : 'text-brand'}`}>
                    {money(g.cash ? g.total : left, sym)}
                  </div>
                </div>
              </div>
              <div className="h-px bg-line mx-2 mt-2" />
              <div className="divide-y divide-line">
                {g.rows.map((row) => (
                  <AllocRow
                    key={row.alloc.accountId}
                    row={row}
                    sym={sym}
                    allowance={plan?.allowanceAccountId === row.alloc.accountId}
                    editing={editing}
                    onToggle={() => toggleDone(row.alloc.accountId)}
                    onOpen={() => row.account && setEditingAccount(row.account)}
                    onAmount={(v) => setAllocation(row.alloc.accountId, v)}
                    onRemove={() => removeAllocation(row.alloc.accountId)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* 轉好了：一組都打勾就收成一行，點開可以反悔取消打勾、也能改金額 */}
        {doneGroups.length > 0 && (
          <div className="px-1 pt-1 text-[12.5px] font-bold text-muted">
            轉好了 <span className="text-faint font-normal">{doneGroups.length} 個存放處</span>
          </div>
        )}
        {doneGroups.map((g) => {
          const key = g.walletId ?? 'none'
          const open = openDone.has(key)
          return (
            <div key={key} className="bg-surface rounded-3xl overflow-hidden">
              <button
                onClick={() => toggleOpenDone(key)}
                className="w-full min-h-[52px] px-3 flex items-center gap-2 text-left active:bg-surface2 transition"
              >
                <span className="w-5 h-5 shrink-0 grid place-items-center rounded-full bg-ok text-on-ok">
                  <IconCheck className="w-3 h-3" />
                </span>
                <WalletBadge name={g.name} emoji={g.emoji} color={g.color} size={22} />
                <span className="flex-1 min-w-0 truncate text-[14px] text-muted">{g.name}</span>
                <span className="text-[14px] text-muted tnum">{money(g.total, sym)}</span>
                <IconChevronR
                  className={`w-4 h-4 text-faint shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
              {open && (
                <div className="px-2 pb-1 divide-y divide-line">
                  {g.rows.map((row) => (
                    <AllocRow
                      key={row.alloc.accountId}
                      row={row}
                      sym={sym}
                      allowance={plan?.allowanceAccountId === row.alloc.accountId}
                      editing={editing}
                      onToggle={() => toggleDone(row.alloc.accountId)}
                      onOpen={() => row.account && setEditingAccount(row.account)}
                      onAmount={(v) => setAllocation(row.alloc.accountId, v)}
                      onRemove={() => removeAllocation(row.alloc.accountId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={() => (unused.length > 0 ? setPicking(true) : setEditingAccount('new'))}
          className="w-full h-11 rounded-2xl text-sm font-medium text-brand flex items-center justify-center gap-1 active:bg-surface2"
        >
          <IconPlus className="w-4 h-4" /> 新增分配項目
        </button>
      </div>

      {/* 零用錢：幾個月才動一次的設定，收成兩條摺疊列 */}
      <div>
        <div className="px-1 pb-2 text-[12.5px] font-bold text-muted">零用錢</div>
        <div className="bg-surface rounded-3xl divide-y divide-line overflow-hidden">
          <CollapsibleRow
            label="零用錢設定"
            summary={allowanceUnfunded ? '⚠️ 來源還沒分配到錢' : `每天 ${money(s.dailyAllowance, sym)}`}
            warn={!!allowanceUnfunded}
            open={openSection.has('allowance')}
            onToggle={() => toggleSection('allowance')}
          >
            <div className="px-3 pb-3 space-y-4">
              {allowanceUnfunded && (
                <div className="rounded-2xl px-3 py-2.5 bg-warn/12 text-warn-ink text-xs">
                  零用錢來源「{allowanceUnfunded.name}」這個月還沒分配到錢，所以每日額度是 0。
                  上面把金額填進去就會自動算出來。
                </div>
              )}

              <label className="flex items-center gap-3">
                <span className="text-sm text-muted flex-1">零用錢來源</span>
                <select
                  value={plan?.allowanceAccountId ?? ''}
                  onChange={(e) => write({ allowanceAccountId: e.target.value || null })}
                  className="h-11 px-3 rounded-xl bg-surface2 text-sm outline-none max-w-44"
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
                    write({
                      dailyAllowanceOverride: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-28 h-11 px-3 text-right rounded-xl bg-surface2 tnum text-sm outline-none"
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
                <span className="text-2xl font-bold tnum text-brand">
                  {money(s.dailyAllowance, sym)}
                </span>
              </div>
            </div>
          </CollapsibleRow>

          {plan?.allowanceAccountId && allowanceAlloc && (
            <CollapsibleRow
              label="零用錢放在哪"
              summary={splitSummary || '未設定'}
              open={openSection.has('split')}
              onToggle={() => toggleSection('split')}
            >
              <div className="px-3 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-faint flex-1 pr-2">
                    一部分放錢包當現金、一部分留在戶頭的話，在這裡填。記帳時選付款來源，就能分開算結餘。
                  </p>
                  {allowanceAlloc.splits?.length ? (
                    <button onClick={clearSplits} className="text-xs text-muted active:text-bad shrink-0">
                      取消拆分
                    </button>
                  ) : null}
                </div>

                {/* One row per wallet: the amount to put there, and what is left of it. */}
                <div className="space-y-2.5">
                  {splitRows.map(({ wallet: w, amount, row }) => (
                    <SwipeRow key={w.id} onDelete={() => removeSplit(w.id)} label="移除" className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <WalletBadge name={w.name} emoji={w.emoji} color={w.color} size={32} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate">{w.name}</span>
                          <span className="block text-[10px] text-faint truncate">
                            {row && (row.allocated > 0 || row.income > 0 || row.carriedIn !== 0) ? (
                              <>
                                還剩{' '}
                                <b className={row.left < 0 ? 'text-bad' : 'text-ok-ink'}>
                                  {money(row.left, sym)}
                                </b>
                                {row.carriedIn !== 0 ? (
                                  <span className={row.carriedIn > 0 ? 'text-ok-ink' : 'text-bad'}>
                                    {' · 結轉 '}
                                    {row.carriedIn > 0 ? '+' : ''}
                                    {money(row.carriedIn, sym)}
                                  </span>
                                ) : (
                                  row.spent > 0 && ` · 已花 ${money(row.spent, sym)}`
                                )}
                              </>
                            ) : (
                              WALLET_KIND_LABEL[w.kind]
                            )}
                          </span>
                        </span>
                        {/* type=text 才有千分位（跟分配列、本月收入同一套）；清空＝0，不會移除這一格 */}
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`${w.name}零用錢`}
                          value={amount ? amount.toLocaleString('en-US') : ''}
                          placeholder="0"
                          onChange={(e) => setSplit(w.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
                          className="w-[88px] h-11 px-2 shrink-0 text-right rounded-lg bg-surface2 tnum text-sm font-semibold outline-none"
                        />
                        {/* 刪除另外一顆（也可以往左滑）。歸零不會拿掉這一格。 */}
                        <button
                          onClick={() => removeSplit(w.id)}
                          aria-label={`移除${w.name}`}
                          className="w-9 h-11 -mr-1 shrink-0 grid place-items-center rounded-lg text-faint active:text-bad"
                        >
                          <IconX className="w-4 h-4" />
                        </button>
                      </div>
                    </SwipeRow>
                  ))}
                </div>

                {/* Wallets holding nothing this month are one tap away rather than
                    five rows of zeroes. */}
                {restWallets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {restWallets.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => {
                          setShownSplits((v) => [...v, w.id])
                          setRemovedSplits((v) => v.filter((x) => x !== w.id))
                        }}
                        className="h-8 px-3 rounded-full bg-surface2 text-xs text-muted active:scale-95 transition"
                      >
                        + <WalletBadge name={w.name} emoji={w.emoji} color={w.color} size={16} className="mx-0.5" />{' '}
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleRow>
          )}
        </div>
      </div>

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

/**
 * 合併清單的一列：打勾＋名稱＋金額。
 * 平常整個左半邊都是打勾鈕（轉帳那天一路點下去）；「編輯」模式下點名稱改開項目編輯器，
 * 名稱不會一打開頁面就是十幾顆誤觸會跳出編輯器的按鈕。打勾對整筆 allocation 生效，
 * 拆分項目在每個存放處各一列、會一起變。
 * 往左滑刪除（共用 SwipeRow，跟記錄列同一套手勢）；編輯模式的垃圾桶也還在。
 */
function AllocRow({
  row,
  sym,
  allowance,
  editing,
  onToggle,
  onOpen,
  onAmount,
  onRemove,
}: {
  row: ListRow
  sym: string
  allowance: boolean
  editing: boolean
  onToggle: () => void
  onOpen: () => void
  onAmount: (amount: number) => void
  onRemove: () => void
}) {
  const done = row.alloc.done
  const label = done ? '標記為未轉帳' : '標記為已轉帳'
  return (
    <SwipeRow onDelete={onRemove}>
      <div className="flex items-center gap-1 pr-1 py-0.5">
        {/* 觸控目標 44×44；視覺圓圈維持 24。 */}
        <button
          onClick={onToggle}
          aria-label={label}
          className="w-11 h-11 shrink-0 grid place-items-center rounded-full active:scale-90 transition"
        >
          <span
            className={`w-6 h-6 grid place-items-center rounded-full ${
              done ? 'bg-ok text-on-ok' : 'border-2 border-line text-transparent'
            }`}
          >
            <IconCheck className="w-3.5 h-3.5" />
          </span>
        </button>

        <button
          onClick={editing ? onOpen : onToggle}
          aria-label={editing ? undefined : label}
          className="flex items-center gap-2 flex-1 min-w-0 min-h-11 text-left active:opacity-60"
        >
          <span
            className="w-8 h-8 shrink-0 grid place-items-center rounded-xl text-base"
            style={{ background: `${row.account?.color ?? '#6b7280'}1f` }}
          >
            {row.account?.emoji ?? '💼'}
          </span>
          <span className="min-w-0">
            <span
              className={`block text-sm truncate ${done ? 'text-muted' : ''} ${
                editing ? 'underline decoration-line decoration-dotted underline-offset-4' : ''
              }`}
            >
              {row.account?.name ?? '（項目已刪除）'}
              {allowance && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-soft text-brand align-middle">
                  零用錢
                </span>
              )}
            </span>
            {row.split && <span className="block text-[10px] text-faint truncate">拆分的其中一份</span>}
          </span>
        </button>

        {/* 無邊框，十幾列讀起來才是一欄數字；focus 了才看得出是輸入框。
            type=text 才能顯示千分位（跟本月收入同一套），輸入時把非數字都濾掉。 */}
        <input
          type="text"
          inputMode="numeric"
          aria-label={`${row.account?.name ?? '項目'}金額`}
          value={row.amount ? row.amount.toLocaleString('en-US') : ''}
          placeholder={`${sym}0`}
          readOnly={row.split}
          title={row.split ? '由下方「零用錢放在哪」的金額加總' : undefined}
          onChange={(e) => onAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
          className={`w-[88px] h-10 px-2 shrink-0 text-right rounded-lg tnum text-sm font-semibold outline-none bg-transparent transition ${
            row.split ? 'text-muted' : done ? 'text-muted focus:bg-surface2' : 'focus:bg-surface2'
          }`}
        />
        {editing && (
          <button
            onClick={onRemove}
            aria-label="移除"
            className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-faint active:text-bad"
          >
            <IconTrash className="w-4 h-4" />
          </button>
        )}
      </div>
    </SwipeRow>
  )
}

/** 「零用錢」底下的一條摺疊列：收合時右側顯示摘要，展開時摘要拿掉、改顯示內容。 */
function CollapsibleRow({
  label,
  summary,
  warn,
  open,
  onToggle,
  children,
}: {
  label: string
  summary: React.ReactNode
  /** 收合時把摘要染成警示色。設定沒填完的提示藏在摺疊區裡就等於沒有提示。 */
  warn?: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full min-h-[52px] px-4 py-3.5 flex items-center justify-between gap-2 text-left active:bg-surface2 transition"
      >
        <span className="text-sm font-semibold shrink-0">{label}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          {!open && (
            <span
              className={`text-[12.5px] tnum truncate ${
                warn ? 'text-warn-ink font-semibold' : 'text-muted'
              }`}
            >
              {summary}
            </span>
          )}
          <IconChevronR
            className={`w-4 h-4 text-faint shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}
