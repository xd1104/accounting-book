import { useEffect } from 'react'
import { useStore } from './store'
import { recordNav } from './lib/persist'
import { pinAfterRouteChange, watchNavPin } from './lib/navPin'
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
import { IconBack, IconChart, IconGear, IconHome, IconList, IconPlus } from './components/icons'

const TABS = [
  { path: '/', label: '首頁', Icon: IconHome },
  { path: '/records', label: '明細', Icon: IconList },
  { path: '/stats', label: '統計', Icon: IconChart },
  { path: '/settings', label: '設定', Icon: IconGear },
] as const

const SUB_PAGES: Record<string, string> = {
  '/plan': '薪水分配',
  '/accounts': '分配項目',
  '/wallets': '存放處',
  '/categories': '分類',
  '/sync': '雲端同步',
}

export function App() {
  const { ready } = useStore()
  const path = useRoute()

  const editId = segment(path, '/edit')
  const sheetOpen = path === '/add' || !!editId
  // The sheet floats above whatever page was showing, so strip it from the base route.
  const base = sheetOpen ? (sessionStorage.getItem('lastBase') ?? '/') : path
  if (!sheetOpen) sessionStorage.setItem('lastBase', path)

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

  useEffect(watchNavPin, [])

  if (!ready) return <div className="h-full bg-bg" />

  return (
    <div className="app-shell bg-bg">
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
                {TABS.find((t) => t.path === base)?.label ?? '記帳本'}
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
        <nav className="nav-anchor inset-x-0 z-30 safe-b bg-surface/92 backdrop-blur-xl border-t border-line">
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
              <TabButton key={t.path} {...t} active={base === t.path} />
            ))}
          </div>
        </nav>
      )}

      <TxnSheet open={sheetOpen} onClose={back} editId={editId || null} />
    </div>
  )
}

function TabButton({
  path,
  label,
  Icon,
  active,
}: {
  path: string
  label: string
  Icon: (p: { className?: string }) => React.ReactElement
  active: boolean
}) {
  return (
    <button
      onClick={() => push(path)}
      className={`h-full flex flex-col items-center justify-center gap-0.5 transition ${
        active ? 'text-brand' : 'text-muted'
      }`}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
