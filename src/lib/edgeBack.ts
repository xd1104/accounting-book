import { isStandalone } from './persist'

/** 從螢幕左緣幾 px 內開始算「要返回」。 */
const EDGE = 24
/** 拖超過畫面寬的這個比例，放手就返回。 */
const BACK_RATIO = 0.35
const FLICK_V = 0.45

/**
 * 從左緣往右滑回上一頁，跟 iPhone 一樣。
 *
 * 只在主畫面 App（standalone）啟用：Safari 分頁本身就有這個手勢，再做一個會兩邊打架。
 * standalone 沒有瀏覽器外框，原本這個手勢完全沒反應——Benson 習慣性地滑了也不會動。
 * `enabled()` 每次手勢開始時才問（子頁面、而且沒有開著任何底部視窗才算）。
 * 頁面在拖曳時整個跟著手指走；放手後若要返回，先滑出去，等 hashchange 換好頁再歸位。
 */
export function watchEdgeBack(
  shell: HTMLElement,
  enabled: () => boolean,
  goBack: () => void,
): () => void {
  let g: { sx: number; sy: number; lock: boolean | null; lastX: number; lastT: number; v: number; dx: number } | null =
    null

  const set = (dx: number, animate: boolean) => {
    shell.style.transition = animate ? 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)' : 'none'
    shell.style.transform = dx > 0 ? `translate3d(${dx}px,0,0)` : ''
    shell.style.boxShadow = dx > 0 ? '-12px 0 28px rgba(0,0,0,0.18)' : ''
  }
  const reset = () => {
    shell.style.transition = 'none'
    shell.style.transform = ''
    shell.style.boxShadow = ''
  }

  const onStart = (e: TouchEvent) => {
    g = null
    if (e.touches.length > 1 || !isStandalone()) return
    const t = e.touches[0]
    if (t.clientX > EDGE || !enabled()) return
    g = { sx: t.clientX, sy: t.clientY, lock: null, lastX: t.clientX, lastT: e.timeStamp, v: 0, dx: 0 }
  }

  const onMove = (e: TouchEvent) => {
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.sx
    const dy = t.clientY - g.sy
    if (g.lock === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      g.lock = dx > 0 && Math.abs(dx) > Math.abs(dy)
    }
    if (!g.lock) return
    e.preventDefault()
    const dt = Math.max(1, e.timeStamp - g.lastT)
    g.v = 0.7 * ((t.clientX - g.lastX) / dt) + 0.3 * g.v
    g.lastX = t.clientX
    g.lastT = e.timeStamp
    g.dx = Math.max(0, dx)
    set(g.dx, false)
  }

  const onEnd = () => {
    const s = g
    g = null
    if (!s?.lock) return
    const w = window.innerWidth
    if (s.dx > w * BACK_RATIO || s.v > FLICK_V) {
      set(w, true)
      const done = () => requestAnimationFrame(reset)
      window.addEventListener('hashchange', done, { once: true })
      setTimeout(() => {
        goBack()
        // 萬一沒有換頁（例如已經在第一頁），也要歸位
        setTimeout(() => {
          window.removeEventListener('hashchange', done)
          reset()
        }, 500)
      }, 220)
    } else {
      set(0, true)
    }
  }

  document.addEventListener('touchstart', onStart, { passive: true })
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
  document.addEventListener('touchcancel', onEnd)
  return () => {
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onEnd)
    reset()
  }
}
