import { buildSovTrend, type RunPoint, type SovPoint } from '@/lib/dashboard/data'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 점유율 추이 (디자인 언어 §4.3). 추이 차트와 같은 점+밴드 문법의 소형판.
 *
 * ★ **선을 끊어야 하는 자리가 둘 있다 — `trend-chart.tsx`와 같은 규칙이다.**
 *   같은 서수 축을 쓰는 이상 같은 거짓말이 가능하다.
 *     - `comparableWithPrev === false` — 경쟁사 집합·엔진 구성·질의 집합·판정기
 *       버전이 바뀌었다. 분모가 달라지면 점유율은 설정 변경만으로도 움직인다.
 *     - `runsSkippedBefore > 0` — 그 사이에 잴 값이 없던 회차가 있다. 조건은
 *       같아서 비교는 가능하지만, 등간격 축이 2주를 1주로 보이게 한다.
 *       원인 중 하나가 **경쟁사 미등록**이다 — 경쟁사가 없으면 SoV는 정의되지
 *       않아 그 회차가 통째로 빠진다. 나중에 경쟁사를 등록한 고객에게 실제로
 *       일어나는 일이고, 그 자리를 감추면 "쭉 재고 있었다"가 된다.
 *   두 경우 모두 선분을 잇지 않고, 왜 끊겼는지를 캡션에 쓴다.
 *
 * ★ 경쟁사 집합이 바뀐 구간의 캡션은 §4.3의 **고정 문구 그대로**다 —
 *   "경쟁사 설정이 바뀐 구간은 이전과 비교하지 않습니다 — 분모가 달라지면
 *   점유율은 설정 변경만으로도 움직입니다." 다른 조건(엔진·질의·판정기)만 바뀐
 *   구간은 추이 차트와 같은 일반 문구를 쓴다.
 *
 * 오차 밴드는 원래부터 점마다 따로 그린다(사각형) — 이어지는 띠가 없으므로
 * 추이 차트처럼 밴드를 구간별로 자를 필요가 없다.
 */
const W = 640
const H = 150
const PAD = { top: 10, right: 12, bottom: 24, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

/**
 * 이을 수 있는 구간으로 자른다 — Task 9 `trend-chart.tsx`의 `splitSegments`와
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
  //   (그릴 점이 하나도 없으면 위에서 이미 null을 반환했다 — `?? latest`는
  //   Map 조회의 타입 좁히기일 뿐, 실제로는 항상 원본 회차가 잡힌다.)
  const denomRun = byRun.get(last.runId) ?? latest

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`언급 점유율 추이 — 최신 ${formatPercent(last.interval.point)} (${formatInterval(last.interval)})`}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={11}>
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        {/* ★ 계열 전체를 잇는 폴리라인 하나가 아니다. 조건이 바뀌었거나
            (`comparableWithPrev === false`) 그 사이 회차가 빠진
            (`runsSkippedBefore > 0`) 자리에서는 선분이 없다. */}
        {segments.map((idx) =>
          idx.length > 1 ? (
            <path
              key={`line-${idx[0]}`}
              data-testid="sov-line"
              // 드로우인은 추이 차트와 같은 CSS 클래스다 — 두 차트가 다른
              // 속도로 그려지면 같은 화면에서 물리 법칙이 갈린다. 점·밴드는
              // 첫 프레임부터 제자리이고 **연결선만** 그려진다 (§6).
              // `pathLength={1}`이 길이를 정규화하므로 이 서버 컴포넌트에
              // 'use client'를 열지 않아도 된다.
              className="chart-draw"
              pathLength={1}
              d={`M ${idx.map((i) => `${x(i)},${y(sov[i]!.interval.point)}`).join(' L ')}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
            />
          ) : null,
        )}
        {sov.map((p, i) => (
          <g key={p.runId}>
            <rect x={x(i) - 4} y={y(p.interval.upper)} width={8} height={Math.max(y(p.interval.lower) - y(p.interval.upper), 1)} fill="var(--primary)" opacity={isolated.has(i) ? 0.25 : 0.14} />
            <circle data-testid="sov-point" cx={x(i)} cy={y(p.interval.point)} r={4} fill="var(--primary)" />
            <title>{`${p.measuredAt.slice(5, 7)}.${p.measuredAt.slice(8, 10)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
          </g>
        ))}
        {/* X축 라벨 — 추이 차트와 같은 문법 (§4.1: 회차 날짜 MM.DD, mono). */}
        {sov.map((p, i) => (
          <text key={`x-${p.runId}`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
            {`${p.measuredAt.slice(5, 7)}.${p.measuredAt.slice(8, 10)}`}
          </text>
        ))}
      </svg>
      <p className="mt-3 max-w-prose text-xs text-muted-foreground">
        분모: 등록 경쟁사({denomRun.competitors.join(', ') || '없음'}) 대비 언급 비중입니다.
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
