import { describe, expect, it } from 'vitest'
import { extractUsage, parseGeminiResponse } from '@/lib/engines/gemini'
import { estimateCostMilliKrw } from '@/lib/engines/pricing'

/**
 * 2026-07-29 실제 v1beta 응답에서 확인한 형태다
 * (docs/superpowers/notes/2026-07-29-gemini-token-actuals.md).
 * 추측으로 쓰지 않는다 — 실제 응답 키를 그대로 옮겼다.
 */
const raw = {
  candidates: [
    {
      content: {
        parts: [{ text: '나이키 페가수스와 뉴발란스 880을 추천합니다.' }],
        role: 'model',
      },
      finishReason: 'STOP',
      groundingMetadata: {
        webSearchQueries: ['30대 남자 러닝화 추천'],
        groundingChunks: [
          { web: { uri: 'https://c.example/1', title: '러닝화 가이드' } },
          { web: { uri: 'https://d.example/2', title: '리뷰 모음' } },
        ],
      },
    },
  ],
  usageMetadata: {
    promptTokenCount: 900,
    candidatesTokenCount: 210,
    thoughtsTokenCount: 0,
    toolUsePromptTokenCount: 0,
  },
}

describe('parseGeminiResponse', () => {
  it('텍스트를 뽑아낸다', () => {
    expect(parseGeminiResponse(raw).text).toContain('뉴발란스 880')
  })

  it('groundingChunks를 인용으로 정규화한다', () => {
    const parsed = parseGeminiResponse(raw)
    expect(parsed.citations).toHaveLength(2)
    expect(parsed.citations[0]).toEqual({
      url: 'https://c.example/1',
      title: '러닝화 가이드',
    })
  })

  it('parts가 여러 개면 이어붙인다', () => {
    const multi = structuredClone(raw)
    multi.candidates[0]!.content.parts = [{ text: 'A' }, { text: 'B' }]
    expect(parseGeminiResponse(multi).text).toBe('AB')
  })

  it('그라운딩 정보가 없어도 던지지 않는다', () => {
    const noGround = structuredClone(raw) as Record<string, unknown>
    delete (
      (noGround.candidates as Record<string, unknown>[])[0] as Record<string, unknown>
    ).groundingMetadata
    expect(parseGeminiResponse(noGround).citations).toEqual([])
  })

  it('title이 없으면 URL로 대체한다', () => {
    const noTitle = structuredClone(raw)
    noTitle.candidates[0]!.groundingMetadata.groundingChunks = [
      { web: { uri: 'https://e.example/3' } } as never,
    ]
    expect(parseGeminiResponse(noTitle).citations[0]).toEqual({
      url: 'https://e.example/3',
      title: 'https://e.example/3',
    })
  })

  it('title이 빈 문자열이어도 URL로 대체한다', () => {
    const emptyTitle = structuredClone(raw)
    emptyTitle.candidates[0]!.groundingMetadata.groundingChunks = [
      { web: { uri: 'https://g.example/5', title: '' } },
    ]
    expect(parseGeminiResponse(emptyTitle).citations[0]?.title).toBe('https://g.example/5')
  })

  it('같은 URL이 여러 청크로 오면 한 번만 센다', () => {
    // 근거 청크는 문장마다 반복되므로 중복이 흔하다. 중복을 그대로 두면
    // "인용 12건"처럼 부풀려진 숫자가 대시보드에 올라간다.
    const dup = structuredClone(raw)
    dup.candidates[0]!.groundingMetadata.groundingChunks = [
      { web: { uri: 'https://c.example/1', title: 'A' } },
      { web: { uri: 'https://c.example/1', title: 'A' } },
      { web: { uri: 'https://d.example/2', title: 'B' } },
    ]
    expect(parseGeminiResponse(dup).citations).toHaveLength(2)
  })

  it('web이 없는 청크(retrievedContext 등)는 건너뛴다', () => {
    const mixed = structuredClone(raw)
    mixed.candidates[0]!.groundingMetadata.groundingChunks = [
      { retrievedContext: { uri: 'x', title: 'y' } } as never,
      { web: { uri: 'https://f.example/4', title: 'F' } },
    ]
    expect(parseGeminiResponse(mixed).citations).toEqual([
      { url: 'https://f.example/4', title: 'F' },
    ])
  })

  it('예상치 못한 형태면 빈 결과를 돌려주고 던지지 않는다', () => {
    expect(parseGeminiResponse({ nope: 1 })).toEqual({ text: '', citations: [], finishReason: null })
    expect(parseGeminiResponse(null)).toEqual({ text: '', citations: [], finishReason: null })
    expect(parseGeminiResponse([])).toEqual({ text: '', citations: [], finishReason: null })
    expect(parseGeminiResponse('문자열')).toEqual({ text: '', citations: [], finishReason: null })
  })

  it('finishReason을 그대로 전달한다 (빈 답변의 원인 구분용)', () => {
    expect(parseGeminiResponse(raw).finishReason).toBe('STOP')
    const blocked = structuredClone(raw)
    blocked.candidates[0]!.finishReason = 'SAFETY'
    expect(parseGeminiResponse(blocked).finishReason).toBe('SAFETY')
  })
})

describe('extractUsage — 원가 계산의 입력', () => {
  it('사고 토큰을 별도로 담는다', () => {
    // ★ 출력에 합치면 어느 쪽이 원가를 밀어올렸는지 사후에 못 가린다.
    //   flash-lite는 0, flash는 2,404였고 그 차이만으로 13배였다.
    const withThoughts = structuredClone(raw)
    withThoughts.usageMetadata.thoughtsTokenCount = 2404
    const usage = extractUsage(withThoughts)
    expect(usage.tokensOut).toBe(210)
    expect(usage.tokensThinking).toBe(2404)
  })

  it('사고 토큰이 원가에 실제로 반영된다', () => {
    const cheap = extractUsage(raw)
    const expensive = extractUsage({
      ...raw,
      usageMetadata: { ...raw.usageMetadata, thoughtsTokenCount: 2404 },
    })
    expect(estimateCostMilliKrw('gemini', expensive)).toBeGreaterThan(
      estimateCostMilliKrw('gemini', cheap),
    )
  })

  it('툴 사용 프롬프트 토큰을 입력에 합산한다', () => {
    // 실측에서는 0이었지만 0이 아닐 때 조용히 누락되면 원가가 틀린다.
    const withTool = structuredClone(raw)
    withTool.usageMetadata.toolUsePromptTokenCount = 150
    expect(extractUsage(withTool).tokensIn).toBe(900 + 150)
  })

  it('usageMetadata가 없어도 던지지 않고 calls는 센다', () => {
    const usage = extractUsage({ candidates: [] })
    expect(usage.calls).toBe(1)
    expect(usage.tokensIn).toBe(0)
    expect(usage.tokensOut).toBe(0)
    expect(usage.tokensThinking).toBe(0)
  })

  it('숫자가 아닌 값이 와도 0으로 다룬다', () => {
    const weird = { usageMetadata: { promptTokenCount: null, candidatesTokenCount: 'x' } }
    expect(extractUsage(weird).tokensIn).toBe(0)
    expect(extractUsage(weird).tokensOut).toBe(0)
  })
})
