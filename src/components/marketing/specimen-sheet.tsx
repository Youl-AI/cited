import { cn } from '@/lib/utils'

/**
 * 계측 시트 — 실측 데이터를 싣는 문서 표면.
 *
 * ## 표면 역할 규칙 (Shape Consistency Lock, tasteskill §4.4)
 *
 * 처음에는 모든 표면이 `GlassPanel`(라운드 2rem 이중 베젤)이었다. 히어로
 * 증거물·신청 폼·질의 공개·재현 장면·마감 CTA가 전부 같은 둥근 유리 카드 —
 * tasteskill §0.D가 LLM 기본값으로 콕 집는 "generic glassmorphism on
 * everything"이었다. 그래서 표면을 역할로 갈랐다:
 *
 * - **문서(이 컴포넌트)**: 실측 답변·질의·계측값을 싣는 표면. 각(radius 0),
 *   헤어라인 테두리. 기록지는 둥글지 않다.
 * - **컨트롤(버튼·입력·탭)**: 시트와 같은 각(radius 0) — 기계의 몸체와
 *   버튼이 같은 모서리를 갖는다(cta-link.tsx 모서리 규칙). 유리 패널
 *   (`GlassPanel`)은 요금제·신청 페이지가 시트로 넘어가며 은퇴했다.
 *
 * 페이지 안에서 표면의 모양이 곧 그 콘텐츠의 종류를 말한다.
 *
 * ## 백플레이트
 *
 * 뒤에 살짝 어긋난(오른쪽 아래 8px) 헤어라인 판 한 장. 이 제품이 파는 것이
 * "한 장의 예쁜 결과"가 아니라 **반복 측정의 기록**이라는 사실을 겹친 기록지로
 * 말한다 — 페이지에서 허용한 단 하나의 장식적 리스크이고, 근거는 위 문장이다
 * (frontend-design: 대담함은 한 곳에, 근거와 함께). 순수 장식 헤어라인 금지
 * (§9.F)와의 경계는 이 근거 유무다.
 */
export function SpecimenSheet({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden
        className="absolute inset-0 translate-x-2 translate-y-2 border border-border/60 bg-foreground/[0.02]"
      />
      {/* `overflow-hidden`을 걸지 않는다 — 각(radius 0)이라 클립할 모서리가
          없다. 안쪽에서 클립이 필요한 요소(재현 장면의 타이핑 가리개)는 자기
          컨테이너가 직접 클립한다. */}
      <div className="relative border border-border bg-card shadow-elevation-2">
        {children}
      </div>
    </div>
  )
}
