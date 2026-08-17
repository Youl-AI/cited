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
    // 비교가 열리는 최소 회차 — period-compare.ts의 조건(len>=4)과 같은 수다.
    const NEEDED = 4
    const have = Math.min(points.length, NEEDED)
    return (
      // 카드가 fill로 늘어나므로(개요 왼쪽 기둥 마지막 카드) 안내문 하나가
      // 좌상단에 뜨면 아래가 빈 창고처럼 보인다(실측 피드백). 수직 중앙 +
      // 회차 진행 눈금 — "언제 열리는가"를 문장이 아니라 눈금이 먼저 말한다.
      // 눈금은 실측 개수다: 색·판정 없음(개수에는 방향이 없다 — delta-badge 규칙).
      <div className="flex h-full flex-col justify-center gap-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          회차가 <span className="font-mono tabular-nums">{NEEDED}</span>개 이상 쌓이면 묶음
          비교가 열립니다 — 회차 하나의 출렁임을 줄여 변화를 판정합니다.
        </p>
        <div>
          <div aria-hidden="true" className="flex gap-1.5">
            {Array.from({ length: NEEDED }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i < have ? 'bg-foreground/40' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="mt-2 font-mono text-xs tracking-[0.08em] text-muted-foreground tabular-nums">
            회차 {have}/{NEEDED}
          </p>
        </div>
      </div>
    )
  }
  const mmdd = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
  const rows = [
    { label: `이전 ${cmp.window}회`, range: `${mmdd(cmp.prev.from)}~${mmdd(cmp.prev.to)}`, w: cmp.prev },
    { label: `최근 ${cmp.window}회`, range: `${mmdd(cmp.curr.from)}~${mmdd(cmp.curr.to)}`, w: cmp.curr },
  ]
  return (
    // 실데이터 상태도 카드 높이를 따라간다 — 남는 높이는 두 행과 판정 줄
    // 사이가 아니라 위아래로 나눠(justify-center) 조판 밀도를 지킨다.
    <div data-testid="period-compare" className="flex h-full flex-col justify-center">
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
