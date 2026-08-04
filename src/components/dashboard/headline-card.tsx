import { IntervalBar } from '@/components/interval-bar'
import { Card, CardContent } from '@/components/ui/card'
import { buildHeadline, type RunPoint } from '@/lib/dashboard/data'
import { changeSentence } from '@/lib/stats/change-copy'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 최신 언급률 + 구간 헤드라인 — 리포트 요약 카드와 같은 문법 (§3).
 *
 * ★ 손으로 적던 `rounded-lg border border-border bg-card`를 `Card`
 *   프리미티브(double-bezel)로 흡수했다. 대시보드에서 카드 어휘가 두 벌로
 *   갈려 있던 것이 Task 6 리포트의 인계 사항이었다.
 * ★ 밀도는 `--card-spacing`으로 올린다(베젤은 4px 그대로). 이 카드는 화면에서
 *   가장 큰 수치 하나를 담는 자리라 기본 16px로는 숫자가 모서리에 붙는다 —
 *   `--card-bezel`을 키우면 **모든** 카드의 트레이가 두꺼워지므로 그쪽이
 *   아니라 여백 변수를 쓴다. 예전 값(p-6 → sm:p-7)과 같은 24/28px이다.
 */
export function HeadlineCard({ points }: { points: RunPoint[] }) {
  const { latest, prev, verdict } = buildHeadline(points)
  if (!latest) return null
  const ci = latest.result.citedRate
  return (
    <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(7)]">
      <CardContent>
        <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율 — 최신 회차</p>
        {/* 수치와 구간은 **같은 베이스라인**에 앉는다. 점추정만 크게 띄우고
            구간을 아래로 내리면 "큰 숫자 하나"가 먼저 읽힌다 — §8 체크리스트의
            첫 항목이 정확히 그것이다. */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-5xl leading-none font-semibold tracking-tighter tabular-nums sm:text-6xl">
            {formatPercent(ci.point)}
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatInterval(ci)}
          </span>
        </div>
        <div className="mt-5">
          <IntervalBar interval={ci} />
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {prev === null
            ? '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
            : changeSentence(verdict)}
        </p>
      </CardContent>
    </Card>
  )
}
