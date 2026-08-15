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
  return data.plans[month] ?? null
}

/** Transactions belonging to a budget period, newest first. */
export function txnsInPeriod(data: AppData, month: string): Txn[] {
  const start = data.settings.monthStartDay
  return data.txns
    .filter((t) => periodOf(t.date, start) === month)
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
}

/**
 * Whether an expense draws down the daily allowance.
 * With no allowance account chosen, every expense counts — that's the sane default
 * before the user has set up a salary plan.
 */
function drawsAllowance(t: Txn, allowanceAccountId: string | null): boolean {
  if (t.type !== 'expense') return false
  if (!allowanceAccountId) return true
  return t.accountId === allowanceAccountId || t.accountId == null
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
  spentToday: number
  /** 本期零用錢已花（含未來日期的預先記錄） */
  spentAllowance: number
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

  let spentToday = 0
  let spentBeforeToday = 0
  let spentAllowance = 0
  let expenseTotal = 0
  let incomeTotal = 0

  for (const t of txns) {
    if (t.type === 'income') incomeTotal += t.amount
    else expenseTotal += t.amount

    if (!drawsAllowance(t, allowanceAccountId)) continue
    spentAllowance += t.amount
    if (t.date === now) spentToday += t.amount
    else if (t.date < now) spentBeforeToday += t.amount
  }

  const rollover = plan?.rollover ?? true
  const todayBudget = rollover ? dailyAllowance * dayIndex - spentBeforeToday : dailyAllowance
  const todayRemaining = todayBudget - spentToday

  const allowanceLeft = allowanceTotal - spentAllowance
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
    spentToday,
    spentAllowance,
    allowanceLeft,
    suggestedDaily,
    expenseTotal,
    incomeTotal,
    net: incomeTotal - expenseTotal,
  }
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
