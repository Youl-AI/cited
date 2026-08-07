import { DeltaBadge } from '@/components/dashboard/delta-badge'
import { IntervalBar } from '@/components/interval-bar'
import type { RunPoint } from '@/lib/dashboard/data'
import { buildPeriodComparison } from '@/lib/dashboard/period-compare'
import { changeSentence } from '@/lib/stats/change-copy'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 기간(묶음) 비교 카드 — 계산·정직성 규칙은 `period-compare.ts`.
 *
 * ★ 두 묶음을 **같은 조판의 두 행**으로 나란히 둔다(위 = 이전, 아래 = 최근).
 *   구간 띠 두 개가 세로로 붙어 있으면 겹침 여부가 눈으로 재진다 — 판정
 *   배지가 말하는 것을 그림이 반복한다.
 * ★ 판정 문장은 헤드라인과 같은 `changeSentence` — 화면마다 '변화'의 뜻이
 *   갈리면 안 된다.
 */
export function PeriodCompareCard({
  points,
  engine,
}: {
  points: RunPoint[]
  /** 전역 엔진 필터 값('all' 또는 엔진 id). 그 엔진의 k/n만 묶는다. */
  engine?: string
}) {
  const cmp = buildPeriodComparison(points, { engine })
  if (!cmp) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        회차가 4개 이상 쌓이면 묶음 비교가 열립니다 — 회차 하나의 출렁임을 줄여 변화를
        판정합니다.
      </p>
    )
  }
  const mmdd = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
  const rows = [
    { label: `이전 ${cmp.window}회`, range: `${mmdd(cmp.prev.from)}~${mmdd(cmp.prev.to)}`, w: cmp.prev },
    { label: `최근 ${cmp.window}회`, range: `${mmdd(cmp.curr.from)}~${mmdd(cmp.curr.to)}`, w: cmp.curr },
  ]
  return (
    <div data-testid="period-compare">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline gap-x-2.5">
              <span className="text-sm font-medium">{row.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{row.range}</span>
              <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                {formatPercent(row.w.interval.point)}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatInterval(row.w.interval)}
              </span>
            </div>
            <div className="mt-1.5">
              <IntervalBar interval={row.w.interval} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <DeltaBadge delta={{ amount: cmp.deltaPoints, verdict: cmp.verdict, kind: 'judged' }} unit="%p" />
        <p className="text-xs leading-relaxed text-muted-foreground">{changeSentence(cmp.verdict)}</p>
      </div>
    </div>
  )
}
