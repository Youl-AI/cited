export type EngineId = 'chatgpt' | 'gemini' | 'naver' | 'google_aio'
export type EngineTier = 'llm' | 'serp'
export type PlanId = 'free' | 'starter' | 'business'

export const ENGINE_TIER: Record<EngineId, EngineTier> = {
  chatgpt: 'llm',
  gemini: 'llm',
  naver: 'serp',
  google_aio: 'serp',
}

/**
 * 고객에게 보여줄 엔진 이름.
 *
 * ★ `EngineId`를 화면에 그대로 쓰면 안 된다. `google_aio`·`chatgpt`는 내부
 *   식별자다 — 실제로 랜딩에 "무료 진단은 chatgpt · gemini만 봅니다"가 찍혀
 *   나갔다. 식별자와 표시 이름을 갈라 두면 다음에도 같은 실수를 안 한다.
 */
export const ENGINE_LABEL: Record<EngineId, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  naver: '네이버 AI 브리핑',
  google_aio: 'Google AI 개요',
}

/** 엔진 목록을 고객이 읽을 문장으로 만든다. */
export function engineLabels(engines: readonly EngineId[]): string[] {
  return engines.map((id) => ENGINE_LABEL[id])
}

export interface PlanConfig {
  /** 월 구독료(원). 무료 진단은 0 */
  priceKrw: number
  maxBrands: number
  maxQueries: number
  maxCompetitors: number
  engines: readonly EngineId[]
  samples: { llm: number; serp: number }
  /** null = 무제한 */
  historyMonths: number | null
  csvExport: boolean
}

export const PLANS = {
  free: {
    priceKrw: 0,
    maxBrands: 1,
    maxQueries: 3,
    maxCompetitors: 3,
    engines: ['chatgpt', 'gemini'],
    samples: { llm: 1, serp: 0 },
    historyMonths: 0,
    csvExport: false,
  },
  starter: {
    priceKrw: 99_000,
    maxBrands: 1,
    maxQueries: 10,
    maxCompetitors: 3,
    engines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
    samples: { llm: 3, serp: 2 },
    historyMonths: 3,
    csvExport: false,
  },
  business: {
    priceKrw: 290_000,
    maxBrands: 3,
    maxQueries: 30,
    maxCompetitors: 10,
    engines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
    samples: { llm: 3, serp: 2 },
    historyMonths: null,
    csvExport: true,
  },
} as const satisfies Record<PlanId, PlanConfig>

export const QUERY_PACK_SIZE = 10
export const QUERY_PACK_PRICE_KRW = 90_000

/** 월 평균 주 수. 원가·SerpApi 소진 예측에 쓴다. */
export const WEEKS_PER_MONTH = 4.3

export interface PlanLimits {
  maxBrands: number
  /**
   * **계정 전체**의 질의 한도. 브랜드마다 주는 것이 아니다.
   *
   * ★ 2026-07-30 결정. 브랜드별로 주면 Business가 3브랜드 × 30질의 = 90질의가
   *   되고, 실측 단가(질의 1개당 월 1,642원 — 답변당 LLM 38.68원 · SERP 37.45원,
   *   samples LLM 3회 · SERP 2회 × 4.3주)로 월 원가 147,800원, **원가율 51%**다.
   *
   *   더 결정적인 근거는 다른 가격과의 정합성이다. 질의당 받는 돈이
   *     Starter  99,000 ÷ 10 = 9,900원
   *     질의 팩  90,000 ÷ 10 = 9,000원
   *     Business(브랜드별, 90) = 3,222원   ← 혼자만 1/3
   *     Business(계정 전체, 30) = 9,667원  ← 줄이 맞는다
   *   즉 브랜드별 해석은 대량 할인이 아니라 가격표의 사고였다.
   *
   *   계정 전체로 두면 Business 원가율은 17%로 Starter(17.2%)와 같아지고,
   *   **요금제 화면의 "질의 30개"를 바꾸지 않아도 된다.** 브랜드를 하나만 쓰는
   *   고객은 지금 광고하는 것과 정확히 같은 것을 받는다.
   *
   *   강제하는 곳은 `validateRunStart`의 `queriesOnOtherBrands`다.
   */
  maxQueries: number
  maxCompetitors: number
  engines: readonly EngineId[]
  samples: { llm: number; serp: number }
  historyMonths: number | null
  csvExport: boolean
}

/**
 * 질의 팩 개수를 정제한다. NaN, Infinity, 음수는 0으로 취급하고, 소수는 버린다.
 * resolveLimits와 monthlyPriceKrw에서 공용으로 사용하여 일관성을 보장한다.
 */
function sanitizePacks(queryPacks: number): number {
  return Number.isFinite(queryPacks) ? Math.max(0, Math.floor(queryPacks)) : 0
}

/**
 * 구매한 질의 팩을 반영한 실제 한도.
 * 설계 ②: `PLANS[plan].maxQueries + queryPacks * QUERY_PACK_SIZE`
 */
export function resolveLimits(plan: PlanId, queryPacks: number): PlanLimits {
  const base = PLANS[plan]
  const packs = sanitizePacks(queryPacks)
  return {
    maxBrands: base.maxBrands,
    maxQueries: base.maxQueries + packs * QUERY_PACK_SIZE,
    maxCompetitors: base.maxCompetitors,
    engines: base.engines,
    samples: base.samples,
    historyMonths: base.historyMonths,
    csvExport: base.csvExport,
  }
}

/** 월 구독 금액(원) — 기본 플랜 + 질의 팩. 항상 정수 KRW를 반환한다. */
export function monthlyPriceKrw(plan: PlanId, queryPacks: number): number {
  const packs = sanitizePacks(queryPacks)
  return PLANS[plan].priceKrw + packs * QUERY_PACK_PRICE_KRW
}

/** 수집 1회의 총 엔진 호출 수 = 질의수 × Σ(엔진별 샘플수) */
export function expectedCallsPerRun(plan: PlanId, queryCount: number): number {
  const { engines, samples } = PLANS[plan]
  const perQuery = engines.reduce(
    (sum, id) => sum + (ENGINE_TIER[id] === 'llm' ? samples.llm : samples.serp),
    0,
  )
  return queryCount * perQuery
}

/**
 * 월 SerpApi 호출 예상치.
 * 설계 문서: 질의수 × 2 SERP엔진 × 2샘플 × 4.3주
 * SerpApi 플랜 업그레이드 판단은 고객 수가 아니라 이 값의 합계로 한다.
 */
export function expectedSerpCallsPerMonth(plan: PlanId, queryCount: number): number {
  const { engines, samples } = PLANS[plan]
  const serpEngines = engines.filter((id) => ENGINE_TIER[id] === 'serp').length
  return Math.round(queryCount * serpEngines * samples.serp * WEEKS_PER_MONTH)
}

/**
 * 저장된 문자열을 표시 이름으로 바꾼다.
 *
 * ★ `AuditResult.engines`·`EvidenceItem.engineId`는 `string`이다(리포트가 jsonb로
 *   저장되므로 과거 리포트에 지금 없는 엔진이 들어 있을 수 있다). 모르는 값은
 *   지우지 않고 원문을 돌려준다 — 지우면 과거 리포트에서 엔진 이름이 사라진다.
 */
export function engineLabel(id: string): string {
  return id in ENGINE_LABEL ? ENGINE_LABEL[id as EngineId] : id
}
