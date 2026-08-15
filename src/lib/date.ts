/**
 * All dates are handled as local-time 'YYYY-MM-DD' strings.
 * Never use toISOString() for a calendar date — it shifts to UTC and can land on the wrong day.
 */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime()
  return Math.round(ms / 86400000)
}

/**
 * The budget period a date belongs to, as a 'YYYY-MM' key.
 * With monthStartDay = 5, 2026-08-03 still belongs to period '2026-07'.
 */
export function periodOf(date: string, monthStartDay: number): string {
  const d = parseISODate(date)
  if (monthStartDay > 1 && d.getDate() < monthStartDay) {
    d.setMonth(d.getMonth() - 1)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** First and last date (inclusive) of a budget period. */
export function periodRange(
  month: string,
  monthStartDay: number,
): { start: string; end: string; days: number } {
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(Math.max(monthStartDay, 1), 28)
  const start = new Date(y, m - 1, day)
  const nextStart = new Date(y, m, day)
  const end = new Date(nextStart)
  end.setDate(end.getDate() - 1)
  return {
    start: toISODate(start),
    end: toISODate(end),
    days: Math.round((nextStart.getTime() - start.getTime()) / 86400000),
  }
}

export function currentPeriod(monthStartDay: number): string {
  return periodOf(today(), monthStartDay)
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDateLabel(date: string): string {
  const d = parseISODate(date)
  const t = today()
  if (date === t) return '今天'
  if (date === addDays(t, -1)) return '昨天'
  if (date === addDays(t, 1)) return '明天'
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const now = new Date()
  if (y === now.getFullYear()) return `${m} 月`
  return `${y} 年 ${m} 月`
}

export function formatFullDate(date: string): string {
  const d = parseISODate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`
}
