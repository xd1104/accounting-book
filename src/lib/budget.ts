import type { AppData, MonthPlan, Txn } from './types'
import { addDays, daysBetween, periodOf, periodRange, today } from './date'

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

  /** 本期零用錢總額 */
  allowanceTotal: number
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
  let dailyAllowance: number
  let allowanceTotal: number
  if (plan?.dailyAllowanceOverride != null) {
    dailyAllowance = plan.dailyAllowanceOverride
    allowanceTotal = dailyAllowance * totalDays
  } else {
    allowanceTotal = allocations.find((a) => a.accountId === allowanceAccountId)?.amount ?? 0
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
export function allowanceByWallet(data: AppData, month: string): WalletBalance[] {
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

  const ids = new Set<string | null>([...allocated.keys(), ...spent.keys(), ...income.keys()])
  const out: WalletBalance[] = []
  for (const id of ids) {
    const w = id ? data.wallets.find((x) => x.id === id) : null
    const a = allocated.get(id) ?? 0
    const s = spent.get(id) ?? 0
    const inc = income.get(id) ?? 0
    if (a === 0 && s === 0 && inc === 0) continue
    out.push({
      walletId: id,
      name: w?.name ?? '未指定',
      emoji: w?.emoji ?? '❓',
      color: w?.color ?? '#6b7280',
      kind: w?.kind ?? 'unset',
      allocated: a,
      spent: s,
      income: inc,
      left: a + inc - s,
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
