import { describe, expect, it } from 'vitest'
import { EngineError, isRetryable } from '@/lib/engines/types'
import {
  FREE_AUDIT_PRICING,
  GEMINI_SEARCH_USD,
  estimateCostKrw,
  estimateCostMilliKrw,
  estimateFreeAuditCostMilliKrw,
  estimateJudgeCostKrw,
  estimateJudgeCostMilliKrw,
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
    // 델타는 "원 단위로는 안 보이지만 밀리원으로는 보이는" 크기여야 한다.
    // 토큰 단가가 내려가면(모델 교체) 1토큰 차이는 밀리원에서도 사라지므로
    // 여기 델타도 같이 키워야 한다 — 실제로 gpt-5 → gpt-5-mini에서 겪었다.
    const a = { calls: 1, tokensIn: 100, tokensOut: 100 } as const
    const b = { calls: 1, tokensIn: 600, tokensOut: 100 } as const
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

describe('estimateFreeAuditCostMilliKrw — 무료 진단 원가', () => {
  it('유료 측정과 **같은** 단가다 (같은 모델을 쓰기 때문)', () => {
    // 원래는 무료를 더 싼 모델로 돌릴 계획이었고 이 테스트도 "더 싸다"를
    // 단언했다. 2026-07-30에 뒤집었다 — 모델이 다르면 같은 브랜드의 언급률이
    // 무료와 유료에서 다르게 나오고, 무료 진단의 숫자가 유료 전환의 근거이므로
    // 그 순간 근거가 무너진다. 차이는 질의 수·측정 횟수·지속성으로 둔다.
    //
    // 다시 나누기로 결정하면 이 단언을 되돌리고 FREE_AUDIT_PRICING만 고치면 된다.
    for (const engineId of ['chatgpt', 'gemini'] as const) {
      const usage = { calls: 1, searches: 2, tokensIn: 8468, tokensOut: 920 }
      expect(estimateFreeAuditCostMilliKrw(engineId, usage)).toBe(
        estimateCostMilliKrw(engineId, usage),
      )
    }
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

describe('estimateJudgeCostMilliKrw', () => {
  // ★ 원 단위 반올림으로는 판정 원가를 누적할 수 없다. 판정 호출 하나가
  //   1원 미만이면 estimateJudgeCostKrw는 **0을 돌려주고**, 그것을 아무리
  //   더해도 0이다. 원가가 조용히 사라진다 — 이 파일 상단이 수집 원가에 대해
  //   경고하는 것과 같은 함정이다.
  it('1원 미만도 0으로 뭉개지 않는다', () => {
    expect(estimateJudgeCostKrw(100, 20)).toBe(0)
    expect(estimateJudgeCostMilliKrw(100, 20)).toBeGreaterThan(0)
  })

  it('밀리원 정수를 돌려준다', () => {
    expect(Number.isInteger(estimateJudgeCostMilliKrw(1234, 567))).toBe(true)
  })

  it('원 단위 함수와 1000배로 맞는다', () => {
    const milli = estimateJudgeCostMilliKrw(500_000, 100_000)
    expect(estimateJudgeCostKrw(500_000, 100_000)).toBe(Math.round(milli / 1000))
  })

  it('출력 토큰이 입력보다 비싸다', () => {
    // Haiku 4.5는 $1 / $5. 단가표가 뒤집히면 원가가 과소 계상된다.
    expect(estimateJudgeCostMilliKrw(0, 1_000_000)).toBeGreaterThan(
      estimateJudgeCostMilliKrw(1_000_000, 0),
    )
  })
})
