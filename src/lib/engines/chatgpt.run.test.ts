import type OpenAI from 'openai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatgptEngine } from '@/lib/engines/chatgpt'
import { EngineError, isRetryable } from '@/lib/engines/types'

/**
 * `run()`의 요청 구성과 실패 경로 검증.
 *
 * 파서 테스트만으로는 여기가 전혀 검증되지 않는다. 실제로 **`input`을 빠뜨린
 * 채 파서 테스트 23개가 전부 통과했고**, 스모크 테스트를 돌리고 나서야
 * "Missing required parameter: 'input'"으로 드러났다. 그 구멍을 여기서 막는다.
 */
const create = vi.fn()

function engine(model?: string) {
  const client = { responses: { create } } as unknown as OpenAI
  return createChatgptEngine(model ? { client, model } : { client })
}

const okResponse = {
  status: 'completed',
  output: [
    { type: 'web_search_call', id: 'ws_1', action: { queries: ['a', 'b', 'c'] } },
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '무신사를 추천합니다.',
          annotations: [
            { type: 'url_citation', url: 'https://a.example?utm_source=openai', title: 'A' },
          ],
        },
      ],
    },
  ],
  tool_usage: { web_search: { num_requests: 1 } },
  usage: {
    input_tokens: 8468,
    output_tokens: 358,
    output_tokens_details: { reasoning_tokens: 84 },
  },
}

afterEach(() => {
  create.mockReset()
})

describe('chatgptEngine.run — 요청 구성', () => {
  it('질의를 input으로 보낸다', async () => {
    // ★ 이걸 빠뜨려서 실제로 400을 받았다. 파서 테스트는 전부 통과했었다.
    create.mockResolvedValue(okResponse)
    await engine().run('러닝화 추천', { sampleIndex: 0 })
    expect(create.mock.calls[0]?.[0]?.input).toBe('러닝화 추천')
  })

  it('웹검색을 강제하고 한국 사용자 위치를 싣는다', async () => {
    // 강제하지 않으면 검색이 실행되지 않고, 그러면 모델의 학습 데이터를 재게 된다.
    // user_location이 없으면 검색이 미국 결과로 쏠린다 (2026-07-31 실측:
    // 금융 질의에 Zelle·Wise·Fidelity). 국가만 고정한다 — 도시·지역 금지.
    create.mockResolvedValue(okResponse)
    await engine().run('q', { sampleIndex: 0 })
    const body = create.mock.calls[0]?.[0]
    expect(body.tools).toEqual([
      { type: 'web_search', user_location: { type: 'approximate', country: 'KR' } },
    ])
    expect(body.tool_choice).toBe('required')
  })

  it('Gemini와 같은 시스템 프롬프트를 쓴다 (엔진 비교가 성립해야 한다)', async () => {
    create.mockResolvedValue(okResponse)
    await engine().run('q', { sampleIndex: 0 })
    expect(create.mock.calls[0]?.[0]?.instructions).toBe(
      '너는 일반 소비자의 질문에 답하는 어시스턴트다. 한국어로, 구체적인 브랜드나 제품명을 들어 간결하게 답하라.',
    )
  })

  it('모델 오버라이드가 실제 요청에 반영된다', async () => {
    create.mockResolvedValue(okResponse)
    await engine('gpt-5.4-mini').run('q', { sampleIndex: 0 })
    expect(create.mock.calls[0]?.[0]?.model).toBe('gpt-5.4-mini')
  })

  it('signal이 없으면 넘기지 않는다', async () => {
    create.mockResolvedValue(okResponse)
    await engine().run('q', { sampleIndex: 0 })
    expect(create.mock.calls[0]?.[1]).toEqual({})
  })

  it('signal이 있으면 SDK로 전달한다 (잡 타임아웃이 실제로 먹어야 한다)', async () => {
    create.mockResolvedValue(okResponse)
    const controller = new AbortController()
    await engine().run('q', { sampleIndex: 0, signal: controller.signal })
    expect(create.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})

describe('chatgptEngine.run — 정상 경로', () => {
  it('텍스트·인용·사용량·원본을 함께 돌려준다', async () => {
    create.mockResolvedValue(okResponse)
    const answer = await engine().run('q', { sampleIndex: 0 })

    expect(answer.text).toBe('무신사를 추천합니다.')
    // 루트 경로에 슬래시가 붙는 건 URL 정규화의 결과다(의도된 동작 —
    // cleanCitationUrl 테스트 참고). 표기 차이로 같은 페이지가 두 번 세지지 않는다.
    expect(answer.citations).toEqual([{ url: 'https://a.example/', title: 'A' }])
    expect(answer.usage).toEqual({
      calls: 1,
      searches: 1, // queries가 3개여도 청구는 1건
      tokensIn: 8468,
      tokensOut: 274,
      tokensThinking: 84,
    })
    // raw는 절대 버리지 않는다 — 판정 로직을 고친 뒤 재판정에 쓴다.
    expect(answer.raw).toBe(okResponse)
  })
})

describe('chatgptEngine.run — 실패 경로', () => {
  it('빈 답변을 "언급 없음"으로 흘려보내지 않는다', async () => {
    // 흘려보내면 판정 단계가 미언급으로 기록해 고객 언급률이 조용히 낮아진다.
    create.mockResolvedValue({ status: 'completed', output: [], usage: {} })
    await expect(engine().run('q', { sampleIndex: 0 })).rejects.toThrow(EngineError)
  })

  it('공백뿐인 답변도 빈 답변으로 본다', async () => {
    create.mockResolvedValue({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: '   \n ', annotations: [] }] },
      ],
    })
    await expect(engine().run('q', { sampleIndex: 0 })).rejects.toThrow(/빈 답변/)
  })

  it('잘린 응답(incomplete)은 재시도하지 않는다', async () => {
    create.mockResolvedValue({ status: 'incomplete', output: [] })
    const error = await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)
    expect(isRetryable(error)).toBe(false)
  })

  it('원인 불명의 빈 답변은 재시도할 가치가 있다', async () => {
    create.mockResolvedValue({ status: 'completed', output: [] })
    const error = await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)
    expect(isRetryable(error)).toBe(true)
  })

  it('취소를 EngineError로 감싸지 않는다', async () => {
    // 감싸면 AbortError라는 사실이 사라져 isRetryable이 재시도로 판정하고,
    // 타임아웃으로 끊은 호출이 백오프를 타고 되살아난다.
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    create.mockRejectedValue(abort)

    const error = await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)
    expect(error).toBe(abort)
    expect(isRetryable(error)).toBe(false)
  })

  it('429는 재시도 대상이고 긴 백오프를 요구한다', async () => {
    create.mockRejectedValue(Object.assign(new Error('rate limit'), { status: 429 }))
    const error = (await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)) as EngineError
    expect(error.retryable).toBe(true)
    expect(error.backoffHint).toBe('long')
  })

  it('400은 재시도하지 않는다', async () => {
    create.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }))
    const error = (await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)) as EngineError
    expect(error.retryable).toBe(false)
  })

  it("code가 문자열이면 상태로 오해하지 않는다", async () => {
    create.mockRejectedValue(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
    const error = (await engine()
      .run('q', { sampleIndex: 0 })
      .catch((e: unknown) => e)) as EngineError
    expect(error.status).toBeUndefined()
    expect(error.retryable).toBe(true)
  })
})
