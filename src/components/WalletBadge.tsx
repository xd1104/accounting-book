import type { ReactNode } from 'react'
import { BANKS } from '../lib/banks'

/**
 * 存放處的圖示。
 *
 * 銀行一律是 🏦，分配頁一排看下來分不出誰是誰（Benson 2026-10-02）。所以認得出來的銀行
 * 換成圖示：常用的幾家畫了簡約版的 logo（**參考官方 logo 的特徵自己畫的，不是官方檔案**；
 * 雲端環境連不上外部網站，LINE Bank、臺灣銀行是照 Benson 傳的搜尋截圖畫的），
 * 其他銀行用品牌色＋簡稱的字標。要加新的一家：最好先跟他要截圖，憑記憶畫的第一版兩家錯一家。
 *
 * 規則：
 * - 只在 emoji 還是「通用的銀行圖示」（🏦🏤📱）時才換。使用者自己挑過的 emoji（例如 🐶）照舊。
 * - 用名字比對（國泰、LINE Bank…），不用改存檔：既有的存放處不必重設就會換上。
 * - 現金、電子支付照舊用 emoji。
 */

/** clipPath 的 id 要每個圖示各自唯一 */
let uid = 0

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
    // LINE Bank（2026 新品牌）：白底，綠、藍兩片圓角斜塊疊成一個「B」，重疊處深藍。
    // 照 Benson 給的截圖畫的簡約版。
    match: (n) => n.replace(/\s/g, '').includes('linebank') || n.includes('連線'),
    draw: (s) =>
      svg(
        s,
        <>
          <rect width="40" height="40" fill="#fff" />
          <path d="M11 10.6 L23.2 7.2 C27.8 5.9 31.4 8.7 31.4 13 C31.4 16.6 29.2 19.1 25.8 20 L11 24.2 Z" fill="#4cc764" />
          <path d="M11 18.8 L25.4 14.8 C30 13.5 33.6 16.6 33.6 21.2 C33.6 25.1 31 28 27.2 29.1 L19.4 31.3 C15 32.5 11 29.6 11 25.2 Z" fill="#3a86dd" />
          {/* 重疊處：綠色那片用藍色那片裁出來，塗深藍 */}
          <clipPath id={`lb-${++uid}`}>
            <path d="M11 18.8 L25.4 14.8 C30 13.5 33.6 16.6 33.6 21.2 C33.6 25.1 31 28 27.2 29.1 L19.4 31.3 C15 32.5 11 29.6 11 25.2 Z" />
          </clipPath>
          <path d="M11 10.6 L23.2 7.2 C27.8 5.9 31.4 8.7 31.4 13 C31.4 16.6 29.2 19.1 25.8 20 L11 24.2 Z" fill="#2f40c4" clipPath={`url(#lb-${uid})`} />
          <rect x="0.5" y="0.5" width="39" height="39" rx="10.7" fill="none" stroke="#0000001a" />
        </>,
      ),
  },
  {
    // 臺灣銀行：白底、紫紅色。外圈一個圓；內圈在上方與左右兩側斷開，
    // 左右的斷口各有兩條往內的橫槓；中間是古錢幣（布幣）的形狀。照 Benson 給的截圖畫的簡約版。
    match: (n) => /[臺台]灣銀行|[臺台]銀/.test(n) || n.includes('bank of taiwan'),
    draw: (s) =>
      svg(
        s,
        <>
          <rect width="40" height="40" fill="#fff" />
          <g fill="none" stroke="#931f55" strokeWidth="2.3">
            <circle cx="20" cy="20" r="15.2" strokeWidth="2.6" />
            <path d="M16.61 10.17 A10.4 10.4 0 0 0 10.05 16.96 H14.4" />
            <path d="M23.39 10.17 A10.4 10.4 0 0 1 29.95 16.96 H25.6" />
            <path d="M14.4 23.04 H10.05 A10.4 10.4 0 0 0 29.95 23.04 H25.6" />
          </g>
          <path
            fill="#931f55"
            d="M16.9 11.4 H23.1 L22.5 14 H21.6 L22.2 19.6 L24.6 27.4 H21.7 L20 23.4 L18.3 27.4 H15.4 L17.8 19.6 L18.4 14 H17.5 Z"
          />
          <rect x="0.5" y="0.5" width="39" height="39" rx="10.7" fill="none" stroke="#0000001a" />
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
