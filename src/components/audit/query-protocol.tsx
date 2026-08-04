'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { KNOWN_CATEGORIES, generateAuditQueries, isRegionalCategory } from '@/lib/audit/queries'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 랜딩 탭에 보여줄 업종 — 전국형만. 지역형 업종은 지역 없이는 질의를 만들 수
 * 없고(의도적으로 던진다), 랜딩이 지역을 지어내 보여주면 "복사해 간 질문 =
 * 실제 측정 질문" 약속이 깨진다. 그래서 탭에서 뺀다.
 */
const DISPLAY_CATEGORIES: readonly string[] = KNOWN_CATEGORIES.filter(
  (c) => !isRegionalCategory(c),
)

/**
 * 질의 프로토콜 카드 — 랜딩의 신뢰 섹션.
 *
 * ## 왜 질의를 공개하는가
 *
 * 랜딩은 "직접 물어서 확인하실 수 있습니다"라고 약속하는데, 정작 **무슨
 * 질문을 던지는지**는 어디에도 없었다. 질의는 LLM 생성이 아니라 카테고리별
 * 고정 템플릿이므로(재실행 비교 가능성 때문 — `queries.ts` 참고) 공개해도
 * 잃는 것이 없고, 방문자는 30초 안에 ChatGPT에 붙여넣어 검증할 수 있다.
 * "진짜인가?"에 대한 답을 우리 말이 아니라 본인 손으로 얻는다.
 *
 * ## 어긋날 수 없는 구조
 *
 * 여기 보이는 질의는 **측정 파이프라인이 실행하는 바로 그 함수**
 * (`generateAuditQueries`)가 만든다. 템플릿을 고치면 랜딩이 자동으로 따라온다.
 * 복사해 간 질문과 실제 측정 질문이 다르면 이 섹션 전체가 거짓말이 되므로,
 * 문자열을 여기 다시 적는 방식은 금지다.
 *
 * ## q1·q2·q3는 장식 번호가 아니다
 *
 * `execute.ts`가 답변 식별자를 `q${i+1}:engine:sample`로 만든다. 즉 이 표기는
 * 파이프라인이 실제로 쓰는 질의 id이고, 리포트의 증거 항목이 이 id로 연결된다.
 * 01/02/03 같은 장식 번호를 쓰지 않는 이유다 — 구조는 사실을 실어야 한다.
 */

/**
 * 판정 모델 표기. 소스는 `src/lib/judge/claude.ts`의 `JUDGE_MODEL`인데, 그
 * 모듈은 Anthropic SDK와 env(server-only)를 끌고 오므로 클라이언트 번들에
 * 넣을 수 없다. 문자열을 복제하고 **동기화 테스트가 드리프트를 막는다**
 * (`query-protocol.test.tsx`). 모델을 바꾸면 그 테스트가 여기를 가리킨다.
 */
export const DISPLAYED_JUDGE_MODEL = 'claude-haiku-4-5'

/** 검증 안내까지 포함한 계측 조건. 전부 실제 설정값에서 계산한다. */
const FREE = PLANS.free

export function QueryProtocol({
  /**
   * 히어로 표본을 만든 질의. 목록에서 그 줄에 "위 표본의 질문" 표식이 붙어
   * 답변과 질문이 같은 측정임을 잇는다. 표본 문구가 템플릿과 어긋나면 표식이
   * 사라지고 E2E가 실패한다 — 조용히 거짓이 되는 것을 막는 장치다.
   */
  specimenQuery,
  /**
   * 껍데기 조정. 랜딩은 이 카드를 유리 패널(`GlassPanel`) **안쪽 알맹이**로
   * 쓰므로 자기 테두리·반경·그림자를 벗는다 — 같은 자리에 테두리가 두 겹이면
   * 베젤이 셋이 된다. `audit/new`는 단독으로 쓰므로 기본값 그대로다.
   */
  className,
}: {
  specimenQuery?: string
  className?: string
}) {
  const [category, setCategory] = useState<string>(DISPLAY_CATEGORIES[0] ?? '패션')
  const [copied, setCopied] = useState<string | null>(null)

  // 브랜드명 인자는 의도적으로 쓰이지 않는다(질의에 안 들어간다). 그 사실
  // 자체가 이 섹션이 증명하려는 것이다.
  const queries = generateAuditQueries(category, '')

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((prev) => (prev === text ? null : prev)), 2000)
    } catch {
      // 클립보드 권한이 없는 환경(http·구형 브라우저). 조용히 넘어가지 않고
      // 버튼 문구로 알린다 — 사용자는 드래그로 복사하면 된다.
      setCopied(`fail:${text}`)
      setTimeout(() => setCopied((prev) => (prev === `fail:${text}` ? null : prev)), 2000)
    }
  }

  return (
    // 그림자는 토큰만 쓴다. 인라인 `shadow-[...]`는 색이 리터럴로 박혀서
    // **다크 표면에서 그냥 안 보인다**(라이트 종이용 틴트 그림자였다).
    // `shadow-elevation-1`은 :root / .surface-dark의 --elev-1을 타므로
    // 표면마다 알맞은 깊이가 나온다.
    <figure
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card shadow-elevation-1',
        className,
      )}
    >
      {/* 계측 조건 띠 — AnswerSpecimen과 같은 문법. mono는 기계가 보는 것,
          sans는 사람이 읽는 것. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/50 px-4 py-2.5 font-mono text-xs text-muted-foreground sm:px-5">
        <span className="tracking-[0.08em] uppercase">queries</span>
        <span aria-hidden className="text-border">
          /
        </span>
        <span className="font-sans text-foreground">{category}</span>
      </div>

      {/* 업종 탭. 사람이 고르는 것이므로 sans. */}
      <div
        role="group"
        aria-label="업종 선택"
        className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3 sm:px-5"
      >
        {DISPLAY_CATEGORIES.map((label) => (
          <button
            key={label}
            type="button"
            aria-pressed={category === label}
            onClick={() => setCategory(label)}
            // 알약이다. 마케팅 표면에서 **누르는 것은 전부 알약**이라는 모서리
            // 규칙(Task 3 리포트 §2.8)을 이 탭만 앱 반경(8~12px)으로 깨고 있었다.
            // `audit/new`도 마케팅 표면으로 넘어오므로 두 곳 모두 여기서 맞는다.
            className={cn(
              'motion-press rounded-none border px-3.5 py-1 text-sm active:scale-[0.97]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              category === label
                ? 'border-foreground/60 bg-foreground text-background'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border/70">
        {queries.map((query, index) => {
          const isSpecimen = specimenQuery !== undefined && query === specimenQuery
          return (
            <li
              key={query}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              {/* 파이프라인의 실제 질의 id. 리포트 증거가 이 id로 연결된다. */}
              <span className="font-mono text-xs text-muted-foreground">q{index + 1}</span>
              <span className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed">
                {query}
                {isSpecimen && (
                  <span className="ml-2 align-middle text-xs whitespace-nowrap text-primary">
                    위 표본의 질문
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void copy(query)}
                className={cn(
                  'motion-press shrink-0 rounded-none border border-border px-3 py-1 text-xs text-muted-foreground active:scale-[0.97]',
                  'hover:bg-accent hover:text-foreground',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                )}
              >
                {copied === query ? '복사됨' : copied === `fail:${query}` ? '복사 안 됨' : '복사'}
              </button>
            </li>
          )
        })}
      </ul>

      {/* 계측 조건. 라벨은 사람 말(sans), 값은 계측값(mono·숫자만 mono). */}
      <figcaption className="border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
        <dl className="grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <dt className="text-muted-foreground">엔진</dt>
            <dd className="font-mono">{FREE.engines.join(' · ')}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <dt className="text-muted-foreground">표본</dt>
            <dd>
              질의 <span className="font-mono tabular-nums">{FREE.maxQueries}</span>개 ×{' '}
              <span className="font-mono tabular-nums">{FREE.samples.llm}</span>회 = 답변{' '}
              <span className="font-mono tabular-nums">
                {FREE.maxQueries * FREE.samples.llm * FREE.engines.length}
              </span>
              개
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <dt className="text-muted-foreground">언급 판정</dt>
            <dd className="font-mono">{DISPLAYED_JUDGE_MODEL}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 sm:justify-start">
            <dt className="text-muted-foreground">신뢰구간</dt>
            <dd className="font-mono">Wilson score 95%</dd>
          </div>
        </dl>
        {/* 무료 진단이 보는 엔진의 한국어 이름. 표 안은 기계 식별자라 mono지만,
            사람에게는 한 번은 사람 말로 말해야 한다. */}
        <p className="mt-2.5 text-xs text-muted-foreground">
          {engineLabels(FREE.engines).join('와 ')}에 같은 질문을 던집니다. 목록에 없는 업종은
          입력한 업종명으로 같은 형태의 질문 <span className="font-mono tabular-nums">3</span>개를
          만듭니다.
        </p>
      </figcaption>
    </figure>
  )
}
