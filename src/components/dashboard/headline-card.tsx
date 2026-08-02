import { IntervalBar } from '@/components/interval-bar'
import { buildHeadline, type RunPoint } from '@/lib/dashboard/data'
import { changeSentence } from '@/lib/stats/change-copy'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/** 최신 언급률 + 구간 헤드라인 — 리포트 요약 카드와 같은 문법 (§3). */
export function HeadlineCard({ points }: { points: RunPoint[] }) {
  const { latest, prev, verdict } = buildHeadline(points)
  if (!latest) return null
  const ci = latest.result.citedRate
  return (
    <section className="rounded-lg border border-border bg-card p-6 sm:p-7">
      <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율 — 최신 회차</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-5xl font-semibold tracking-tighter tabular-nums">
          {formatPercent(ci.point)}
        </span>
        <span className="font-mono text-sm text-muted-foreground">{formatInterval(ci)}</span>
      </div>
      <div className="mt-4">
        <IntervalBar interval={ci} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {prev === null
          ? '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
          : changeSentence(verdict)}
      </p>
    </section>
  )
}
