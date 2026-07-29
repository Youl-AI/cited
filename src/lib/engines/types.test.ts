import { describe, expect, it } from 'vitest'
import { EngineError, isRetryable } from '@/lib/engines/types'
import {
  FREE_AUDIT_PRICING,
  GEMINI_SEARCH_USD,
  estimateCostKrw,
  estimateCostMilliKrw,
  estimateFreeAuditCostMilliKrw,
  estimateJudgeCostKrw,
} from '@/lib/engines/pricing'

describe('EngineError', () => {
  it('429는 재시도 가능하고 더 긴 대기를 요구한다', () => {
    const e = new EngineError('rate limited', { engineId: 'chatgpt', status: 429 })
    expect(e.retryable).toBe(true)
    expect(e.backoffHint).toBe('long')
  })

  it('5xx는 재시도 가능하다', () => {
    expect(new EngineError('boom', { engineId: 'gemini', status: 503 }).retryable).toBe(true)
  })

  it('경계값 500과 499를 가른다', () => {
    // 503만으로는 `>= 500`을 `> 500`으로 바꿔도 안 잡힌다 (변이 테스트에서 확인).
    expect(new EngineError('x', { engineId: 'gemini', status: 500 }).retryable).toBe(true)
    expect(new EngineError('x', { engineId: 'gemini', status: 499 }).retryable).toBe(false)
  })

  it('경계값 429와 428을 가른다', () => {
    expect(new EngineError('x', { engineId: 'gemini', status: 429 }).backoffHint).toBe('long')
    expect(new EngineError('x', { engineId: 'gemini', status: 428 }).backoffHint).toBe('none')
  })

  it('400류는 즉시 포기한다', () => {
    const e = new EngineError('bad request', { engineId: 'naver', status: 400 })
    expect(e.retryable).toBe(false)
    expect(e.backoffHint).toBe('none')
  })

  it('네트워크 에러(status 없음)는 재시도 가능하다', () => {
    expect(new EngineError('ECONNRESET', { engineId: 'chatgpt' }).retryable).toBe(true)
  })

  it('isRetryable은 EngineError가 아닌 에러도 판정한다', () => {
    expect(isRetryable(new Error('unknown'))).toBe(true)
    expect(isRetryable(new EngineError('x', { engineId: 'naver', status: 401 }))).toBe(false)
  })

  it('취소(AbortError)는 재시도하지 않는다', () => {
    // 사용자가 껐거나 잡이 타임아웃된 것이다. 다시 부르면 취소의 의미가 없다.
    const aborted = new DOMException('The operation was aborted.', 'AbortError')
    expect(isRetryable(aborted)).toBe(false)
  })

  it('cause를 보존한다 (원인 추적)', () => {
    const cause = new Error('socket hang up')
    expect(new EngineError('x', { engineId: 'gemini', cause }).cause).toBe(cause)
  })
})

describe('estimateCostKrw', () => {
  it('검색 질의 수로 청구한다 — 호출 수가 아니다', () => {
    // ★ Gemini 3는 "each search query that the model decides to execute" 기준.
    //   실측에서 한 호출이 검색을 2건 돌렸다. 호출 수로 계산하면 절반이 된다.
    const oneSearch = estimateCostMilliKrw('gemini', { calls: 1, searches: 1 })
    const twoSearches = estimateCostMilliKrw('gemini', { calls: 1, searches: 2 })
    expect(twoSearches).toBe(oneSearch * 2)
  })

  it('searches가 없으면 호출 수로 물러선다', () => {
    expect(estimateCostMilliKrw('gemini', { calls: 3 })).toBe(
      estimateCostMilliKrw('gemini', { calls: 3, searches: 3 }),
    )
  })

  it('SERP 엔진은 호출 건당 정액', () => {
    const cost = estimateCostKrw('naver', { calls: 1 })
    expect(cost).toBeGreaterThan(0)
    expect(estimateCostKrw('naver', { calls: 4 })).toBeCloseTo(cost * 4, 6)
  })

  it('LLM 엔진은 토큰에 비례한다', () => {
    const small = estimateCostKrw('chatgpt', { calls: 1, tokensIn: 100, tokensOut: 100 })
    const big = estimateCostKrw('chatgpt', { calls: 1, tokensIn: 1000, tokensOut: 1000 })
    expect(big).toBeGreaterThan(small)
  })

  it('토큰 정보가 없으면 0이 아니라 호출 기본 비용을 낸다', () => {
    expect(estimateCostKrw('gemini', { calls: 1 })).toBeGreaterThan(0)
  })

  it('원 단위 정수를 돌려준다 (소수점 금액 금지)', () => {
    expect(
      Number.isInteger(estimateCostKrw('chatgpt', { calls: 3, tokensIn: 1234, tokensOut: 567 })),
    ).toBe(true)
  })

  it('사고 토큰을 출력 단가로 청구한다', () => {
    // 실측: flash-lite는 0, flash는 한 번에 2,404 토큰. 빠뜨리면 원가가 13배 틀린다.
    const without = estimateCostMilliKrw('gemini', { calls: 1, tokensIn: 10, tokensOut: 900 })
    const withThinking = estimateCostMilliKrw('gemini', {
      calls: 1,
      tokensIn: 10,
      tokensOut: 900,
      tokensThinking: 2404,
    })
    expect(withThinking).toBeGreaterThan(without)

    // 사고 토큰 N개 = 출력 토큰 N개와 같은 금액이어야 한다.
    const asOutput = estimateCostMilliKrw('gemini', {
      calls: 1,
      tokensIn: 10,
      tokensOut: 900 + 2404,
    })
    expect(withThinking).toBe(asOutput)
  })
})

describe('estimateCostMilliKrw — 예산 누적용 정밀 단위', () => {
  it('밀리원 정수를 돌려준다 (부동소수점을 DB로 흘리지 않는다)', () => {
    const v = estimateCostMilliKrw('gemini', { calls: 1, tokensIn: 10, tokensOut: 920 })
    expect(Number.isInteger(v)).toBe(true)
  })

  it('반올림 이전 값이라 원 단위로는 안 보이는 차이를 구분한다', () => {
    // 원 단위로 반올림하면 두 값이 같아져 예산 누적이 조용히 어긋난다.
    const a = { calls: 1, tokensIn: 100, tokensOut: 100 } as const
    const b = { calls: 1, tokensIn: 101, tokensOut: 100 } as const
    expect(estimateCostKrw('chatgpt', a)).toBe(estimateCostKrw('chatgpt', b))
    expect(estimateCostMilliKrw('chatgpt', a)).toBeLessThan(estimateCostMilliKrw('chatgpt', b))
  })

  it('estimateCostKrw는 밀리원을 반올림한 값이다', () => {
    const usage = { calls: 2, tokensIn: 4321, tokensOut: 876, tokensThinking: 100 }
    expect(estimateCostKrw('chatgpt', usage)).toBe(
      Math.round(estimateCostMilliKrw('chatgpt', usage) / 1000),
    )
  })

  it('음수 사용량은 거부한다 (예산 누적을 되돌리는 값이 들어오면 안 된다)', () => {
    expect(() => estimateCostMilliKrw('gemini', { calls: -1 })).toThrow()
    expect(() => estimateCostMilliKrw('gemini', { calls: 1, tokensOut: -5 })).toThrow()
  })
})

describe('estimateFreeAuditCostMilliKrw — 무료 진단은 별도 단가표', () => {
  it('같은 사용량이면 유료 측정보다 싸다', () => {
    const usage = { calls: 1, tokensIn: 12, tokensOut: 920 }
    expect(estimateFreeAuditCostMilliKrw('gemini', usage)).toBeLessThan(
      estimateCostMilliKrw('gemini', usage),
    )
  })

  it('검색 요금은 무료 진단이라고 깎이지 않는다 (무료 티어에 그라운딩이 없다)', () => {
    // 한때 perCallUsd를 0으로 두고 "월 5,000건 무료"라고 적어뒀는데 틀렸다.
    // 무료 티어는 그라운딩 자체가 "Not available"이다.
    expect(FREE_AUDIT_PRICING.gemini.perCallUsd).toBe(GEMINI_SEARCH_USD)
  })

  it('토큰이 0이어도 검색 요금은 남는다', () => {
    const searchOnly = estimateFreeAuditCostMilliKrw('gemini', {
      calls: 1,
      searches: 1,
      tokensIn: 0,
      tokensOut: 0,
    })
    expect(searchOnly).toBe(Math.round(GEMINI_SEARCH_USD * 1400 * 1000))
  })

  it('검색을 안 한 답변에는 검색 요금이 붙지 않는다', () => {
    const noSearch = estimateFreeAuditCostMilliKrw('gemini', {
      calls: 1,
      searches: 0,
      tokensIn: 10,
      tokensOut: 100,
    })
    const withSearch = estimateFreeAuditCostMilliKrw('gemini', {
      calls: 1,
      searches: 1,
      tokensIn: 10,
      tokensOut: 100,
    })
    expect(withSearch - noSearch).toBe(Math.round(GEMINI_SEARCH_USD * 1400 * 1000))
  })

  it('실측 사용량으로 계산한 무료 진단 1건(3질의)이 150원 안쪽이다', () => {
    // 2026-07-29 실측: 입력 ~10 · 출력 ~920 토큰 · **검색 질의 2건/호출**.
    // 이 상한이 깨지면 3단계 예산 킬스위치를 다시 계산해야 한다.
    const perCall = estimateFreeAuditCostMilliKrw('gemini', {
      calls: 1,
      searches: 2,
      tokensIn: 12,
      tokensOut: 920,
    })
    expect((perCall * 3) / 1000).toBeLessThanOrEqual(150)
  })
})

describe('estimateJudgeCostKrw', () => {
  it('토큰이 늘면 비용이 는다', () => {
    expect(estimateJudgeCostKrw(10_000, 2_000)).toBeGreaterThan(estimateJudgeCostKrw(1_000, 200))
  })

  it('원 단위 정수를 돌려준다', () => {
    expect(Number.isInteger(estimateJudgeCostKrw(1234, 567))).toBe(true)
  })
})
