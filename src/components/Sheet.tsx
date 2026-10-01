import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { IconX } from './icons'
import { lockScroll, unlockScroll } from '../lib/scrollLock'
import { watchEscape } from '../lib/topSheet'

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Fill the screen instead of hugging its content — for the entry form */
  full?: boolean
  footer?: ReactNode
  /**
   * 能不能從內容往下拉關閉（預設：非全螢幕的都可以）。
   * 記帳視窗關掉這個：表單填到一半，手指在內容上一滑就整筆不見太危險，只認標題列。
   */
  dismissFromBody?: boolean
}

/** 往下拉超過面板高度的這個比例，放手就關。 */
const DISMISS_RATIO = 0.28
/** 往下甩得夠快也關（px/ms）。 */
const FLICK_V = 0.5

export function Sheet({ open, onClose, title, children, full, footer, dismissFromBody }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const fromBody = dismissFromBody ?? !full
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // 只有最上層回應 Escape（見 lib/topSheet.ts）
    const stopEscape = watchEscape(() => rootRef.current, onClose)
    lockScroll()
    return () => {
      stopEscape()
      unlockScroll()
    }
  }, [open, onClose])

  /**
   * 往下拉關閉，跟 iOS 的卡片視窗一樣。
   * - 從標題列（那條灰色拉桿）往下拉：隨時都可以。
   * - 從內容往下拉：只在內容已經捲到最上面時才算（不然是在捲內容）。
   *   全螢幕的（選圖示、選銀行）與記帳視窗例外，只認標題列——前者整片是可以點的格子，
   *   後者表單填到一半手指一滑就整筆不見，太危險。
   * 用原生 touch 事件、touchmove 非 passive：確定是往下拉關閉後要 preventDefault，
   * 不然 iOS 會同時做內容的彈性捲動，面板跟著抖（同 SwipeRow 的理由）。
   *
   * ⚠️ 視窗會疊（編輯項目 → 選擇圖示），而子視窗的 DOM 就渲染在外層面板的 body 裡，
   * 觸控事件會一路冒泡到外層。外層若照單全收，看到的是「自己 body 的 scrollTop=0、
   * 手指在 body 裡」，就會接手並 preventDefault：拉子視窗標題列時兩層一起關（外層沒存的
   * 修改跟著丟），在子視窗格子上往回捲時格子不動、反而是外層被拉下來。
   * 所以只處理「最近的 [data-sheet] 是自己」的觸控——疊在上面的視窗自己管自己。
   */
  useEffect(() => {
    if (!open) return
    const root = rootRef.current
    const panel = panelRef.current
    const backdrop = backdropRef.current
    const header = headerRef.current
    const body = bodyRef.current
    if (!root || !panel || !backdrop || !header || !body) return

    let g: {
      sy: number
      sx: number
      ok: boolean
      lock: boolean | null
      lastY: number
      lastT: number
      v: number
      dy: number
    } | null = null

    const set = (dy: number, animate: boolean) => {
      const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'
      panel.style.transition = animate ? `transform 0.3s ${ease}` : 'none'
      panel.style.transform = dy > 0 ? `translate3d(0,${dy}px,0)` : ''
      backdrop.style.transition = animate ? `opacity 0.3s ${ease}` : 'none'
      backdrop.style.opacity = String(Math.max(0, 1 - dy / panel.offsetHeight))
    }

    const onStart = (e: TouchEvent) => {
      g = null
      if (e.touches.length > 1) return
      const target = e.target as Node
      const el = target instanceof Element ? target : target.parentElement
      // 落在疊在上面的子視窗裡：不是我的手勢（見上面 ⚠️）
      if (el?.closest('[data-sheet]') !== root) return
      const t = e.touches[0]
      const inHeader = header.contains(target)
      const inBody = body.contains(target)
      const ok = inHeader || (fromBody && inBody && body.scrollTop <= 0)
      g = { sy: t.clientY, sx: t.clientX, ok, lock: null, lastY: t.clientY, lastT: e.timeStamp, v: 0, dy: 0 }
    }

    const onMove = (e: TouchEvent) => {
      if (!g || !g.ok) return
      const t = e.touches[0]
      const dy = t.clientY - g.sy
      const dx = t.clientX - g.sx
      if (g.lock === null) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        // 只有「往下、而且比橫向多」才是要關；往上就是一般捲動
        g.lock = dy > 0 && Math.abs(dy) > Math.abs(dx)
        if (!g.lock) return
        // 拉動時把焦點拿掉，鍵盤先收起來
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
      if (!g.lock) return
      e.preventDefault()
      const dt = Math.max(1, e.timeStamp - g.lastT)
      g.v = 0.7 * ((t.clientY - g.lastY) / dt) + 0.3 * g.v
      g.lastY = t.clientY
      g.lastT = e.timeStamp
      // 往上拉過原位：一點阻尼
      g.dy = dy > 0 ? dy : dy * 0.2
      set(g.dy, false)
    }

    const onEnd = () => {
      const s = g
      g = null
      if (!s?.lock) return
      if (s.dy > panel.offsetHeight * DISMISS_RATIO || s.v > FLICK_V) {
        panel.style.transition = 'transform 0.22s ease-in'
        panel.style.transform = 'translate3d(0,100%,0)'
        backdrop.style.transition = 'opacity 0.22s ease-in'
        backdrop.style.opacity = '0'
        setTimeout(() => onCloseRef.current(), 200)
      } else {
        set(0, true)
      }
    }

    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: false })
    panel.addEventListener('touchend', onEnd)
    panel.addEventListener('touchcancel', onEnd)
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
      panel.removeEventListener('touchend', onEnd)
      panel.removeEventListener('touchcancel', onEnd)
    }
  }, [open, fromBody])

  if (!open) return null

  return (
    <div ref={rootRef} data-sheet className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/45 animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`relative bg-surface rounded-t-3xl shadow-2xl animate-sheet-in flex flex-col ${
          full ? 'h-[92vh]' : 'max-h-[88vh]'
        }`}
      >
        <div ref={headerRef} className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="w-11" />
          <div className="flex-1 text-center">
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line" />
            {title && <div className="font-semibold">{title}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="w-11 h-11 grid place-items-center rounded-full text-muted active:bg-surface2"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* overscroll-contain：捲到底時不要把捲動傳給後面的頁面 */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {children}
        </div>

        {footer && <div className="shrink-0 px-4 pt-2 safe-pb-4 border-t border-line">{footer}</div>}
        {!footer && <div className="safe-pb-2" />}
      </div>
    </div>
  )
}
