import type { ReactNode } from 'react'

interface Props {
  /** 0..1+ — values above 1 mean over budget */
  progress: number
  size?: number
  stroke?: number
  color: string
  children?: ReactNode
}

export function Ring({ progress, size = 208, stroke = 7, color, children }: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(progress, 1))
  const over = progress > 1
  const base = { cx: size / 2, cy: size / 2, r, fill: 'none' } as const

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle {...base} stroke="var(--surface-2)" strokeWidth={stroke} />
        {over ? (
          <>
            {/* 環滿了就是滿了。整圈用低飽和的 --bad（面積不變、刺激度大降），
                實心紅只留 12 點鐘一小段代表「繞過起點」。
                ⚠️ 不准改回「畫出超出的比例」：6.6 倍超支時那就是幾乎整圈實心紅，
                   正是 2026-09-02 他嫌醜的東西。 */}
            <circle {...base} stroke="var(--bad)" strokeWidth={stroke} opacity={0.3} />
            <circle
              {...base}
              stroke="var(--bad)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${c * 0.075} ${c}`}
            />
          </>
        ) : (
          <circle
            {...base}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p)}
            style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.32,0.72,0,1), stroke 0.3s' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}

/** Green while comfortable, amber when close, red once over. */
export function budgetColor(progress: number): string {
  if (progress > 1) return 'var(--bad)'
  if (progress > 0.8) return 'var(--warn)'
  return 'var(--ok)'
}
