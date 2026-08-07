'use client'

import { useId, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { buildTrend, engineIdsIn, type RunPoint, type TrendPoint } from '@/lib/dashboard/data'
import { engineColor } from '@/lib/dashboard/engine-color'
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
 * ## 두 가지 모드
 *
 * - **한 계열**(`전체` 또는 엔진 하나): 점 + 95% 신뢰구간 밴드. 이 화면의
 *   기본값이고, 구간을 볼 수 있는 유일한 모드다.
 * - **엔진 비교**: 엔진별 선을 한 축에 겹쳐 그린다. **밴드는 그리지 않는다** —
 *   반투명 밴드 둘이 겹치면 겹친 자리의 농도가 세 번째 값처럼 읽힌다(없는
 *   값이다). 구간이 필요하면 엔진 하나를 골라 보면 된다. 대신 선 아래를
 *   그라디언트로 아주 옅게 깔아 어느 선이 어느 엔진인지 면으로도 잡히게 한다.
 *
 * ★ 비교 모드의 x축은 **회차 축**이지 각 엔진의 계열 인덱스가 아니다. 엔진마다
 *   n=0인 회차가 다를 수 있어(그 회차엔 점이 없다) 인덱스로 그리면 두 선이
 *   서로 다른 날짜를 같은 세로줄에 세운다. `runId → 축 위치` 지도를 만들어
 *   맞춘다.
 *
 * ★ **애니메이션은 무엇에 걸지 않는가가 규칙이다.** 연결선은 그려지고(§5.1이
 *   "보조"라 규정한 요소라 늦게 도착해도 값이 안 바뀐다), 밴드는 첫 프레임부터
 *   제자리이며(§6), 점은 밴드가 이미 놓인 뒤 **뒤따라** 앉는다. 순서가 밴드 →
 *   점인 것이 중요하다 — 반대면 "확정값처럼 보였다가 흐려지는" 인상이 된다.
 */

const W = 640
// 220 → 280. 회차가 쌓이면 선의 오르내림이 세로로 눌려 평평해 보인다 —
// 데이터가 늘수록 세로 여유가 더 필요하다.
const H = 280
// ★ `right`는 여백 취향이 아니라 **끝 라벨의 자리**다. 12px일 때 마지막 회차의
//   X축 라벨(`08.03`)이 실제로 잘렸다(실측). 선 끝의 값 라벨도 여기 앉는다.
const PAD = { top: 14, right: 52, bottom: 26, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

/** 점이 앉는 스태거 상한 — 회차가 20개여도 마지막 점이 0.5초 안에 앉는다. */
const POP_STEP = 32
const POP_MAX = 420

function mmdd(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
}

/**
 * 계측점 — 작은 원 하나(반경 2.5px), 모든 엔진 공통.
 *
 * ★ **모양 마커(네모·마름모·삼각형)를 접었다.** 원래는 gemini/google의 휘도
 *   근접을 모양으로 가르려던 규격인데, 반경 2.5px에서 모양은 읽히지도 않고
 *   눈에는 "찌그러진 점"만 남았다(사용자 피드백). 계열 정체는 색 + 범례 +
 *   툴팁 문자열(엔진 이름을 글자로 든다) 셋이 지고, 색만으로 못 가르는
 *   독자에게는 범례·툴팁의 **글자**가 정보를 전달한다.
 *
 * ★ 점은 계측값의 자리 표시지 그림의 주인공이 아니다 — 주인공은 선과 그 아래
 *   면이다. 표면색 1.5px 링은 선·밴드 위에서 점의 윤곽을 지키는 최소 잉크다.
 *   (차트가 카드 안에 앉으므로 링 색은 `--card`다.)
 *
 * ★ `delay`는 앉는 순번이다(왼→오). 값이 아니라 **회차 수**에서 나오므로
 *   인라인 style로 내보낸다 — Tailwind 임의값 클래스는 평문 스캐너가 못 본다
 *   (dashboard/page.tsx의 `ENTER_DELAY` 주석과 같은 이유).
 */
function Marker({
  cx,
  cy,
  color,
  delay,
}: {
  cx: number
  cy: number
  color: string
  delay: number
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2.5}
      fill={color}
      stroke="var(--card)"
      strokeWidth={1.5}
      paintOrder="stroke"
      className="chart-pop"
      style={{ animationDelay: `${delay}ms` }}
      data-testid="trend-point"
    />
  )
}

/** 축 위의 한 점 — 계열 인덱스가 아니라 **회차 축 위치**를 들고 다닌다. */
interface Placed {
  pos: number
  p: TrendPoint
}

/**
 * 연속 구간으로 자른다. 점 i가 직전 점과 비교 불가이거나 사이에 빠진 회차가
 * 있으면 새 세그먼트가 시작된다 — 선분·밴드 모두 세그먼트 안에서만 잇는다.
 *
 * `posOf`는 계열 인덱스를 축 위치로 옮긴다. 한 계열 모드에서는 항등함수이고,
 * 비교 모드에서는 `runId → 회차 축` 지도다.
 */
function splitSegments(
  series: readonly TrendPoint[],
  posOf: (p: TrendPoint, index: number) => number,
): Placed[][] {
  const segments: Placed[][] = []
  series.forEach((p, i) => {
    const broken = i > 0 && (!p.comparableWithPrev || p.runsSkippedBefore > 0)
    const placed: Placed = { pos: posOf(p, i), p }
    if (i === 0 || broken) segments.push([placed])
    else segments[segments.length - 1]!.push(placed)
  })
  return segments
}

export function TrendChart({
  points,
  initialEngine = 'all',
}: {
  points: RunPoint[]
  /**
   * 전역 엔진 필터(`?engine=`)가 정한 시작 모드. 이후의 토글은 이 차트가
   * 소유한다 — 호출부는 `key={engine}`으로 필터 변경 시 차트를 다시 세워
   * 상태를 리셋한다(두 컨트롤이 같은 상태를 놓고 싸우지 않게).
   */
  initialEngine?: string
}) {
  const engines = engineIdsIn(points)
  // 비교 모드는 엔진이 둘 이상일 때만 뜻이 있다 — 하나짜리 "비교"는 전체와 같다.
  const canCompare = engines.length >= 2
  const [mode, setMode] = useState<'all' | 'compare' | string>(
    initialEngine !== 'all' && engines.includes(initialEngine) ? initialEngine : 'all',
  )
  // 커서가 짚은 회차. 모드를 갈아타면 축 길이가 달라지므로 같이 비운다.
  const [hover, setHover] = useState<number | null>(null)
  const gradientId = useId()

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

  const comparing = mode === 'compare' && canCompare

  // ── 계열 조립 ────────────────────────────────────────────────────────────
  // 비교 모드: 엔진별 계열 + 공통 회차 축. 한 계열 모드: 예전 그대로.
  const engineSeries = comparing
    ? engines.map((id) => ({ id, series: buildTrend(points, id) }))
    : []
  // 축에 세울 회차 — 어느 엔진이든 값이 있는 회차만. (전부 n=0인 회차는 축에서도
  // 뺀다: 세로줄만 서고 점이 하나도 없으면 "잰 것이 있다"는 인상이 거짓이다.)
  const axisRuns = comparing
    ? points.filter((p) => engineSeries.some((e) => e.series.some((t) => t.runId === p.runId)))
    : buildTrend(points, mode === 'compare' ? 'all' : mode).map((t) => ({
        runId: t.runId,
        measuredAt: t.measuredAt,
      }))
  const posOfRun = new Map(axisRuns.map((r, i) => [r.runId, i]))

  const series: TrendPoint[] = comparing ? [] : buildTrend(points, mode === 'compare' ? 'all' : mode)
  const color = comparing
    ? 'var(--primary)'
    : mode === 'all'
      ? 'var(--primary)'
      : engineColor(mode)
  const label = comparing ? '엔진 비교' : mode === 'all' ? '전체' : engineLabel(mode)

  const n = axisRuns.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const latest = series[series.length - 1]

  // 라벨 간격 — 640px 폭에 11px mono 라벨(약 34px)이 겹치지 않으려면 회차당
  // 최소 40px이 필요하다. 그보다 촘촘해지면 그 배수만큼 건너뛴다.
  const labelStep = Math.max(1, Math.ceil(n / Math.floor(IW / 40)))

  const breakSource = comparing ? engineSeries.flatMap((e) => e.series) : series
  const conditionBreak = comparing
    ? engineSeries.some((e) => e.series.some((p, i) => i > 0 && !p.comparableWithPrev))
    : breakSource.some((p, i) => i > 0 && !p.comparableWithPrev)
  const gapBreak = comparing
    ? engineSeries.some((e) => e.series.some((p, i) => i > 0 && p.runsSkippedBefore > 0))
    : breakSource.some((p, i) => i > 0 && p.runsSkippedBefore > 0)

  // 렌더 직전 방어 — 모드를 갈아탄 프레임에 옛 인덱스가 남아 있을 수 있다.
  const hoverIndex = hover !== null && hover < n ? hover : null
  const hoveredRun = hoverIndex !== null ? axisRuns[hoverIndex]! : null
  const hovered = hoveredRun ? (series.find((p) => p.runId === hoveredRun.runId) ?? null) : null
  // 비교 모드 툴팁 — 짚은 회차의 엔진별 값. 값이 없는 엔진은 줄을 만들지 않는다.
  const hoveredRows = hoveredRun
    ? engineSeries
        .map((e) => ({ id: e.id, p: e.series.find((t) => t.runId === hoveredRun.runId) ?? null }))
        .filter((r): r is { id: string; p: TrendPoint } => r.p !== null)
    : []

  // 툴팁 기준점 — 짚은 점을 가리지 않으면서 차트 밖으로도 넘치지 않게 옮긴다.
  // 양 끝 회차는 가로 기준을, 높은 값(위쪽에 찍힌 점)은 세로 기준을 뒤집는다.
  // 언급률이 높을수록 점이 위로 가므로 "잘 나오는 브랜드일수록 툴팁이 잘린다"가
  // 기본값이 되는 것을 막는다.
  // 비교 모드에는 짚은 점이 여럿이라 기준을 **그 회차의 가장 높은 값**으로 잡는다.
  const tipAnchor = comparing
    ? hoveredRows.length > 0
      ? Math.max(...hoveredRows.map((r) => r.p.interval.point))
      : null
    : (hovered?.interval.point ?? null)
  const tipFx = hoverIndex === null ? 0 : x(hoverIndex) / W
  const tipFy = tipAnchor === null ? 0 : y(tipAnchor) / H
  const tipShiftX = tipFx < 0.18 ? '0' : tipFx > 0.82 ? '-100%' : '-50%'
  const tipShiftY = tipFy < 0.32 ? 'calc(0% + 0.625rem)' : 'calc(-100% - 0.625rem)'
  const tipOpen = comparing ? hoveredRows.length > 0 : hovered !== null

  const modes: string[] = ['all', ...(canCompare ? ['compare'] : []), ...engines]
  const modeLabel = (id: string) =>
    id === 'all' ? '전체' : id === 'compare' ? '엔진 비교' : engineLabel(id)

  return (
    <div>
      {/* 세그먼트 트레이 — 앱 머리글의 현재 위치 표시와 같은 어휘다(트레이 +
          활성 조각만 카드색으로 1단). 예전에는 활성 토글이 --primary로 꽉 찬
          알약이었는데, 그 색은 이 화면에서 **차트의 계열색**이기도 하다 —
          같은 색이 "선택됨"과 "전체 계열"을 동시에 뜻하고 있었다 (§2: 색의 뜻은
          하나). 반경은 카드와 같은 동심 뺄셈(껍질 --radius×1.4, 베젤 4px) —
          `var(--radius-xl)`로 줄여 쓰지 않는 이유는 card.tsx 주석에 있다
          (`:root`에서 치환돼 표면 스케일을 못 탄다). */}
      <div
        className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-foreground/[0.06]"
        role="group"
        aria-label="엔진 선택"
      >
        {modes.map((id) => {
          const active = mode === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setMode(id)
                setHover(null)
              }}
              className={`motion-press rounded-[calc(var(--radius)*1.4-0.25rem)] px-2.5 py-1 text-xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                active
                  ? 'bg-card font-medium text-foreground shadow-elevation-1'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
              }`}
            >
              {id === 'compare' ? (
                // 비교 조각의 표식은 색 점 하나가 아니라 **엔진 색을 이은 띠**다 —
                // "여러 계열이 한 축에 온다"가 조각 안에서 미리 보인다.
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block h-2 w-4 rounded-full align-middle"
                  style={{
                    background: `linear-gradient(90deg, ${engines
                      .map((e) => engineColor(e))
                      .join(', ')})`,
                  }}
                />
              ) : (
                id !== 'all' && (
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: engineColor(id) }}
                  />
                )
              )}
              {modeLabel(id)}
              {/* 비교 모드에서는 엔진 조각이 범례를 겸한다 — 색점 + 이름에
                  **최신값**을 붙인다. 차트 아래 별도 범례를 두면 모드 토글마다
                  카드 높이가 흔들린다(레이아웃 시프트). 이 값은 계열의 마지막
                  점과 같은 숫자다 — 새 정보가 아니라 자리 이동이다. */}
              {comparing && id !== 'all' && id !== 'compare' && (
                <span
                  data-testid="tray-latest"
                  className="ml-1.5 font-mono text-[0.6875rem] font-medium tabular-nums text-foreground"
                >
                  {(() => {
                    const s = engineSeries.find((e) => e.id === id)?.series
                    const last = s?.[s.length - 1]
                    return last ? formatPercent(last.interval.point) : '—'
                  })()}
                </span>
              )}
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
            comparing
              ? `엔진별 언급률 추이 — ${engineSeries
                  .map((e) => {
                    const last = e.series[e.series.length - 1]
                    return `${engineLabel(e.id)} ${last ? formatPercent(last.interval.point) : '측정 없음'}`
                  })
                  .join(', ')}`
              : latest
                ? `${label} 언급률 추이 — 최신 ${formatPercent(latest.interval.point)} (${formatInterval(latest.interval)})`
                : `${label} 언급률 추이 — 표시할 회차 없음`
          }
          onMouseLeave={() => setHover(null)}
        >
          {/* 선 아래 washes — 비교 모드 전용. 선 바로 아래에서 시작해 **절반쯤
              내려가기 전에 완전히 사라진다**. 두 가지를 동시에 지키려는 모양이다:
              - 색을 면으로 한 번 더 말해 어느 선이 어느 엔진인지 잡히게 한다.
              - 바닥까지 칠하지 않는다. 겹쳐 칠하면 두 wash가 포개진 아래쪽이
                더 진해지는데, 그 농도는 **어떤 값도 아니다** — 신뢰구간 밴드를
                이 모드에서 안 그리는 것과 정확히 같은 이유다. 45%에서 0으로
                떨어뜨리면 두 선 사이 좁은 띠에서만 살짝 겹치고 아래쪽은 비어
                있어, 면적이 값을 주장하는 그림이 되지 않는다.
              (좌표계는 기본값 objectBoundingBox — 각 계열이 **자기 상자 기준**
              으로 사라지므로, 높은 선의 wash가 낮은 선의 wash보다 길어지지 않는다.) */}
          <defs>
            {engines.map((id) => (
              <linearGradient key={id} id={`${gradientId}-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={engineColor(id)} stopOpacity={0.2} />
                <stop offset="45%" stopColor={engineColor(id)} stopOpacity={0} />
                <stop offset="100%" stopColor={engineColor(id)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* 계열용 그라디언트 둘 — 데이터 의미는 없고 방향만 말한다.
              - line: 과거(왼쪽)는 옅고 현재(오른쪽)로 갈수록 제 색이다. 시선을
                최신값으로 데려가는 잉크 배분이지 값의 변화가 아니다 — 어느
                점에서든 선의 높이(값)는 그대로다.
              - area: 선에서 바닥으로 사라지는 면. 좌표는 userSpaceOnUse다 —
                세그먼트가 갈려도 그라디언트가 세그먼트마다 다시 시작하지 않는다. */}
          <defs>
            <linearGradient id={`${gradientId}-line`} gradientUnits="userSpaceOnUse" x1={PAD.left} x2={W - PAD.right} y1="0" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="75%" stopColor={color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
            <linearGradient id={`${gradientId}-area`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={PAD.top} y2={PAD.top + IH}>
              <stop offset="0%" stopColor={color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* 눈금 — 헤어라인 다섯. 바닥·중앙·상단은 제 농도, 25·75는 반 농도.
              상자도 패널도 없다 — 좌표계는 선 다섯이면 충분하고, 그 이상은
              그림이 아니라 슬라이드가 된다(실제 피드백). */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--border)"
                strokeWidth={1}
                opacity={tick === 0 || tick === 0.5 || tick === 1 ? 0.7 : 0.25}
              />
              {/* 라벨은 0·50·100만 — 다섯 개면 축이 시끄럽다. 사이 눈금은
                  선만 남아 높이를 재는 자로 쓰인다. */}
              {(tick === 0 || tick === 0.5 || tick === 1) && (
                <text x={PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={10} opacity={0.8}>
                  {Math.round(tick * 100)}%
                </text>
              )}
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
              strokeOpacity={0.18}
              strokeWidth={1}
            />
          )}

          {comparing ? (
            // ── 비교 모드 ────────────────────────────────────────────────
            engineSeries.map((e) => {
              const c = engineColor(e.id)
              const segments = splitSegments(e.series, (p) => posOfRun.get(p.runId) ?? 0)
              return (
                <g key={e.id}>
                  {segments.map((seg) => {
                    // 점 하나짜리 세그먼트는 선이 될 수 없다 — 마커만 남긴다
                    // (밴드는 이 모드에서 애초에 그리지 않는다).
                    if (seg.length < 2) return null
                    const line = seg.map((s) => `${x(s.pos)},${y(s.p.interval.point)}`).join(' L ')
                    const first = seg[0]!
                    const last = seg[seg.length - 1]!
                    return (
                      <g key={`${e.id}-${first.p.runId}`}>
                        <path
                          d={`M ${line} L ${x(last.pos)},${y(0)} L ${x(first.pos)},${y(0)} Z`}
                          fill={`url(#${gradientId}-${e.id})`}
                          data-testid="trend-wash"
                        />
                        <path
                          data-testid="trend-line"
                          className="chart-draw"
                          pathLength={1}
                          d={`M ${line}`}
                          fill="none"
                          stroke={c}
                          strokeWidth={2}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </g>
                    )
                  })}
                  {e.series.map((p) => {
                    const pos = posOfRun.get(p.runId) ?? 0
                    return (
                      <g key={`${e.id}-pt-${p.runId}`}>
                        <Marker cx={x(pos)} cy={y(p.interval.point)} color={c} delay={Math.min(pos * POP_STEP, POP_MAX)} />
                        {/* 짚은 회차의 점은 흰 속 링으로 커진다 — 계열색 테두리 +
                            표면색 속. 다른 점을 흐리지 않고 그 점만 세운다. */}
                        {hoverIndex === pos && (
                          <circle cx={x(pos)} cy={y(p.interval.point)} r={4.5} fill="var(--card)" stroke={c} strokeWidth={2} />
                        )}
                        <title>{`${engineLabel(e.id)} · ${mmdd(p.measuredAt)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
                      </g>
                    )
                  })}
                </g>
              )
            })
          ) : (
            // ── 한 계열 모드 ─────────────────────────────────────────────
            // 오차 밴드·연결선 — 세그먼트 안에서만 잇고, 점보다 먼저(아래에) 그린다.
            // 혼자 남은 점은 세로 띠로 그린다 — "구간이 넓다"가 정직한 첫인상이다.
            <>
              {splitSegments(series, (_p, i) => i).map((seg) => {
                const first = seg[0]!
                if (seg.length === 1) {
                  return (
                    <rect
                      key={first.p.runId}
                      data-testid="trend-band"
                      x={x(first.pos) - 5}
                      y={y(first.p.interval.upper)}
                      width={10}
                      rx={5}
                      height={Math.max(y(first.p.interval.lower) - y(first.p.interval.upper), 1)}
                      fill={color}
                      opacity={0.25}
                    />
                  )
                }
                const upper = seg.map((s) => `${x(s.pos)},${y(s.p.interval.upper)}`).join(' L ')
                const lower = [...seg]
                  .reverse()
                  .map((s) => `${x(s.pos)},${y(s.p.interval.lower)}`)
                  .join(' L ')
                const lowerFwd = seg.map((s) => `${x(s.pos)},${y(s.p.interval.lower)}`).join(' L ')
                const linePts = seg.map((s) => `${x(s.pos)},${y(s.p.interval.point)}`).join(' L ')
                const lastSeg = seg[seg.length - 1]!
                return (
                  <g key={first.p.runId}>
                    {/* 선 아래 면 — 선(옅은 계열색)에서 바닥(투명)으로 사라진다.
                        값이 아니라 선의 무게추다(면적이 값이면 아래로 갈수록
                        진해야 한다). 밴드보다 먼저 깔린다. */}
                    <path
                      d={`M ${linePts} L ${x(lastSeg.pos)},${y(0)} L ${x(first.pos)},${y(0)} Z`}
                      fill={`url(#${gradientId}-area)`}
                    />
                    <path d={`M ${upper} L ${lower} Z`} fill={color} opacity={0.08} data-testid="trend-band" />
                    {/* 밴드 윤곽 — 구간의 **경계**가 값이다(위 = upper, 아래 =
                        lower). 면만 있으면 경계가 흐릿해 구간의 폭을 눈으로 재기
                        어렵다. 그라디언트로 흐리는 것은 금지지만(경계를 지운다)
                        경계를 선으로 세우는 것은 반대 방향이다. */}
                    <path d={`M ${upper}`} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={1} />
                    <path d={`M ${lowerFwd}`} fill="none" stroke={color} strokeOpacity={0.22} strokeWidth={1} />
                    {/* 드로우인은 **연결선에만** 건다. 밴드는 첫 프레임부터 제자리다
                        (§6: 점을 먼저 보여 주고 밴드를 나중에 붙이는 연출 금지).
                        `pathLength={1}`이 길이를 정규화해 CSS만으로 그려진다. */}
                    <path
                      data-testid="trend-line"
                      className="chart-draw"
                      pathLength={1}
                      d={`M ${linePts}`}
                      fill="none"
                      stroke={`url(#${gradientId}-line)`}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                )
              })}

              {series.map((p, i) => (
                <g key={p.runId}>
                  {/* 최신 점만 가는 링 하나 — "현재 회차"는 액센트를 가질 수
                      있는 유일한 점이다(dataviz: current period in the accent).
                      점이 앉는 것과 같은 박자로 나타난다. */}
                  {i === series.length - 1 && (
                    <circle
                      className="chart-pop"
                      style={{ animationDelay: `${Math.min(i * POP_STEP, POP_MAX)}ms` }}
                      cx={x(i)}
                      cy={y(p.interval.point)}
                      r={6}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.25}
                      opacity={0.5}
                    />
                  )}
                  <Marker cx={x(i)} cy={y(p.interval.point)} color={color} delay={Math.min(i * POP_STEP, POP_MAX)} />
                  {/* 짚은 점만 흰 속 링으로 커진다 — 나머지 점을 흐리지 않는다.
                      값을 강조하려고 다른 값을 지우는 것은 조작이다. */}
                  {hoverIndex === i && (
                    <circle cx={x(i)} cy={y(p.interval.point)} r={4.5} fill="var(--card)" stroke={color} strokeWidth={2} />
                  )}
                  <title>{`${mmdd(p.measuredAt)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
                </g>
              ))}
            </>
          )}

          {/* X축 라벨 — 회차가 쌓이면 솎는다. 라벨이 서로 붙어 읽히지 않는
              것보다 몇 개를 비우는 편이 낫고, **마지막 회차는 언제나 남긴다**
              (지금이 언제인지가 이 차트에서 가장 자주 찾는 값이다). */}
          {axisRuns.map((r, i) =>
            i % labelStep === 0 || i === n - 1 ? (
              <text key={r.runId} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
                {mmdd(r.measuredAt)}
              </text>
            ) : null,
          )}

          {/* 선 끝의 값 — 호버 없이도 "지금 몇 퍼센트인가"가 읽혀야 한다
              (dataviz: 선은 끝에 직접 라벨). 라벨은 **최신 하나뿐**이다 —
              점마다 숫자를 붙이면 그건 차트가 아니라 표다(안티패턴).
              커서가 그 점을 짚고 있으면 툴팁과 같은 값이 두 번 보이므로 숨긴다.
              ★ 비교 모드에는 붙이지 않는다 — 끝값 둘이 세로로 겹치면 어느 쪽
              숫자인지가 색으로만 갈린다. 그쪽은 아래 범례가 값을 말한다. */}
          {/* 선 끝의 값 — 계열색 글자 하나. 알약 배지를 실제로 만들어 봤는데
              그림 위의 스티커처럼 겉돌았다(사용자 피드백 — "진짜 구려").
              잉크는 글자면 충분하고, 색이 계열색이라 축 라벨과 섞이지 않는다. */}
          {!comparing && latest && hoverIndex !== n - 1 && (
            <text
              data-testid="trend-end-label"
              x={x(n - 1) + 11}
              y={y(latest.interval.point) + 4}
              fill={color}
              className="font-mono font-semibold"
              fontSize={12}
            >
              {formatPercent(latest.interval.point)}
            </text>
          )}

          {/* 히트 영역 — 점은 반경 4px라 그것만 노리게 하면 사실상 못 짚는다.
              회차마다 이웃과의 중점까지를 자기 띠로 갖는다(마지막에 그려 위에 얹는다).
              ★ `fill="transparent"`다. `fill="none"`은 포인터 이벤트를 받지 않는다. */}
          {axisRuns.map((r, i) => {
            const left = i === 0 ? PAD.left : (x(i - 1) + x(i)) / 2
            const right = i === n - 1 ? W - PAD.right : (x(i) + x(i + 1)) / 2
            return (
              <rect
                key={`hit-${r.runId}`}
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

        {tipOpen && hoverIndex !== null && hoveredRun !== null && (
          // ★ `aria-hidden` — 같은 문장이 이미 점의 `<title>`로 노출된다.
          //   보조기기에 두 번 읽히면 회차 수만큼 중복이 쌓인다.
          // ★ `pointer-events-none` — 툴팁이 커서 아래로 들어오면 자기 히트
          //   영역을 가려 깜빡인다.
          // ★ 툴팁은 **반전 카드**다(--foreground 바탕에 --background 글자).
          //   차트에서 잉크를 걷어낸 만큼(눈금·점 축소) 값을 읽는 자리는 이
          //   카드 하나로 모인다 — 페이지에서 가장 진한 표면이라 커서를 따라
          //   다니는 읽기 초점이 된다. 같은 카테고리 제품들(Peec·Otterly)의
          //   차트 문법에서 가져온 관습이기도 하다.
          <div
            aria-hidden="true"
            data-testid="trend-tooltip"
            className="pointer-events-none absolute z-10 w-max rounded-xl bg-foreground px-3.5 py-2.5 text-background shadow-elevation-2"
            style={{
              left: `${tipFx * 100}%`,
              top: `${tipFy * 100}%`,
              transform: `translate(${tipShiftX}, ${tipShiftY})`,
            }}
          >
            <p className="font-mono text-[0.6875rem] tracking-[0.08em] uppercase opacity-60">
              {mmdd(hoveredRun.measuredAt)}
            </p>
            {comparing ? (
              <div className="mt-1.5 space-y-1.5">
                {hoveredRows.map((row) => (
                  <div key={row.id} className="flex items-baseline gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ background: engineColor(row.id) }}
                    />
                    <span className="text-xs opacity-75">{engineLabel(row.id)}</span>
                    <span className="ml-auto pl-3 font-mono text-sm font-semibold tabular-nums">
                      {formatPercent(row.p.interval.point)}
                    </span>
                    <span className="font-mono text-[0.6875rem] tabular-nums opacity-60">
                      {row.p.interval.k}/{row.p.interval.n}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              hovered && (
                <>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                    {formatPercent(hovered.interval.point)}{' '}
                    <span className="font-normal opacity-70">
                      ({formatInterval(hovered.interval)})
                    </span>
                  </p>
                  <p className="font-mono text-xs tabular-nums opacity-60">
                    {hovered.interval.k}/{hovered.interval.n}
                  </p>
                </>
              )
            )}
          </div>
        )}
      </div>

      {/* ★ 캡션은 **높이가 고정**이다. 모드마다 문장 길이가 다른데, 그때마다
          카드가 자라고 줄어들면 토글이 화면 전체를 밀어낸다 — 값이 아닌 것이
          움직이는 레이아웃 시프트다(사용자 피드백). min-h-10 = 비교 모드 캡션
          두 줄(실측 38px)의 자리. 별도 범례는 없다 — 비교 모드의 계열
          정체·최신값은 위 트레이 조각이 든다(같은 이유: 슬롯이 늘고 줄면
          카드가 움직인다). */}
      <p className="mt-3 min-h-10 max-w-prose text-xs text-muted-foreground">
        {comparing ? (
          <>
            엔진별 언급률입니다. 이 모드에는 신뢰구간을 그리지 않습니다 — 반투명 띠 둘이
            겹치면 겹친 자리가 세 번째 값처럼 읽힙니다. 구간이 필요하면 엔진 하나를 고르세요.
          </>
        ) : (
          <>점은 회차별 언급률, 띠는 95% 신뢰구간입니다. 구간이 겹치는 변화는 변화로 읽지 마세요.</>
        )}
        {conditionBreak &&
          ' 선이 끊긴 자리는 측정 조건(엔진 구성·질의 집합·판정기 버전)이 바뀐 곳입니다 — 분모나 분자의 정의가 달라져 앞뒤를 비교하지 않습니다.'}
        {gapBreak &&
          ' 측정이 없던 회차가 있는 구간도 잇지 않습니다 — 점 사이 간격이 실제로 지난 기간과 다릅니다.'}
      </p>
    </div>
  )
}
