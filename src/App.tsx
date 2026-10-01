import { useEffect, useMemo, useRef } from 'react'
import { useStore } from './store'
import { recordNav } from './lib/persist'
import { pinAfterRouteChange, watchNavPin } from './lib/navPin'
import { watchShellHeight } from './lib/shellHeight'
import { back, push, segment, useRoute } from './router'
import { Home } from './pages/Home'
import { Records } from './pages/Records'
import { Stats } from './pages/Stats'
import { Settings } from './pages/Settings'
import { Plan } from './pages/Plan'
import { Accounts } from './pages/Accounts'
import { Categories } from './pages/Categories'
import { Wallets } from './pages/Wallets'
import { Sync } from './pages/Sync'
import { TxnSheet } from './components/TxnSheet'
import { UpdateBanner } from './components/UpdateBanner'
import { UndoToast } from './components/UndoToast'
import { watchEdgeBack } from './lib/edgeBack'
import { IconBack, IconChart, IconHome, IconList, IconPlus, IconWallet } from './components/icons'
import { allocationByWallet } from './lib/budget'
import { currentPeriod } from './lib/date'

/**
 * 分頁列：首頁｜明細｜＋｜分配｜統計（2026-10-01 Benson 選的）。
 * 「分配」從子頁面升成分頁；設定讓出位置、改成首頁右上角的齒輪（變成子頁面）。
 * ＋ 要維持在正中間，所以左右各兩個——要再加分頁前先想清楚誰讓位。
 */
const TABS = [
  { path: '/', label: '首頁', title: '首頁', Icon: IconHome },
  { path: '/records', label: '明細', title: '明細', Icon: IconList },
  { path: '/plan', label: '分配', title: '薪水分配', Icon: IconWallet },
  { path: '/stats', label: '統計', title: '統計', Icon: IconChart },
] as const

const SUB_PAGES: Record<string, string> = {
  '/settings': '設定',
  '/accounts': '分配項目',
  '/wallets': '存放處',
  '/categories': '分類',
  '/sync': '雲端同步',
}

export function App() {
  const { ready, data } = useStore()
  const path = useRoute()

  const editId = segment(path, '/edit')
  const sheetOpen = path === '/add' || !!editId
  // The sheet floats above whatever page was showing, so strip it from the base route.
  const base = sheetOpen ? (sessionStorage.getItem('lastBase') ?? '/') : path
  if (!sheetOpen) sessionStorage.setItem('lastBase', path)

  /**
   * 「分配」分頁上的紅點：這個月還有錢沒轉。判斷跟分配頁 hero 的「這個月還要轉」完全一致
   * （allocationByWallet、不含現金、同一個 currentPeriod），首頁那張薪水分配卡拿掉之後，
   * 這是唯一的提醒——兩邊說法不一樣就會一邊有紅點、一邊寫「都轉完了」。
   */
  const planMonth = currentPeriod(data.settings.monthStartDay)
  const planPending = useMemo(
    () => allocationByWallet(data, planMonth).some((r) => r.kind !== 'cash' && r.total - r.done > 0),
    [data, planMonth],
  )

  const subTitle = SUB_PAGES[base]
  const isTab = TABS.some((t) => t.path === base)
  // 首頁與明細頁改成自己畫一行有內容的標題（日期 / 明細＋搜尋），這裡就不用再疊一層
  // 「首頁」「明細」的分頁名了——那正是兩行沒資訊的問題。統計、設定還沒有自己的標題列，
  // 維持原本的 App header 顯示分頁名，別跟著拿掉。
  const ownsHeader = base === '/' || base === '/records'

  // 見 index.css 的 `body.nav-canvas`：螢幕最底下那條由瀏覽器鋪的區域跟著 body
  // 的背景色走，有分頁列時要讓它跟分頁列同色，否則會看起來像版面漏了一條。
  useEffect(() => {
    document.body.classList.toggle('nav-canvas', isTab)
  }, [isTab])

  // 每次換頁都把分頁列釘回視口底部（稍後再補釘兩次，見 navPin.ts），
  // 每次釘完都記下結果，設定頁會列出來。
  useEffect(() => pinAfterRouteChange((info) => recordNav(base, info)), [base])

  useEffect(watchShellHeight, [])
  useEffect(watchNavPin, [])

  // 從左緣往右滑返回（只在子頁面、沒有開著底部視窗時）。手勢開始時才讀最新的頁面狀態。
  const shellRef = useRef<HTMLDivElement>(null)
  const canEdgeBack = useRef(false)
  canEdgeBack.current = !!subTitle && !sheetOpen
  useEffect(() => {
    if (!ready || !shellRef.current) return
    return watchEdgeBack(
      shellRef.current,
      () => canEdgeBack.current && !document.querySelector('[data-sheet]'),
      back,
    )
  }, [ready])

  if (!ready) return <div className="h-full bg-bg" />

  return (
    <div ref={shellRef} className="app-shell bg-bg">
      {ownsHeader ? (
        // ⚠️ safe-t 不准刪 —— 它負責瀏海的頂部安全區
        <div className="sticky top-0 z-30 safe-t bg-bg/85 backdrop-blur-xl" />
      ) : (
        <header className="sticky top-0 z-30 safe-t bg-bg/85 backdrop-blur-xl">
          <div className="h-12 flex items-center px-2">
            {subTitle ? (
              <>
                <button
                  onClick={back}
                  aria-label="返回"
                  className="w-11 h-11 grid place-items-center rounded-full text-ink active:bg-surface2"
                >
                  <IconBack className="w-5 h-5" />
                </button>
                <span className="font-semibold">{subTitle}</span>
              </>
            ) : (
              <span className="px-2 font-semibold">
                {TABS.find((t) => t.path === base)?.title ?? '記帳本'}
              </span>
            )}
          </div>
        </header>
      )}

      <UpdateBanner />

      <main className={isTab ? 'pb-24' : 'pb-8'}>
        {base === '/' && <Home onEditTxn={(id) => push(`/edit/${id}`)} />}
        {base === '/records' && <Records onEditTxn={(id) => push(`/edit/${id}`)} />}
        {base === '/stats' && <Stats />}
        {base === '/settings' && <Settings />}
        {base === '/plan' && <Plan />}
        {base === '/accounts' && <Accounts />}
        {base === '/wallets' && <Wallets />}
        {base === '/categories' && <Categories />}
        {base === '/sync' && <Sync />}
      </main>

      {isTab && (
        <nav data-no-swallow className="nav-anchor inset-x-0 z-30 safe-b bg-surface/92 backdrop-blur-xl border-t border-line">
          <div className="h-16 grid grid-cols-5 items-center max-w-lg mx-auto">
            {TABS.slice(0, 2).map((t) => (
              <TabButton key={t.path} {...t} active={base === t.path} />
            ))}

            <div className="grid place-items-center">
              <button
                onClick={() => push('/add')}
                aria-label="記一筆"
                className="w-14 h-14 -mt-6 rounded-full bg-brand text-on-brand grid place-items-center shadow-lg shadow-brand/35 active:scale-95 transition"
              >
                <IconPlus className="w-7 h-7" />
              </button>
            </div>

            {TABS.slice(2).map((t) => (
              <TabButton key={t.path} {...t} active={base === t.path} dot={t.path === '/plan' && planPending} />
            ))}
          </div>
        </nav>
      )}

      <TxnSheet open={sheetOpen} onClose={back} editId={editId || null} />
      <UndoToast aboveNav={isTab && !sheetOpen} />
    </div>
  )
}

function TabButton({
  path,
  label,
  Icon,
  active,
  dot,
}: {
  path: string
  label: string
  title?: string
  Icon: (p: { className?: string }) => React.ReactElement
  active: boolean
  /** 紅點提醒（目前只有「分配」：這個月還有錢沒轉） */
  dot?: boolean
}) {
  return (
    <button
      // 再點一次目前的分頁＝捲回最上面（iOS 的分頁列都是這樣）
      onClick={() => (active ? window.scrollTo({ top: 0, behavior: 'smooth' }) : push(path))}
      aria-label={dot ? `${label}（這個月還有錢沒轉）` : undefined}
      className={`h-full flex flex-col items-center justify-center gap-0.5 transition ${
        active ? 'text-brand' : 'text-muted'
      }`}
    >
      <span className="relative">
        <Icon className="w-6 h-6" />
        {dot && (
          <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-bad ring-2 ring-surface" />
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
