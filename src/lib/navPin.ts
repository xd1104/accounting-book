/**
 * 把分頁列釘在視口底部 —— 用量的，不用算的。
 *
 * 為什麼需要這種東西：iPhone 16 Pro、主畫面 App，Benson 的裝置回報
 * `視窗 402×874 · 安全區 62/0/34/0 · dvh 874`，數字全都正確；同一個 CSS 算出來的
 * `top: 775px`，統計頁渲染在 775→874（對），首頁／明細卻渲染在 713→812。
 * 差 62px，剛好是上安全區 —— WebKit 給 fixed 元素的包含塊原點在 y = -62。
 * 猜了四輪都錯，所以改成排版完之後量一次、差多少補多少。
 *
 * ⚠️ **一次不夠，要補量幾次。** 第一版只在換頁後的 rAF 量一次，真機上四頁裡只有
 * 一頁被修好 —— 顯示歪掉的時間點不一定在那個 rAF 之前（頁面內容、字體、非同步
 * 資料都可能讓版面稍後才定案）。所以換頁後隔一段時間再量兩次，量到對的就是 no-op。
 *
 * ⚠️ 上限 200px 是保險絲：如果哪天量到離譜的差值（例如量在版面還沒排好的瞬間），
 * 寧可不修，也不要把分頁列甩到畫面外。
 */
const MAX_CORRECTION = 200

/** 補量的時間點（毫秒）。0 代表「排版完的下一個 frame」。 */
const RETRIES = [250, 800]

export type PinInfo = {
  /** 修正前量到的底邊 */
  raw: number
  /** 修正後量到的底邊 */
  fixed: number
  /** 實際套上的位移 */
  delta: number
}

export function pinNavToBottom(): PinInfo | null {
  const nav = document.querySelector<HTMLElement>('nav')
  if (!nav) return null
  // 先清掉上一次的位移再量，否則量到的是「已經修正過」的位置，會越修越偏。
  nav.style.transform = ''
  const raw = Math.round(nav.getBoundingClientRect().bottom)
  const delta = Math.round(window.innerHeight) - raw
  if (delta !== 0 && Math.abs(delta) <= MAX_CORRECTION) {
    nav.style.transform = `translateY(${delta}px)`
  }
  const fixed = Math.round(nav.getBoundingClientRect().bottom)
  return { raw, fixed, delta }
}

/**
 * 換頁後把分頁列釘好，並在稍後補釘兩次。
 * 回傳取消函式（換頁時要取消，不然舊頁排的計時器會在新頁上跑）。
 */
export function pinAfterRouteChange(onPinned: (info: PinInfo | null) => void): () => void {
  const frame = requestAnimationFrame(() =>
    requestAnimationFrame(() => onPinned(pinNavToBottom())),
  )
  const timers = RETRIES.map((ms) => window.setTimeout(() => onPinned(pinNavToBottom()), ms))
  return () => {
    cancelAnimationFrame(frame)
    timers.forEach(clearTimeout)
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
