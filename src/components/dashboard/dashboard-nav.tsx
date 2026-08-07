import Link from 'next/link'

/**
 * 대시보드 안의 보기 전환 레일 — 커맨드센터 셸의 왼쪽 기둥.
 *
 * ## 왜 탭인가 (스크롤 대신)
 *
 * 예전 대시보드는 여섯 블록을 세로로 쌓았다. 핵심 화면(추이·지표)을 보려고
 * 스크롤할 일은 없었지만, 히트맵·출처·회차 목록은 두세 화면 아래 있었다.
 * 같은 카테고리 제품들(Peec·Otterly)은 개요를 한 화면 그리드에 눌러 담고
 * 나머지를 왼쪽 내비게이션으로 가른다 — 그 문법을 따른다.
 *
 * ★ 상태는 URL(`?view=`)이다 — 브랜드(`?brand=`)·범위(`?range=`)와 같은
 *   방식. 서버 컴포넌트가 해당 보기만 그리므로 클라이언트 번들·상태가 없고,
 *   링크를 공유하면 같은 화면이 열린다.
 * ★ 좁은 화면에서는 세로 레일이 가로 스크롤 칩 줄로 눕는다 — 레일을 고정
 *   기둥으로 두면 본문 폭이 320px에서 살아남지 못한다.
 */

export const DASHBOARD_VIEWS = [
  { value: 'overview', label: '개요' },
  // 점유율은 개요가 아니라 자기 탭이다 — 개요의 주인공은 언급률(헤드라인
  // 77%와 같은 지표) 하나여야 하고, 점유율은 경쟁사를 등록해야만 정의되는
  // 파생 지표라 첫 화면의 두 번째 대형 차트가 되면 주장이 갈라진다.
  { value: 'sov', label: '점유율' },
  { value: 'queries', label: '질문별' },
  { value: 'sources', label: '출처' },
  { value: 'runs', label: '측정 회차' },
] as const

export type DashboardView = (typeof DASHBOARD_VIEWS)[number]['value']

/** `?view=` 값 → 보기. 모르는 값은 개요로 떨어진다(범위 선택기와 같은 규칙). */
export function resolveView(value: string | undefined): DashboardView {
  return DASHBOARD_VIEWS.find((v) => v.value === value)?.value ?? 'overview'
}

export function DashboardNav({
  active,
  brandId,
  range,
  hrefBase = '/dashboard',
}: {
  active: DashboardView
  brandId: string
  range: string
  hrefBase?: string
}) {
  return (
    <nav
      aria-label="대시보드 보기"
      // lg 미만: 가로 칩 줄(스크롤 가능). lg 이상: 세로 레일, 스크롤해도
      // 따라오는 sticky — 탭이 화면 밖으로 나가면 전환 수단이 사라진다.
      className="flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:w-36 lg:shrink-0 lg:flex-col lg:overflow-visible"
    >
      {DASHBOARD_VIEWS.map((view) => {
        const isActive = view.value === active
        return (
          <Link
            key={view.value}
            href={`${hrefBase}?brand=${brandId}&range=${range}&view=${view.value}`}
            aria-current={isActive ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors duration-[var(--motion-micro)] ease-instrument ${
              isActive
                ? 'bg-foreground/[0.06] font-medium text-foreground'
                : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
            }`}
          >
            {view.label}
          </Link>
        )
      })}
    </nav>
  )
}
