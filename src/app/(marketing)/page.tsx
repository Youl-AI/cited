import { AUDIT_FLOW } from '@/components/audit/flow'
import { QueryProtocol } from '@/components/audit/query-protocol'
import { RequestForm } from '@/components/audit/request-form'
import { SPECIMEN } from '@/components/marketing/actuals'
import { CtaLink } from '@/components/marketing/cta-link'
import { GlassPanel } from '@/components/marketing/glass-panel'
import { Hero } from '@/components/marketing/hero'
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
 * (`AnswerSpecimen`). "이거 진짜야?"에 대한 답이 그 일치에서 나온다.
 *
 * ## 구조 (AIDA — gpt-taste §2)
 *
 * Attention 히어로 · Action(신청 폼, 히어로 직하) · Interest(질의 공개 ·
 * 리포트 내용) · Desire(순서 · 한계). 신청 폼이 위쪽에 있는 것은 의도다 —
 * 이 페이지의 유일한 전환 지점이고, 스크롤 끝까지 읽어야 신청할 수 있는
 * 페이지는 신청을 읽기의 보상으로 만든다.
 *
 * 실측 데이터(답변 원문·언급률)는 `components/marketing/actuals.ts` 한 곳에
 * 있다. 히어로와 질의 프로토콜이 **같은 표본**을 가리켜야 "위 표본의 질문"
 * 표시가 성립한다.
 */

/** 무료 진단이 실제로 무엇을 보내는가. 순서가 없는 목록이므로 번호를 붙이지 않는다. */
const DELIVERABLES = [
  {
    title: '언급률과 신뢰구간',
    body: '몇 번 물어서 몇 번 나왔는지, 그리고 그 숫자를 얼마나 믿어도 되는지 범위로 함께 드립니다.',
  },
  {
    title: '답변 원문',
    body: '위와 같은 형태로, 실제 AI가 뭐라고 답했는지 그대로 보여드립니다. 직접 물어서 확인하실 수 있습니다.',
  },
  {
    title: 'AI가 읽는 출처',
    body: '한 번도 언급되지 않았더라도, AI가 이 질문에 답할 때 어떤 사이트를 읽는지 알려드립니다. 거기가 손볼 곳입니다.',
  },
  {
    title: '경쟁사 대비 점유율',
    body: '경쟁사를 넣으시면 같은 답변에서 누가 더 자주 불리는지 비교해 드립니다.',
  },
] as const

// 신청 순서는 `components/audit/flow.tsx`에 한 벌만 둔다. 폼 안의 압축판과
// 아래 섹션이 갈리면 "영업일 1일"이 한쪽에서만 사라지는 식으로 약속이
// 조용히 달라진다.

export default function HomePage() {
  return (
    <>
      <Hero />

      {/* ── 신청 ─────────────────────────────────────────────
          히어로 CTA(`#request`)가 여기로 온다. `scroll-mt-24`가 없으면 앵커로
          점프했을 때 제목이 떠 있는 머리글 밑으로 들어간다. */}
      <section
        id="request"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 pb-20 sm:pb-28"
      >
        <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:gap-14">
          <Reveal index={0}>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">무료 진단 신청</h2>
            <p className="mt-4 max-w-[34em] text-base leading-relaxed text-muted-foreground">
              질의 <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를{' '}
              <span className="font-mono tabular-nums">1</span>회 측정해 메일로 보내드립니다.
              결제 정보는 받지 않습니다.
            </p>
            {/* 히어로의 표시 규칙 설명이 이어지는 자리다. 경쟁사를 실제로
                입력하는 칸 바로 옆이라, 여기서 읽어야 결정에 쓸 수 있다. */}
            <p className="mt-5 max-w-[34em] text-sm leading-relaxed text-muted-foreground">
              우리는 알려주신 브랜드만 셀 수 있습니다. 경쟁사를 적게 넣으면 점유율이 실제보다
              높게 보입니다. 리포트에 분모를 항상 함께 적는 이유입니다.
            </p>
          </Reveal>

          <Reveal index={1}>
            <GlassPanel>
              <div className="p-6 sm:p-8">
                <RequestForm />
              </div>
            </GlassPanel>
          </Reveal>
        </div>
      </section>

      {/* ── 검증 — 질의 프로토콜 ──────────────────────────────
          "직접 물어서 확인하실 수 있습니다"라는 약속을 실행 가능하게 만드는
          섹션이다. 질의는 고정 템플릿이라 공개해도 잃을 것이 없고, 방문자가
          30초 안에 본인 손으로 검증하는 것이 어떤 문구보다 강하다.
          여기 질의는 측정 파이프라인과 **같은 함수**가 만든다. 어긋날 수 없다. */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            무엇을 묻는지 공개합니다
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            질문은 업종마다 고정된 템플릿이고, <strong className="font-medium text-foreground">브랜드명을
            넣지 않습니다</strong>. 이름을 대고 물으면 AI는 당연히 그 브랜드를 말하니까요.
            그대로 복사해 ChatGPT에 붙여넣어 보세요.
          </p>

          <div className="mt-8 max-w-3xl">
            <QueryProtocol specimenQuery={SPECIMEN.query} />
          </div>

          {/* ★ 반전 카피. 직접 검증한 사람의 답은 우리 표본과 다를 수 있고,
              그 순간 "틀렸네?"가 되면 섹션이 역효과다. 그 차이가 바로 이 제품이
              측정하는 대상(변동성)임을 먼저 말해 둔다. */}
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            받은 답이 위 표본과 달라도 정상입니다. AI 답변은 물을 때마다 바뀝니다. 한 번의
            측정에 신뢰구간을 붙이는 이유가 그것입니다.
          </p>
        </div>
      </section>

      {/* ── 무엇을 받나 ──────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            리포트에 들어가는 것
          </h2>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {DELIVERABLES.map((item) => (
              <div key={item.title}>
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 순서 ─────────────────────────────────────────────
          번호를 붙인다. 이건 장식이 아니라 실제 순서이고, 읽는 사람이
          "지금 어디쯤인가"를 알아야 하는 정보다. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">신청하면</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {AUDIT_FLOW.map((step, index) => (
            <li key={step.label} className="border-t border-foreground/15 pt-4">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-base font-semibold">{step.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 한계 ─────────────────────────────────────────────
          팔기 전에 못 하는 것을 먼저 말한다. 1회 측정의 한계를 우리가 먼저
          꺼내지 않으면, 고객이 리포트를 받고 스스로 발견한다. 그때는
          "숨겼다"가 된다. */}
      <section className="border-t border-border">
        {/* 위 섹션들과 같은 좌측 정렬선을 쓴다. max-w-3xl을 그대로 중앙에 두면
            이 섹션만 안쪽으로 들여쓴 것처럼 보인다. */}
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            무료 진단으로 알 수 없는 것
          </h2>
          <div className="mt-8 max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-medium text-foreground">변화는 알 수 없습니다.</strong> 무료
              진단은 <span className="font-mono tabular-nums">1</span>회 측정입니다. AI 답변은
              물어볼 때마다 달라지므로, 한 번 재서 나온 숫자는 넓은 범위 안의 한 점입니다.
              리포트에 그 범위를 숫자로 함께 적습니다.
            </p>
            <p>
              <strong className="font-medium text-foreground">엔진은 둘입니다.</strong> 무료 진단은{' '}
              {engineLabels(PLANS.free.engines).join(' · ')}만 봅니다. 네이버 AI 브리핑과 Google AI
              개요는 유료 플랜에서 추가됩니다.
            </p>
            <p>
              같은 질문을 주 <span className="font-mono tabular-nums">3</span>회 측정하면 범위가
              좁아지고, 지난주와 비교해 변화가 실제인지 측정 오차인지 판정할 수 있습니다. 그게
              유료 플랜이 하는 일입니다.
            </p>
          </div>
          {/* 히어로의 보조 CTA와 **같은 라벨·같은 모양**이다. 마케팅 표면에서
              누르는 것은 전부 알약이라는 규칙(리포트 §2.8)을 앱 버튼
              (`variant="outline"`, 8~12px 반경)이 여기서만 깨고 있었다. */}
          <div className="mt-8">
            <CtaLink href="/pricing" tone="ghost" icon={false}>
              요금제 보기
            </CtaLink>
          </div>
        </div>
      </section>
    </>
  )
}
