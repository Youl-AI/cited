import Link from 'next/link'
import { engineColor } from '@/lib/dashboard/engine-color'
import { engineLabel } from '@/lib/plans'

/**
 * 전역 엔진 필터 — 머리글의 세그먼트 트레이. 상태는 URL(`?engine=`)이다
 * (브랜드·범위·보기와 같은 방식 — 서버가 그대로 그리고, 링크 공유가 화면
 * 공유다).
 *
 * ## 어디까지 거는가 (정직성 경계)
 *
 * 엔진별로 **분해가 저장되어 있는 지표만** 따라간다: 언급률(헤드라인·추이
 * 차트·기간 비교). 점유율·순위·출처·질문별은 스냅샷에 엔진별 분해가 없다 —
 * 필터가 걸린 척 전체 값을 보여주는 것이 최악이므로, 그 카드들은 "전체 엔진
 * 기준" 안내 한 줄로 정직하게 남는다(호출부가 단다).
 *
 * ★ 조판은 RangePicker와 같은 트레이 어휘 — 같은 줄에 서는 컨트롤은 같은
 *   모양이어야 한다.
 */

/** `?engine=` 값 → 엔진 id. 모르는 값·미지원 엔진은 전체로 떨어진다. */
export function resolveEngine(value: string | undefined, engines: readonly string[]): string {
  return value && engines.includes(value) ? value : 'all'
}

export function EnginePicker({
  engines,
  selected,
  brandId,
  range,
  view,
  hrefBase = '/dashboard',
}: {
  engines: readonly string[]
  selected: string
  brandId: string
  range: string
  view: string
  hrefBase?: string
}) {
  // 엔진이 하나면 필터가 고를 것이 없다.
  if (engines.length < 2) return null

  const item =
    'flex items-center gap-1.5 rounded-[calc(var(--radius)*1.4-4px)] border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-micro)] ease-instrument'
  const options = [
    { id: 'all', label: '전체 엔진' },
    ...engines.map((id) => ({ id, label: engineLabel(id) })),
  ]

  return (
    <div
      role="group"
      aria-label="엔진 필터"
      className="flex gap-1 rounded-[calc(var(--radius)*1.4)] border border-border bg-muted/40 p-1"
    >
      {options.map((option) => {
        const active = option.id === selected
        return (
          <Link
            key={option.id}
            href={`${hrefBase}?brand=${brandId}&range=${range}&view=${view}&engine=${option.id}`}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? `${item} border-border bg-card text-foreground shadow-elevation-1`
                : `${item} border-transparent text-muted-foreground hover:text-foreground`
            }
          >
            {option.id !== 'all' && (
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: engineColor(option.id) }}
              />
            )}
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}
