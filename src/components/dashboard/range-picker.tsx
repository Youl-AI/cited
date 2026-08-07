import Link from 'next/link'

/**
 * 보기 범위 — 최근 N회차만 그린다.
 *
 * ## 왜 "일"이 아니라 "회차"인가
 *
 * 7일/30일/90일이 대시보드의 관습이지만 우리 데이터는 **회차 단위**다. 측정
 * 주기는 플랜이 정하고(주 3회 등) 실패한 회차는 스냅샷이 없어 점 자체가
 * 없다. "최근 30일"이라 써 놓고 점이 두 개만 찍히면 그건 우리 화면이 기간을
 * 약속하고 못 지킨 것이다. 회차로 세면 라벨과 화면이 어긋날 수 없다.
 *
 * ## 선택지를 **없애지 않는다** (이 파일이 한 번 틀렸던 자리)
 *
 * 관습적인 기간 선택기(GA·Plausible·Vercel·PostHog)의 공통점은 선택지 집합이
 * **고정**이라는 것이다. 데이터가 모자란 선택지는 *비활성*으로 남지 사라지지
 * 않는다. 이유가 둘이다:
 *
 * 1. **되돌아올 길이 항상 있어야 한다.** 예전 구현은 "자를 것이 없으면
 *    컨트롤을 만들지 않는다"였는데, `?range=4`인 상태에서 회차가 4개뿐이면
 *    컨트롤이 통째로 사라져 **전체로 돌아갈 버튼이 없었다**. 화면을 좁힌 것은
 *    사용자인데 넓힐 방법을 우리가 치운 것이다.
 * 2. **비활성 선택지가 정보다.** "최근 12회"가 흐릿하게 있으면 회차가 쌓이면
 *    열린다는 사실이 보인다. 없애 버리면 그 선택지가 존재한다는 것조차 모른다.
 *
 * 그래서 규칙은: **선택지는 언제나 셋 다 그린다.** 자를 회차가 모자란 선택지는
 * 링크가 아니라 `aria-disabled`인 조각이고, 사유를 `title`로 단다. 컨트롤
 * 자체를 숨기는 경우는 하나뿐 — 고를 수 있는 것이 '전체'뿐이고 지금 보고
 * 있는 것도 '전체'일 때. 그때는 컨트롤이 아무 일도 못 하고, 갇힐 사람도 없다.
 *
 * ★ 상태를 URL(`?range=`)에 둔다 — 브랜드 전환(`?brand=`)과 같은 방식이고,
 *   서버 컴포넌트가 그대로 잘라서 그리므로 클라이언트 번들이 늘지 않는다.
 *   링크를 공유하면 같은 화면이 열린다.
 * ★ 조판은 `BrandPicker`의 세그먼트 트레이와 **같은 어휘**다. 같은 줄에 서는
 *   두 컨트롤이 다른 모양이면 둘 중 하나가 다른 종류의 물건으로 읽힌다.
 */

/** 선택지. `null`은 전체 보기다. */
export const RANGE_OPTIONS: readonly { value: string; runs: number | null; label: string }[] = [
  { value: '4', runs: 4, label: '최근 4회' },
  { value: '12', runs: 12, label: '최근 12회' },
  { value: 'all', runs: null, label: '전체' },
]

/** 기본값은 전체다 — 우리가 임의로 잘라 보여주지 않는다. */
export const DEFAULT_RANGE = 'all'

/** `?range=` 값 → 자를 회차 수. 모르는 값은 전체로 떨어진다. */
export function resolveRange(value: string | undefined): number | null {
  return RANGE_OPTIONS.find((o) => o.value === value)?.runs ?? null
}

/** 점 목록을 범위만큼 자른다. 최신 쪽을 남긴다(points는 오래된 → 최신 순). */
export function sliceToRange<T>(points: readonly T[], runs: number | null): T[] {
  return runs === null ? [...points] : points.slice(-runs)
}

/**
 * 이 선택지가 지금 쓸모가 있는가 — 가진 회차보다 넓게 자르는 선택지는
 * '전체'와 같은 화면을 낸다. 지금 그 값이 선택돼 있으면(URL을 손으로 고쳤거나
 * 회차가 줄었거나) **활성으로 남긴다** — 현재 상태를 비활성으로 그리면
 * "지금 여기 있는데 여기 못 온다"가 된다.
 */
export function isRangeUsable(runs: number | null, totalRuns: number): boolean {
  return runs === null || runs < totalRuns
}

export function RangePicker({
  selected,
  brandId,
  totalRuns,
  hrefBase = '/dashboard',
  view,
}: {
  selected: string
  brandId: string
  totalRuns: number
  /** 링크가 걸리는 경로. 기본은 대시보드 — 디자인 프리뷰만 다르게 준다. */
  hrefBase?: string
  /** 현재 보기(`?view=`). 넘기면 범위를 갈아타도 보고 있던 탭이 유지된다 —
   *  히트맵을 보다가 범위를 바꿨는데 개요로 튕기면 그건 이동이지 조정이 아니다. */
  view?: string
}) {
  const viewQuery = view ? `&view=${view}` : ''
  // 유일하게 숨기는 경우: 고를 수 있는 것이 '전체'뿐이고 지금도 '전체'다.
  // (좁혀 놓은 상태라면 되돌아갈 길이 필요하므로 무조건 그린다.)
  const anyUsable = RANGE_OPTIONS.some((o) => o.runs !== null && isRangeUsable(o.runs, totalRuns))
  if (!anyUsable && selected === DEFAULT_RANGE) return null

  const item =
    'rounded-[calc(var(--radius)*1.4-4px)] border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-micro)] ease-instrument'

  return (
    <div
      role="group"
      aria-label="보기 범위"
      className="flex gap-1 rounded-[calc(var(--radius)*1.4)] border border-border bg-muted/40 p-1"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === selected
        if (!active && !isRangeUsable(option.runs, totalRuns)) {
          return (
            <span
              key={option.value}
              aria-disabled="true"
              // 사유를 적는다 — 흐릿한 조각만 있으면 고장으로 읽힌다.
              title={`회차가 ${option.runs}개 이상 쌓이면 열립니다 (현재 ${totalRuns}개)`}
              className={`${item} cursor-not-allowed border-transparent text-muted-foreground/45`}
            >
              {option.label}
            </span>
          )
        }
        return (
          <Link
            key={option.value}
            href={`${hrefBase}?brand=${brandId}&range=${option.value}${viewQuery}`}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? `${item} border-border bg-card text-foreground shadow-elevation-1`
                : `${item} border-transparent text-muted-foreground hover:text-foreground`
            }
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}
