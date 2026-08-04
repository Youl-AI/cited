import { CtaLink } from '@/components/marketing/cta-link'
import { AUDIT_FLOW } from '@/components/audit/flow'

/**
 * 마감 CTA (AIDA의 Action, gpt-taste §2 "Massive, high-contrast CTA").
 *
 * ## 상자가 없다
 *
 * 원래는 유리 패널 상자였다. 그런데 그 상자가 히어로 증거물·폼·질의 공개와
 * 같은 껍데기라, 마지막 화면이 "또 그 카드"로 끝났다(§0.D generic-glass 텔).
 * 마감은 용기가 아니라 **타이포 순간**이다 — 위아래 헤어라인 사이에 큰 활자와
 * 버튼 하나. Editorial Manifesto Close. 페이지에서 이 크기의 활자는 여기와
 * 히어로뿐이고, 그 호응(열고 닫는 두 목소리)이 상자보다 강하다.
 *
 * 가운데 정렬은 §4.3 위반이 아니다 — 매니페스토/마감처럼 메시지 자체가
 * 디자인인 자리는 명시적 예외다.
 *
 * ## 라벨은 하나다
 *
 * "무료 진단 받기"는 머리글·히어로와 **같은 문구·같은 목적지**(`/audit/new`)다.
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
 * (§4.11)에 걸린다. 대비는 흰 대형 활자 + 브랜드색 버튼이 만든다. 앰비언트
 * 워시 위에 그라데이션을 한 겹 더 얹지도 않는다(Task 3 인계: 배경은 한 겹).
 */
export function ClosingCta() {
  return (
    <div className="border-y border-border py-20 text-center sm:py-28">
      <h2 className="mx-auto max-w-[16em] text-4xl font-bold tracking-tighter text-balance sm:text-5xl md:text-6xl">
        우리 브랜드가 불리고 있는지, <span className="text-primary">한 번 재 보세요</span>
      </h2>
      <p className="mx-auto mt-8 max-w-[32em] text-lg leading-relaxed text-muted-foreground">
        {AUDIT_FLOW[0].short}만 넣으면 됩니다. 카드 정보는 받지 않습니다.
      </p>
      <div className="mt-12 flex justify-center">
        <CtaLink href="/audit/new">무료 진단 받기</CtaLink>
      </div>
    </div>
  )
}
