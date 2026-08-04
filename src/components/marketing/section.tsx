import { cn } from '@/lib/utils'

/**
 * 마케팅 섹션의 수직 리듬.
 *
 * ## 왜 상수인가
 *
 * Task 3은 섹션마다 `py-16 sm:py-20`을 손으로 적었고, 그 결과 랜딩이
 * "웹앱 간격"(tasteskill §7 VISUAL_DENSITY 4~7)으로 읽혔다. gpt-taste §2는
 * 섹션 사이를 **시네마틱 챕터**로 벌리라고 못박는다(`py-32 md:py-48`).
 * 값을 한 곳에 두지 않으면 섹션이 늘어날 때마다 리듬이 갈린다.
 *
 * 데스크톱 `py-40`(160px)은 gpt-taste가 말하는 구간(128~192px) 안이고,
 * 모바일 `py-28`(112px)은 그 비율을 좁은 화면에 맞게 줄인 값이다. 여기서
 * 더 벌리면 한 화면에 제목과 내용이 같이 잡히지 않는다.
 *
 * ★ 섹션 사이에 헤어라인(`border-t`)을 긋지 않는다. 간격이 이미 챕터를
 *   가르고, 선을 더하면 §9.F가 말하는 "designed feel을 내려고 그은 선"이 된다.
 */
export const SECTION_Y = 'py-28 md:py-40'

/** 본문 컨테이너. 랜딩의 모든 섹션이 같은 좌측 정렬선을 쓴다. */
export const SECTION_X = 'mx-auto w-full max-w-6xl px-6'

/**
 * 컨테이너까지 포함한 표준 섹션.
 *
 * 전폭이 필요한 섹션(핀 장면·핀 장면)은 이걸 쓰지 않고 `SECTION_Y`·
 * `SECTION_X`를 직접 조합한다. "전폭 모드" prop을 달아 두면 호출부가 둘 중
 * 무엇인지 읽으려고 이 파일까지 와야 한다.
 */
export function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className={cn('relative', SECTION_Y, className)}>
      <div className={SECTION_X}>{children}</div>
    </section>
  )
}
