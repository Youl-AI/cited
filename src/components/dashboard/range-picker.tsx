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
 * ## 최소 4회차인 이유
 *
 * 이보다 짧게 자르면 변화 판정에 쓸 직전 회차까지 잘려 나가고, 추이 차트가
 * 선이 아니라 점 몇 개가 된다. 자를 수 있는 최솟값이 "그래도 추세가 보이는"
 * 길이여야 한다.
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

export function RangePicker({
  selected,
  brandId,
  totalRuns,
}: {
  selected: string
  brandId: string
  totalRuns: number
}) {
  // 자를 것이 없으면 컨트롤을 만들지 않는다 — 회차가 4개뿐인데 "최근 4회 /
  // 전체"가 나란히 있으면 두 버튼이 같은 화면을 낸다.
  const usable = RANGE_OPTIONS.filter((o) => o.runs === null || o.runs < totalRuns)
  if (usable.length <= 1) return null

  const item =
    'rounded-[calc(var(--radius)*1.4-4px)] border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-micro)] ease-instrument'

  return (
    <div
      role="group"
      aria-label="보기 범위"
      className="flex gap-1 rounded-[calc(var(--radius)*1.4)] border border-border bg-muted/40 p-1"
    >
      {usable.map((option) => {
        const active = option.value === selected
        return (
          <Link
            key={option.value}
            href={`/dashboard?brand=${brandId}&range=${option.value}`}
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
