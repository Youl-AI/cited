import type { EngineId } from '@/lib/plans'

/** 환율. 원가 계산 기준 (설계 문서) */
export const USD_TO_KRW = 1400

export interface EnginePrice {
  perCallUsd: number
  perMTokenInUsd: number
  perMTokenOutUsd: number
}

/**
 * 엔진별 단가.
 *
 * `perCallUsd`는 **검색 요금**이다. 토큰과 별도로 청구되며 모델을 바꿔도
 * 줄지 않는다. 2026-07-29 공식 가격표에서 확인했다.
 *   - OpenAI 웹검색: $10 / 1,000회
 *   - Gemini 3 grounding: $14 / 1,000 **검색 질의**
 *
 * ★ **청구 단위가 호출이 아니라 검색 질의다.** Gemini 3 문서: "your project is
 *   billed for each search query that the model decides to execute." 실측에서
 *   한 호출이 검색을 2건 돌렸으므로 호출 수로 계산하면 **원가가 절반이 된다.**
 *   그래서 아래 계산은 `usage.searches`를 먼저 쓰고, 없을 때만 `usage.calls`로
 *   물러선다. 엔진은 응답에서 실제 검색 수를 읽어 채워야 한다.
 *
 * ★ **무료 티어에는 검색 그라운딩이 없다.** 공식 가격표의 Grounding with
 *   Google Search 항목이 무료 티어에서 "Not available"이고, 실제로 호출하면
 *   429 RESOURCE_EXHAUSTED가 온다(모델 자체는 200 OK). 결제를 켜지 않으면
 *   이 제품의 측정 자체가 불가능하다.
 *
 * ★ **검색 본문의 토큰 청구는 제공자마다 다르다. 같은 공식으로 계산하지 마라.**
 *   - **Gemini: 청구하지 않는다.** 2026-07-29 실측 확인 — grounding on/off와
 *     무관하게 입력 토큰이 질의문 그대로였다(7~12 토큰). 공식 문서도
 *     "Retrieved context ... is not charged as input tokens"로 명시한다.
 *     즉 Gemini의 grounding 비용은 `perCallUsd`뿐이다.
 *   - **OpenAI: 청구한다.** 문서가 `$10/1k calls + Search content tokens
 *     billed at model rates`로 명시한다. 여기서는 `perMTokenIn`이 지배 변수이며
 *     호출당 5,000~20,000 토큰이 될 수 있다. **Task 4에서 반드시 실측하라** —
 *     Gemini에서 이미 한 번 틀린 가정이다.
 *
 * ★ **사고(thinking) 토큰을 빠뜨리지 마라.** 실측에서 `flash-lite`는 0이었지만
 *   `flash`는 한 번에 2,404 토큰을 썼고 출력 단가로 청구된다. 모델을 한 단계
 *   올리면 호출당 원가가 3.2원 → 41.9원(13배)이 된다. `CostUsage.tokensThinking`이
 *   그 몫이며 출력 단가로 계산한다.
 *
 * 설계 문서: "이 설계 과정에서 원가 계산이 두 번 틀렸다. 계산은 틀리고 실측만 맞는다."
 */
export const PRICING: Record<EngineId, EnginePrice> = {
  // 검색 툴 요금은 확정값. 토큰 단가는 실제로 고를 모델에 맞춰 채운다.
  chatgpt: { perCallUsd: 0.01, perMTokenInUsd: 1.25, perMTokenOutUsd: 10 },
  gemini: { perCallUsd: 0.014, perMTokenInUsd: 1.5, perMTokenOutUsd: 9 },
  // SerpApi Starter $25 / 1,000건 = 건당 $0.025
  naver: { perCallUsd: 0.025, perMTokenInUsd: 0, perMTokenOutUsd: 0 },
  google_aio: { perCallUsd: 0.025, perMTokenInUsd: 0, perMTokenOutUsd: 0 },
}

/**
 * ★ 무료 진단은 **저가 모델**로 돈다 (설계 문서 "무료 진단 플로우").
 *
 * 검색 툴 요금($0.01)은 그대로 붙지만 토큰 단가가 한 자릿수 배로 떨어져
 * 호출당 60% 이상 절감된다. 무료 진단은 리드 수집용이라 유료 측정만큼의
 * 정확도가 필요 없다.
 *
 * 3단계의 무료 진단 잡은 위 PRICING이 아니라 **이 표**로 원가를 계산해야 한다
 * (`estimateFreeAuditCostMilliKrw`). 하나로 합치면 무료 진단 예산 킬스위치가
 * 실제보다 비싸게 계산해 조기에 막는다.
 */
export const FREE_AUDIT_PRICING: Record<'chatgpt' | 'gemini', EnginePrice> = {
  chatgpt: { perCallUsd: 0.01, perMTokenInUsd: 0.15, perMTokenOutUsd: 0.6 }, // 실제 고를 mini급 모델 단가로 교체
  // gemini-3.5-flash-lite 실측 단가 (2026-07-29 공식 가격표 확인).
  //
  // ★ perCallUsd가 0이 아니다. 한때 0으로 적어뒀는데 **틀렸다** —
  //   "월 5,000건 무료"는 근거 없는 값이었고, 실제로는 무료 티어에 검색
  //   그라운딩이 아예 없다. 무료 진단이라고 검색이 공짜가 되지 않는다.
  //   토큰 단가만 저가 모델 몫으로 낮아진다.
  gemini: { perCallUsd: 0.014, perMTokenInUsd: 0.3, perMTokenOutUsd: 2.5 },
}

/**
 * Gemini 검색 그라운딩 단가. **무료 한도는 없다.**
 *
 * 이전에 `GEMINI_FREE_GROUNDING_PER_MONTH = 5000`을 두고 있었으나 근거가 없는
 * 값이었다. 공식 가격표는 무료 티어에서 "Not available", 유료 티어에서
 * $14 / 1,000 검색 질의다. 결제를 켜야만 측정이 가능하다.
 */
export const GEMINI_SEARCH_USD = 0.014

/** Claude Haiku 4.5 판정기 단가 ($1 / $5 per MTok) */
export const JUDGE_PRICING = { perMTokenInUsd: 1, perMTokenOutUsd: 5 }

export interface CostUsage {
  calls: number
  /** 모델이 실제로 실행한 검색 질의 수. 없으면 calls로 물러선다. */
  searches?: number
  tokensIn?: number
  tokensOut?: number
  /** 사고 토큰. 출력 단가로 청구된다. */
  tokensThinking?: number
}

function assertNonNegative(usage: CostUsage): void {
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`비용 계산: ${key}가 음수이거나 유한하지 않습니다 (${value})`)
    }
  }
}

function costUsd(price: EnginePrice, usage: CostUsage): number {
  assertNonNegative(usage)
  // 사고 토큰은 출력 토큰과 같은 단가다. 나눠서 받되 계산은 합쳐서 한다.
  const outTokens = (usage.tokensOut ?? 0) + (usage.tokensThinking ?? 0)
  // ★ 검색 요금은 호출 수가 아니라 **실제 검색 질의 수**로 매긴다.
  //   엔진이 실측값을 못 채웠을 때만 호출 수로 물러선다 — 그 경우는
  //   과소 계상이므로, 새 엔진을 붙일 때 searches를 반드시 채워라.
  const billableSearches = usage.searches ?? usage.calls
  return (
    billableSearches * price.perCallUsd +
    ((usage.tokensIn ?? 0) / 1_000_000) * price.perMTokenInUsd +
    (outTokens / 1_000_000) * price.perMTokenOutUsd
  )
}

/**
 * 밀리원(1/1000원) 정수.
 *
 * 예산 누적은 **이 단위로** 해야 한다. 호출 하나가 3.2원인데 원 단위로
 * 반올림하면 매 호출 0.2원씩 사라지고, 그 누락이 그대로 예산 킬스위치의
 * 오차가 된다. 밀리원 정수로 쌓으면 부동소수점 오차 없이 더할 수 있어
 * DB 컬럼에 그대로 담아도 된다.
 */
export function estimateCostMilliKrw(engineId: EngineId, usage: CostUsage): number {
  return Math.round(costUsd(PRICING[engineId], usage) * USD_TO_KRW * 1000)
}

/** 원(KRW) 정수. 화면 표시용. 누적에는 `estimateCostMilliKrw`를 써라. */
export function estimateCostKrw(engineId: EngineId, usage: CostUsage): number {
  return Math.round(estimateCostMilliKrw(engineId, usage) / 1000)
}

/**
 * 무료 진단 전용 원가. 저가 모델 단가표를 쓴다.
 *
 * 검색 요금은 유료 측정과 **같다**. 싸지는 건 토큰 단가뿐이다.
 */
export function estimateFreeAuditCostMilliKrw(
  engineId: 'chatgpt' | 'gemini',
  usage: CostUsage,
): number {
  return Math.round(costUsd(FREE_AUDIT_PRICING[engineId], usage) * USD_TO_KRW * 1000)
}

export function estimateJudgeCostKrw(tokensIn: number, tokensOut: number): number {
  const usd =
    (tokensIn / 1_000_000) * JUDGE_PRICING.perMTokenInUsd +
    (tokensOut / 1_000_000) * JUDGE_PRICING.perMTokenOutUsd
  return Math.round(usd * USD_TO_KRW)
}
