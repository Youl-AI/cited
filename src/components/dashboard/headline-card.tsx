import { IntervalBar } from '@/components/interval-bar'
import { Card, CardContent } from '@/components/ui/card'
import { buildHeadline, type RunPoint } from '@/lib/dashboard/data'
import { engineColor } from '@/lib/dashboard/engine-color'
import { engineLabel } from '@/lib/plans'
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
 *
 * ## 오른쪽 칸 — 엔진별 최신값
 *
 * 대시보드 폭이 6xl(1152px)이라 왼쪽 숫자 덩어리만 있으면 카드의 오른쪽 60%가
 * 빈 채로 남는다. 그 자리를 **새 정보**로 채운다: 같은 회차를 엔진별로 쪼갠
 * 값이다. 장식이 아니라 이 화면에서 가장 자주 나오는 다음 질문("어느 엔진이
 * 끌어내리고 있나")의 답이고, 아래 추이 차트의 `엔진 비교` 모드로 이어지는
 * 입구이기도 하다.
 *
 * ★ **히어로는 여전히 하나다.** 오른쪽 값은 `text-base`로, 왼쪽(`text-5xl~6xl`)
 *   과 겨루지 않는다. 같은 크기로 늘어놓으면 "이 화면의 주장이 무엇인가"가
 *   사라진다(dataviz: one hero figure per view).
 * ★ 엔진이 하나뿐이면 이 칸을 만들지 않는다 — 전체값과 같은 숫자를 한 번 더
 *   적는 칸이 된다.
 */
export function HeadlineCard({ points }: { points: RunPoint[] }) {
  const { latest, prev, verdict } = buildHeadline(points)
  if (!latest) return null
  const ci = latest.result.citedRate

  // 최신 회차의 엔진별 값. n=0인 엔진은 뺀다 — 0%가 아니라 **잰 것이 없다**이다.
  const byEngine = Object.entries(latest.result.byEngine)
    .filter(([, interval]) => interval && interval.n > 0)
    .map(([id, interval]) => ({ id, interval: interval! }))
  const showEngines = byEngine.length >= 2

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
        </div>

        {showEngines && (
          // 왼쪽과 세로선으로 가른다 — 카드 하나 안의 두 칸이지 카드 둘이 아니다.
          // (색은 --border가 아니라 --foreground 알파다: 표면이 뒤집혀도 같이
          // 뒤집히는 헤어라인 가족 — 대시보드 섹션 구분선과 같은 계열.)
          <div className="lg:border-l lg:border-foreground/[0.07] lg:pl-10">
            <p className="text-sm text-muted-foreground">엔진별 — 같은 회차</p>
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
                    {/* 값은 히어로의 절반이 안 되는 크기다 — 이 칸은 맥락이지
                        두 번째 주장이 아니다. */}
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
            {/* 엔진 사이의 차이도 구간이 겹치면 차이가 아니다 — 큰 숫자 옆에
                구간을 붙여 놓고 이 한 줄을 빼면, 나란히 놓인 두 값이 저절로
                "ChatGPT가 더 낫다"로 읽힌다. */}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              엔진끼리도 구간이 겹치면 차이로 읽지 마세요.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
