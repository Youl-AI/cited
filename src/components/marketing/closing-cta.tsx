import { CtaLink } from '@/components/marketing/cta-link'
import { GlassPanel } from '@/components/marketing/glass-panel'
import { AUDIT_FLOW } from '@/components/audit/flow'

/**
 * 마감 CTA (AIDA의 Action, gpt-taste §2 "Massive, high-contrast CTA").
 *
 * ## 라벨은 하나다
 *
 * "무료 진단 받기"는 머리글·히어로와 **같은 문구·같은 목적지**(`#request`)다.
 * 한 의도에 한 라벨이라는 규칙(tasteskill §4.5)은 문구를 바꾸지 말라는 뜻이지
 * 반복하지 말라는 뜻이 아니다. 여기서 "지금 시작하기" 같은 새 문구를 만들면
 * 그 순간 위반이 된다.
 *
 * 보조 링크("요금제 보기")는 **여기 두지 않는다.** 바로 위 한계 섹션이 유료
 * 플랜 이야기로 끝나면서 그 링크를 이미 내놓는다. 마감은 하나만 가리킨다.
 *
 * ## 고대비를 색면이 아니라 값으로 만든다
 *
 * 밝은 색 블록을 깔면 다크 페이지 한가운데가 라이트로 뒤집혀 Page Theme Lock
 * (§4.11)에 걸린다. 대비는 흰 제목 + 브랜드색 알약이 만든다. 앰비언트 워시
 * 위에 그라데이션을 한 겹 더 얹지도 않는다(Task 3 인계: 배경은 한 겹으로 끝).
 */
export function ClosingCta() {
  return (
    <GlassPanel className="bg-primary/[0.06]">
      <div className="px-8 py-16 text-center sm:px-16 sm:py-24">
        <h2 className="mx-auto max-w-[18em] text-3xl font-bold tracking-tighter text-balance sm:text-4xl">
          우리 브랜드가 불리고 있는지, 한 번 재 보세요
        </h2>
        <p className="mx-auto mt-6 max-w-[32em] text-lg leading-relaxed text-muted-foreground">
          {AUDIT_FLOW[0].short}만 넣으면 됩니다. 카드 정보는 받지 않습니다.
        </p>
        <div className="mt-10 flex justify-center">
          <CtaLink href="#request">무료 진단 받기</CtaLink>
        </div>
      </div>
    </GlassPanel>
  )
}
