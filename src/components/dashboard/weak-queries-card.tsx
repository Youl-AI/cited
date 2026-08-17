import Link from 'next/link'
import type { RunPoint } from '@/lib/dashboard/data'
import { weakestQueries } from '@/lib/dashboard/weak-queries'
import { formatPercent } from '@/lib/stats/wilson'

/**
 * 약한 질문 TOP 3 — 개요의 실행 카드. 선정·정렬 규칙은 `weak-queries.ts`.
 *
 * ★ 색·판정 없음 — 질의당 표본이 작아(답변 6개 수준) 구간이 넓다. k/n
 *   원시값과 %만 적고, 판단은 질문별 탭(히트맵 + 회차 흐름)에 넘긴다.
 * ★ 질문 전문을 자르지 않는다(`line-clamp` 없음) — 질문이 곧 실행 단위라
 *   "…"로 잘리면 무엇을 고칠지 알 수 없다. 길면 줄바꿈으로 받는다.
 */
export function WeakQueriesCard({
  points,
  queriesHref,
}: {
  points: RunPoint[]
  /** "질문별 전체 보기" 링크 — 호출부가 view=queries URL을 만든다. */
  queriesHref: string
}) {
  const weak = weakestQueries(points, 3)
  if (weak.length === 0) {
    return <p className="text-sm text-muted-foreground">아직 표시할 회차가 없습니다.</p>
  }
  return (
    <div className="flex h-full flex-col">
      <ol className="space-y-3" data-testid="weak-query-rows">
        {weak.map((q) => (
          <li key={q.queryText} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 text-sm leading-snug">{q.queryText}</span>
            <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
              {formatPercent(q.interval.point)}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {q.interval.k}/{q.interval.n}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-auto pt-3">
        {/* 화살표 니지는 run-list.tsx 행 화살표와 같은 값이다(translate 0.5 ·
            --motion-micro · instrument) — 대시보드에서 "→가 살짝 밀리면
            이동 링크"라는 어휘를 한 곳만 다르게 두지 않는다. hover: 변형은
            Tailwind v4 기본이 (hover:hover) 게이트라 터치 기기에선 안 돈다. */}
        <Link
          href={queriesHref}
          className="group/wq text-xs font-medium text-muted-foreground transition-colors duration-[var(--motion-micro)] ease-instrument underline-offset-4 hover:text-foreground hover:underline"
        >
          질문별 전체 보기{' '}
          <span
            aria-hidden="true"
            className="inline-block transition-[translate] duration-[var(--motion-micro)] ease-instrument group-hover/wq:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </p>
    </div>
  )
}
