import type { Account, AccountKind, AppData, Category, Settings, Wallet, WalletKind } from './types'
import { DATA_VERSION } from './types'

export const WALLET_KIND_LABEL: Record<WalletKind, string> = {
  cash: '現金',
  bank: '戶頭',
}

/** Display order of the allocation types, used by the pickers and the grouped list. */
export const ACCOUNT_KINDS: AccountKind[] = ['allowance', 'fixed', 'saving', 'invest', 'other']

export const KIND_LABEL: Record<AccountKind, string> = {
  allowance: '日常零用錢',
  fixed: '固定支出',
  saving: '儲蓄',
  invest: '投資',
  other: '其他',
}

export const KIND_HINT: Record<AccountKind, string> = {
  allowance: '每天可以花的錢，額度由這裡算出來',
  fixed: '房租、保險、電信等每月固定要付的',
  saving: '存起來不動的',
  invest: '拿去投資的',
  other: '其他用途',
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const DEFAULT_SETTINGS: Settings = {
  currencySymbol: '$',
  monthStartDay: 1,
}

// Hue order is validated with the dataviz palette checker (lightness band, chroma
// floor and normal-vision separation all pass). Categories always render with their
// emoji and name, so colour is reinforcement rather than the sole identity channel.
const EXPENSE_CATEGORIES: Array<[string, string, string]> = [
  ['餐飲', '🍜', '#f97316'],
  ['交通', '🚌', '#0ea5e9'],
  ['購物', '🛍️', '#ec4899'],
  ['娛樂', '🎮', '#a855f7'],
  ['日用品', '🧻', '#14b8a6'],
  ['醫療', '💊', '#ef4444'],
  ['學習', '📚', '#3b82f6'],
  ['通訊', '📱', '#65a30d'],
  ['人情', '🎁', '#f43f5e'],
  ['居住', '🏠', '#ca8a04'],
  ['其他', '✨', '#6b7280'],
]

const INCOME_CATEGORIES: Array<[string, string, string]> = [
  ['薪水', '💰', '#22c55e'],
  ['獎金', '🎉', '#eab308'],
  ['投資', '📈', '#06b6d4'],
  ['副業', '💼', '#8b5cf6'],
  ['其他', '✨', '#6b7280'],
]

export function defaultCategories(): Category[] {
  const out: Category[] = []
  EXPENSE_CATEGORIES.forEach(([name, emoji, color], i) => {
    out.push({ id: uid(), name, emoji, color, type: 'expense', order: i })
  })
  INCOME_CATEGORIES.forEach(([name, emoji, color], i) => {
    out.push({ id: uid(), name, emoji, color, type: 'income', order: i })
  })
  return out
}

export function defaultWallets(): Wallet[] {
  const defs: Array<[string, string, string, WalletKind]> = [
    ['錢包現金', '💵', '#22c55e', 'cash'],
    ['主要戶頭', '🏦', '#3b82f6', 'bank'],
  ]
  return defs.map(([name, emoji, color, kind], i) => ({
    id: uid(),
    name,
    emoji,
    color,
    kind,
    order: i,
  }))
}

export function defaultAccounts(wallets: Wallet[]): Account[] {
  const bank = wallets.find((w) => w.kind === 'bank')?.id ?? null
  const defs: Array<[string, string, string, Account['kind']]> = [
    ['生活費', '💳', '#6366f1', 'allowance'],
    ['房租', '🏠', '#a16207', 'fixed'],
    ['儲蓄', '🏦', '#22c55e', 'saving'],
    ['投資', '📈', '#06b6d4', 'invest'],
    ['緊急預備金', '🛟', '#f97316', 'saving'],
  ]
  return defs.map(([name, emoji, color, kind], i) => ({
    id: uid(),
    name,
    emoji,
    color,
    kind,
    walletId: bank,
    order: i,
  }))
}

export function emptyData(): AppData {
  const wallets = defaultWallets()
  return {
    version: DATA_VERSION,
    categories: defaultCategories(),
    wallets,
    accounts: defaultAccounts(wallets),
    plans: {},
    txns: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: new Date().toISOString(),
  }
}


/** Starting icon for a new allocation item, chosen by its type until the user picks one. */
export const KIND_EMOJI: Record<AccountKind, string> = {
  allowance: '💳',
  fixed: '🏠',
  saving: '🏦',
  invest: '📈',
  other: '💼',
}

export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#6b7280',
]
