import type { Account, AppData, Category, Settings } from './types'
import { DATA_VERSION } from './types'

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

export function defaultAccounts(): Account[] {
  const defs: Array<[string, string, string, Account['kind']]> = [
    ['生活費', '💳', '#6366f1', 'allowance'],
    ['固定支出', '🏠', '#a16207', 'fixed'],
    ['儲蓄', '🏦', '#22c55e', 'saving'],
    ['投資', '📈', '#06b6d4', 'saving'],
    ['緊急預備金', '🛟', '#f97316', 'saving'],
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

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    categories: defaultCategories(),
    accounts: defaultAccounts(),
    plans: {},
    txns: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: new Date().toISOString(),
  }
}

export const CATEGORY_EMOJIS = [
  '🍜', '🍱', '☕', '🍺', '🛒', '🚌', '🚗', '⛽', '🚕', '✈️',
  '🛍️', '👕', '👟', '💄', '🎮', '🎬', '🎵', '🏀', '📚', '✏️',
  '🧻', '🧼', '💊', '🏥', '💇', '📱', '💻', '🏠', '💡', '💧',
  '🎁', '❤️', '🐶', '🐱', '✨', '💰', '🎉', '📈', '💼', '🏦',
]

export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#6b7280',
]
