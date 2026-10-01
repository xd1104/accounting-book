import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** 往左滑停住時露出的「刪除」寬度。 */
const ACTION_W = 84
/** 滑超過整列寬的這個比例就放手直接刪（iOS 的「滑到底」）。 */
const FULL_RATIO = 0.55
/** 甩得夠快就算數，不用拖過一半（px/ms）。 */
const FLICK_V = 0.35
const SPRING = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)'

/** 整個 App 同時只開一列——開新的就把舊的收回去，跟 iOS 一樣。 */
let openRow: { close: () => void } | null = null

/**
 * 往左滑露出右側「刪除」的列，照 iPhone 內建 App 的手感：
 * - 跟手（拖曳中直接改 transform、不經過 React 重繪）；
 * - 甩一下就開／關，不用拖過一半；
 * - 一路滑到底（過整列 55%）放手就直接刪；
 * - 點這列以外的地方、或頁面開始捲動，就收回去。
 *
 * ⚠️ **用原生 touch 事件、而且 touchmove 不能是 passive。**
 * 第一版（2026-10-01）用 pointer 事件 + `touch-action: pan-y`，iPhone 上一判定是水平滑，
 * 瀏覽器照樣同時捲頁面，接著發 pointercancel 把這列彈回去——Benson 的錄影就是
 * 「列卡在一半、整頁跟著上下晃」。現在確定是水平滑之後就 `preventDefault()`
 * 把那一次手勢的捲動吃掉；判定成垂直就完全不碰，捲動照舊。
 * React 的 onTouchMove 是 passive 的（preventDefault 無效），所以要自己 addEventListener。
 *
 * 拖過之後那一下 click 一定要吞掉，不然放手的瞬間會順便點到列上的按鈕（打勾、開編輯）。
 */
export function SwipeRow({
  onDelete,
  children,
  className = '',
  foregroundClassName = 'bg-surface',
  label = '刪除',
  disabled,
}: {
  onDelete: () => void
  children: ReactNode
  /** 外框：圓角要跟列本身一致，紅色才不會從角落露出來 */
  className?: string
  /** 前景要有不透明底色，才蓋得住後面的紅色 */
  foregroundClassName?: string
  label?: string
  disabled?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<HTMLDivElement>(null)
  const actRef = useRef<HTMLButtonElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  useEffect(() => {
    const root = rootRef.current
    const fg = fgRef.current
    const act = actRef.current
    const text = textRef.current
    if (!root || !fg || !act || !text || disabled) return

    let x = 0 // 目前位移（≤ 0）
    let open = false
    let armed = false // 已經滑到「放手就刪」的距離
    let deleting = false
    let g: {
      sx: number
      sy: number
      base: number
      lock: 'x' | 'y' | null
      lastX: number
      lastT: number
      v: number
    } | null = null
    /** 這次按下之後真的拖過——接下來那個 click 不算數 */
    let swallowClick = false

    const paint = (nx: number, animate: boolean) => {
      x = nx
      const reveal = Math.max(ACTION_W, -nx)
      fg.style.transition = animate ? SPRING : 'none'
      fg.style.transform = nx ? `translate3d(${nx}px,0,0)` : ''
      // 紅底永遠剛好填滿露出來的那一塊。
      act.style.transition = animate ? 'width 0.32s cubic-bezier(0.25, 1, 0.5, 1)' : 'none'
      act.style.width = `${reveal}px`
      act.style.visibility = nx < 0 ? 'visible' : 'hidden'
      // 文字平常置中在按鈕裡；滑到「放手就刪」時跳到左緣、貼著前景走，跟 iOS 一樣。
      text.style.transition = 'transform 0.2s ease'
      text.style.transform = armed ? `translateX(${-(reveal - ACTION_W) / 2}px)` : ''
      act.setAttribute('aria-hidden', String(!open))
      act.tabIndex = open ? 0 : -1
    }

    const setOpen = (v: boolean) => {
      open = v
      armed = false
      paint(v ? -ACTION_W : 0, true)
      if (v) {
        if (openRow && openRow !== handle) openRow.close()
        openRow = handle
      } else if (openRow === handle) openRow = null
    }
    const handle = { close: () => setOpen(false) }

    /** 滑出去 → 高度收起來 → 才真的刪，畫面不會「啪」一下少一列。 */
    const commitDelete = () => {
      if (deleting) return
      deleting = true
      if (openRow === handle) openRow = null
      const w = root.offsetWidth
      armed = true
      paint(-w, true)
      root.style.height = `${root.offsetHeight}px`
      requestAnimationFrame(() => {
        root.style.transition = 'height 0.22s ease 0.12s, opacity 0.22s ease 0.12s'
        root.style.height = '0px'
        root.style.opacity = '0'
      })
      setTimeout(() => onDeleteRef.current(), 340)
    }

    const onStart = (e: TouchEvent) => {
      if (deleting || e.touches.length > 1) return
      const t = e.touches[0]
      g = { sx: t.clientX, sy: t.clientY, base: x, lock: null, lastX: t.clientX, lastT: e.timeStamp, v: 0 }
      swallowClick = false
    }

    const onMove = (e: TouchEvent) => {
      if (!g) return
      const t = e.touches[0]
      const dx = t.clientX - g.sx
      const dy = t.clientY - g.sy
      if (!g.lock) {
        // 門檻要小：iOS 在手指剛動的前幾 px 就決定這次手勢要不要捲頁面，
        // 等它開始捲了才 preventDefault 就沒用了。
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
        g.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        if (g.lock === 'y') return // 要捲頁面：完全放手
        swallowClick = true
        if (openRow && openRow !== handle) openRow.close()
      }
      if (g.lock !== 'x') return
      e.preventDefault()

      const dt = Math.max(1, e.timeStamp - g.lastT)
      g.v = 0.7 * ((t.clientX - g.lastX) / dt) + 0.3 * g.v
      g.lastX = t.clientX
      g.lastT = e.timeStamp

      let nx = g.base + dx
      // 往右超過原位：一點點阻尼，拉得動但會彈回來
      if (nx > 0) nx = nx * 0.2
      const w = root.offsetWidth
      const wasArmed = armed
      armed = -nx > w * FULL_RATIO
      if (armed !== wasArmed) paint(nx, true) // 進出「放手就刪」時紅底跳一下，提示得到
      else paint(nx, false)
    }

    const onEnd = () => {
      const s = g
      g = null
      if (!s || s.lock !== 'x') return
      if (armed) return commitDelete()
      // 甩的方向優先，其次看停在哪
      if (s.v < -FLICK_V) setOpen(true)
      else if (s.v > FLICK_V) setOpen(false)
      else setOpen(-x > ACTION_W / 2)
    }

    const onCancel = () => {
      if (!g) return
      g = null
      armed = false
      setOpen(open)
    }

    // 滑開時：點這列以外 → 收回；頁面捲動 → 收回
    const onOutside = (e: Event) => {
      if (!open || root.contains(e.target as Node)) return
      setOpen(false)
      // iOS：滑開時點別處只會收回，那一下不會同時按到別的東西（例如隔壁那列的打勾）。
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, true), 450)
    }
    const onScroll = () => {
      if (open && !g) setOpen(false)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (swallowClick || (open && !act.contains(e.target as Node))) {
        e.stopPropagation()
        e.preventDefault()
        const wasOpen = open
        swallowClick = false
        if (wasOpen && x === -ACTION_W) setOpen(false)
      }
    }

    const onAct = (e: MouseEvent) => {
      e.stopPropagation()
      commitDelete()
    }

    fg.addEventListener('touchstart', onStart, { passive: true })
    fg.addEventListener('touchmove', onMove, { passive: false })
    fg.addEventListener('touchend', onEnd)
    fg.addEventListener('touchcancel', onCancel)
    fg.addEventListener('click', onClickCapture, true)
    act.addEventListener('click', onAct)
    document.addEventListener('touchstart', onOutside, { capture: true, passive: true })
    document.addEventListener('mousedown', onOutside, true)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    paint(0, false)
    return () => {
      fg.removeEventListener('touchstart', onStart)
      fg.removeEventListener('touchmove', onMove)
      fg.removeEventListener('touchend', onEnd)
      fg.removeEventListener('touchcancel', onCancel)
      fg.removeEventListener('click', onClickCapture, true)
      act.removeEventListener('click', onAct)
      document.removeEventListener('touchstart', onOutside, true)
      document.removeEventListener('mousedown', onOutside, true)
      window.removeEventListener('scroll', onScroll, true)
      if (openRow === handle) openRow = null
    }
  }, [disabled])

  return (
    <div ref={rootRef} className={`relative overflow-hidden ${className}`}>
      {/* 收著時 visibility:hidden，圓角邊緣不會透出一絲紅色 */}
      <button
        ref={actRef}
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-bad text-on-bad text-sm font-semibold"
        style={{ width: ACTION_W, visibility: 'hidden' }}
      >
        <span ref={textRef} className="block">
          {label}
        </span>
      </button>
      {/* pan-y：橫向交給這裡、直向交給瀏覽器；再加上確定橫滑後的 preventDefault 雙重保險 */}
      <div
        ref={fgRef}
        className={`relative ${foregroundClassName}`}
        style={{ willChange: 'transform', touchAction: 'pan-y' }}
      >
        {children}
      </div>
    </div>
  )
}
