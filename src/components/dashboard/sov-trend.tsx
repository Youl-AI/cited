import { buildSovTrend, type RunPoint, type SovPoint } from '@/lib/dashboard/data'
import { competitorColor } from '@/lib/dashboard/engine-color'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 점유율 추이 (디자인 언어 §4.3) — **브랜드별 선을 한 축에 겹쳐 그린다.**
 *
 * 같은 카테고리 제품들(Peec·Otterly)의 기본 화면이 정확히 이 그림이다:
 * 우리와 경쟁사가 각자의 색으로 한 좌표계에 서고, "누가 치고 올라오는가"가
 * 선의 교차로 읽힌다. 우리 계열은 --primary, 경쟁사는 등록 순서로 고정된
 * 계열색(`competitorColor`)이다.
 *
 * ## 값의 정의
 *
 * 회차의 브랜드별 언급 수(`ranking`)를 그 회차 전체 언급 수로 나눈 몫이다.
 * 우리 계열은 스냅샷의 `shareOfVoice`(같은 분모로 계산된 Wilson 구간)를
 * 그대로 쓴다 — 캡슐 띠(95% 신뢰구간)도 **우리 계열에만** 두른다. 경쟁사
 * 선에는 구간을 그리지 않는다: 겹치는 반투명 띠 넷은 겹침의 농도가 없는
 * 값을 만든다(추이 차트 엔진 비교 모드와 같은 결정).
 *
 * ★ **선을 끊어야 하는 자리가 둘 있다 — `trend-chart.tsx`와 같은 규칙이다.**
 *   같은 서수 축을 쓰는 이상 같은 거짓말이 가능하다.
 *     - `comparableWithPrev === false` — 경쟁사 집합·엔진 구성·질의 집합·판정기
 *       버전이 바뀌었다. 분모가 달라지면 점유율은 설정 변경만으로도 움직인다.
 *     - `runsSkippedBefore > 0` — 그 사이에 잴 값이 없던 회차가 있다.
 *   끊는 위치는 회차 속성이므로 **모든 브랜드 선이 같은 자리에서 끊긴다.**
 *   그 회차 순위에 없는 브랜드는 그 자리만 비운다(0이 아니라 측정 없음).
 *
 * ★ 경쟁사 집합이 바뀐 구간의 캡션은 §4.3의 **고정 문구 그대로**다.
 * ★ 경쟁사가 없으면(순위가 우리뿐) 예전 단일 계열 그림으로 떨어진다.
 */
const W = 640
// 추이 차트와 같은 이유로 키운다(그쪽 H 주석). 계열이 여럿이라 단일 시절보다
// 세로 여유를 조금 더 준다.
const H = 210
// 오른쪽은 끝 라벨의 자리다 — 추이 차트와 같은 이유(그쪽 PAD 주석).
const PAD = { top: 12, right: 52, bottom: 24, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

/**
 * 이을 수 있는 구간으로 자른다 — `trend-chart.tsx`의 `splitSegments`와
 * 같은 규칙·같은 이유다. 반환은 **전역 인덱스**의 묶음이다: x 좌표는 계열
 * 전체에서의 위치로 정해야 구간이 갈려도 점이 제자리에 남는다.
 */
function segmentsOf(series: SovPoint[]): number[][] {
  const out: number[][] = []
  series.forEach((p, i) => {
    const breaks = !p.comparableWithPrev || p.runsSkippedBefore > 0
    if (i === 0 || breaks) out.push([i])
    else out[out.length - 1]!.push(i)
  })
  return out
}

/** 순서 무관 집합 비교 — 스냅샷이 정렬을 보장하지 않는 필드가 있다. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((v, i) => v === y[i])
}

export function SovTrend({ points }: { points: RunPoint[] }) {
  const sov = buildSovTrend(points)
  const latest = points[points.length - 1]
  if (sov.length === 0 || !latest) return null
  const n = sov.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const last = sov[n - 1]!
  // 라벨 솎기 — 추이 차트와 같은 계산(그쪽 주석 참고).
  const labelStep = Math.max(1, Math.ceil(n / Math.floor(IW / 40)))
  const segments = segmentsOf(sov)
  // 밴드 불투명도는 TrendChart와 같은 값이다 (§4.1): 이어지는 세그먼트 안의
  // 점은 0.14, 혼자 남은 점은 0.25 — "구간이 넓다"가 정직한 첫인상이어야 한다.
  const isolated = new Set(segments.filter((s) => s.length === 1).flat())
  // 왜 끊겼는지를 캡션에 쓴다 — 말없이 끊긴 선은 버그로 읽힌다. 경쟁사 집합이
  // 바뀐 끊김은 §4.3 고정 문구, 나머지 조건 변경은 일반 문구로 가른다.
  // (`SovPoint`는 무엇이 바뀌었는지 들고 오지 않으므로 원본 회차로 되짚는다.)
  const byRun = new Map(points.map((p) => [p.runId, p]))
  let hasCompetitorBreak = false
  let hasOtherConditionBreak = false
  sov.forEach((p, i) => {
    if (i === 0 || p.comparableWithPrev) return
    const prevRun = byRun.get(sov[i - 1]!.runId)
    const currRun = byRun.get(p.runId)
    if (prevRun && currRun && !sameSet(prevRun.competitors, currRun.competitors)) {
      hasCompetitorBreak = true
    } else {
      hasOtherConditionBreak = true
    }
  })
  const hasGap = sov.some((p) => p.runsSkippedBefore > 0)
  // ★ 분모 캡션은 **마지막으로 그린 점**의 회차 경쟁사를 쓴다. 최신 회차가
  //   n=0이라 차트에서 빠졌으면(`buildSovTrend`가 거른다) `latest.competitors`는
  //   화면의 어느 점도 쓰지 않은 분모다 — 차트와 캡션이 다른 말을 하게 된다.
  const denomRun = byRun.get(last.runId) ?? latest

  // ── 브랜드별 계열 ────────────────────────────────────────────────────────
  // 마지막으로 그린 회차의 순위(언급 수 내림차순)가 계열 목록이다. 색은
  // 순위가 아니라 **등록 목록의 저장 순서**로 배정한다(engine-color.ts).
  const denomRanking = denomRun.result.ranking
  const multi = denomRanking.length > 1
  const brandColorOf = (name: string, isSelf: boolean): string => {
    if (isSelf) return 'var(--primary)'
    const idx = denomRun.competitors.indexOf(name)
    return competitorColor(idx < 0 ? 0 : idx)
  }
  // 계열 값: 각 그려진 회차에서 브랜드 몫(언급 수 / 전체 언급 수). 그 회차
  // 순위에 없는 브랜드·전체 0인 회차는 null — 0%가 아니라 측정 없음이다.
  const shareAt = (runId: string, name: string): number | null => {
    const run = byRun.get(runId)
    if (!run) return null
    const total = run.result.ranking.reduce((s, r) => s + r.mentions, 0)
    if (total === 0) return null
    const entry = run.result.ranking.find((r) => r.name === name)
    return entry ? entry.mentions / total : null
  }
  const brandSeries = multi
    ? denomRanking.map((b) => ({
        name: b.name,
        isSelf: b.isSelf,
        color: brandColorOf(b.name, b.isSelf),
        values: sov.map((p) => shareAt(p.runId, b.name)),
      }))
    : []

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={
          multi
            ? `브랜드별 언급 점유율 추이 — 최신 ${denomRanking
                .map((b) => `${b.name}${b.isSelf ? '(우리)' : ''} ${formatPercent((shareAt(last.runId, b.name) ?? 0))}`)
                .join(', ')}`
            : `언급 점유율 추이 — 최신 ${formatPercent(last.interval.point)} (${formatInterval(last.interval)})`
        }
      >
        {/* 눈금 — 추이 차트와 **같은 문법**(헤어라인 다섯, 25·75는 반 농도).
            같은 화면의 두 차트가 다른 문법을 쓰면 하나가 고장으로 읽힌다. */}
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
            {tick !== 0.25 && tick !== 0.75 && (
              <text x={PAD.left - 8} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={10} opacity={0.8}>
                {Math.round(tick * 100)}%
              </text>
            )}
          </g>
        ))}

        {/* 우리 계열의 95% 신뢰구간 캡슐 — 멀티 모드에서도 우리 것만 두른다
            (머리말). 점보다 먼저(아래에) 깔린다. */}
        {sov.map((p, i) => (
          <rect
            key={`band-${p.runId}`}
            data-testid="sov-band"
            x={x(i) - 4}
            y={y(p.interval.upper)}
            width={8}
            rx={4}
            height={Math.max(y(p.interval.lower) - y(p.interval.upper), 1)}
            fill="var(--primary)"
            opacity={isolated.has(i) ? 0.25 : 0.14}
          />
        ))}

        {multi ? (
          // ── 브랜드별 선 ─────────────────────────────────────────────────
          // 세그먼트(조건 변화·빠진 회차)는 회차 속성이라 모든 선이 같은
          // 자리에서 끊긴다. 값이 null인 회차는 그 선만 추가로 끊는다.
          brandSeries.map((b) => (
            <g key={b.name}>
              {segments.map((idx) => {
                // 세그먼트 안에서 null로 다시 자른다.
                const runs: number[][] = []
                for (const i of idx) {
                  if (b.values[i] === null) {
                    runs.push([])
                    continue
                  }
                  if (runs.length === 0) runs.push([])
                  runs[runs.length - 1]!.push(i)
                }
                return runs
                  .filter((r) => r.length > 1)
                  .map((r) => (
                    <path
                      key={`${b.name}-${r[0]}`}
                      data-testid="sov-line"
                      className="chart-draw"
                      pathLength={1}
                      d={`M ${r.map((i) => `${x(i)},${y(b.values[i] ?? 0)}`).join(' L ')}`}
                      fill="none"
                      stroke={b.color}
                      strokeWidth={b.isSelf ? 2.5 : 1.75}
                      strokeOpacity={b.isSelf ? 1 : 0.85}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))
              })}
              {sov.map((p, i) => {
                const v = b.values[i]
                if (v === null || v === undefined) return null
                return (
                  <circle
                    key={`${b.name}-pt-${p.runId}`}
                    data-testid={b.isSelf ? 'sov-point' : 'sov-competitor-point'}
                    className="chart-pop"
                    style={{ animationDelay: `${Math.min(i * 32, 420)}ms` }}
                    cx={x(i)}
                    cy={y(v)}
                    r={b.isSelf ? 2.5 : 2}
                    fill={b.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    paintOrder="stroke"
                  />
                )
              })}
            </g>
          ))
        ) : (
          // ── 단일 계열(경쟁사 미등록) — 예전 그림 그대로 ──────────────────
          <>
            {segments.map((idx) => {
              if (idx.length <= 1) return null
              const linePts = idx.map((i) => `${x(i)},${y(sov[i]!.interval.point)}`).join(' L ')
              return (
                <path
                  key={`line-${idx[0]}`}
                  data-testid="sov-line"
                  className="chart-draw"
                  pathLength={1}
                  d={`M ${linePts}`}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            })}
            {sov.map((p, i) => (
              <g key={p.runId}>
                {i === n - 1 && (
                  <circle
                    className="chart-pop"
                    style={{ animationDelay: `${Math.min(i * 32, 420)}ms` }}
                    cx={x(i)}
                    cy={y(p.interval.point)}
                    r={6}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1.25}
                    opacity={0.5}
                  />
                )}
                <circle
                  data-testid="sov-point"
                  className="chart-pop"
                  style={{ animationDelay: `${Math.min(i * 32, 420)}ms` }}
                  cx={x(i)}
                  cy={y(p.interval.point)}
                  r={2.5}
                  fill="var(--primary)"
                  stroke="var(--card)"
                  strokeWidth={1.5}
                  paintOrder="stroke"
                />
                <title>{`${p.measuredAt.slice(5, 7)}.${p.measuredAt.slice(8, 10)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
              </g>
            ))}
          </>
        )}

        {/* X축 라벨 — 추이 차트와 같은 문법 (§4.1: 회차 날짜 MM.DD, mono).
            솎는 규칙도 같다 — 마지막 회차는 언제나 남긴다. */}
        {sov.map((p, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text key={`x-${p.runId}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
              {`${p.measuredAt.slice(5, 7)}.${p.measuredAt.slice(8, 10)}`}
            </text>
          ) : null,
        )}

        {/* 선 끝의 값 — 단일 계열에서만. 멀티 모드는 선 넷의 끝이 붙어 있어
            숫자 넷이 겹친다 — 그쪽 값은 아래 범례가 말한다. */}
        {!multi && (
          <text
            data-testid="sov-end-label"
            x={x(n - 1) + 11}
            y={y(last.interval.point) + 4}
            fill="var(--primary)"
            className="font-mono font-semibold"
            fontSize={12}
          >
            {formatPercent(last.interval.point)}
          </text>
        )}
      </svg>

      {/* 범례 — 계열이 둘 이상이면 색만으로 정체를 말하지 않는다(dataviz).
          최신값을 같이 적어 선 끝 라벨을 포기한 자리를 대신 맡는다. */}
      {multi && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5" data-testid="sov-legend">
          {denomRanking.map((b) => {
            const v = shareAt(last.runId, b.name)
            return (
              <li key={b.name} className="flex items-baseline gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: brandColorOf(b.name, b.isSelf) }}
                />
                <span className={b.isSelf ? 'font-medium' : 'text-muted-foreground'}>
                  {b.name}
                  {b.isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">우리</span>}
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {v === null ? '—' : formatPercent(v)}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        {multi ? (
          <>
            각 선은 그 회차 전체 브랜드 언급 중 해당 브랜드의 몫입니다(분모: 우리 +{' '}
            {denomRun.competitors.join(', ')}). 캡슐 띠는 우리 계열의 95% 신뢰구간입니다 —
            경쟁사 선에는 구간을 그리지 않습니다.
          </>
        ) : (
          <>분모: 등록 경쟁사({denomRun.competitors.join(', ') || '없음'}) 대비 언급 비중입니다.</>
        )}
        {hasCompetitorBreak &&
          ' 경쟁사 설정이 바뀐 구간은 이전과 비교하지 않습니다 — 분모가 달라지면 점유율은 설정 변경만으로도 움직입니다.'}
        {hasOtherConditionBreak &&
          ' 측정 조건(엔진 구성·질의 집합·판정기 버전)이 바뀐 구간은 이전과 비교하지 않습니다 — 분모나 분자의 정의가 달라지면 점유율은 설정 변경만으로도 움직입니다.'}
        {hasGap &&
          ' 점유율을 잴 수 없던 회차가 있는 구간도 잇지 않습니다 — 경쟁사를 등록하기 전 회차와 스냅샷이 없는 회차가 그렇습니다. 점 사이 간격이 실제로 지난 기간과 다릅니다.'}
      </p>
    </div>
  )
}
