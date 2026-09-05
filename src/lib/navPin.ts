/**
 * 把分頁列釘在視口底部 —— 用量的，不用算的。
 *
 * 為什麼需要這種東西：iPhone 16 Pro、主畫面 App，Benson 的裝置回報
 * `視窗 402×874 · 安全區 62/0/34/0 · dvh 874`，數字全都正確；但同一份 CSS
 * （`.nav-anchor` 的 `top: calc(100dvh - 4rem - 1px - env(safe-area-inset-bottom))`
 * ＝ 775）在**統計／設定**渲染出 775→874（對），在**首頁／明細**卻渲染出 713→812。
 * 兩頁差 62px，剛好是上安全區；反推 WebKit 給 fixed 元素的包含塊原點在 y = -62，
 * 高度倒是對的 874。（先前用 `bottom: 0` 時量到底邊 812，也對得上同一個包含塊。）
 * 差別看起來是頁面夠不夠長到會捲動，但那只是觀察到的相關性，沒有證明因果。
 *
 * 與其繼續猜 WebKit 的包含塊怎麼算的（已經猜錯三輪），不如**量完再修**：
 * 排版完之後比對分頁列的底邊和 `innerHeight`，差多少就位移多少。
 * 在正常瀏覽器上差值恆為 0、什麼都不會做；在會歪掉的地方直接補回來。
 *
 * ⚠️ 上限 200px 是保險絲：如果哪天量到離譜的差值（例如量在版面還沒排好的瞬間），
 * 寧可不修，也不要把分頁列甩到畫面外。
 */
const MAX_CORRECTION = 200

export function pinNavToBottom(): void {
  const nav = document.querySelector('nav')
  if (!nav) return
  // 先清掉上一次的位移再量，否則量到的是「已經修正過」的位置，會越修越偏。
  nav.style.transform = ''
  const delta = Math.round(window.innerHeight - nav.getBoundingClientRect().bottom)
  if (delta !== 0 && Math.abs(delta) <= MAX_CORRECTION) {
    nav.style.transform = `translateY(${delta}px)`
  }
}

/** 轉向、鍵盤、視口變動都要重量一次。回傳解除訂閱的函式。 */
export function watchNavPin(): () => void {
  const run = () => pinNavToBottom()
  window.addEventListener('resize', run)
  window.addEventListener('orientationchange', run)
  window.visualViewport?.addEventListener('resize', run)
  return () => {
    window.removeEventListener('resize', run)
    window.removeEventListener('orientationchange', run)
    window.visualViewport?.removeEventListener('resize', run)
  }
}
