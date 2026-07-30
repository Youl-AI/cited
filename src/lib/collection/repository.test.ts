import { describe, expect, it } from 'vitest'
import { buildAnswerRow, buildRunMetrics, resolveRunStatus, validateRunStart } from '@/lib/collection/repository'
import type { CollectedAnswer } from '@/lib/collection/run'

function collected(overrides: Partial<CollectedAnswer> = {}): CollectedAnswer {
  return {
    queryId: 'q1',
    queryText: '러닝화 추천',
    engineId: 'chatgpt',
    sampleIndex: 0,
    text: '아식스를 추천합니다.',
    citations: [{ url: 'https://a.com/x', title: 'A' }],
    raw: { original: true },
    usage: { calls: 1, searches: 2, tokensIn: 10, tokensOut: 900, tokensThinking: 100 },
    costMilliKrw: 42_400,
    ...overrides,
  }
}

describe('validateRunStart', () => {
  const base = {
    brandId: 'b1',
    plan: 'starter' as const,
    queryPacks: 0,
    queriesOnOtherBrands: 0,
  }

  it('질의가 없으면 거부한다', () => {
    expect(() => validateRunStart({ ...base, queries: [] })).toThrowError(/질의/)
  })

  it('한도를 넘는 질의 수를 거부한다', () => {
    const queries = Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    expect(() => validateRunStart({ ...base, queries })).toThrowError(/한도/)
  })

  it('한도와 같은 수는 허용한다', () => {
    const queries = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    expect(() => validateRunStart({ ...base, queries })).not.toThrow()
  })

  it('질의 팩을 반영한 한도까지 허용한다', () => {
    const queries = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    expect(() => validateRunStart({ ...base, queries, queryPacks: 1 })).not.toThrow()
  })

  it('중복 질의 id를 거부한다', () => {
    // ★ 중복은 answerId(`queryId:engineId:sampleIndex`)를 충돌시켜 저장이
    //   덮어써진다. 돈은 두 번 쓰고 데이터는 한 번분만 남는다.
    //   buildFanout이 걸러내지만, 여기서 먼저 잡으면 원인이 분명해진다.
    expect(() =>
      validateRunStart({ ...base, queries: [{ id: 'q1', text: 'a' }, { id: 'q1', text: 'b' }] }),
    ).toThrowError(/중복/)
  })

  it('오류 메시지에 brandId를 담는다', () => {
    // 여러 브랜드를 돌리는 스케줄러에서 어느 브랜드가 막혔는지 알아야 한다.
    expect(() => validateRunStart({ ...base, queries: [] })).toThrowError(/b1/)
  })

  // ★ 질의 한도는 **계정 전체**의 것이다. 브랜드마다 따로 주면 Business
  //   고객이 3브랜드 × 30질의 = 90질의를 돌려 원가율이 51%가 된다
  //   (2026-07-30 실측 단가 기준). Starter·질의 팩은 질의당 9,000~9,900원인데
  //   그 방식의 Business만 3,222원이라 가격 체계가 어긋난다.
  describe('한도는 계정 전체를 센다', () => {
    it('다른 브랜드가 쓴 질의를 합쳐서 한도를 넘으면 거부한다', () => {
      const queries = Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, text: 't' }))
      // starter 한도 10. 다른 브랜드가 7개를 쓰고 있으면 4개를 더 못 돌린다.
      expect(() =>
        validateRunStart({ ...base, queries, queriesOnOtherBrands: 7 }),
      ).toThrowError(/한도/)
    })

    it('합계가 한도와 같으면 허용한다', () => {
      const queries = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, text: 't' }))
      expect(() =>
        validateRunStart({ ...base, queries, queriesOnOtherBrands: 7 }),
      ).not.toThrow()
    })

    it('오류 메시지가 합계와 한도를 함께 보여준다', () => {
      // "질의 4개인데 한도 10을 넘는다"만 나오면 운영자도 고객도 이해 못 한다.
      const queries = Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, text: 't' }))
      let message = ''
      try {
        validateRunStart({ ...base, queries, queriesOnOtherBrands: 7 })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).toContain('11') // 7 + 4
      expect(message).toContain('10') // 한도
      expect(message).toMatch(/다른 브랜드|계정/)
    })

    it('질의 팩은 계정 전체 한도를 늘린다', () => {
      const queries = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, text: 't' }))
      expect(() =>
        validateRunStart({ ...base, queries, queriesOnOtherBrands: 10, queryPacks: 1 }),
      ).not.toThrow()
    })

    it('음수는 한도를 늘리는 데 쓸 수 없다', () => {
      // 호출자가 뺄셈을 잘못해 음수를 넘기면 한도가 조용히 늘어난다.
      const queries = Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, text: 't' }))
      expect(() =>
        validateRunStart({ ...base, queries, queriesOnOtherBrands: -5 }),
      ).toThrowError(/한도/)
    })
  })
})

describe('buildAnswerRow', () => {
  it('원본(raw)을 반드시 담는다', () => {
    const row = buildAnswerRow('r1', collected())
    expect(row.raw).toEqual({ original: true })
    expect(row.text).toBe('아식스를 추천합니다.')
    expect(row.citations).toHaveLength(1)
  })

  it('질의문 스냅샷을 담는다 (질의가 나중에 수정되어도 남는다)', () => {
    expect(buildAnswerRow('r1', collected()).queryText).toBe('러닝화 추천')
  })

  it('같은 (run, query, engine, sample)이면 같은 id다', () => {
    // ★ id를 무작위로 만들면 재시도로 두 번 저장될 때 onConflictDoNothing이
    //   막지 못하고 같은 답변이 두 행이 된다. 그러면 언급률의 분모가 늘어난다.
    const a = buildAnswerRow('r1', collected())
    const b = buildAnswerRow('r1', collected())
    expect(a.id).toBe(b.id)
  })

  it('샘플이 다르면 id가 다르다', () => {
    const a = buildAnswerRow('r1', collected({ sampleIndex: 0 }))
    const b = buildAnswerRow('r1', collected({ sampleIndex: 1 }))
    expect(a.id).not.toBe(b.id)
  })

  it('수집이 다르면 id가 다르다', () => {
    expect(buildAnswerRow('r1', collected()).id).not.toBe(buildAnswerRow('r2', collected()).id)
  })
})

describe('buildRunMetrics', () => {
  const outcomes = [
    { engineId: 'chatgpt' as const, ok: true, attempts: 1 },
    { engineId: 'chatgpt' as const, ok: false, attempts: 3 },
    { engineId: 'gemini' as const, ok: true, attempts: 1 },
  ]
  const answers = [
    collected({ engineId: 'chatgpt', usage: { calls: 1, tokensIn: 10, tokensOut: 100 } }),
    collected({ engineId: 'gemini', sampleIndex: 1, usage: { calls: 1, searches: 2, tokensIn: 5, tokensOut: 50 } }),
  ]

  it('엔진별 호출 수를 시도 기준으로 센다', () => {
    // ★ 성공만 세면 실패에 쓴 돈이 원가에서 빠진다. 실패한 호출도 과금된다
    //   (429는 아니지만 500류·타임아웃은 이미 토큰을 태웠을 수 있다).
    const m = buildRunMetrics(outcomes, answers, 84_800)
    expect(m.callsByEngine.chatgpt).toBe(2)
    expect(m.callsByEngine.gemini).toBe(1)
  })

  it('토큰을 합산한다', () => {
    const m = buildRunMetrics(outcomes, answers, 84_800)
    expect(m.tokensIn).toBe(15)
    expect(m.tokensOut).toBe(150)
  })

  it('SERP 호출 수는 SERP 엔진만 센다', () => {
    // ★ LLM 호출을 SerpApi 쿼터에 넣으면 월 1,000건 경고가 엉뚱한 시점에 뜬다.
    const m = buildRunMetrics(
      [
        { engineId: 'naver' as const, ok: true, attempts: 1 },
        { engineId: 'chatgpt' as const, ok: true, attempts: 1 },
      ],
      [collected({ engineId: 'naver' }), collected({ engineId: 'chatgpt' })],
      0,
    )
    expect(m.serpApiCalls).toBe(1)
  })

  it('원가를 밀리원 그대로 담고 원 단위로도 제공한다', () => {
    const m = buildRunMetrics(outcomes, answers, 84_800)
    expect(m.estimatedCostMilliKrw).toBe(84_800)
    expect(m.estimatedCostKrw).toBe(85)
  })

  it('stage1PassRate는 판정 단계가 채운다', () => {
    expect(buildRunMetrics(outcomes, answers, 0).stage1PassRate).toBeNull()
  })

  it('결과가 없으면 0으로 채운다 (undefined를 남기지 않는다)', () => {
    const m = buildRunMetrics([], [], 0)
    expect(m).toMatchObject({ tokensIn: 0, tokensOut: 0, serpApiCalls: 0, estimatedCostKrw: 0 })
    expect(m.callsByEngine).toEqual({})
  })
})

describe('resolveRunStatus', () => {
  it('전부 성공이면 succeeded', () => {
    expect(resolveRunStatus({ chatgpt: { attempted: 10, succeeded: 10 } })).toBe('succeeded')
  })

  it('한 건도 못 얻으면 failed', () => {
    expect(resolveRunStatus({ chatgpt: { attempted: 10, succeeded: 0 } })).toBe('failed')
  })

  it('부분 실패면 partial', () => {
    expect(
      resolveRunStatus({
        chatgpt: { attempted: 10, succeeded: 10 },
        naver: { attempted: 10, succeeded: 0 },
      }),
    ).toBe('partial')
  })

  it('90% 이상이면 succeeded (배지 기준과 같다)', () => {
    // ★ isDegraded와 같은 경계를 쓴다. 다르면 배지는 없는데 상태는 partial인
    //   행이 생기고, 그것을 보고 장애를 찾으러 나선다.
    expect(resolveRunStatus({ chatgpt: { attempted: 10, succeeded: 9 } })).toBe('succeeded')
    expect(resolveRunStatus({ chatgpt: { attempted: 10, succeeded: 8 } })).toBe('partial')
  })

  it('시도가 아예 없으면 failed', () => {
    // 성공률 계산은 1(완전)을 돌려주지만, 답변 0건은 성공이 아니다.
    expect(resolveRunStatus({})).toBe('failed')
  })
})
