import { cn } from '@/lib/utils'

/**
 * 답변 표본 — 이 제품의 **서명 요소**다.
 *
 * 랜딩의 히어로와 리포트의 증거 섹션이 같은 컴포넌트를 쓴다. 이유가 있다:
 * 랜딩에서 본 것과 리포트에서 받는 것이 **같은 물건**이어야 "이거 진짜야?"에
 * 답이 된다. 히어로에 대시보드 목업을 놓고 리포트에 다른 걸 보내면 그 질문이
 * 되살아난다.
 *
 * ## 왜 답변 원문이 히어로인가
 *
 * 이 제품이 파는 것은 대시보드가 아니다. **내가 통제할 수 없는 남의 문장**이고,
 * 거기 들어 있거나 없다는 사실이다. 큰 숫자와 그래디언트로 시작하면 "무엇을
 * 받나"에 답하지만, GEO를 모르는 사람의 실제 장벽은 "왜 신경 써야 하나"다.
 * 문장을 먼저 보여주면 그 답이 읽는 즉시 나온다.
 *
 * ## 표시 규칙이 곧 제품의 한계 설명이다
 *
 * **등록한 브랜드만 표시한다.** 답변에 나온 다른 브랜드(W컨셉·쿠팡…)는 평문으로
 * 남는다. 그게 사실이다 — 우리는 고객이 등록하지 않은 브랜드를 셀 수 없다
 * (판정기가 그 별칭을 모른다). 이 규칙 하나가 Share of Voice의 가장 중요한
 * 주의사항("경쟁사를 적게 등록하면 점유율이 높아진다")을 문단 없이 가르친다.
 *
 * 자기 브랜드는 **브랜드색(불확실성의 색)**으로, 경쟁사는 무채색 밑줄로 표시한다.
 */

export interface SpecimenMark {
  /** 답변 원문에 실제로 나타난 표기. 이 문자열을 그대로 찾는다 */
  text: string
  /** 몇 번째로 언급된 브랜드인가. 1부터. 모르면 생략 */
  position?: number
  /** 고객 자신인가 */
  isSelf: boolean
}

export interface AnswerSpecimenProps {
  /** 엔진 식별자 — 계측 항목이므로 mono로 조판한다 */
  engineId: string
  /** 실제로 던진 질문 */
  query: string
  /** 답변 원문 */
  text: string
  /** 표시할 브랜드. 등록되지 않은 브랜드는 넣지 않는다 */
  marks?: readonly SpecimenMark[]
  /** 하단 계측 줄. 없으면 그리지 않는다 */
  footer?: React.ReactNode
  className?: string
}

/**
 * 원문을 표시 구간과 평문 구간으로 쪼갠다.
 *
 * ★ `dangerouslySetInnerHTML`을 쓰지 않는다. 답변 원문은 AI가 만든 것이고
 *   무엇이 들어 있을지 모른다. 조각으로 나눠 React가 이스케이프하게 둔다.
 *
 * 겹치는 표기는 **긴 것이 이긴다** — `무신사`와 `무신사스탠다드`가 둘 다
 * 별칭이면 짧은 쪽을 먼저 잡아서 `무신사`[1]`스탠다드`로 찢어진다.
 */
export function splitByMarks(
  text: string,
  marks: readonly SpecimenMark[],
): { text: string; mark: SpecimenMark | null }[] {
  if (marks.length === 0) return [{ text, mark: null }]

  const byLongest = [...marks].sort((a, b) => b.text.length - a.text.length)
  const out: { text: string; mark: SpecimenMark | null }[] = []
  let plain = ''
  let i = 0

  outer: while (i < text.length) {
    for (const mark of byLongest) {
      if (mark.text.length > 0 && text.startsWith(mark.text, i)) {
        if (plain) {
          out.push({ text: plain, mark: null })
          plain = ''
        }
        out.push({ text: mark.text, mark })
        i += mark.text.length
        continue outer
      }
    }
    plain += text[i]
    i += 1
  }
  if (plain) out.push({ text: plain, mark: null })
  return out
}

/**
 * 표시 규칙만 그린다 — 껍데기(테두리·조건 띠·캡션) 없이 **표식이 붙은 본문**.
 *
 * 랜딩의 "실측 재현" 스크롤텔링과 벤토가 같은 답변을 다른 껍데기에 담는데,
 * 그때마다 `<mark>`·밑줄색·순서 번호를 다시 적으면 **표시 규칙이 화면마다
 * 갈린다.** 규칙은 여기 한 곳에 있고, `AnswerSpecimen`도 이걸 쓴다.
 */
export function SpecimenMarks({
  text,
  marks = [],
}: {
  text: string
  marks?: readonly SpecimenMark[]
}) {
  const parts = splitByMarks(text, marks)
  return (
    <>
      {parts.map((part, index) =>
        part.mark ? (
          <mark
            key={index}
            className={cn(
              'bg-transparent font-medium text-foreground',
              'border-b-2 pb-[0.05em]',
              part.mark.isSelf ? 'border-primary' : 'border-metric-flat',
            )}
          >
            {part.text}
            {part.mark.position !== undefined && (
              <sup
                className={cn(
                  'ml-0.5 font-mono text-[0.625rem] font-normal',
                  part.mark.isSelf ? 'text-primary' : 'text-muted-foreground',
                )}
                // 위치는 계측값이다. 스크린리더에는 뜻을 풀어 읽어준다.
                aria-label={`${part.mark.position}번째로 언급`}
              >
                {part.mark.position}
              </sup>
            )}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function AnswerSpecimen({
  engineId,
  query,
  text,
  marks = [],
  footer,
  className,
}: AnswerSpecimenProps) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        // 계측 장비의 인상 — 그림자를 거의 쓰지 않는다. 종이 위의 얇은 테두리.
        //
        // ★ 인라인 리터럴 `shadow-[0_1px_2px_oklch(0.2_0.015_258/0.04)]`에서
        //   토큰으로 옮겼다(레저 인계). 판단 근거:
        //   1. **`--recess-1`이 아니라 `--elev-1`이다.** recess는 안쪽 그림자로,
        //      "값을 담는 칸"(입력·셀렉트 트리거)에 판다 — 표본은 담는 칸이 아니라
        //      **표면 위에 얹힌 물건**이다. 여기에 recess를 쓰면 답변 원문이
        //      페이지 안으로 파여 들어간다(input.tsx의 elevation↔recess 분업).
        //   2. **값이 사실상 같다.** 리터럴 = `0 1px 2px …/0.04`,
        //      `--elev-1`(라이트) = `0 0 0 1px …/0.03, 0 1px 2px …/0.05`.
        //      더해지는 것은 3% 알파의 1px 윤곽 하나뿐이고, 이 요소는 이미
        //      `border-border` 실선을 두르고 있어 눈에 띄지 않는다.
        //   3. **다크 표면에서만 실제로 달라진다 — 그리고 그게 고치려던 결함이다.**
        //      이 컴포넌트는 랜딩(마케팅 다크)에서도 쓰인다. 리터럴은 어두운 색을
        //      박아 둔 값이라 다크 배경에서 아무것도 그리지 않았다. 토큰은
        //      `.surface-dark`에서 위쪽 inset 하이라이트(반사광)로 뒤집혀,
        //      다크에서도 판이 판으로 읽힌다.
        //
        // ★ **인쇄:** `scripts/audit-pdf.mts`는 `printBackground: true`로 찍으므로
        //   그림자도 종이에 나온다. 즉 이 자리에는 리터럴 시절부터 이미 그림자가
        //   찍히고 있었고, 이번 변경의 인쇄 diff는 위 (2)의 3% 윤곽 한 겹뿐이다
        //   (같은 색조 258 틴트, 순수 검정 아님). 무해하므로 `print:` 가드를
        //   새로 걸지 않는다 — 걸면 그동안 나오던 그림자를 **없애는** 쪽이 되어
        //   납품물이 오히려 바뀐다. 애니메이션은 이 컴포넌트에 없다.
        //
        // ★ **`shadow-elevation-1`이 아니라 `shadow-(--elev-1)`이다 — 실측으로
        //   가른 차이다.** 이 컴포넌트는 호출부가 껍데기를 벗길 수 있어야 한다
        //   (히어로는 `GlassPanel` 안쪽 알맹이로 쓰면서
        //   `className="… shadow-none"`을 넘긴다). 그런데 tailwind-merge는
        //   `shadow-elevation-1`을 **그림자가 아니라 그림자 색**으로 분류해서
        //   `shadow-none`과 충돌시키지 않는다:
        //       cn('shadow-elevation-1', 'shadow-none') → 둘 다 남는다
        //       cn('shadow-(--elev-1)',  'shadow-none') → 'shadow-none'
        //   둘 다 남으면 승부는 **발행 순서**가 가른다(특이도가 같다). 지금은
        //   운 좋게 `.shadow-none`이 뒤에 있어 화면은 멀쩡하지만, 순서에 기대는
        //   덮어쓰기는 이 저장소에서 이미 한 번 조용히 깨진 적이 있다
        //   (brand-picker의 점선 보더 — Task 7 재리뷰). 커스텀 속성 형태는
        //   twMerge가 정상 분류하므로 순서에 기대지 않는다.
        //   값은 완전히 같다: `--shadow-elevation-1`은 `var(--elev-1)`의 별칭이고
        //   (globals.css `@theme inline`), 둘 다 **이 요소에서** 치환되므로
        //   `.surface-dark`의 재선언을 그대로 탄다. 입력·셀렉트·구간 막대가
        //   `shadow-(--recess-1)`을 쓰는 것과 같은 형태다.
        'shadow-(--elev-1)',
        className,
      )}
    >
      {/* 계측 조건 띠 — 전부 mono다. 우리가 측정한 것과 AI가 쓴 것을
          서체로 구분한다. 이 규칙이 화면 전체에서 유지된다. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5 font-mono text-xs text-muted-foreground sm:px-5">
        <span className="tracking-[0.08em] uppercase">{engineId}</span>
        <span aria-hidden className="text-border">
          /
        </span>
        {/* 질문은 사람의 말이므로 sans다. mono 띠 안에서도 이 규칙을 지킨다. */}
        <q className="font-sans text-foreground before:content-none after:content-none">
          {query}
        </q>
      </div>

      <blockquote className="px-4 py-4 text-[0.9375rem] leading-[1.8] whitespace-pre-wrap sm:px-5 sm:py-5">
        <SpecimenMarks text={text} marks={marks} />
      </blockquote>

      {/* ★ 여기는 mono가 아니다. 대부분 한국어 문장이라 mono를 걸면 글자마다
          시스템 서체로 떨어져 한 줄 안에서 서체가 갈린다. 위 조건 띠만 mono다 —
          거기 들어가는 것은 엔진 식별자뿐이다. */}
      {footer ? (
        <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          {footer}
        </figcaption>
      ) : null}
    </figure>
  )
}
