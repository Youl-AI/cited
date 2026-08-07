import { SpecimenMarks } from '@/components/audit/answer-specimen'
import { IntervalBar } from '@/components/interval-bar'
import { MEASURED, MENTION_COUNTS, SOURCES, SPECIMEN } from '@/components/marketing/actuals'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * "리포트에 들어가는 것" — gapless 벤토 (gpt-taste §4).
 *
 * ## 왜 벤토인가
 *
 * 네 항목은 **서로 무게가 다르다.** 답변 원문은 이 제품의 서명이고, 나머지
 * 셋은 그 답변에서 파생된 계측값이다. 네 개를 같은 크기 카드로 늘어놓으면
 * (tasteskill §9.C가 금지하는 "3-4개 동일 카드") 그 위계가 사라진다.
 * 벤토는 크기로 위계를 말한다.
 *
 * ## 셀 수 = 콘텐츠 수 = 4 (tasteskill §4.7 BENTO CELL COUNT)
 *
 * 4셀이 2×2 격자를 **빈칸 없이** 채운다. 원래 원문 셀이 세로 두 칸(전문
 * 게재)이었는데, 원문이 발췌로 줄면서(히어로·재현 장면과의 3중 전문 등장
 * 완화 — 아래 "발췌" 주석) 두 칸 높이가 빈 공간이 됐다. 지금은 네 셀이
 * 각 한 칸씩이고, 위계는 칸 크기 대신 틴트·콘텐츠 밀도가 말한다. 행 높이는
 * 내용대로 달라 격자가 목록으로 굳지 않는다. `sm` 아래는 단일 열.
 *
 * ★ `grid-flow-dense`는 지금(전 셀 1칸) 무동작이다. 남겨 두는 이유는
 *   안전장치다: 나중에 어느 셀에 span이 다시 붙으면 sparse는 구멍을 남기고
 *   dense는 되메운다(gpt-taste §4).
 *
 * ## 배경 다양성 (tasteskill §4.7 Bento Background Diversity)
 *
 * 흰 글자 카드 넷이면 벤토가 아니라 표다. 네 셀이 각각 다른 바닥을 가지고,
 * **셋은 실측 UI를 싣는다** — 신뢰구간 띠·표식이 붙은 답변 원문·mono 계측값.
 * 지어낸 스크린샷을 만들 필요가 없다(§9.E). 우리는 진짜가 있다.
 *
 * ## 숫자의 출처
 *
 * 전부 2026-07-30 실측 한 건에서 나온다(`actuals.ts`). 언급률은
 * `wilsonInterval(5,6)`, 출처 비율은 `(3,6)`·`(2,6)`, 언급 횟수는 실측의
 * 순위 항목이다. 리터럴 퍼센트는 이 파일에 하나도 없다.
 */

/** 셀 공통. 바닥색만 셀마다 다르다. */
const CELL = 'flex flex-col gap-3 p-7 sm:p-8'

/**
 * 셀 바닥은 **전부 불투명이어야 한다.**
 *
 * 처음에는 `bg-primary/[0.07]`·`bg-foreground/[0.05]`처럼 알파로 틴트했는데,
 * 이 격자는 바닥(`bg-border` = `oklch(1 0 0 / 10%)`)이 1px 틈으로 비쳐서 선이
 * 되는 구조다. 셀이 반투명이면 그 흰 판이 **셀 전체를 통째로 비춘다** — 틴트가
 * 의도보다 밝아지고 헤어라인은 주변과 같은 색이 되어 사라진다.
 *
 * `color-mix`로 같은 색을 **미리 섞어** 불투명한 값으로 만든다. 토큰을 그대로
 * 참조하므로 표면이 바뀌면 따라 바뀐다(리터럴 색을 박지 않는다).
 */
const TINT_BRAND = 'bg-[color-mix(in_oklch,var(--card),var(--primary)_9%)]'
const TINT_RAISED = 'bg-[color-mix(in_oklch,var(--card),var(--foreground)_6%)]'

export function DeliverablesBento() {
  return (
    <div
      className={
        // gapless — 셀 사이 간격이 아니라 **1px 헤어라인**이다. 바닥의
        // `bg-border`가 그 틈으로 보여서 선이 되고, 셀은 서로 붙어 있다.
        // 각(radius 0)이다 — 벤토 셀은 전부 실측 데이터라 문서 표면 계열이고,
        // 문서는 둥글지 않다(표면 역할 규칙: specimen-sheet.tsx 머리말).
        // `surface-paper` — 리포트 견본은 문서라 종이(라이트)로 반전한다
        // (specimen-sheet.tsx "종이 반전"). 셀 틴트는 전부 토큰 참조라
        // 스코프를 따라 라이트 값으로 함께 넘어간다.
        'surface-paper grid grid-flow-dense gap-px overflow-hidden border border-border bg-border text-foreground shadow-elevation-3 sm:grid-cols-2'
      }
    >
      {/* ── 1. 언급률과 신뢰구간 ─────────────────────────────
          브랜드 틴트 + 실측 계측 UI. 이 셀이 제품의 주장을 그림으로 만든다. */}
      <div className={`${CELL} ${TINT_BRAND}`}>
        <h3 className="text-base font-semibold">언급률과 신뢰구간</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          몇 번 물어서 몇 번 나왔는지, 그리고 그 숫자를 얼마나 믿어도 되는지 범위로 함께
          드립니다.
        </p>
        {/* ★ 숫자를 히어로(4xl)보다 한참 작게(xl) 조판한다. 같은 83%가 히어로·
            재현 장면에 이미 큰 활자로 서 있다 — 세 번째까지 크면 반복이 서사가
            아니라 복붙으로 읽힌다(2026-08-05 외부 피드백). 이 셀의 주인공은
            숫자가 아니라 신뢰구간 띠(구성요소 견본)다. */}
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="font-mono text-xl font-medium tracking-tight tabular-nums">
              {formatPercent(MEASURED.cited.point)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatInterval(MEASURED.cited)}
            </span>
          </div>
          <div className="mt-3">
            <IntervalBar interval={MEASURED.cited} />
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            답변 <span className="font-mono tabular-nums">{MEASURED.cited.n}</span>개 중{' '}
            <span className="font-mono tabular-nums">{MEASURED.cited.k}</span>개에서 언급
          </p>
        </div>
      </div>

      {/* ── 2. 답변 원문 ─────────────────────────────────────
          히어로의 표본 카드와 **같은 표시 규칙**을 쓰되(`SpecimenMarks`)
          조건 띠와 캡션은 벗는다 — 여기서는 완제품이 아니라 "이런 게
          들어갑니다"의 견본이고, 그래서 전문이 아니라 **발췌**다(전문은
          히어로 표본과 실측 재현 두 곳으로 충분하다 — 같은 원문이 세 번
          전문으로 등장하면 중복으로 읽힌다). line-clamp는 시각 절단이라
          원문 텍스트 자체는 손대지 않는다. */}
      <div className={`${CELL} bg-card`}>
        <h3 className="text-base font-semibold">답변 원문</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          실제 AI가 뭐라고 답했는지 그대로 보여드립니다. 직접 물어서 확인하실 수 있습니다.
        </p>
        <blockquote className="mt-2 line-clamp-5 border-l-2 border-border pl-4 text-sm leading-[1.9] whitespace-pre-wrap">
          <SpecimenMarks text={SPECIMEN.text} marks={SPECIMEN.marks} />
        </blockquote>
        <p className="mt-auto pt-4 text-xs text-muted-foreground">
          2026-07-30 실측 발췌 · 밑줄이 우리가 센 브랜드입니다
        </p>
      </div>

      {/* ── 3. AI가 읽는 출처 ────────────────────────────────
          언급률이 0%인 브랜드에게도 남는 유일한 집행 가능한 정보다. */}
      <div className={`${CELL} ${TINT_RAISED}`}>
        <h3 className="text-base font-semibold">AI가 읽는 출처</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          한 번도 언급되지 않았더라도, AI가 이 질문에 답할 때 어떤 사이트를 읽는지 알려드립니다.
          거기가 손볼 곳입니다.
        </p>
        <dl className="mt-auto space-y-2 pt-4 text-sm">
          {SOURCES.top.map((row) => (
            <div key={row.domain}>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-mono text-xs">{row.domain}</dt>
                <dd className="font-mono tabular-nums">{formatPercent(row.share.point)}</dd>
              </div>
              <p className="font-mono text-[0.6875rem] text-muted-foreground">
                {formatInterval(row.share)}
              </p>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          답변 <span className="font-mono tabular-nums">{MEASURED.cited.n}</span>개에서 도메인{' '}
          <span className="font-mono tabular-nums">{SOURCES.domains}</span>개
        </p>
      </div>

      {/* ── 4. 경쟁사 대비 점유율 ────────────────────────────
          밑줄 문법이 답변 원문 셀과 같다 — 자사는 브랜드색, 경쟁사는 무채색.
          비율이 아니라 **횟수**를 적는다(actuals.ts 주석 참고). */}
      <div className={`${CELL} bg-background`}>
        <h3 className="text-base font-semibold">경쟁사 대비 점유율</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          경쟁사를 넣으시면 같은 답변에서 누가 더 자주 불리는지 비교해 드립니다.
        </p>
        <dl className="mt-auto space-y-2 pt-4 text-sm">
          {MENTION_COUNTS.map((row) => (
            <div key={row.brand} className="flex items-baseline justify-between gap-3">
              <dt
                className={
                  row.isSelf
                    ? 'border-b-2 border-primary pb-[0.05em] font-medium'
                    : 'border-b-2 border-metric-flat pb-[0.05em] text-muted-foreground'
                }
              >
                {row.brand}
              </dt>
              <dd className="font-mono tabular-nums">
                {row.count}
                <span className="ml-1 text-xs text-muted-foreground">회</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          답변 <span className="font-mono tabular-nums">{MEASURED.cited.n}</span>개에서 센 언급 횟수
        </p>
      </div>
    </div>
  )
}
