import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `run()`의 실패 경로 검증.
 *
 * 파서 테스트만으로는 여기가 전혀 검증되지 않는다. 그리고 여기가 실제로
 * 제품을 망가뜨리는 자리다 — 빈 답변을 "언급 없음"으로 흘려보내면 고객의
 * 언급률이 조용히 낮아지고, 취소를 재시도로 판정하면 타임아웃이 무의미해진다.
 *
 * SDK를 모킹한다. 실제 API 호출은 스모크 테스트의 몫이고 CI에 두지 않는다.
 */
const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
}))

vi.mock('@/lib/env', () => ({ env: { GEMINI_API_KEY: 'test-key' } }))

afterEach(() => {
  generateContent.mockReset()
})

async function engine() {
  const { createGeminiEngine } = await import('@/lib/engines/gemini')
  return createGeminiEngine()
}

const okResponse = {
  candidates: [
    {
      content: { parts: [{ text: '무신사를 추천합니다.' }] },
      finishReason: 'STOP',
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://a.example', title: 'A' } }],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 920, thoughtsTokenCount: 0 },
}

describe('geminiEngine.run — 정상 경로', () => {
  it('텍스트·인용·사용량·원본을 함께 돌려준다', async () => {
    generateContent.mockResolvedValue(okResponse)
    const answer = await (await engine()).run('러닝화 추천', { sampleIndex: 0 })

    expect(answer.text).toBe('무신사를 추천합니다.')
    expect(answer.citations).toEqual([{ url: 'https://a.example', title: 'A' }])
    expect(answer.usage).toEqual({ calls: 1, tokensIn: 10, tokensOut: 920, tokensThinking: 0 })
    // raw는 절대 버리지 않는다 — 판정 로직을 고친 뒤 재판정에 쓴다.
    expect(answer.raw).toBe(okResponse)
  })

  it('googleSearch 툴을 켜서 호출한다', async () => {
    generateContent.mockResolvedValue(okResponse)
    await (await engine()).run('러닝화 추천', { sampleIndex: 0 })

    const config = generateContent.mock.calls[0]?.[0]?.config
    expect(config.tools).toEqual([{ googleSearch: {} }])
    expect(config.systemInstruction).toContain('한국어')
  })

  it('signal이 없으면 abortSignal을 넘기지 않는다', async () => {
    generateContent.mockResolvedValue(okResponse)
    await (await engine()).run('q', { sampleIndex: 0 })
    expect('abortSignal' in generateContent.mock.calls[0]![0].config).toBe(false)
  })

  it('signal이 있으면 SDK로 전달한다 (잡 타임아웃이 실제로 먹어야 한다)', async () => {
    generateContent.mockResolvedValue(okResponse)
    const controller = new AbortController()
    await (await engine()).run('q', { sampleIndex: 0, signal: controller.signal })
    expect(generateContent.mock.calls[0]?.[0]?.config?.abortSignal).toBe(controller.signal)
  })

  it('모델을 바꿔 인스턴스를 만들 수 있다 (무료 진단용 저가 모델)', async () => {
    const { createGeminiEngine } = await import('@/lib/engines/gemini')
    generateContent.mockResolvedValue(okResponse)
    await createGeminiEngine({ model: 'gemini-3.5-flash' }).run('q', { sampleIndex: 0 })
    expect(generateContent.mock.calls[0]?.[0]?.model).toBe('gemini-3.5-flash')
  })
})

describe('geminiEngine.run — 빈 답변은 "언급 없음"이 아니다', () => {
  it('본문이 비면 던진다', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
      usageMetadata: {},
    })
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toThrow(/빈 답변/)
  })

  it('공백뿐인 본문도 빈 것으로 본다', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: '   \n ' }] }, finishReason: 'STOP' }],
    })
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toThrow(/빈 답변/)
  })

  it('안전 필터로 막힌 경우는 재시도하지 않는다', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }],
    })
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      retryable: false,
    })
  })

  it('원인 모를 빈 답변은 재시도한다', async () => {
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
    })
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      retryable: true,
    })
  })
})

describe('geminiEngine.run — 에러 분류', () => {
  it('429를 재시도 가능·긴 대기로 분류한다', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }))
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      retryable: true,
      backoffHint: 'long',
    })
  })

  it('400을 즉시 포기로 분류한다', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }))
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      retryable: false,
    })
  })

  it('네트워크 에러(status 없음)는 재시도 가능하다', async () => {
    generateContent.mockRejectedValue(Object.assign(new Error('boom'), { code: 'ECONNRESET' }))
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      retryable: true,
      status: undefined,
    })
  })

  it('gRPC code를 HTTP status로 오해하지 않는다', async () => {
    // ★ Google SDK 에러는 gRPC 코드(8 = RESOURCE_EXHAUSTED)를 code에 싣는다.
    //   이걸 HTTP status로 읽으면 8은 429도 5xx도 아니므로 "400류 = 즉시 포기"가
    //   되어, 쿼터 초과로 실패한 수집이 재시도 없이 버려진다.
    generateContent.mockRejectedValue(Object.assign(new Error('quota'), { code: 8 }))
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      status: undefined,
      retryable: true,
    })
  })

  it('취소는 EngineError로 감싸지 않고 그대로 던진다', async () => {
    // ★ 감싸면 name이 'EngineError'가 되어 AbortError라는 사실이 사라지고,
    //   isRetryable이 재시도로 판정해 타임아웃으로 끊은 호출이 되살아난다.
    const { isRetryable } = await import('@/lib/engines/types')
    const aborted = new DOMException('aborted', 'AbortError')
    generateContent.mockRejectedValue(aborted)

    const error = await (await engine()).run('q', { sampleIndex: 0 }).catch((e: unknown) => e)
    expect(error).toBe(aborted)
    expect(isRetryable(error)).toBe(false)
  })

  it('원본 에러를 cause로 보존한다', async () => {
    const original = Object.assign(new Error('upstream'), { status: 500 })
    generateContent.mockRejectedValue(original)
    await expect((await engine()).run('q', { sampleIndex: 0 })).rejects.toMatchObject({
      cause: original,
    })
  })
})

describe('레지스트리', () => {
  it('gemini가 등록되어 있다', async () => {
    const { getEngine, implementedEngineIds } = await import('@/lib/engines')
    expect(implementedEngineIds()).toContain('gemini')
    const e = await getEngine('gemini')
    expect(e.id).toBe('gemini')
    expect(e.tier).toBe('llm')
  })

  it('미구현 엔진은 무엇이 구현됐는지 알려준다', async () => {
    const { getEngine } = await import('@/lib/engines')
    await expect(getEngine('naver')).rejects.toThrow(/구현된 엔진: gemini/)
  })
})
