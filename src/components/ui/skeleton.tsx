import { cn } from "@/lib/utils"

/**
 * 스켈레톤 — 셔머(`.skeleton`, globals.css).
 *
 * ★ `animate-pulse`를 걷어낸 이유와 감속 곡선·reduced-motion 처리는 그쪽
 *   주석에 있다. 요약: 명멸은 "로딩 중"만 말하고, 훑고 지나가는 빛은
 *   **읽는 방향**을 함께 말한다.
 * ★ 이 컴포넌트는 **모양을 정하지 않는다.** 스켈레톤이 값을 하려면 실제로
 *   올 콘텐츠와 같은 치수여야 한다(redesign-skill: "skeleton loaders that
 *   match the layout shape"). 즉 호출부가 이렇게 쓴다:
 *
 *     <Skeleton className="h-7 w-32" />            // 수치 한 줄
 *     <Skeleton className="h-4 w-full max-w-64" /> // 본문 한 줄
 *     <Skeleton className="h-48 rounded-xl" />     // 차트 판
 *
 *   화면 하나에 같은 크기의 회색 박스를 늘어놓는 것은 스켈레톤이 아니라
 *   스피너를 네모나게 그린 것이다.
 * ★ 접근성: 보조기기에는 읽어 줄 내용이 없다. 로딩 상태는 이 상자가 아니라
 *   그것을 감싸는 영역이 `aria-busy`로 말해야 한다 — 여기서 `aria-hidden`을
 *   강제하면 호출부가 그 판단을 못 하므로 기본값만 두고 열어 둔다.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "skeleton rounded-[min(var(--radius-md),8px)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
