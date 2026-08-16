export type TxnType = 'expense' | 'income'

/** 分配項目的類型。allowance 會被拿來推算每日零用錢，其餘為分類用途。 */
export type AccountKind = 'allowance' | 'fixed' | 'saving' | 'invest' | 'other'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  type: TxnType
  order: number
  archived?: boolean
}

/** 錢實際放在哪：錢包現金，或某個銀行戶頭 */
export type WalletKind = 'cash' | 'bank'

export interface Wallet {
  id: string
  name: string
  emoji: string
  color: string
  kind: WalletKind
  order: number
  archived?: boolean
}

/** 分配項目 = 錢的用途（房貸、生活費、旅遊基金） */
export interface Account {
  id: string
  name: string
  emoji: string
  color: string
  kind: AccountKind
  /** 這個項目的錢平常放在哪個存放處 */
  walletId: string | null
  order: number
  archived?: boolean
}

/** 一筆分配拆到多個存放處，例如零用錢一半現金一半在戶頭 */
export interface AllocationSplit {
  walletId: string
  amount: number
}

/** 這個月薪水撥給某個項目的一筆錢，done = 已經實際轉過去了 */
export interface Allocation {
  accountId: string
  amount: number
  done: boolean
  doneAt?: string
  /** 有值時取代 amount 的單一存放處，用來拆成現金／戶頭 */
  splits?: AllocationSplit[]
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
  /** 這筆錢算在哪個分配項目上。只有零用錢項目才會扣每日額度 */
  accountId: string | null
  /** 實際從哪裡付的：錢包現金或某個戶頭 */
  walletId: string | null
  /** 說明：吃了什麼、買了什麼，可多行 */
  note: string
  /** 照片 id，實際影像存在 IndexedDB（localStorage 塞不下） */
  photos?: string[]
  date: string // 'YYYY-MM-DD'
  createdAt: string
  updatedAt: string
}

export interface Settings {
  currencySymbol: string
  /** 每月從幾號開始算（例如 5 號發薪水就設 5），1 = 自然月 */
  monthStartDay: number
  /** 最後一次匯出備份的時間，用來提醒該備份了 */
  lastBackupAt?: string
}

export interface AppData {
  version: number
  categories: Category[]
  wallets: Wallet[]
  accounts: Account[]
  /** key = 'YYYY-MM' */
  plans: Record<string, MonthPlan>
  txns: Txn[]
  settings: Settings
  updatedAt: string
}

export const DATA_VERSION = 2
