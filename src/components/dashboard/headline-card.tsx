import { IntervalBar } from '@/components/interval-bar'
import { Card, CardContent } from '@/components/ui/card'
import { buildHeadline, sameConditions, type RunPoint } from '@/lib/dashboard/data'
import { engineColor } from '@/lib/dashboard/engine-color'
import { engineLabel } from '@/lib/plans'
import { changeSentence } from '@/lib/stats/change-copy'
import { formatInterval, formatPercent, judgeChange } from '@/lib/stats/wilson'

/**
 * 최신 언급률 + 구간 헤드라인 — 리포트 요약 카드와 같은 문법 (§3).
 *
 * ## 두 가지 조판
 *
 * - 기본(가로): 왼쪽에 히어로 숫자, 오른쪽에 엔진별 칸. 페이지 전폭을 쓰는
 *   자리(회차가 없는 화면 등)용.
 * - `compact`(세로): 커맨드센터 그리드의 오른쪽 기둥용. 폭 20rem 안에서
 *   히어로 → 구간 띠 → 판정 문장 → 엔진별 한 줄들이 세로로 쌓인다.
 *   히어로는 `text-4xl` — 기둥 폭에서 6xl은 숫자가 카드를 찢는다. 그래도
 *   화면의 다른 어떤 숫자보다 크다(히어로는 하나 규칙 유지).
 *
 * ★ 밀도는 `--card-spacing`으로 올린다(베젤은 4px 그대로) — card.tsx 주석.
 * ★ 엔진별 값에서 n=0인 엔진은 뺀다 — 0%가 아니라 **잰 것이 없다**이다.
 * ★ 엔진끼리도 구간이 겹치면 차이가 아니다 — 이 한 줄을 빼면 나란히 놓인
 *   두 값이 저절로 "ChatGPT가 더 낫다"로 읽힌다.
 */
export function HeadlineCard({
  points,
  compact = false,
  engine = 'all',
}: {
  points: RunPoint[]
  compact?: boolean
  /**
   * 전역 엔진 필터(`?engine=`). 엔진이 골라지면 히어로가 그 엔진의 언급률로
   * 바뀐다 — 판정도 그 엔진의 직전 회차와 비교한다(조건이 같을 때만,
   * `judgeChange` — 전체 헤드라인과 같은 잣대다).
   */
  engine?: string
}) {
  const { latest, prev, verdict } = buildHeadline(points)
  if (!latest) return null

  const byEngine = Object.entries(latest.result.byEngine)
    .filter(([, interval]) => interval && interval.n > 0)
    .map(([id, interval]) => ({ id, interval: interval! }))
  const showEngines = byEngine.length >= 2

  // 엔진 필터가 걸리면 히어로·판정을 그 엔진으로 좁힌다. 값이 없으면(n=0)
  // 전체로 떨어지지 않고 '없음'을 말한다 — 필터가 걸린 척 전체 값을 보여주는
  // 것이 최악이다.
  const engineSel = engine !== 'all' ? engine : null
  const engineInterval = engineSel ? (latest.result.byEngine[engineSel] ?? null) : null
  const ci = engineSel ? engineInterval : latest.result.citedRate
  const label = engineSel
    ? `AI 답변에 인용된 비율 — ${engineLabel(engineSel)} · 최신 회차`
    : 'AI 답변에 인용된 비율 — 최신 회차'
  const sentence = (() => {
    if (!engineSel) {
      return prev === null
        ? '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
        : changeSentence(verdict)
    }
    if (!ci || ci.n === 0) return '이 엔진의 최신 회차 값이 없습니다.'
    if (prev === null) return '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
    const prevInterval = prev.result.byEngine[engineSel]
    if (!prevInterval || prevInterval.n === 0)
      return '이 엔진의 직전 회차 값이 없어 변화를 판정할 수 없습니다.'
    if (!sameConditions(prev, latest))
      return changeSentence('incomparable')
    return changeSentence(
      judgeChange(prevInterval, ci, { prevEngines: prev.engines, currEngines: latest.engines }),
    )
  })()

  if (compact) {
    return (
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-4xl leading-none font-semibold tracking-tighter tabular-nums">
              {ci && ci.n > 0 ? formatPercent(ci.point) : '—'}
            </span>
            {ci && ci.n > 0 && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatInterval(ci)}
              </span>
            )}
          </div>
          {ci && ci.n > 0 && (
            <div className="mt-4">
              <IntervalBar interval={ci} />
            </div>
          )}
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{sentence}</p>

          {showEngines && (
            <ul
              className="mt-4 space-y-2 border-t border-foreground/[0.07] pt-4"
              data-testid="headline-engines"
            >
              {byEngine.map(({ id, interval }) => (
                <li key={id} className="flex items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: engineColor(id) }}
                  />
                  {/* 필터로 고른 엔진 행만 제 색 글자다 — 지금 히어로가 어느
                      행에서 왔는지가 목록 안에서 보인다. */}
                  <span className={id === engineSel ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                    {engineLabel(id)}
                  </span>
                  <span className="ml-auto font-mono text-sm font-medium tabular-nums">
                    {formatPercent(interval.point)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatInterval(interval)}
                  </span>
                </li>
              ))}
              <li className="pt-1 text-xs leading-relaxed text-muted-foreground">
                엔진끼리도 구간이 겹치면 차이로 읽지 마세요.
              </li>
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(7)]">
      <CardContent
        className={
          showEngines
            ? 'grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]'
            : undefined
        }
      >
        <div>
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">AI 답변에 인용된 비율 — 최신 회차</p>
          {/* 수치와 구간은 **같은 베이스라인**에 앉는다. 점추정만 크게 띄우고
              구간을 아래로 내리면 "큰 숫자 하나"가 먼저 읽힌다 — §8 체크리스트의
              첫 항목이 정확히 그것이다. */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-5xl leading-none font-semibold tracking-tighter tabular-nums sm:text-6xl">
              {formatPercent(latest.result.citedRate.point)}
            </span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatInterval(latest.result.citedRate)}
            </span>
          </div>
          <div className="mt-5">
            <IntervalBar interval={latest.result.citedRate} />
          </div>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {prev === null
              ? '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
              : changeSentence(verdict)}
          </p>
        </div>

        {showEngines && (
          <div className="lg:border-l lg:border-foreground/[0.07] lg:pl-10">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">엔진별 — 같은 회차</p>
            <ul className="mt-3 space-y-3.5" data-testid="headline-engines">
              {byEngine.map(({ id, interval }) => (
                <li key={id}>
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: engineColor(id) }}
                    />
                    <span className="text-sm text-muted-foreground">{engineLabel(id)}</span>
                    <span className="ml-auto font-mono text-base font-medium tabular-nums">
                      {formatPercent(interval.point)}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatInterval(interval)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <IntervalBar interval={interval} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              엔진끼리도 구간이 겹치면 차이로 읽지 마세요.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
