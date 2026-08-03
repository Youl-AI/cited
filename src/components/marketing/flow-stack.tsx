import { AUDIT_FLOW } from '@/components/audit/flow'
import { GlassPanel } from '@/components/marketing/glass-panel'
import { StickyStack } from '@/components/motion/sticky-stack'

/**
 * "신청하면" 3단계 — 스티키 스택 (tasteskill §5.A).
 *
 * ## 왜 나열이 아니라 스택인가
 *
 * 세 단계는 **동시에 존재하지 않는다.** 신청한 사람은 언제나 셋 중 정확히 한
 * 상태에 있고, 다음 단계가 오면 이전 단계는 끝난다. 스티키 스택이 말하는 것이
 * 정확히 그것이다 — 다음 카드가 올라온 만큼 이전 카드가 뒤로 물러난다.
 * `Reveal`(순서대로 나타나기)로 하면 세 개가 나란히 남아 "셋 다 진행 중"으로
 * 읽힌다. 그 차이가 이 컴포넌트를 고른 이유다(§5 MOTION MUST BE MOTIVATED).
 *
 * ## 왜 여기에 두는가
 *
 * "리포트에 들어가는 것" 바로 다음이다. 무엇을 받는지 본 사람의 다음 질문이
 * "그래서 언제 어떻게 오나"이고, 그 답이 이 세 단계다. 그리고 아래쪽
 * "실측 재현"(`PinScene`)과 **붙여 두지 않는다** — 핀 섹션 둘이 연달아 오면
 * 스크롤이 오래 갇힌 것처럼 느껴진다. 사이에 "무엇을 묻는지 공개합니다"가
 * 들어가 숨을 돌린다.
 *
 * ## 번호는 장식이 아니다 — 그리고 그 주장은 시맨틱이 받쳐야 한다
 *
 * 01/02/03은 아이브로가 아니라 **실제 순서**다(§9.F가 금지하는 것은
 * "Stage 1 / Phase 02" 꼴의 지어낸 단계 라벨이고, 여기 라벨은 신청·메일
 * 확인·리포트 수신이라는 실제 행위다). 그 주장을 눈에 보이는 숫자로만 하면
 * **스크린리더에는 아무 순서도 없다.** `ordered`로 `<ol>`/`<li>`를 세워
 * "목록, 항목 3개 중 1"이 읽히게 한다.
 *
 * 문구는 `components/audit/flow.tsx` 한 벌에서 온다 — 폼 안의 압축판과
 * 갈리면 "영업일 1일"이 한쪽에서만 사라진다.
 */
export function FlowStack() {
  return (
    <StickyStack
      ordered
      cards={AUDIT_FLOW.map((step, index) => (
        <div key={step.label} className="w-full max-w-3xl px-6">
          <GlassPanel>
            <div className="p-8 sm:p-12">
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {step.label}
              </h3>
              <p className="mt-5 max-w-[34em] text-base leading-relaxed text-muted-foreground sm:text-lg">
                {step.body}
              </p>
            </div>
          </GlassPanel>
        </div>
      ))}
    />
  )
}
