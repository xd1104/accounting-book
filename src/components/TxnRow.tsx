import type { AppData, Txn } from '../lib/types'
import { money } from '../lib/format'
import { usePhotoURL } from './Photo'

export function TxnRow({
  txn,
  data,
  onClick,
  showDate,
}: {
  txn: Txn
  data: AppData
  onClick?: () => void
  showDate?: boolean
}) {
  const cat = data.categories.find((c) => c.id === txn.categoryId)
  const wallet = data.wallets.find((w) => w.id === txn.walletId)
  const sym = data.settings.currencySymbol
  const firstPhoto = txn.photos?.[0] ?? null
  const photoURL = usePhotoURL(firstPhoto)
  const md = txn.date.slice(5).replace('-', '/')

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-[14px] text-left min-h-[46px] transition active:bg-surface2"
    >
      {firstPhoto ? (
        // Show the photo itself, with the category emoji tucked in the corner.
        <span className="relative w-[30px] h-[30px] shrink-0">
          <span className="block w-full h-full rounded-full overflow-hidden bg-surface2">
            {photoURL && <img src={photoURL} alt="" className="w-full h-full object-cover" />}
          </span>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 grid place-items-center rounded-full text-[7px] ring-1 ring-surface"
            style={{ background: cat?.color ?? '#6b7280' }}
          >
            {cat?.emoji ?? '✨'}
          </span>
        </span>
      ) : (
        <span
          className="w-[30px] h-[30px] shrink-0 grid place-items-center rounded-full text-[15px]"
          style={{ background: `${cat?.color ?? '#6b7280'}22` }}
        >
          {cat?.emoji ?? '✨'}
        </span>
      )}
      {/* 分類名不再重複寫一次：emoji 已經代表分類，沒有備註時才 fallback 顯示分類名。 */}
      <span className="flex-1 min-w-0 truncate text-[15px] font-medium">
        {txn.note || cat?.name || '未分類'}
      </span>
      {showDate && <span className="shrink-0 text-xs text-muted tnum">{md}</span>}
      {/* wallet 為 null 是使用者在項目編輯器按過「不指定」，不補預設值（見 CLAUDE.md）。 */}
      {wallet && <span className="shrink-0 text-[12.5px] opacity-75">{wallet.emoji}</span>}
      <span
        className={`shrink-0 tnum text-[15px] font-bold ${txn.type === 'income' ? 'text-ok-ink' : ''}`}
      >
        {txn.type === 'income' ? '+' : '−'}
        {money(txn.amount, sym).replace('-', '')}
      </span>
    </button>
  )
}
