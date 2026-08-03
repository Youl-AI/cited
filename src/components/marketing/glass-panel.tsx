import { cn } from '@/lib/utils'

/**
 * 이중 베젤 패널 (soft-skill §4.A "Doppelrand").
 *
 * ★ 표면 역할 규칙(specimen-sheet.tsx 머리말): 이 유리는 **행동 표면**
 *   (신청 폼·요금제·진단 신청)에만 쓴다. 실측 데이터를 싣는 문서 표면은
 *   각진 `SpecimenSheet`다. 모든 표면에 유리를 씌우는 순간 §0.D의
 *   "generic glassmorphism on everything" 텔로 돌아간다.
 *
 * 프리미엄 표면에서 카드는 배경 위에 **평평하게 놓이지 않는다.** 알루미늄
 * 트레이에 앉은 유리판처럼, 바깥 껍데기와 안쪽 알맹이가 각각 자기 테두리를
 * 갖는다. 그래서 두 겹이다:
 *
 * - **바깥 껍데기**: 아주 옅은 채움 + 헤어라인 + `p-1.5`(6px) + 큰 반경(2rem).
 * - **안쪽 알맹이**: 자기 배경(`--card`) + 위쪽 모서리의 반사광(elevation-1의
 *   inset 하이라이트) + **동심원이 되는 반경** `calc(2rem - 0.375rem)`.
 *   이 계산이 어긋나면 두 모서리가 어긋나 보이고, 그 순간 기계가 아니라
 *   덧댄 div가 된다.
 *
 * ★ 여기에 `backdrop-filter`를 걸지 않는다. 이 패널은 스크롤하는 콘텐츠라
 *   블러를 걸면 매 프레임 배경을 다시 합성한다(soft-skill §6). 유리 블러는
 *   고정 요소(마케팅 머리글)에만 있는 `.glass`가 담당한다.
 */
export function GlassPanel({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[2rem] border border-border bg-foreground/[0.03] p-1.5 shadow-elevation-3',
        className,
      )}
    >
      <div
        className={cn(
          'overflow-hidden rounded-[calc(2rem-0.375rem)] bg-card shadow-elevation-1',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
