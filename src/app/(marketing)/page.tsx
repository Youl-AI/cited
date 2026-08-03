import Link from 'next/link'
import { QueryProtocol } from '@/components/audit/query-protocol'
import { RequestForm } from '@/components/audit/request-form'
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
 * | Action(앞당김) | 신청 폼 | 분할 + 인터랙티브 패널 |
 * | Interest | 리포트에 들어가는 것 | gapless 벤토 |
 * | Interest | 신청하면 3단계 | 스티키 스택(핀) |
 * | Interest | 무엇을 묻는지 공개합니다 | 전폭 단일 열 + 계측 패널 |
 * | **Desire** | 실측 재현 | 핀 스크럽 스크롤텔링 |
 * | Desire | 알 수 없는 것 | 헤어라인 정의 원장 |
 * | Action(마감) | 마감 CTA | 전폭 고대비 패널 |
 *
 * 여덟 섹션에 여덟 패밀리다(§4.7 Section-Layout-Repetition). 분할 레이아웃은
 * 히어로와 신청 폼 **둘이 연달아 오고 거기서 끊긴다**(§4.7 지그재그 상한 2).
 * 아이브로는 히어로의 "한국어 GEO 모니터링" 하나뿐이다(상한 ceil(8/3) = 3).
 *
 * 신청 폼이 위쪽에 있는 것은 의도다 — 이 페이지의 유일한 전환 지점이고,
 * 스크롤 끝까지 읽어야 신청할 수 있는 페이지는 신청을 읽기의 보상으로 만든다.
 *
 * 핀 섹션 둘(스티키 스택 · 실측 재현)은 **붙여 두지 않는다.** 사이에 질의
 * 공개 섹션이 들어가 스크롤이 한 번 자유로워진다.
 *
 * 실측 데이터(답변 원문·언급률·인용 출처·언급 횟수)는
 * `components/marketing/actuals.ts` 한 곳에 있다. 히어로·벤토·실측 재현·질의
 * 프로토콜이 **같은 표본**을 가리켜야 "위 표본의 질문" 표시가 성립한다.
 */
export default function HomePage() {
  return (
    <>
      <Hero />

      {/* ── 신청 ─────────────────────────────────────────────
          히어로 CTA(`#request`)가 여기로 온다. `scroll-mt-24`가 없으면 앵커로
          점프했을 때 제목이 떠 있는 머리글 밑으로 들어간다.
          히어로가 자기 아래 여백을 이미 가지므로 위쪽 패딩은 두지 않는다.

          ★ 처음에는 왼쪽에 떠 있는 제목·문단 + 오른쪽 유리 카드였다. 폼이
            훨씬 길어서 왼쪽 아래가 통째로 빈 여백이 됐고, "제목 왼쪽 + 카드
            오른쪽"은 그 자체로 템플릿 냄새였다. 지금은 **신청서 한 장**이다 —
            접수 안내 레일과 기입란이 한 시트 안에서 헤어라인으로 나뉜다.
            신청서는 기입하는 문서라 유리가 아니라 시트다(specimen-sheet.tsx). */}
      <section id="request" className={`${SECTION_X} scroll-mt-24 pb-28 md:pb-40`}>
        <Reveal index={0}>
          <SpecimenSheet>
            <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              {/* ── 접수 안내 레일 ──────────────────────────
                  모바일에서는 폼 위의 머리 블록으로 접힌다(아래 border 방향
                  전환). 레일 바닥의 측정 규격은 폼 안 FlowStrip(순서)과 겹치지
                  않는 정보만 싣는다 — 무엇을 몇 번, 어디에 묻는지. */}
              {/* ★ 레일은 flex-col이고 내용이 네 클러스터다(소개 · 질의
                  미리보기 · 규격 · 방침/문의). 폼 열이 더 길어서 생기는 세로
                  여분은 lg에서 `lg:mt-auto`로 클러스터 **사이에 고르게**
                  분배된다 — 바닥에 빈 공간이 고이지 않고 호흡이 된다.
                  모바일(자연 높이)에서는 mt-auto가 0이라 기본 간격이 선다. */}
              <div className="flex flex-col border-b border-border bg-foreground/[0.02] p-6 sm:p-8 lg:border-r lg:border-b-0">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    무료 진단 신청
                  </h2>
                  <p className="mt-4 max-w-[34em] text-base leading-relaxed text-muted-foreground">
                    질의 <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>
                    개를 <span className="font-mono tabular-nums">1</span>회 측정해 메일로
                    보내드립니다. 결제 정보는 받지 않습니다.
                  </p>
                  {/* 히어로의 표시 규칙 설명이 이어지는 자리다. 경쟁사를 실제로
                      입력하는 칸 바로 옆이라, 여기서 읽어야 결정에 쓸 수 있다. */}
                  <p className="mt-5 max-w-[34em] text-sm leading-relaxed text-muted-foreground">
                    우리는 알려주신 브랜드만 셀 수 있습니다. 경쟁사를 적게 넣으면 점유율이
                    실제보다 높게 보입니다. 리포트에 분모를 항상 함께 적는 이유입니다.
                  </p>
                </div>

                {/* ── 질의 미리보기 ────────────────────────────
                    오른쪽 "업종" 칸과 직결되는 자리다: 업종 하나로 무슨
                    질문이 만들어지는지 실물 한 줄로 즉답한다. 질의는
                    SPECIMEN(2026-07-30 실측)에서 온다 — 아래 "무엇을
                    묻는지 공개합니다"가 전체 프로토콜이라면 여기는 기입
                    전 미리보기 한 줄이다. */}
                <div className="mt-8 border border-border bg-foreground/[0.04] p-5 lg:mt-auto">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground">
                      업종을 적으면 질문이 만들어집니다
                    </p>
                    <blockquote className="mt-3 border-l-2 border-primary/60 pl-3 text-sm leading-relaxed">
                      {SPECIMEN.query}
                    </blockquote>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      업종 &lsquo;패션&rsquo;에 실제로 쓰는 질의 중 하나입니다. 전체 질의는 아래
                      섹션에 공개되어 있습니다.
                    </p>
                  </div>

                {/* 측정 규격 — 값은 전부 PLANS.free에서 온다(손으로 적은 수치
                    없음). mono는 숫자에만 건다 — 한글을 mono에 넣으면 글자마다
                    시스템 서체로 떨어진다(히어로 아이브로와 같은 이유). */}
                <dl className="mt-8 border-t border-border text-sm lg:mt-auto">
                  {(
                    [
                      [
                        '질의',
                        <>
                          <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개
                          · 업종 고정 템플릿
                        </>,
                      ],
                      [
                        '측정',
                        <>
                          <span className="font-mono tabular-nums">1</span>회
                        </>,
                      ],
                      ['엔진', engineLabels(PLANS.free.engines).join(' · ')],
                    ] as const
                  ).map(([term, value]) => (
                    <div
                      key={term}
                      className="flex items-baseline justify-between gap-4 border-b border-border py-3"
                    >
                      <dt className="text-muted-foreground">{term}</dt>
                      <dd className="text-right text-[0.875rem]">{value}</dd>
                    </div>
                  ))}
                  </dl>

                {/* 처리 기준은 방침 문서가 원본이다 — 여기서 새 약속을 만들지
                    않고 문서로 보낸다(푸터에도 있지만, 정보를 적는 칸 옆이
                    실제로 궁금해지는 자리다). 문의처도 같다: 푸터에만 있던
                    주소를 신청을 망설이는 자리 옆에 내놓는다. */}
                <div className="mt-6 lg:mt-auto">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    적어주신 내용은 진단에만 씁니다. 처리 기준은{' '}
                    <Link
                      href="/legal/privacy"
                      className="underline underline-offset-2 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground"
                    >
                      개인정보처리방침
                    </Link>
                    에 있습니다.
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    궁금한 점은{' '}
                    <a
                      href="mailto:contact@cited.co.kr"
                      className="underline underline-offset-2 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground"
                    >
                      contact@cited.co.kr
                    </a>
                    로 보내주세요.
                  </p>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <RequestForm />
              </div>
            </div>
          </SpecimenSheet>
        </Reveal>
      </section>

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

      {/* ── 순서 — 계측 레일 ─────────────────────────────────
          큰 스크롤 연출은 아래 "실측 재현" 한 곳에만 쓴다. 여기는 노드와
          헤어라인으로 순서만 조용히 말한다(`FlowSteps` 머리말 참고). */}
      <Section>
        <Reveal index={0}>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">신청하면</h2>
        </Reveal>
        <div className="mt-12">
          <FlowSteps />
        </div>
      </Section>

      {/* ── 검증 — 질의 프로토콜 ──────────────────────────────
          "직접 물어서 확인하실 수 있습니다"라는 약속을 실행 가능하게 만드는
          섹션이다. 질의는 고정 템플릿이라 공개해도 잃을 것이 없고, 방문자가
          30초 안에 본인 손으로 검증하는 것이 어떤 문구보다 강하다.
          여기 질의는 측정 파이프라인과 **같은 함수**가 만든다. 어긋날 수 없다. */}
      <Section>
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
            질의는 실측 문서라 유리가 아니라 계측 시트다(specimen-sheet.tsx). */}
        <Reveal index={1} className="mt-10 max-w-4xl">
          <SpecimenSheet>
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
          {/* 히어로의 보조 CTA와 **같은 라벨·같은 모양**이다. 마케팅 표면에서
              누르는 것은 전부 알약이라는 규칙(Task 3 리포트 §2.8). */}
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
