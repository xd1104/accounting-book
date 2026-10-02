import type { ReactNode } from 'react'
import { BANKS } from '../lib/banks'

/**
 * 存放處的圖示。
 *
 * 銀行一律是 🏦，分配頁一排看下來分不出誰是誰（Benson 2026-10-02）。所以認得出來的銀行
 * 換成圖示：常用的幾家畫了簡約版的 logo（**參考官方 logo 的特徵自己畫的，不是官方檔案**，
 * 這個環境連不上外部網站、拿不到原圖），其他銀行用品牌色＋簡稱的字標。
 *
 * 規則：
 * - 只在 emoji 還是「通用的銀行圖示」（🏦🏤📱）時才換。使用者自己挑過的 emoji（例如 🐶）照舊。
 * - 用名字比對（國泰、LINE Bank…），不用改存檔：既有的存放處不必重設就會換上。
 * - 現金、電子支付照舊用 emoji。
 */

const GENERIC = new Set(['🏦', '🏤', '📱', '🏛️', '🏛'])

type Logo = (size: number) => ReactNode

const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ display: 'block' }}>
    {children}
  </svg>
)

/** 簡約版 logo：只抓每家最好認的一個特徵 */
const LOGOS: Array<{ match: (n: string) => boolean; draw: Logo }> = [
  {
    // 國泰世華：綠底、白色的樹
    match: (n) => n.includes('國泰') || n.includes('cathay'),
    draw: (s) =>
      svg(
        s,
        <>
          <rect width="40" height="40" fill="#00873c" />
          <g fill="#fff">
            <circle cx="20" cy="14.5" r="6.6" />
            <circle cx="13.6" cy="19.6" r="5.2" />
            <circle cx="26.4" cy="19.6" r="5.2" />
            <rect x="18.5" y="20" width="3" height="11.5" rx="1.3" />
          </g>
        </>,
      ),
  },
  {
    // LINE Bank：綠底、白色對話框裡寫 BANK
    match: (n) => n.replace(/\s/g, '').includes('linebank') || n.includes('連線'),
    draw: (s) =>
      svg(
        s,
        <>
          <rect width="40" height="40" fill="#06c755" />
          <rect x="6.5" y="9" width="27" height="19" rx="9.5" fill="#fff" />
          <path d="M12.5 26 L10.8 32.4 L19.5 27.2 Z" fill="#fff" />
          <text
            x="20"
            y="21"
            textAnchor="middle"
            fontSize="7.4"
            fontWeight="800"
            fill="#06c755"
            style={{ fontFamily: 'inherit', letterSpacing: '0.2px' }}
          >
            BANK
          </text>
        </>,
      ),
  },
  {
    // 臺灣銀行：深綠底、白色圓環裡一個「台」（像一枚銀幣）
    match: (n) => /[臺台]灣銀行|[臺台]銀/.test(n) || n.includes('bank of taiwan'),
    draw: (s) =>
      svg(
        s,
        <>
          <rect width="40" height="40" fill="#0b6b3a" />
          <circle cx="20" cy="20" r="12.2" fill="none" stroke="#fff" strokeWidth="2.4" />
          <text
            x="20"
            y="25"
            textAnchor="middle"
            fontSize="14"
            fontWeight="800"
            fill="#fff"
            style={{ fontFamily: 'inherit' }}
          >
            台
          </text>
        </>,
      ),
  },
]

/** 其他認得出來的銀行：品牌色底＋簡稱 */
function monogram(name: string): { text: string; color: string } | null {
  const n = name.toLowerCase().replace(/\s/g, '')
  const hit = BANKS.find(
    (b) =>
      n.includes(b.name.toLowerCase().replace(/\s/g, '')) ||
      (b.alias ?? '')
        .toLowerCase()
        .split(/\s+/)
        .some((a) => a.length >= 2 && n.includes(a)),
  )
  return hit?.short ? { text: hit.short, color: hit.color } : null
}

export function bankMark(name: string, emoji: string): Logo | null {
  if (!GENERIC.has(emoji)) return null
  const n = name.toLowerCase()
  const logo = LOGOS.find((l) => l.match(n))
  if (logo) return logo.draw
  const m = monogram(name)
  if (!m) return null
  const latin = /^[a-z]/i.test(m.text)
  const fs = latin ? (m.text.length > 3 ? 9.5 : 11.5) : m.text.length > 1 ? 13 : 18
  return (s) =>
    svg(
      s,
      <>
        <rect width="40" height="40" fill={m.color} />
        <text
          x="20"
          y={20 + fs * 0.36}
          textAnchor="middle"
          fontSize={fs}
          fontWeight="800"
          fill="#fff"
          style={{ fontFamily: 'inherit' }}
        >
          {m.text}
        </text>
      </>,
    )
}

/**
 * 存放處圖示：認得出來的銀行畫成圓角方塊的 logo（像 App 圖示），
 * 其他維持原本「淡色圓底＋emoji」的樣子。
 */
export function WalletBadge({
  name,
  emoji,
  color,
  size = 36,
  className = '',
}: {
  name: string
  emoji: string
  color: string
  size?: number
  className?: string
}) {
  const mark = bankMark(name, emoji)
  if (mark) {
    return (
      <span
        className={`inline-block shrink-0 overflow-hidden align-middle ${className}`}
        style={{ width: size, height: size, borderRadius: size * 0.28 }}
      >
        {mark(size)}
      </span>
    )
  }
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full align-middle ${className}`}
      style={{ width: size, height: size, background: `${color}22`, fontSize: Math.round(size * 0.48) }}
    >
      {emoji}
    </span>
  )
}
