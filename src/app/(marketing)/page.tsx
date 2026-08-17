import { QueryProtocol } from '@/components/audit/query-protocol'
import { SPECIMEN } from '@/components/marketing/actuals'
import { ClosingCta } from '@/components/marketing/closing-cta'
import { CtaLink } from '@/components/marketing/cta-link'
import { DeliverablesBento } from '@/components/marketing/deliverables-bento'
import { FlowSteps } from '@/components/marketing/flow-steps'
import { SpecimenSheet } from '@/components/marketing/specimen-sheet'
import { Hero } from '@/components/marketing/hero'
import { ReplayScene } from '@/components/marketing/replay-scene'
import { SECTION_X, Section } from '@/components/marketing/section'
import { Reveal } from '@/components/motion/reveal'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 랜딩.
 *
 * ## 히어로가 답변 원문인 이유
 *
 * 이 제품이 파는 것은 대시보드가 아니다. **내가 통제할 수 없는 남의 문장**이고,
 * 거기에 내 브랜드가 있거나 없다는 사실이다. 큰 숫자와 그래디언트로 시작하면
 * "무엇을 받나"에 답하지만, GEO를 모르는 사람의 실제 장벽은 **"왜 신경 써야
 * 하나"**다. 문장을 먼저 보여주면 그 답이 읽는 즉시 나온다.
 *
 * 그리고 랜딩에서 본 것과 리포트에서 받는 것이 **같은 컴포넌트**다
 * (`AnswerSpecimen`/`SpecimenMarks`). "이거 진짜야?"에 대한 답이 그 일치에서
 * 나온다.
 *
 * ## 구조 (AIDA — gpt-taste §2)
 *
 * | 단계 | 섹션 | 레이아웃 패밀리 |
 * |---|---|---|
 * | Attention | 히어로 | 비대칭 에디토리얼 분할 |
 * | Interest | 리포트에 들어가는 것 | gapless 벤토 |
 * | Interest | 신청하면 3단계 | 자막 핀 스크럽 |
 * | Interest | 무엇을 묻는지 공개합니다 | 전폭 단일 열 + 계측 패널 |
 * | **Desire** | 실측 재현 | 핀 스크럽 스크롤텔링 |
 * | Desire | 알 수 없는 것 | 헤어라인 정의 원장 |
 * | Action(마감) | 마감 대형 타이포 | 헤어라인 사이 무용기 타이포 |
 *
 * 일곱 섹션에 일곱 패밀리다(§4.7 Section-Layout-Repetition). 아이브로는
 * 히어로의 "한국어 GEO 모니터링" 하나뿐이다(상한 ceil(7/3) = 3).
 *
 * ★ 신청 폼은 이 페이지에 없다 — **`/audit/new` 단독안**(2026-08-04 사용자
 *   확정). 원래 히어로 바로 아래 신청서 시트가 있었는데, 히어로 CTA가 "한
 *   화면 스크롤" 버튼이 되고 Action이 Interest보다 먼저 오는 어색함이 있었다.
 *   지금은 CTA 세 개(머리글·히어로·마감)가 전부 `/audit/new`로 가고, AIDA의
 *   Action은 마감 타이포가 맡는다. 신청서 조판 자체는
 *   `components/audit/request-sheet.tsx`로 옮겨 살아 있다.
 *
 * 실측 데이터(답변 원문·언급률·인용 출처·언급 횟수)는
 * `components/marketing/actuals.ts` 한 곳에 있다. 히어로·벤토·실측 재현·질의
 * 프로토콜이 **같은 표본**을 가리켜야 "위 표본의 질문" 표시가 성립한다.
 */
export default function HomePage() {
  return (
    <>
      <Hero />

      {/* ── 무엇을 받나 — 벤토 ───────────────────────────────
          네 항목의 무게가 서로 다르다. 크기로 그 위계를 말한다. 셀 안의 숫자는
          전부 2026-07-30 실측 한 건에서 나온다(`DeliverablesBento` 참고). */}
      <Section>
        <Reveal index={0}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            리포트에 들어가는 것
          </h2>
          <p className="mt-4 max-w-[34em] text-base leading-relaxed text-muted-foreground">
            아래 숫자는 예시가 아닙니다. 위 표본과 같은 측정에서 계산된 값입니다.
          </p>
        </Reveal>
        <Reveal index={1} className="mt-12">
          <DeliverablesBento />
        </Reveal>
      </Section>

      {/* ── 순서 — 자막 핀 스크럽 ────────────────────────────
          한 번에 한 단계만 보이고 스크롤이 자막을 넘긴다(1 → 사라짐 → 2 →
          사라짐 → 3). 재현 장면과 같은 PinScene 골격이라 페이지의 스크롤
          물리는 여전히 하나다. 제목까지 함께 핀돼야 하므로 자기 몫의 수직
          여백을 스스로 갖는다 — `Section`을 쓰지 않는다(`FlowSteps` 머리말). */}
      <FlowSteps />

      {/* ── 검증 — 질의 프로토콜 ──────────────────────────────
          "직접 물어서 확인하실 수 있습니다"라는 약속을 실행 가능하게 만드는
          섹션이다. 질의는 고정 템플릿이라 공개해도 잃을 것이 없고, 방문자가
          30초 안에 본인 손으로 검증하는 것이 어떤 문구보다 강하다.
          여기 질의는 측정 파이프라인과 **같은 함수**가 만든다. 어긋날 수 없다. */}
      {/* id="queries" — 히어로 계측 조건 스트립의 "질의 전문 공개" 앵커가
          여기로 내린다(hero.tsx). 스트립의 약속과 이 섹션이 같은 사실이다. */}
      <Section id="queries">
        <Reveal index={0}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            무엇을 묻는지 공개합니다
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            질문은 업종마다 고정된 템플릿이고, <strong className="font-medium text-foreground">브랜드명을
            넣지 않습니다</strong>. 이름을 대고 물으면 AI는 당연히 그 브랜드를 말하니까요.
            그대로 복사해 ChatGPT에 붙여넣어 보세요.
          </p>
        </Reveal>

        {/* 계측 카드는 시트 안쪽 알맹이가 된다 — 테두리·반경·그림자를
            시트에 넘기고 자기 껍데기를 벗는다(히어로의 표본과 같은 처리).
            ★ tone="stage" — 이건 실측 문서가 아니라 **도구**(업종 탭·복사
              버튼이 달린 콘솔)다. 문서만 종이로 반전한다는 경계
              (specimen-sheet.tsx "종이 반전"). 종이 판이 벤토·재현 사이에
              하나 더 끼면 흰 블록이 연속돼 대비가 도로 사라진다. */}
        <Reveal index={1} className="mt-10 max-w-4xl">
          <SpecimenSheet tone="stage">
            <QueryProtocol
              specimenQuery={SPECIMEN.query}
              className="rounded-none border-0 bg-transparent shadow-none"
            />
          </SpecimenSheet>
        </Reveal>

        {/* ★ 반전 카피. 직접 검증한 사람의 답은 우리 표본과 다를 수 있고,
            그 순간 "틀렸네?"가 되면 섹션이 역효과다. 그 차이가 바로 이 제품이
            측정하는 대상(변동성)임을 먼저 말해 둔다. */}
        <Reveal index={2}>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            받은 답이 위 표본과 달라도 정상입니다. AI 답변은 물을 때마다 바뀝니다. 한 번의
            측정에 신뢰구간을 붙이는 이유가 그것입니다.
          </p>
        </Reveal>
      </Section>

      {/* ── 시그니처 — 실측 재현 ─────────────────────────────
          핀 + 스크럽. 질의 → 답변 → 언급 판정 → 언급률이 스크롤 진행률에
          매달린다. 자기 몫의 수직 여백을 스스로 갖는 전폭 장면이라
          `Section`을 쓰지 않는다. */}
      <ReplayScene />

      {/* ── 한계 ─────────────────────────────────────────────
          팔기 전에 못 하는 것을 먼저 말한다. 1회 측정의 한계를 우리가 먼저
          꺼내지 않으면, 고객이 리포트를 받고 스스로 발견한다. 그때는
          "숨겼다"가 된다.
          헤어라인은 **행 사이에만** 긋는다(§9.F: 위아래로 두르지 않는다). */}
      <Section>
        <Reveal index={0}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            무료 진단으로 알 수 없는 것
          </h2>
        </Reveal>

        <Reveal index={1} className="mt-12">
          <dl className="divide-y divide-border">
            <div className="grid gap-3 pb-8 md:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] md:gap-12">
              <dt className="text-lg font-semibold tracking-tight">변화는 알 수 없습니다</dt>
              <dd className="max-w-[42em] text-base leading-relaxed text-muted-foreground">
                무료 진단은 <span className="font-mono tabular-nums">1</span>회 측정입니다. AI
                답변은 물어볼 때마다 달라지므로, 한 번 재서 나온 숫자는 넓은 범위 안의 한
                점입니다. 리포트에 그 범위를 숫자로 함께 적습니다.
              </dd>
            </div>
            <div className="grid gap-3 py-8 md:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] md:gap-12">
              <dt className="text-lg font-semibold tracking-tight">엔진은 둘입니다</dt>
              <dd className="max-w-[42em] text-base leading-relaxed text-muted-foreground">
                무료 진단은 {engineLabels(PLANS.free.engines).join(' · ')}만 봅니다. 네이버 AI
                브리핑과 Google AI 개요는 유료 플랜에서 추가됩니다.
              </dd>
            </div>
          </dl>
        </Reveal>

        {/* 한계 뒤에 붙는 해소책이라 원장 밖에 둔다 — 이건 "알 수 없는 것"이
            아니라 "그래서 어떻게 하면 되는가"다. */}
        <Reveal index={2} className="mt-10">
          <p className="max-w-[42em] text-base leading-relaxed text-muted-foreground">
            같은 질문을 주 <span className="font-mono tabular-nums">3</span>회 측정하면 범위가
            좁아지고, 지난주와 비교해 변화가 실제인지 측정 오차인지 판정할 수 있습니다. 그게
            유료 플랜이 하는 일입니다.
          </p>
          {/* 히어로의 보조 CTA와 **같은 라벨·같은 모양**이다. 마케팅 표면의
              컨트롤은 전부 각이라는 모서리 규칙(cta-link.tsx). */}
          <div className="mt-8">
            <CtaLink href="/pricing" tone="ghost" icon={false}>
              요금제 보기
            </CtaLink>
          </div>
        </Reveal>
      </Section>

      {/* ── 마감 ─────────────────────────────────────────────
          바로 아래가 기존 푸터다(`(marketing)/layout.tsx`). 마감 CTA가 그
          경계에 서므로 아래 패딩만 조금 줄여 푸터와 붙지 않게 한다. */}
      <section className={`${SECTION_X} pb-28 md:pb-40`}>
        <Reveal index={0}>
          <ClosingCta />
        </Reveal>
      </section>
    </>
  )
}
