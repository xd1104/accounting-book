import { isStandalone } from './persist'

/**
 * 主畫面 App（standalone）專用：把外殼的最小高度釘成整個螢幕的高度。
 *
 * 為什麼要這樣做：iPhone 16 Pro 上 `window.innerHeight` **會隨頁面內容變**
 * ——內容短的頁面回報 812，內容長的回報 874（差的 62 是上安全區）。
 * 分頁列貼的是那個會縮水的視口，底下才空出一條。
 * 試過讓內容多 1px 可捲，視口只跟著變成 813，沒有回到 874 —— 視口是跟著內容高度走的。
 *
 * 所以直接讓內容高過整個螢幕。**`screen.height` 是這台裝置上唯一不會隨頁面變的數字**，
 * 而 standalone 的視窗就是整個螢幕，所以它就是那個「完整高度」。
 *
 * ⚠️ **只在 standalone 套。** 一般瀏覽器分頁的視窗比螢幕小很多（還有工具列、
 * 桌機更是整個螢幕），拿 `screen.height` 當最小高度會憑空多出一大段可捲的空白。
 */
export function applyShellHeight(): void {
  const root = document.documentElement
  if (!isStandalone()) {
    root.style.removeProperty('--shell-min')
    return
  }
  const h = Math.round(window.screen?.height ?? 0)
  // +1 是為了確保真的溢出：內容剛好等於視口時有些情況不算可捲。
  if (h > 0) root.style.setProperty('--shell-min', `${h + 1}px`)
}

/** 轉向會換掉 `screen.height`，要重算。回傳解除訂閱的函式。 */
export function watchShellHeight(): () => void {
  applyShellHeight()
  const run = () => applyShellHeight()
  window.addEventListener('resize', run)
  window.addEventListener('orientationchange', run)
  return () => {
    window.removeEventListener('resize', run)
    window.removeEventListener('orientationchange', run)
  }
}
