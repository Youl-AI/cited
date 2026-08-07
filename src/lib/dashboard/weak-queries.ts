import type { RunPoint } from './data'
import type { Interval } from '@/lib/stats/wilson'

/**
 * 가장 약한 질문 — 최신 회차에서 언급률이 낮은 질의 셋. 순수 모듈(I/O 없음).
 *
 * ## 왜 이게 개요에 올라오는가
 *
 * 고객이 실제로 고칠 수 있는 단위는 지표가 아니라 **질문**이다 — 어느 질문에서
 * 안 나오는지를 알아야 어떤 콘텐츠를 쓸지 정해진다. 그 정보(히트맵)가 탭 안에
 * 숨어 있으면 대시보드는 보고서지 도구가 아니다. 상위 셋만 개요로 끌어올리고
 * 전체는 질문별 탭이 맡는다.
 *
 * ## 정직성 규칙
 *
 * - **n=0(그 회차에 안 물은 질의)은 후보가 아니다.** 측정 없음은 0%가 아니다.
 * - 정렬은 점추정 오름차순, 동률이면 **표본 큰 쪽 먼저** — 1/6과 0/2가 있으면
 *   더 많이 물어봐서 낮게 나온 쪽이 더 확실한 약점이다.
 * - 색·판정을 붙이지 않는다. 질의당 표본(n=답변 수)이 작아 구간이 넓다 —
 *   k/n 원시값을 그대로 보여 주는 것이 이 자리의 정직한 최대치다.
 */
export interface WeakQuery {
  queryText: string
  interval: Interval
}

export function weakestQueries(points: readonly RunPoint[], count = 3): WeakQuery[] {
  const latest = points[points.length - 1]
  if (!latest) return []
  return latest.result.byQuery
    .filter((q) => q.interval.n > 0)
    .map((q) => ({ queryText: q.queryText, interval: q.interval }))
    .sort(
      (a, b) => a.interval.point - b.interval.point || b.interval.n - a.interval.n,
    )
    .slice(0, count)
}
