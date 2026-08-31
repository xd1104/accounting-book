import type { Account, AppData, Category, MonthPlan, Settings, Txn, Wallet } from './types'
import { DEFAULT_SETTINGS, emptyData } from './defaults'

/**
 * Markdown on disk instead of one JSON blob.
 *
 * Borrowed from lose-weight-helper: split the data across small files, one per
 * month, and write them as markdown with a YAML front matter header. Three things
 * follow from that, all of which the single-file version got wrong:
 *
 *   - Two devices editing different months never collide, so conflicts stop
 *     being the normal case.
 *   - `git diff` shows the records that changed rather than a rewritten blob,
 *     which makes the repo genuinely useful as history.
 *   - The files stay hand-editable and readable on github.com.
 *
 * Records are one JSON object per list item: structured enough to parse exactly,
 * flat enough to read.
 */

export const META_PATH = 'data/meta.md'
export const MONTH_DIR = 'data/months'
export const PHOTO_DIR = 'data/photos'

export function monthPath(month: string): string {
  return `${MONTH_DIR}/${month}.md`
}

/** Storage bucket for a record: the calendar month of its date, independent of
 *  monthStartDay so that changing the pay cycle never rewrites every file. */
export function bucketOf(txn: Txn): string {
  return txn.date.slice(0, 7)
}

// ---------- front matter ----------

function fmValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0'
  if (typeof v === 'boolean') return String(v)
  return JSON.stringify(String(v))
}

function buildFrontMatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${fmValue(v)}`)
  return `---\n${lines.join('\n')}\n---\n`
}

function parseFrontMatter(text: string): { fields: Record<string, unknown>; body: string } {
  const norm = text.replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(norm)
  if (!m) return { fields: {}, body: norm }
  const fields: Record<string, unknown> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const raw = kv[2].trim()
    if (raw === 'null' || raw === '') fields[kv[1]] = null
    else if (raw === 'true') fields[kv[1]] = true
    else if (raw === 'false') fields[kv[1]] = false
    else if (/^-?\d+(\.\d+)?$/.test(raw)) fields[kv[1]] = Number(raw)
    else {
      try {
        fields[kv[1]] = JSON.parse(raw)
      } catch {
        fields[kv[1]] = raw
      }
    }
  }
  return { fields, body: norm.slice(m[0].length) }
}

/** Items are written as `- {json}`; anything else in the file is ignored. */
function parseSection(body: string, heading: string): unknown[] {
  const norm = body.replace(/\r\n/g, '\n')
  const start = norm.indexOf(`## ${heading}`)
  if (start < 0) return []
  const rest = norm.slice(start + heading.length + 3)
  const end = rest.indexOf('\n## ')
  const block = end < 0 ? rest : rest.slice(0, end)
  const out: unknown[] = []
  for (const line of block.split('\n')) {
    const m = /^-\s+(\{.*\})\s*$/.exec(line.trim())
    if (!m) continue
    try {
      out.push(JSON.parse(m[1]))
    } catch {
      /* a corrupted line should not take the whole file down */
    }
  }
  return out
}

function section(heading: string, items: unknown[]): string {
  return `\n## ${heading}\n\n${items.map((i) => `- ${JSON.stringify(i)}`).join('\n')}\n`
}

// ---------- meta: the things that are not month-specific ----------

export interface Meta {
  settings: Settings
  wallets: Wallet[]
  accounts: Account[]
  categories: Category[]
  updatedAt: string
}

/**
 * Deliberately carries no global `updatedAt`: sync compares file bodies, and a
 * timestamp that moves on every edit anywhere would make this file look changed
 * on both devices at once — turning every cross-device edit into a conflict.
 */
export function serializeMeta(d: AppData): string {
  return (
    buildFrontMatter({
      currencySymbol: d.settings.currencySymbol,
      monthStartDay: d.settings.monthStartDay,
      lastBackupAt: d.settings.lastBackupAt ?? null,
      carryCash: d.settings.carryCash !== false,
    }) +
    section('存放處', d.wallets) +
    section('分配項目', d.accounts) +
    section('分類', d.categories)
  )
}

export function parseMeta(text: string): Meta {
  const { fields, body } = parseFrontMatter(text)
  const base = emptyData()
  const wallets = parseSection(body, '存放處') as Wallet[]
  const accounts = parseSection(body, '分配項目') as Account[]
  const categories = parseSection(body, '分類') as Category[]
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      currencySymbol: (fields.currencySymbol as string) || DEFAULT_SETTINGS.currencySymbol,
      monthStartDay: (fields.monthStartDay as number) || DEFAULT_SETTINGS.monthStartDay,
      lastBackupAt: (fields.lastBackupAt as string) ?? undefined,
      // Absent in files written before this existed, and the default is on.
      carryCash: fields.carryCash !== false,
    },
    wallets: wallets.length ? wallets : base.wallets,
    accounts: accounts.length ? accounts : base.accounts,
    categories: categories.length ? categories : base.categories,
    updatedAt: new Date().toISOString(),
  }
}

// ---------- one file per month ----------

export interface MonthFile {
  month: string
  plan: MonthPlan | null
  txns: Txn[]
}

export function serializeMonth(month: string, plan: MonthPlan | null, txns: Txn[]): string {
  const sorted = [...txns].sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
  )
  let out = buildFrontMatter({
    month,
    income: plan?.income ?? 0,
    allowanceAccountId: plan?.allowanceAccountId ?? null,
    dailyAllowanceOverride: plan?.dailyAllowanceOverride ?? null,
    rollover: plan?.rollover ?? true,
    hasPlan: !!plan,
  })
  if (plan) out += section('分配', plan.allocations)
  out += section('記錄', sorted)
  return out
}

export function parseMonth(month: string, text: string): MonthFile {
  const { fields, body } = parseFrontMatter(text)
  const txns = parseSection(body, '記錄') as Txn[]
  const allocations = parseSection(body, '分配') as MonthPlan['allocations']
  const hasPlan = fields.hasPlan === true || allocations.length > 0 || !!fields.income
  return {
    month,
    plan: hasPlan
      ? {
          month,
          income: (fields.income as number) || 0,
          allocations,
          allowanceAccountId: (fields.allowanceAccountId as string) ?? null,
          dailyAllowanceOverride: (fields.dailyAllowanceOverride as number) ?? null,
          rollover: fields.rollover !== false,
        }
      : null,
    txns: txns.filter((t) => t && t.id && t.date),
  }
}

// ---------- splitting and reassembling AppData ----------

/** Every month that needs a file: any with records, a plan, or both. */
export function monthKeys(d: AppData): string[] {
  const keys = new Set<string>(Object.keys(d.plans))
  for (const t of d.txns) keys.add(bucketOf(t))
  return [...keys].sort()
}

export function monthTxns(d: AppData, month: string): Txn[] {
  return d.txns.filter((t) => bucketOf(t) === month)
}

export function assemble(meta: Meta, months: MonthFile[]): AppData {
  const plans: Record<string, MonthPlan> = {}
  const txns: Txn[] = []
  for (const m of months) {
    if (m.plan) plans[m.month] = m.plan
    txns.push(...m.txns)
  }
  return {
    version: emptyData().version,
    settings: meta.settings,
    wallets: meta.wallets,
    accounts: meta.accounts,
    categories: meta.categories,
    plans,
    txns,
    updatedAt: meta.updatedAt,
  }
}
