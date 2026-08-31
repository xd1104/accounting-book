import type { AppData, MonthPlan, Txn } from './types'
import { addDays, addMonths, daysBetween, periodOf, periodRange, today } from './date'

export function emptyPlan(month: string, allowanceAccountId: string | null): MonthPlan {
  return {
    month,
    income: 0,
    allocations: [],
    allowanceAccountId,
    dailyAllowanceOverride: null,
    rollover: true,
  }
}

export function getPlan(data: AppData, month: string): MonthPlan | null {
  return resolvePlan(data, month).plan
}

/**
 * A month with no plan of its own inherits the most recent earlier one, with the
 * transferred ticks cleared — set the split up once and every later month keeps it.
 * `carried` marks a plan that is only inherited; the first edit writes it for real.
 */
export function resolvePlan(
  data: AppData,
  month: string,
): { plan: MonthPlan | null; carried: boolean; from: string | null } {
  const stored = data.plans[month]
  if (stored) return { plan: stored, carried: false, from: null }

  const earlier = Object.keys(data.plans)
    .filter((m) => m < month)
    .sort()
  const fromMonth = earlier.at(-1)
  if (!fromMonth) return { plan: null, carried: false, from: null }

  const prev = data.plans[fromMonth]
  return {
    plan: {
      ...prev,
      month,
      allocations: prev.allocations.map((a) => ({ ...a, done: false, doneAt: undefined })),
    },
    carried: true,
    from: fromMonth,
  }
}

/** Transactions belonging to a budget period, newest first. */
export function txnsInPeriod(data: AppData, month: string): Txn[] {
  const start = data.settings.monthStartDay
  return data.txns
    .filter((t) => periodOf(t.date, start) === month)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

/**
 * Whether a record moves the allowance — expenses draw it down, income tops it up.
 * Money coming back in (a friend repaying you, a refund) is spendable again, so
 * leaving income out made the balance read lower than it really is.
 * With no allowance account chosen everything counts, which is the sane default
 * before a salary plan exists.
 */
function touchesAllowance(t: Txn, allowanceAccountId: string | null): boolean {
  // No allowance item chosen yet — count everything, which is right before setup.
  if (!allowanceAccountId) return true
  // Leaving the item unset is the way to keep something out of the allowance,
  // which is what a salary record needs: the plan already accounts for it.
  return t.accountId === allowanceAccountId
}

export interface PeriodSummary {
  month: string
  start: string
  end: string
  totalDays: number
  /** 1-based day index within the period, clamped to the period */
  dayIndex: number
  /** remaining days including today; 0 for a finished period */
  daysLeft: number
  isCurrent: boolean
  isFuture: boolean

  plan: MonthPlan | null
  income: number
  allocated: number
  allocatedDone: number
  unallocated: number
  allocationComplete: boolean

  /** 本期零用錢總額（含上期結轉的現金） */
  allowanceTotal: number
  /** 其中由上期現金結轉而來的 */
  carriedIn: number
  /** 每日額度 */
  dailyAllowance: number
  /** 今天的可用額度（rollover 模式下含前幾天沒花完的） */
  todayBudget: number
  /** 今天還剩多少可以花 */
  todayRemaining: number
  /** 今天花掉的（不扣今天收到的） */
  spentToday: number
  /** 今天收到、算在零用錢裡的 */
  incomeToday: number
  /** 本期零用錢已花（含未來日期的預先記錄） */
  spentAllowance: number
  /** 本期收到、算回零用錢的 */
  incomeAllowance: number
  allowanceLeft: number
  /** 剩下的錢平均分到剩下的天數 */
  suggestedDaily: number

  expenseTotal: number
  incomeTotal: number
  net: number
}

export function summarize(data: AppData, month: string, now = today()): PeriodSummary {
  const { monthStartDay } = data.settings
  const { start, end, days: totalDays } = periodRange(month, monthStartDay)
  const plan = getPlan(data, month)
  const txns = txnsInPeriod(data, month)

  const currentPeriod = periodOf(now, monthStartDay)
  const isCurrent = currentPeriod === month
  const isFuture = month > currentPeriod

  // How far into the period we are.
  let dayIndex: number
  if (isCurrent) dayIndex = Math.min(Math.max(daysBetween(start, now) + 1, 1), totalDays)
  else if (isFuture) dayIndex = 0
  else dayIndex = totalDays
  const daysLeft = isCurrent ? totalDays - dayIndex + 1 : isFuture ? totalDays : 0

  // --- salary allocation ---
  const income = plan?.income ?? 0
  const allocations = plan?.allocations ?? []
  const allocated = allocations.reduce((s, a) => s + a.amount, 0)
  const allocatedDone = allocations.filter((a) => a.done).reduce((s, a) => s + a.amount, 0)
  const unallocated = income - allocated

  // --- allowance ---
  const allowanceAccountId = plan?.allowanceAccountId ?? null
  // Cash that survived earlier periods is spendable now, so it belongs in the
  // pot — and therefore in the daily figure derived from it.
  const carriedIn = allowanceAccountId ? cashCarryTotal(data, month) : 0
  let dailyAllowance: number
  let allowanceTotal: number
  if (plan?.dailyAllowanceOverride != null) {
    // A hand-set daily figure is the user overriding the arithmetic, so leave it
    // alone; the carried cash still counts toward what the month actually holds.
    dailyAllowance = plan.dailyAllowanceOverride
    allowanceTotal = dailyAllowance * totalDays + carriedIn
  } else {
    const planned = allocations.find((a) => a.accountId === allowanceAccountId)?.amount ?? 0
    allowanceTotal = planned + carriedIn
    dailyAllowance = totalDays > 0 ? allowanceTotal / totalDays : 0
  }

  // Net figures drive the budget; the gross ones are what the screens label.
  let netToday = 0
  let netBeforeToday = 0
  let spentAllowance = 0
  let incomeAllowance = 0
  let expenseToday = 0
  let incomeToday = 0
  let expenseTotal = 0
  let incomeTotal = 0

  for (const t of txns) {
    if (t.type === 'income') incomeTotal += t.amount
    else expenseTotal += t.amount

    if (!touchesAllowance(t, allowanceAccountId)) continue
    const signed = t.type === 'expense' ? t.amount : -t.amount
    if (t.type === 'expense') spentAllowance += t.amount
    else incomeAllowance += t.amount

    if (t.date === now) {
      netToday += signed
      if (t.type === 'expense') expenseToday += t.amount
      else incomeToday += t.amount
    } else if (t.date < now) {
      netBeforeToday += signed
    }
  }

  const rollover = plan?.rollover ?? true
  const todayBudget = rollover ? dailyAllowance * dayIndex - netBeforeToday : dailyAllowance
  const todayRemaining = todayBudget - netToday

  const allowanceLeft = allowanceTotal + incomeAllowance - spentAllowance
  const suggestedDaily = daysLeft > 0 ? allowanceLeft / daysLeft : 0

  return {
    month,
    start,
    end,
    totalDays,
    dayIndex,
    daysLeft,
    isCurrent,
    isFuture,
    plan,
    income,
    allocated,
    allocatedDone,
    unallocated,
    allocationComplete: allocations.length > 0 && allocations.every((a) => a.done),
    allowanceTotal,
    carriedIn,
    dailyAllowance,
    todayBudget,
    todayRemaining,
    spentToday: expenseToday,
    incomeToday,
    spentAllowance,
    incomeAllowance,
    allowanceLeft,
    suggestedDaily,
    expenseTotal,
    incomeTotal,
    net: incomeTotal - expenseTotal,
  }
}

export interface WalletBalance {
  walletId: string | null
  name: string
  emoji: string
  color: string
  kind: 'cash' | 'bank' | 'unset'
  /** 這個月配到這裡的零用錢 */
  allocated: number
  /** 上期結轉進來的（只有現金會結轉） */
  carriedIn: number
  /** 從這裡花掉的零用錢 */
  spent: number
  /** 收進這裡、算回零用錢的 */
  income: number
  left: number
}

/**
 * Split the allowance across where the money physically sits, so "how much cash
 * is left in my wallet" and "how much is left in the bank" are separate answers.
 */
interface RawWalletFigures {
  allocated: Map<string | null, number>
  spent: Map<string | null, number>
  income: Map<string | null, number>
}

/** One period's allowance figures per wallet, before anything is carried in. */
function rawAllowanceByWallet(data: AppData, month: string): RawWalletFigures {
  const plan = getPlan(data, month)
  const allowanceId = plan?.allowanceAccountId ?? null

  const allocated = new Map<string | null, number>()
  const alloc = plan?.allocations.find((a) => a.accountId === allowanceId)
  if (alloc) {
    if (alloc.splits?.length) {
      for (const s of alloc.splits) {
        allocated.set(s.walletId, (allocated.get(s.walletId) ?? 0) + s.amount)
      }
    } else {
      const home = data.accounts.find((a) => a.id === allowanceId)?.walletId ?? null
      allocated.set(home, alloc.amount)
    }
  }

  const spent = new Map<string | null, number>()
  const income = new Map<string | null, number>()
  for (const t of txnsInPeriod(data, month)) {
    if (!touchesAllowance(t, allowanceId)) continue
    const bucket = t.type === 'expense' ? spent : income
    bucket.set(t.walletId, (bucket.get(t.walletId) ?? 0) + t.amount)
  }

  return { allocated, spent, income }
}

/** The earliest period the ledger knows anything about. */
function firstPeriod(data: AppData): string | null {
  const start = data.settings.monthStartDay
  let min: string | null = null
  for (const key of Object.keys(data.plans)) if (!min || key < min) min = key
  for (const t of data.txns) {
    const p = periodOf(t.date, start)
    if (!min || p < min) min = p
  }
  return min
}

/** A bad date in the data must not turn the fold below into a very long loop. */
const MAX_CARRY_PERIODS = 240

/**
 * Cash left over from earlier periods, per wallet.
 *
 * Physical cash does not reset at month end — whatever is still in the wallet on
 * the 31st is the same money that is in it on the 1st, so next month's cash
 * allowance starts with it. Money left sitting in a bank account is deliberately
 * not carried: it never left the account, and counting it as new allowance would
 * hand out the same balance again every month.
 *
 * Folded forward from the first period the ledger knows about rather than
 * computed recursively, because each period's leftover already includes what was
 * carried into it. Periods with no allowance source contribute nothing — before
 * the first plan exists there is no allowance to have a balance of.
 */
export function cashCarryByWallet(data: AppData, month: string): Map<string, number> {
  const out = new Map<string, number>()
  if (data.settings.carryCash === false) return out

  const cashIds = data.wallets.filter((w) => w.kind === 'cash').map((w) => w.id)
  if (!cashIds.length) return out

  const start = firstPeriod(data)
  if (!start || start >= month) return out

  for (const id of cashIds) out.set(id, 0)

  let p = start
  for (let i = 0; p < month && i < MAX_CARRY_PERIODS; i++, p = addMonths(p, 1)) {
    if (!getPlan(data, p)?.allowanceAccountId) continue
    const raw = rawAllowanceByWallet(data, p)
    for (const id of cashIds) {
      const left =
        (raw.allocated.get(id) ?? 0) +
        (out.get(id) ?? 0) +
        (raw.income.get(id) ?? 0) -
        (raw.spent.get(id) ?? 0)
      out.set(id, left)
    }
  }
  return out
}

export function cashCarryTotal(data: AppData, month: string): number {
  let n = 0
  for (const v of cashCarryByWallet(data, month).values()) n += v
  return n
}

export function allowanceByWallet(data: AppData, month: string): WalletBalance[] {
  const { allocated, spent, income } = rawAllowanceByWallet(data, month)
  const carry = cashCarryByWallet(data, month)

  const ids = new Set<string | null>([
    ...allocated.keys(),
    ...spent.keys(),
    ...income.keys(),
    // A wallet holding nothing but last month's leftover still has a balance.
    ...[...carry.entries()].filter(([, v]) => v !== 0).map(([k]) => k),
  ])
  const out: WalletBalance[] = []
  for (const id of ids) {
    const w = id ? data.wallets.find((x) => x.id === id) : null
    const a = allocated.get(id) ?? 0
    const s = spent.get(id) ?? 0
    const inc = income.get(id) ?? 0
    const carried = (id && carry.get(id)) || 0
    if (a === 0 && s === 0 && inc === 0 && carried === 0) continue
    out.push({
      walletId: id,
      name: w?.name ?? '未指定',
      emoji: w?.emoji ?? '❓',
      color: w?.color ?? '#6b7280',
      kind: w?.kind ?? 'unset',
      allocated: a,
      carriedIn: carried,
      spent: s,
      income: inc,
      left: a + carried + inc - s,
    })
  }

  // Wallet order first, unspecified last.
  return out.sort((x, y) => {
    const ox = data.wallets.findIndex((w) => w.id === x.walletId)
    const oy = data.wallets.findIndex((w) => w.id === y.walletId)
    return (ox < 0 ? 99 : ox) - (oy < 0 ? 99 : oy)
  })
}

export interface CategoryTotal {
  categoryId: string
  name: string
  emoji: string
  color: string
  total: number
  count: number
  share: number
}

export function categoryTotals(data: AppData, month: string, type: 'expense' | 'income'): CategoryTotal[] {
  const byId = new Map<string, number>()
  const counts = new Map<string, number>()
  let sum = 0
  for (const t of txnsInPeriod(data, month)) {
    if (t.type !== type) continue
    byId.set(t.categoryId, (byId.get(t.categoryId) ?? 0) + t.amount)
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    sum += t.amount
  }
  const out: CategoryTotal[] = []
  for (const [categoryId, total] of byId) {
    const cat = data.categories.find((c) => c.id === categoryId)
    out.push({
      categoryId,
      name: cat?.name ?? '未分類',
      emoji: cat?.emoji ?? '✨',
      color: cat?.color ?? '#6b7280',
      total,
      count: counts.get(categoryId) ?? 0,
      share: sum > 0 ? total / sum : 0,
    })
  }
  return out.sort((a, b) => b.total - a.total)
}

/** Daily expense totals across a period, for the trend chart. */
export function dailyTotals(data: AppData, month: string): Array<{ date: string; expense: number }> {
  const { start, days } = periodRange(month, data.settings.monthStartDay)
  const map = new Map<string, number>()
  for (const t of txnsInPeriod(data, month)) {
    if (t.type !== 'expense') continue
    map.set(t.date, (map.get(t.date) ?? 0) + t.amount)
  }
  const out: Array<{ date: string; expense: number }> = []
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    out.push({ date, expense: map.get(date) ?? 0 })
  }
  return out
}

export interface WalletPlanTotal {
  walletId: string | null
  name: string
  emoji: string
  color: string
  kind: 'cash' | 'bank' | 'unset'
  /** 這個月要放進這個存放處的總額 */
  total: number
  /** 其中已經勾選「已轉帳」的 */
  done: number
  /** 有幾個分配項目放在這裡 */
  items: number
}

/**
 * The whole salary plan totalled by where the money ends up.
 *
 * The allocation list is organised by purpose (房租、儲蓄…), which is the right
 * way to decide the plan but the wrong way to execute it: actually moving the
 * money means knowing "how much goes into 國泰 this month", and adding that up
 * by hand across a dozen items is exactly the sort of arithmetic that gets it
 * wrong. `allowanceByWallet` answers a different question — that one is about
 * the allowance only, and nets out spending.
 */
export function allocationByWallet(data: AppData, month: string): WalletPlanTotal[] {
  const plan = getPlan(data, month)
  const total = new Map<string | null, number>()
  const done = new Map<string | null, number>()
  const items = new Map<string | null, number>()

  const add = (walletId: string | null, amount: number, isDone: boolean) => {
    if (!amount) return
    total.set(walletId, (total.get(walletId) ?? 0) + amount)
    items.set(walletId, (items.get(walletId) ?? 0) + 1)
    if (isDone) done.set(walletId, (done.get(walletId) ?? 0) + amount)
  }

  for (const a of plan?.allocations ?? []) {
    if (a.splits?.length) {
      // A split item lands in several places, so it counts toward each of them.
      for (const s of a.splits) add(s.walletId, s.amount, !!a.done)
    } else {
      add(data.accounts.find((x) => x.id === a.accountId)?.walletId ?? null, a.amount, !!a.done)
    }
  }

  const out: WalletPlanTotal[] = []
  for (const [walletId, amount] of total) {
    const w = walletId ? data.wallets.find((x) => x.id === walletId) : null
    out.push({
      walletId,
      name: w?.name ?? '未指定存放處',
      emoji: w?.emoji ?? '❓',
      color: w?.color ?? '#6b7280',
      kind: w?.kind ?? 'unset',
      total: amount,
      done: done.get(walletId) ?? 0,
      items: items.get(walletId) ?? 0,
    })
  }

  // Wallet order first, unspecified last.
  return out.sort((x, y) => {
    const ox = data.wallets.findIndex((w) => w.id === x.walletId)
    const oy = data.wallets.findIndex((w) => w.id === y.walletId)
    return (ox < 0 ? 99 : ox) - (oy < 0 ? 99 : oy)
  })
}
