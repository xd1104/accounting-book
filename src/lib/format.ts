/** Rounded to whole units — TWD has no practical cent usage. */
export function money(n: number, symbol = '$'): string {
  const v = Math.round(n)
  const sign = v < 0 ? '-' : ''
  return `${sign}${symbol}${Math.abs(v).toLocaleString('en-US')}`
}

/** Compact form for axis labels: 12.3k */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1)}k`
  return String(Math.round(n))
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`
}
