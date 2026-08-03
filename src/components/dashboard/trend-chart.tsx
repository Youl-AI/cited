'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
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
 *
 * ★ **Task 7에서 더한 것은 전부 스타일 레이어다.** `splitSegments`·밴드 기하·
 *   n=0 처리·캡션 문구·좌표 함수는 한 글자도 건드리지 않았다. 새로 생긴 것은
 *   (1) 호버 툴팁 + 크로스헤어, (2) 연결선 드로우인, (3) 세그먼트 트레이 토글.
 *   툴팁이 읽는 값은 `<title>`이 쓰던 문자열과 **같은 세 항목 그대로**다
 *   (날짜 · 점추정 (구간) · k/n) — 시각 툴팁은 그 문자열의 승격이지 새 정보가
 *   아니고, `<title>`은 보조기기용으로 그대로 남는다.
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
  // 커서가 짚은 회차. 엔진을 갈아타면 계열 길이가 달라지므로 같이 비운다.
  const [hover, setHover] = useState<number | null>(null)
  const series: TrendPoint[] = buildTrend(points, engine)
  const color = engine === 'all' ? 'var(--primary)' : (ENGINE_COLOR[engine] ?? 'var(--primary)')
  const label = engine === 'all' ? '전체' : engineLabel(engine)

  if (points.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-center text-sm leading-relaxed text-muted-foreground">
          아직 측정 회차가 없습니다. 첫 측정이 끝나면 점이 하나 찍힙니다 — 점 하나로는 변화를
          말할 수 없고, 회차가 쌓일수록 구간이 좁아집니다.
        </CardContent>
      </Card>
    )
  }

  const n = series.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const latest = series[n - 1]

  const segments = splitSegments(series)
  const conditionBreak = series.some((p, i) => i > 0 && !p.comparableWithPrev)
  const gapBreak = series.some((p, i) => i > 0 && p.runsSkippedBefore > 0)

  // 렌더 직전 방어 — 엔진을 갈아탄 프레임에 옛 인덱스가 남아 있을 수 있다.
  const hoverIndex = hover !== null && hover < n ? hover : null
  const hovered = hoverIndex !== null ? series[hoverIndex]! : null

  // 툴팁 기준점 — 짚은 점을 가리지 않으면서 차트 밖으로도 넘치지 않게 옮긴다.
  // 양 끝 회차는 가로 기준을, 높은 값(위쪽에 찍힌 점)은 세로 기준을 뒤집는다.
  // 언급률이 높을수록 점이 위로 가므로 "잘 나오는 브랜드일수록 툴팁이 잘린다"가
  // 기본값이 되는 것을 막는다.
  const tipFx = hoverIndex === null ? 0 : x(hoverIndex) / W
  const tipFy = hovered === null ? 0 : y(hovered.interval.point) / H
  const tipShiftX = tipFx < 0.18 ? '0' : tipFx > 0.82 ? '-100%' : '-50%'
  const tipShiftY = tipFy < 0.32 ? 'calc(0% + 0.625rem)' : 'calc(-100% - 0.625rem)'

  return (
    <div>
      {/* 세그먼트 트레이 — 앱 머리글의 현재 위치 표시와 같은 어휘다(트레이 +
          활성 조각만 카드색으로 1단). 예전에는 활성 토글이 --primary로 꽉 찬
          알약이었는데, 그 색은 이 화면에서 **차트의 계열색**이기도 하다 —
          같은 색이 "선택됨"과 "전체 계열"을 동시에 뜻하고 있었다 (§2: 색의 뜻은
          하나). 반경은 카드와 같은 동심 뺄셈(껍질 --radius-xl, 베젤 4px). */}
      <div
        className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-foreground/[0.06]"
        role="group"
        aria-label="엔진 선택"
      >
        {['all', ...engines].map((id) => {
          const active = engine === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setEngine(id)
                setHover(null)
              }}
              className={`motion-press rounded-[calc(var(--radius-xl)-0.25rem)] px-2.5 py-1 text-xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                active
                  ? 'bg-card font-medium text-foreground shadow-elevation-1'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
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
          )
        })}
      </div>

      {/* 툴팁은 SVG 밖 HTML로 띄운다(foreignObject가 아니라) — 카드 어휘·그림자·
          한글 조판을 그대로 쓸 수 있고, viewBox 스케일에 글자 크기가 끌려가지
          않는다. 그래서 이 래퍼는 svg 하나만 담아 **정확히 차트 상자**여야 한다. */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full transition-opacity duration-[var(--motion-state)] ease-instrument"
          role="img"
          aria-label={
            latest
              ? `${label} 언급률 추이 — 최신 ${formatPercent(latest.interval.point)} (${formatInterval(latest.interval)})`
              : `${label} 언급률 추이 — 표시할 회차 없음`
          }
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={11}>
                {Math.round(tick * 100)}%
              </text>
            </g>
          ))}

          {/* 크로스헤어 — 점보다 **아래**에 그린다. 커서가 짚은 회차의 세로
              기준선일 뿐이라 계측값(점·밴드)을 덮으면 안 된다. */}
          {hoverIndex !== null && (
            <line
              data-testid="trend-crosshair"
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={PAD.top}
              y2={PAD.top + IH}
              stroke="var(--foreground)"
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

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
                {/* 드로우인은 **연결선에만** 건다. 밴드는 첫 프레임부터 제자리다
                    (§6: 점을 먼저 보여 주고 밴드를 나중에 붙이는 연출 금지).
                    `pathLength={1}`이 길이를 정규화해 CSS만으로 그려진다. */}
                <path
                  data-testid="trend-line"
                  className="chart-draw"
                  pathLength={1}
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
              {/* 짚은 점만 후광으로 집어낸다 — 나머지 점을 흐리지 않는다.
                  값을 강조하려고 다른 값을 지우는 것은 조작이다. */}
              {hoverIndex === i && (
                <circle cx={x(i)} cy={y(p.interval.point)} r={8} fill="none" stroke={color} strokeWidth={1} opacity={0.45} />
              )}
              <Marker engine={engine} cx={x(i)} cy={y(p.interval.point)} color={color} />
              <title>{`${mmdd(p.measuredAt)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
            </g>
          ))}

          {series.map((p, i) => (
            <text key={p.runId} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
              {mmdd(p.measuredAt)}
            </text>
          ))}

          {/* 히트 영역 — 점은 반경 4px라 그것만 노리게 하면 사실상 못 짚는다.
              회차마다 이웃과의 중점까지를 자기 띠로 갖는다(마지막에 그려 위에 얹는다).
              ★ `fill="transparent"`다. `fill="none"`은 포인터 이벤트를 받지 않는다. */}
          {series.map((p, i) => {
            const left = i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2
            const right = i === n - 1 ? W - PAD.right : (x(i) + x(i + 1)) / 2
            return (
              <rect
                key={`hit-${p.runId}`}
                data-testid="trend-hit"
                x={left}
                y={PAD.top}
                width={Math.max(right - left, 1)}
                height={IH}
                fill="transparent"
                onMouseOver={() => setHover(i)}
              />
            )
          })}
        </svg>

        {hovered !== null && hoverIndex !== null && (
          // ★ `aria-hidden` — 같은 문장이 이미 점의 `<title>`로 노출된다.
          //   보조기기에 두 번 읽히면 회차 수만큼 중복이 쌓인다.
          // ★ `pointer-events-none` — 툴팁이 커서 아래로 들어오면 자기 히트
          //   영역을 가려 깜빡인다.
          <div
            aria-hidden="true"
            data-testid="trend-tooltip"
            className="pointer-events-none absolute z-10 w-max rounded-lg bg-popover px-3 py-2 shadow-elevation-2 ring-1 ring-foreground/10"
            style={{
              left: `${tipFx * 100}%`,
              top: `${tipFy * 100}%`,
              transform: `translate(${tipShiftX}, ${tipShiftY})`,
            }}
          >
            <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
              {mmdd(hovered.measuredAt)}
            </p>
            <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
              {formatPercent(hovered.interval.point)}{' '}
              <span className="font-normal text-muted-foreground">
                ({formatInterval(hovered.interval)})
              </span>
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {hovered.interval.k}/{hovered.interval.n}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        점은 회차별 언급률, 띠는 95% 신뢰구간입니다. 구간이 겹치는 변화는 변화로 읽지 마세요.
        {conditionBreak &&
          ' 선이 끊긴 자리는 측정 조건(엔진 구성·질의 집합·판정기 버전)이 바뀐 곳입니다 — 분모나 분자의 정의가 달라져 앞뒤를 비교하지 않습니다.'}
        {gapBreak &&
          ' 측정이 없던 회차가 있는 구간도 잇지 않습니다 — 점 사이 간격이 실제로 지난 기간과 다릅니다.'}
      </p>
    </div>
  )
}
