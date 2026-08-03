'use client'

import { useCallback, useEffect, useRef } from 'react'
import { SpecimenMarks } from '@/components/audit/answer-specimen'
import { IntervalBar } from '@/components/interval-bar'
import { MEASURED, SPECIMEN } from '@/components/marketing/actuals'
import { SpecimenSheet } from '@/components/marketing/specimen-sheet'
import { PinScene } from '@/components/motion/pin-scene'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * "실측 재현" — 이 페이지의 시그니처 장면 (스펙 §4.1 Desire).
 *
 * ## 무엇을 재생하는가
 *
 * 2026-07-30에 실제로 돌아간 측정 한 건이다. 질의를 던지고, 답변을 받고,
 * 판정기가 브랜드를 표시하고, 언급률이 남는다. **네 단계가 곧 파이프라인의
 * 실제 순서**이고(`execute.ts`), 스크롤 진행률이 그 순서를 되감을 수 있게
 * 만든다. 사용자가 직접 앞뒤로 굴려 볼 수 있다는 것이 이 연출의 전부다.
 *
 * 동기 한 문장(Motion Motivated): **스토리텔링** — "83%"라는 결과만으로는
 * 그 숫자가 어디서 왔는지 알 수 없고, 그 의심이 이 제품의 유일한 장벽이다.
 *
 * ## 데이터는 히어로와 같은 것이다
 *
 * `SPECIMEN`·`MEASURED` 한 곳에서만 온다. 원문은 글자 하나 고치지 않는다
 * (안의 대시·가운뎃점은 ChatGPT가 쓴 것이다 — 하드 룰이 카피 규칙보다 위다).
 * 표식은 `SpecimenMarks`로 그린다 — 히어로·벤토·리포트가 쓰는 바로 그 규칙이다.
 *
 * ## 진행률을 `useState`로 받지 않는다
 *
 * `onProgress`는 GSAP 티커에서 초당 수십 번 불린다(리프 JSDoc). 받은 값은
 * **ref로 잡아 둔 DOM 노드에 직접** 쓴다. 움직이는 것은 `transform`과
 * `opacity`뿐이고(GPU 합성), 계측값 자체는 굴리지 않는다 — 숫자가 스크롤에
 * 따라 변하면 "지나간 중간값"이 측정된 적 없는 숫자가 된다(design-language §6).
 * 스크롤이 정하는 것은 **무엇이 보이는가**이지 값이 아니다.
 *
 * ## 가리개(cover)의 기본값은 "비켜나 있음"이다
 *
 * 가리개는 마크업(`translate-x-full`·`translate-y-full`)에서 **비켜나 있고**,
 * JS가 붙어야 마운트 직후 `apply(0)`이 덮는다. 반대로 잡으면 — 즉 클래스에
 * "덮은 상태"를 박으면 — JS가 죽은 브라우저에서 답변이 **영영 가려진다**
 * (design-language §6: "초기 상태를 컴포넌트 클래스에 박지 않는다").
 * 대가는 하이드레이션 전 한 프레임의 완성 상태인데, 이 장면은 첫 화면에서
 * 여섯 섹션 아래라 눈에 닿지 않는다. reduced-motion에서는 `PinScene`이
 * `onProgress(1)`을 보장하므로 그대로 완성 상태로 선다.
 */

/** 전체 진행률 → 구간 [from, to)의 지역 진행률 0..1 */
function span(p: number, from: number, to: number): number {
  if (p <= from) return 0
  if (p >= to) return 1
  return (p - from) / (to - from)
}

/**
 * 파이프라인의 실제 단계. 숫자를 붙이지 않는다 — "Stage 1 / Step 2" 꼴은
 * tasteskill §9.F가 금지하는 라벨이고, 단계의 이름 자체가 라벨이다.
 * 구간 경계는 "읽는 데 걸리는 시간"에 맞췄다: 답변 스트리밍이 가장 길다.
 */
const PHASES = [
  { label: '질의', from: 0, to: 0.24 },
  { label: '답변', from: 0.24, to: 0.62 },
  { label: '언급 판정', from: 0.62, to: 0.8 },
  { label: '언급률', from: 0.8, to: 1 },
] as const

interface MarkHandle {
  el: HTMLElement
  /** 클래스가 정한 밑줄 색(자사 = 브랜드색, 경쟁사 = 무채색). 한 번만 읽는다 */
  base: string
  sup: HTMLElement | null
}

export function ReplayScene() {
  const queryCover = useRef<HTMLSpanElement>(null)
  const answerCover = useRef<HTMLDivElement>(null)
  const answerBody = useRef<HTMLQuoteElement>(null)
  const readout = useRef<HTMLDivElement>(null)
  const steps = useRef<(HTMLLIElement | null)[]>([])
  const marks = useRef<MarkHandle[] | null>(null)
  const started = useRef(false)
  /** 지금 `will-change`를 세워 둔 상태인가. 매 프레임 같은 값을 쓰지 않으려는 것 */
  const layered = useRef(false)

  const apply = useCallback((p: number) => {
    started.current = true
    const q = span(p, PHASES[0].from, PHASES[0].to)
    const a = span(p, PHASES[1].from, PHASES[1].to)
    const m = span(p, PHASES[2].from, PHASES[2].to)
    const r = span(p, PHASES[3].from, PHASES[3].to)

    // ★ `transform`이 아니라 **`translate` 프로퍼티**다(실브라우저에서 잡은 버그).
    //   Tailwind v4의 `translate-x-full`은 `transform: translateX(100%)`이 아니라
    //   `translate: var(--tw-translate-x) var(--tw-translate-y)`로 컴파일된다.
    //   두 프로퍼티는 서로를 덮지 않고 **합성**되므로, 인라인에 transform을 쓰면
    //   q=0에서 100%(클래스) + 0%(인라인) = 100%가 되어 가리개가 영영 비켜나 있다.
    //   jsdom에도 `style.translate`가 있어 테스트가 같은 값을 본다.
    //
    // ① 질의 타이핑 — 가리개가 오른쪽으로 비켜나며 글자가 드러난다.
    if (queryCover.current) {
      queryCover.current.style.translate = `${q * 100}% 0`
    }
    // ② 답변 스트리밍 — 가리개가 아래로 내려간다. 그 윗변의 헤어라인이 커서다.
    if (answerCover.current) {
      answerCover.current.style.translate = `0 ${a * 100}%`
    }

    // ③ 언급 판정 — 밑줄과 순서 번호가 들어온다. 밑줄 색은 클래스가 정한
    //    값을 그대로 쓰고 알파만 진행률로 섞는다(색을 새로 고르지 않는다).
    const body = answerBody.current
    if (body) {
      marks.current ??= [...body.querySelectorAll('mark')].map((el) => ({
        el,
        base: getComputedStyle(el).borderBottomColor || 'currentColor',
        sup: el.querySelector('sup'),
      }))
      for (const item of marks.current) {
        item.el.style.borderBottomColor =
          m >= 1 ? '' : `color-mix(in oklch, ${item.base} ${Math.round(m * 100)}%, transparent)`
        if (item.sup) item.sup.style.opacity = String(m)
      }
    }

    // ④ 언급률 정착 — 숫자는 처음부터 최종값이다. 들어오는 것은 판 자체다.
    //    여기도 `translate`로 통일한다 — 이 컴포넌트 안에 transform과 translate가
    //    섞여 있으면 다음 사람이 위 함정을 그대로 다시 밟는다.
    if (readout.current) {
      readout.current.style.opacity = String(r)
      readout.current.style.translate = `0 ${(1 - r) * 16}px`
    }

    // 단계 표시 — 지금 무엇이 진행 중인지. 지나간 단계는 밝은 채로 남는다.
    PHASES.forEach((phase, index) => {
      const el = steps.current[index]
      if (el) el.style.opacity = String(0.3 + span(p, phase.from, phase.to) * 0.7)
    })

    // `will-change`는 **장면이 도는 동안만** 세운다. 클래스로 상주시키면 브라우저가
    // 페이지 수명 내내 세 요소를 별도 레이어로 승격해 둔다(tasteskill §6.A:
    // "실제로 움직일 요소에만, 아껴서"). 진행률이 0이거나 1이면 장면은 끝났거나
    // 시작 전이라 승격을 쥐고 있을 이유가 없다. 같은 문자열을 매 프레임 다시
    // 쓰면 그 자체가 스타일 무효화라, 값이 바뀔 때만 건드린다.
    // ε를 두는 이유(실측): ScrollTrigger는 refresh 때 진행률 0에 **아주 가까운**
    // 값(1e-6 수준)으로 한 번 흘린다. `p > 0`으로 두면 장면이 화면에 들어오기도
    // 전에 레이어가 서고, 그 뒤로 영영 내려가지 않는다.
    const wantsLayer = p > 0.001 && p < 0.999
    if (layered.current !== wantsLayer) {
      layered.current = wantsLayer
      const value = wantsLayer ? 'translate' : 'auto'
      for (const el of [queryCover.current, answerCover.current, readout.current]) {
        if (el) el.style.willChange = value
      }
    }
  }, [])

  // 마운트 직후 "시작 전" 상태로 덮는다.
  // ★ `started` 가드가 필요하다(실측으로 고친 것): `PinScene`은 이 컴포넌트의
  //   **자식**이라 그쪽 effect가 먼저 돈다. reduced-motion에서 `onProgress(1)`이
  //   이미 완성 상태를 그려 놓은 뒤에 여기서 0을 덮으면, 모션이 꺼진 사용자에게
  //   답변이 영영 가려진 채로 남는다. 이미 진행률을 받았으면 손대지 않는다.
  useEffect(() => {
    if (!started.current) apply(0)
  }, [apply])

  return (
    <PinScene onProgress={apply}>
      {/* ★ 핀되는 동안 화면 밖으로 넘치면 안 된다 — 넘긴 만큼은 핀이 풀릴 때까지
          닿을 수 없다. 그래서 모바일에서 조판을 한 단씩 줄이고(제목·본문·표본),
          단계 표시를 세로 목록에서 **가로 한 줄**로 눕힌다. */}
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center px-6 py-16 sm:py-24">
        <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          {/* ── 해설 + 단계 표시 ─────────────────────────── */}
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
              이 숫자는 이렇게 나왔습니다
            </h2>
            <p className="mt-3 max-w-[30em] text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
              맨 위에서 보신 2026-07-30 표본 그대로입니다. 리포트도 이 순서로
              만들어집니다.
            </p>
            <ol className="mt-6 flex flex-wrap gap-x-5 gap-y-1 lg:mt-8 lg:block lg:space-y-2.5">
              {PHASES.map((phase, index) => (
                <li
                  key={phase.label}
                  ref={(el) => {
                    steps.current[index] = el
                  }}
                  className="text-sm font-medium transition-opacity duration-[var(--motion-state)] ease-instrument"
                >
                  {phase.label}
                </li>
              ))}
            </ol>
          </div>

          {/* ── 재생되는 표본 ────────────────────────────── */}
          <div>
            <SpecimenSheet>
              {/* 계측 조건 띠 — AnswerSpecimen과 같은 문법(mono는 기계, sans는 사람).
                  ★ 여기만 `bg-muted/50`이 아니라 불투명 `bg-muted`다. 가리개가
                    같은 색으로 글자를 덮어야 하는데, 반투명이면 밑의 글자가
                    비쳐서 타이핑이 아니라 흐릿한 글자가 된다. */}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted px-4 py-2.5 font-mono text-xs text-muted-foreground sm:px-5">
                <span className="tracking-[0.08em] uppercase">{SPECIMEN.engineId}</span>
                <span aria-hidden className="text-border">
                  /
                </span>
                <span className="relative inline-block overflow-hidden font-sans text-foreground">
                  {SPECIMEN.query}
                  {/* 마크업 상태는 `translate-x-full` — **비켜나 있다.**
                      JS가 붙어야 덮는다(위 "가리개" 주석 참고). */}
                  <span
                    ref={queryCover}
                    aria-hidden
                    className="absolute inset-0 translate-x-full bg-muted"
                  />
                </span>
              </div>

              <div className="relative overflow-hidden">
                <blockquote
                  ref={answerBody}
                  className="px-4 py-4 text-sm leading-[1.75] whitespace-pre-wrap sm:px-5 sm:py-5 sm:text-[0.9375rem] sm:leading-[1.8]"
                >
                  <SpecimenMarks text={SPECIMEN.text} marks={SPECIMEN.marks} />
                </blockquote>
                <div
                  ref={answerCover}
                  aria-hidden
                  className="absolute inset-0 translate-y-full bg-card"
                >
                  {/* 커서. 스트리밍의 앞머리를 표시한다 */}
                  <span className="absolute inset-x-0 top-0 h-px bg-primary/70" />
                </div>
              </div>
            </SpecimenSheet>

            <div
              ref={readout}
              className="mt-4 rounded-lg border border-border bg-foreground/[0.03] px-4 py-3.5 sm:mt-5 sm:px-5 sm:py-4"
            >
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                이 측정의 언급률
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-3xl font-medium tracking-tighter tabular-nums sm:text-4xl">
                  {formatPercent(MEASURED.cited.point)}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatInterval(MEASURED.cited)}
                </span>
              </div>
              <div className="mt-3">
                <IntervalBar interval={MEASURED.cited} />
              </div>
              <p className="mt-2.5 text-sm text-muted-foreground">
                답변 <span className="font-mono tabular-nums">{MEASURED.cited.n}</span>개 중{' '}
                <span className="font-mono tabular-nums">{MEASURED.cited.k}</span>개에서 언급
              </p>
            </div>
          </div>
        </div>
      </div>
    </PinScene>
  )
}
