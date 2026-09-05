/**
 * Storage durability helpers.
 *
 * Browser storage is evictable by default: iOS clears a site's data after a
 * stretch of not being opened, and a home-screen web app keeps its data in a
 * partition separate from Safari — deleting the home-screen icon takes that
 * data with it. Asking for persistent storage removes the automatic-eviction
 * half of that, and the backup reminder covers the rest.
 */

/** Ask the browser not to evict our data. Silently unsupported on some engines. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

/** True when this page is running as an installed/home-screen app. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes it here instead of via display-mode
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * 畫面幾何診斷。
 *
 * 為什麼要把這個做進 App：底部分頁列下方那條空白只在 Benson 的真機上出現，
 * 這裡沒有 WebKit、截圖只能反推、猜了兩輪都猜錯（先猜 theme-color、再猜
 * 主畫面圖示是舊的，兩次都被實測推翻）。與其再猜第三次，不如讓那台裝置自己講。
 *
 * 安全區的值沒有 JS API 可讀，只能拿一個看不見的元素套 env() 再讀 computed padding。
 */
export function viewportReport(): string {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right)' +
    ' env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const n = (v: string) => Math.round(parseFloat(v) || 0)
  const inset = [n(cs.paddingTop), n(cs.paddingRight), n(cs.paddingBottom), n(cs.paddingLeft)]
  el.remove()

  const mode =
    (['standalone', 'fullscreen', 'minimal-ui'] as const).find(
      (m) => window.matchMedia?.(`(display-mode: ${m})`).matches,
    ) ?? 'browser'
  const nav = (navigator as unknown as { standalone?: boolean }).standalone
  const vv = window.visualViewport

  return [
    `螢幕 ${screen.width}×${screen.height}`,
    `視窗 ${window.innerWidth}×${window.innerHeight}`,
    vv ? `可視 ${Math.round(vv.width)}×${Math.round(vv.height)}` : null,
    `安全區 ${inset.join('/')}`,
    `dvh ${probeHeight('100dvh')} · vh ${probeHeight('100vh')} · svh ${probeHeight('100svh')}`,
    `模式 ${mode}${nav === undefined ? '' : nav ? '+ios' : '-ios'}`,
    `dpr ${window.devicePixelRatio}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** 一個看不見的元素設成某個高度單位，回報它實際量到幾 px。單位不支援就回 '-'。 */
function probeHeight(value: string): string {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:${value}`
  document.body.appendChild(el)
  const h = Math.round(el.getBoundingClientRect().height)
  el.remove()
  return h > 0 ? String(h) : '-'
}

/**
 * 每個分頁的分頁列實際落在哪裡。
 *
 * 這題卡在「首頁／明細的分頁列比正確位置高 62px，統計／設定卻正確」，而診斷那行
 * 只看得到當下這頁（設定頁本來就是對的那一頁）。所以改成每切一個分頁就記一次，
 * 設定頁再一次列出來 —— 逛過四個分頁再拍一張，四頁的數字就都有了。
 */
const navSeen: Record<string, string> = {}

/**
 * 記下這一頁的分頁列狀況。格式 `h視窗高 b分頁列底邊`，例如 `h874 b874`。
 *
 * ⚠️ **`h` 一定要印出來。** 上一版只印底邊和位移，結果四頁都是 `812/812 d0`
 * ——位移 0 看起來像「位置本來就對」，其實是 `innerHeight` 在那兩頁**就是 812**，
 * 分頁列確實貼在視口底、是視口自己短了一截。少印這個數字就看不出真正的原因。
 * 兩個數字相等代表分頁列貼齊視口底；`h` 不是 874 就代表視口被縮了。
 */
export function recordNav(path: string, info: { fixed: number } | null): void {
  if (!info) return
  navSeen[path] = `h${Math.round(window.innerHeight)} b${info.fixed}`
}

export function navReport(): string {
  const label: Record<string, string> = {
    '/': '首',
    '/records': '明',
    '/stats': '統',
    '/settings': '設',
  }
  const parts = Object.keys(label)
    .filter((p) => navSeen[p])
    .map((p) => `${label[p]} ${navSeen[p]}`)
  return parts.length ? parts.join(' · ') : '（先逛過四個分頁再回來看）'
}

export function daysSince(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null
}

/**
 * Whether a working cloud copy exists.
 *  - `off`   not connected, so this browser holds the only copy
 *  - `ok`    connected and healthy
 *  - `stuck` connected but failing or waiting on a conflict, so the cloud copy
 *            has stopped keeping up and is quietly going stale
 */
export type CloudState = 'off' | 'ok' | 'stuck'

/** How overdue a backup is, given the record count and when one was last taken. */
export function backupStatus(
  txnCount: number,
  lastBackupAt: string | undefined,
  cloud: CloudState = 'off',
): { due: boolean; never: boolean; days: number | null } {
  const days = daysSince(lastBackupAt)
  // Sync uploads every change within seconds and keeps the full history in a
  // repo — strictly better than a file in Downloads. Asking for a manual export
  // on top of that is a chore with nothing behind it, so stand down.
  if (cloud === 'ok') return { due: false, never: !lastBackupAt, days }
  if (txnCount === 0) return { due: false, never: !lastBackupAt, days }
  if (!lastBackupAt) return { due: true, never: true, days: null }
  return { due: (days ?? 0) >= 7, never: false, days }
}

/** Map sync status onto the durability question the banner actually asks. */
export function cloudState(status: string, hasConfig: boolean): CloudState {
  if (!hasConfig) return 'off'
  return status === 'error' || status === 'conflict' ? 'stuck' : 'ok'
}
