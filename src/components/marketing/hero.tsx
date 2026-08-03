import { AnswerSpecimen } from '@/components/audit/answer-specimen'
import { IntervalBar } from '@/components/interval-bar'
import { MEASURED, SPECIMEN } from '@/components/marketing/actuals'
import { CtaLink } from '@/components/marketing/cta-link'
import { GlassPanel } from '@/components/marketing/glass-panel'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 랜딩 히어로 — 비대칭 분할(Asymmetric Split).
 *
 * ## 왜 가운데 정렬이 아닌가
 *
 * DESIGN_VARIANCE 8에서 중앙 정렬 히어로는 금지에 가깝다(tasteskill §4.3).
 * 그리고 이 히어로에는 **두 개의 주인공**이 있다: 왼쪽의 주장과 오른쪽의
 * 증거물. 가운데로 모으면 둘 중 하나가 다른 하나의 캡션이 된다.
 * 비대칭 배치가 "이건 우리가 하는 말, 저건 AI가 한 말"을 공간으로 말한다.
 *
 * ## 오른쪽은 목업이 아니라 실물이다
 *
 * div로 지은 가짜 대시보드는 AI 디자인의 1번 텔이다(tasteskill §4.8·§9.F).
 * 우리는 가짜를 만들 필요가 없다 — **리포트가 쓰는 바로 그 컴포넌트**
 * (`AnswerSpecimen`)에 2026-07-30 실측 답변을 그대로 넣는다. 랜딩에서 본 것과
 * 배송물이 같은 물건이라는 사실이 "이거 진짜야?"에 대한 답이다.
 *
 * ## 히어로 텍스트 스택은 넷이다 (tasteskill §4.7)
 *
 * 아이브로 · H1 · 서브텍스트 · CTA 두 개. 그 아래 유리 패널은 **자산**이고,
 * 패널 안의 계측 레일과 패널 밑 한 줄은 그 자산의 판독 눈금이다. 신뢰
 * 마이크로스트립·가격 티저·기능 목록은 히어로에 없다.
 *
 * ## H1 두 줄 계약
 *
 * `.hero-display`(globals.css)가 `clamp(1.75rem, 4vw, 2.75rem)`을 잡고,
 * 여기서 `max-w-[20em]`으로 위쪽을 막는다. 문장의 자연 폭이 약 23.2em이라
 * 20em 컨테이너에서는 한 줄이 될 수 없고, 가장 긴 어절 덩어리가 11.84em이라
 * xl 좌측 컬럼(약 13.7em)에서도 세 줄이 되지 않는다. 즉 **정확히 두 줄**이다.
 * 폭 380px 아래에서만 세 줄로 접힌다(데스크톱 2줄 규칙의 대상이 아니고,
 * 네 줄은 320px에서도 나지 않는다).
 *
 * ## 등장은 CSS다 (`.enter-rise`)
 *
 * 첫 화면 요소에 Motion `whileInView`를 걸면 하이드레이션 전까지 투명해서
 * LCP가 JS 뒤로 밀린다. 여기만 CSS 키프레임이고, 스크롤해서 만나는 아래
 * 섹션은 `Reveal`이다. 지연은 `--motion-stagger`(60ms) 배수 — 위계 순서가
 * 곧 등장 순서다(제목 → 값 → 보조).
 *
 * ## 폼은 히어로 바로 아래다
 *
 * 히어로에 신청 폼까지 넣으면 첫 화면이 700px을 넘어 CTA가 접히는 쪽으로
 * 밀린다. 전환 경로는 히어로 CTA(`#request`)가 잇고, 폼은 스크롤 한 번
 * 아래의 첫 섹션이다.
 */
export function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-24 pb-16 sm:pb-20">
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:gap-14">
        {/* ── 주장 ─────────────────────────────────────────── */}
        <div>
          {/* ★ mono를 쓰지 않는다. mono에는 한글 글리프가 없어서 "한국어"와
              "모니터링"만 시스템 서체로 떨어지고, 한 줄 안에서 서체가 세 번
              갈린다(실제로 그렇게 보였다). 그리고 이건 계측값이 아니라 말이다 —
              "sans는 말, mono는 계측값" 규칙을 여기서도 지킨다. */}
          <p className="enter-rise text-sm font-medium tracking-wide text-muted-foreground">
            한국어 GEO 모니터링
          </p>

          <h1 className="hero-display enter-rise mt-5 max-w-[20em] text-balance [animation-delay:60ms]">
            고객이 AI에게 물었을 때, 우리 브랜드가 불리고 있나
          </h1>

          <p className="enter-rise mt-6 max-w-[34em] text-lg leading-relaxed text-muted-foreground [animation-delay:120ms]">
            검색 순위는 우리가 올릴 수 있습니다. AI 답변은 그렇지 않습니다. Cited는 ChatGPT와
            Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 기록합니다.
          </p>

          {/* 하나의 의도에 하나의 라벨. `무료 진단 받기`는 머리글과 히어로가
              같은 문구를 쓴다(tasteskill §4.5 중복 CTA 금지). */}
          <div className="enter-rise mt-10 flex flex-wrap items-center gap-3 [animation-delay:180ms]">
            <CtaLink href="#request">무료 진단 받기</CtaLink>
            <CtaLink href="/pricing" tone="ghost" icon={false}>
              요금제 보기
            </CtaLink>
          </div>
        </div>

        {/* ── 증거물 ───────────────────────────────────────── */}
        <div className="enter-rise [animation-delay:240ms] xl:mt-8">
          <GlassPanel>
            <AnswerSpecimen
              engineId={SPECIMEN.engineId}
              query={SPECIMEN.query}
              text={SPECIMEN.text}
              marks={SPECIMEN.marks}
              footer={<span>2026-07-30 실측 · 밑줄이 우리가 센 브랜드입니다</span>}
              // 패널이 이미 테두리·반경·그림자를 갖는다. 표본은 그 안쪽 알맹이라
              // 자기 껍데기를 벗는다(같은 자리에 테두리가 두 겹이면 베젤이 셋이 된다).
              className="rounded-none border-0 bg-transparent shadow-none"
            />

            {/* ── 계측 레일 ──────────────────────────────────
                같은 측정에서 나온 숫자다. 답변 바로 아래에 붙여야 "무엇을 보고
                무엇이 나오는가"가 한 눈에 이어진다. */}
            <div className="border-t border-border bg-foreground/[0.02] px-4 py-5 sm:px-5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                위 측정의 결과
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-4xl font-medium tracking-tighter tabular-nums">
                  {formatPercent(MEASURED.cited.point)}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatInterval(MEASURED.cited)}
                </span>
              </div>
              {/* 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다. */}
              <div className="mt-3">
                <IntervalBar interval={MEASURED.cited} />
              </div>
              <p className="mt-2.5 text-sm text-muted-foreground">
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
          </GlassPanel>

          {/* 표시 규칙이 곧 제품의 한계 설명이다. 나머지 두 문장은 경쟁사 칸
              바로 옆(신청 섹션)에 둔다 — 읽는 사람이 실제로 결정하는 자리다. */}
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            표시가 없는 브랜드는{' '}
            <strong className="font-medium text-foreground">등록되지 않아 세지 않은 것</strong>
            입니다.
          </p>
        </div>
      </div>
    </section>
  )
}
