export type EngineId = 'chatgpt' | 'gemini' | 'naver' | 'google_aio'
export type EngineTier = 'llm' | 'serp'
export type PlanId = 'free' | 'starter' | 'business'

export const ENGINE_TIER: Record<EngineId, EngineTier> = {
  chatgpt: 'llm',
  gemini: 'llm',
  naver: 'serp',
  google_aio: 'serp',
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
