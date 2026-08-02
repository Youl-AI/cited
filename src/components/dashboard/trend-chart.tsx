'use client'

import { useState } from 'react'
import { buildTrend, engineIdsIn, type RunPoint, type TrendPoint } from '@/lib/dashboard/data'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 추이 차트 — 점 + 오차 밴드 (디자인 언어 §4.1). 점만 찍고 구간을 감추지
 * 않는다. 의존성 없음 — 수제 SVG (IntervalBar 전례).
 *
 * ★ 끊는 규칙이 이 차트의 가장 중요한 규칙이다 (§4.1). 직전 점과 조건이
 *   다르거나(`comparableWithPrev === false`) 사이에 회차가 빠졌으면
 *   (`runsSkippedBefore > 0`) 선분과 밴드를 잇지 않고, 캡션에 이유를 쓴다 —
 *   말없이 끊긴 선은 버그로 읽힌다.
 */

const ENGINE_COLOR: Record<string, string> = {
  chatgpt: 'var(--color-engine-chatgpt)',
  gemini: 'var(--color-engine-gemini)',
  naver: 'var(--color-engine-naver)',
  google_aio: 'var(--color-engine-google)',
}

const W = 640
const H = 220
const PAD = { top: 12, right: 12, bottom: 26, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

function mmdd(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
}

/** gemini/google은 휘도가 붙는다 — 색과 함께 마커 모양으로 가른다 (§2). */
function Marker({ engine, cx, cy, color }: { engine: string; cx: number; cy: number; color: string }) {
  const common = { fill: color, 'data-testid': 'trend-point' } as const
  switch (engine) {
    case 'gemini':
      return <rect {...common} x={cx - 3.5} y={cy - 3.5} width={7} height={7} />
    case 'naver':
      return <rect {...common} x={cx - 4} y={cy - 4} width={8} height={8} transform={`rotate(45 ${cx} ${cy})`} />
    case 'google_aio':
      return <polygon {...common} points={`${cx},${cy - 4.5} ${cx + 4.5},${cy + 4} ${cx - 4.5},${cy + 4}`} />
    default:
      return <circle {...common} cx={cx} cy={cy} r={4} />
  }
}

/**
 * 연속 구간으로 자른다. 점 i가 직전 점과 비교 불가이거나 사이에 빠진 회차가
 * 있으면 새 세그먼트가 시작된다 — 선분·밴드 모두 세그먼트 안에서만 잇는다.
 */
function splitSegments(series: readonly TrendPoint[]): { startIndex: number; pts: TrendPoint[] }[] {
  const segments: { startIndex: number; pts: TrendPoint[] }[] = []
  series.forEach((p, i) => {
    const broken = i > 0 && (!p.comparableWithPrev || p.runsSkippedBefore > 0)
    if (i === 0 || broken) segments.push({ startIndex: i, pts: [p] })
    else segments[segments.length - 1]!.pts.push(p)
  })
  return segments
}

export function TrendChart({ points }: { points: RunPoint[] }) {
  const engines = engineIdsIn(points)
  const [engine, setEngine] = useState<'all' | string>('all')
  const series: TrendPoint[] = buildTrend(points, engine)
  const color = engine === 'all' ? 'var(--primary)' : (ENGINE_COLOR[engine] ?? 'var(--primary)')
  const label = engine === 'all' ? '전체' : engineLabel(engine)

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        아직 측정 회차가 없습니다. 첫 측정이 끝나면 점이 하나 찍힙니다 — 점 하나로는 변화를
        말할 수 없고, 회차가 쌓일수록 구간이 좁아집니다.
      </p>
    )
  }

  const n = series.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const latest = series[n - 1]

  const segments = splitSegments(series)
  const conditionBreak = series.some((p, i) => i > 0 && !p.comparableWithPrev)
  const gapBreak = series.some((p, i) => i > 0 && p.runsSkippedBefore > 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="엔진 선택">
        {['all', ...engines].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setEngine(id)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-[120ms] ${
              engine === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {id !== 'all' && (
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: ENGINE_COLOR[id] ?? 'var(--primary)' }}
              />
            )}
            {id === 'all' ? '전체' : engineLabel(id)}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full transition-opacity duration-[240ms]"
        role="img"
        aria-label={
          latest
            ? `${label} 언급률 추이 — 최신 ${formatPercent(latest.interval.point)} (${formatInterval(latest.interval)})`
            : `${label} 언급률 추이 — 표시할 회차 없음`
        }
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={11}>
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* 오차 밴드·연결선 — 세그먼트 안에서만 잇고, 점보다 먼저(아래에) 그린다.
            혼자 남은 점은 세로 띠로 그린다 — "구간이 넓다"가 정직한 첫인상이다. */}
        {segments.map((seg) => {
          const first = seg.pts[0]!
          if (seg.pts.length === 1) {
            return (
              <rect
                key={first.runId}
                data-testid="trend-band"
                x={x(seg.startIndex) - 5}
                y={y(first.interval.upper)}
                width={10}
                height={Math.max(y(first.interval.lower) - y(first.interval.upper), 1)}
                fill={color}
                opacity={0.25}
              />
            )
          }
          const upper = seg.pts.map((p, j) => `${x(seg.startIndex + j)},${y(p.interval.upper)}`).join(' L ')
          const lower = [...seg.pts]
            .map((_, j) => {
              const idx = seg.pts.length - 1 - j
              return `${x(seg.startIndex + idx)},${y(seg.pts[idx]!.interval.lower)}`
            })
            .join(' L ')
          return (
            <g key={first.runId}>
              <path d={`M ${upper} L ${lower} Z`} fill={color} opacity={0.14} data-testid="trend-band" />
              <path
                data-testid="trend-line"
                d={`M ${seg.pts.map((p, j) => `${x(seg.startIndex + j)},${y(p.interval.point)}`).join(' L ')}`}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
            </g>
          )
        })}

        {series.map((p, i) => (
          <g key={p.runId}>
            <Marker engine={engine} cx={x(i)} cy={y(p.interval.point)} color={color} />
            <title>{`${mmdd(p.measuredAt)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
          </g>
        ))}

        {series.map((p, i) => (
          <text key={p.runId} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
            {mmdd(p.measuredAt)}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        점은 회차별 언급률, 띠는 95% 신뢰구간입니다. 구간이 겹치는 변화는 변화로 읽지 마세요.
        {conditionBreak &&
          ' 선이 끊긴 구간은 측정 조건(엔진·질의·판정 기준)이 바뀐 곳입니다 — 조건이 다른 회차는 비교하지 않습니다.'}
        {gapBreak &&
          ' 측정이 빠진 회차가 있는 구간도 잇지 않습니다 — 이어 그리면 계속 측정한 것처럼 보입니다.'}
      </p>
    </div>
  )
}
