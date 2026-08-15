export type TxnType = 'expense' | 'income'

/** 帳戶用途：allowance = 日常零用錢來源；fixed = 固定支出；saving = 存起來不動的 */
export type AccountKind = 'allowance' | 'fixed' | 'saving'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  type: TxnType
  order: number
  archived?: boolean
}

export interface Account {
  id: string
  name: string
  emoji: string
  color: string
  kind: AccountKind
  order: number
  archived?: boolean
}

/** 這個月薪水撥給某個帳戶的一筆錢，done = 已經實際轉過去了 */
export interface Allocation {
  accountId: string
  amount: number
  done: boolean
  doneAt?: string
}

export interface MonthPlan {
  month: string // 'YYYY-MM'
  income: number
  allocations: Allocation[]
  /** 哪個帳戶的錢是零用錢，每日額度由它推算 */
  allowanceAccountId: string | null
  /** 設了就直接用這個數字當每日額度，不再從帳戶推算 */
  dailyAllowanceOverride: number | null
  /** 沒花完的額度是否累積到之後的日子 */
  rollover: boolean
}

export interface Txn {
  id: string
  type: TxnType
  amount: number
  categoryId: string
  /** 這筆錢從哪個帳戶出。只有從零用錢帳戶出的才會扣每日額度 */
  accountId: string | null
  note: string
  date: string // 'YYYY-MM-DD'
  createdAt: string
  updatedAt: string
}

export interface Settings {
  currencySymbol: string
  /** 每月從幾號開始算（例如 5 號發薪水就設 5），1 = 自然月 */
  monthStartDay: number
}

export interface AppData {
  version: number
  categories: Category[]
  accounts: Account[]
  /** key = 'YYYY-MM' */
  plans: Record<string, MonthPlan>
  txns: Txn[]
  settings: Settings
  updatedAt: string
}

export const DATA_VERSION = 1
