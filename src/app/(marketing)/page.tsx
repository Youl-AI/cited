import Link from 'next/link'
import { AnswerSpecimen } from '@/components/audit/answer-specimen'
import { RequestForm } from '@/components/audit/request-form'
import { Button } from '@/components/ui/button'
import { PLANS, engineLabels } from '@/lib/plans'
import { formatInterval, formatPercent, wilsonInterval } from '@/lib/stats/wilson'

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
 * ## 아래 답변은 실측이다
 *
 * 2026-07-30 `pnpm audit:run`으로 실제 ChatGPT에 물어 받은 답변의 일부다.
 * 지어낸 예시를 쓰면 첫 리포트에서 톤이 달라지고, 그 차이가 바로 의심이 된다.
 * `docs/superpowers/notes/2026-07-30-first-audit-actuals.md` 참고.
 */

const SPECIMEN = {
  engineId: 'chatgpt',
  query: '30대 남자 옷 어디서 사는 게 좋아?',
  text: `좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.

- 온라인 / 편리: 무신사(스트리트·캐주얼), W컨셉(디자이너), 29CM·쿠팡·지마켓(빠른 배송).
- 베이식·미니멀(30대에 무난): 유니클로, COS, 무탠다드.`,
  // ★ 등록한 브랜드만 표시한다. W컨셉·쿠팡·유니클로는 평문으로 남는다 —
  //   우리는 고객이 등록하지 않은 브랜드를 셀 수 없고, 그 사실을 감추면
  //   언급 점유율을 오해하게 된다. 이 규칙 하나가 그 주의사항을 가르친다.
  //
  // ★ 순서 번호는 **자기 브랜드에만** 붙인다. 리포트가 정확히 그렇게 그린다
  //   (`evidenceMarks`) — 랜딩에서 본 것과 배송물이 달라지면 "이거 진짜야?"가
  //   되살아난다. 여기 표시 규칙을 바꾸려면 그쪽도 같이 봐야 한다.
  marks: [
    { text: '무신사', position: 1, isSelf: true },
    { text: '무탠다드', position: 1, isSelf: true },
    { text: '29CM', isSelf: false },
  ],
} as const

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

/**
 * 위 답변이 속한 측정의 **실제 결과**. 같은 실행에서 나온 숫자다
 * (`notes/2026-07-30-first-audit-actuals.md`).
 *
 * ★ 히어로에서 이미 신뢰구간을 보여준다. 이 제품의 정체성이 "숫자"가 아니라
 *   "그 숫자를 얼마나 믿어도 되는가"이므로, 구간을 뒤쪽 섹션으로 미루면
 *   가장 중요한 차별점을 스크롤 아래에 숨기는 것이 된다.
 */
const MEASURED = {
  cited: wilsonInterval(5, 6),
  byEngine: [
    { engine: 'ChatGPT', interval: wilsonInterval(3, 3) },
    { engine: 'Gemini', interval: wilsonInterval(2, 3) },
  ],
} as const

/** 신청부터 수신까지. **이건 실제 순서**이고 순서가 정보이므로 번호를 붙인다. */
const FLOW = [
  { label: '신청', body: '브랜드명·업종·이메일을 넣습니다. 카드 정보는 받지 않습니다.' },
  { label: '메일 확인', body: '확인 링크를 누르기 전에는 아무것도 실행되지 않습니다.' },
  { label: '리포트 수신', body: '영업일 1일 이내에 메일로 보내드립니다.' },
] as const

export default function HomePage() {
  return (
    <>
      {/* ── 히어로 ───────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
        {/* ★ mono를 쓰지 않는다. mono에는 한글 글리프가 없어서 "한국어"와
            "모니터링"만 시스템 서체로 떨어지고, 한 줄 안에서 서체가 세 번
            갈린다(실제로 그렇게 보였다). 그리고 이건 계측값이 아니라 말이다 —
            "sans는 말, mono는 계측값" 규칙을 여기서도 지킨다. */}
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          한국어 GEO 모니터링
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          고객이 AI에게 물었을 때, 우리 브랜드가 불리고 있나
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          검색 순위는 우리가 올릴 수 있습니다. AI 답변은 그렇지 않습니다. Cited는 ChatGPT와
          Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 기록합니다.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
          {/* 서명 요소 — 남의 문장 하나. */}
          <div>
            <AnswerSpecimen
              engineId={SPECIMEN.engineId}
              query={SPECIMEN.query}
              text={SPECIMEN.text}
              marks={SPECIMEN.marks}
              footer={<span>2026-07-30 실측 · 밑줄이 우리가 센 브랜드입니다</span>}
            />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              표시가 없는 브랜드는{' '}
              <strong className="font-medium text-foreground">등록되지 않아 세지 않은 것</strong>
              입니다. 우리는 알려주신 브랜드만 셀 수 있습니다 — 그래서 경쟁사를 적게 넣으면
              점유율이 실제보다 높게 보입니다. 리포트에 분모를 항상 함께 적는 이유입니다.
            </p>

            {/* 같은 측정의 결과. 답변 바로 아래에 붙여야 "무엇을 보고 무엇이
                나오는가"가 한 눈에 이어진다. */}
            <div className="mt-8 rounded-lg border border-border bg-muted/30 p-5">
              <p className="text-sm font-medium">위 측정의 결과</p>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-3xl font-semibold tracking-tighter tabular-nums">
                  {formatPercent(MEASURED.cited.point)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatInterval(MEASURED.cited)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                답변 <span className="font-mono tabular-nums">{MEASURED.cited.n}</span>개 중{' '}
                <span className="font-mono tabular-nums">{MEASURED.cited.k}</span>개에서 언급
              </p>
              <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                {MEASURED.byEngine.map((row) => (
                  <div key={row.engine} className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{row.engine}</dt>
                    <dd className="font-mono tabular-nums">
                      {formatPercent(row.interval.point)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatInterval(row.interval)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
              {/* ★ 옆의 범위가 왜 그렇게 넓은지 말하지 않으면, 숫자를 못 믿을
                  제품으로 읽힌다. 넓이의 원인이 측정 횟수라는 걸 여기서 밝힌다. */}
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                옆의 범위가 넓은 것은 <span className="font-mono tabular-nums">1</span>회만
                측정했기 때문입니다. 여러 번 재면 좁아집니다.
              </p>
            </div>
          </div>

          {/* 폼 — 히어로 안에 둔다. 스크롤해서 찾게 만들 이유가 없다. */}
          <div className="rounded-lg border border-border bg-card p-6 sm:p-7">
            <h2 className="text-xl font-semibold tracking-tight">무료 진단 신청</h2>
            <p className="mt-2 mb-6 text-sm text-muted-foreground">
              질의 <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를{' '}
              <span className="font-mono tabular-nums">1</span>회 측정해 메일로 보내드립니다.
              결제 정보는 받지 않습니다.
            </p>
            <RequestForm />
          </div>
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
          번호를 붙인다 — 이건 장식이 아니라 실제 순서이고, 읽는 사람이
          "지금 어디쯤인가"를 알아야 하는 정보다. */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">신청하면</h2>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {FLOW.map((step, index) => (
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
          꺼내지 않으면, 고객이 리포트를 받고 스스로 발견한다 — 그때는
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
          <Button variant="outline" className="mt-8" asChild>
            <Link href="/pricing">요금제 보기</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
