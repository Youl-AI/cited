import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { ANSWER_MAX_CHARS, createClaudeJudge } from '@/lib/judge/claude'
import type { JudgeRequest } from '@/lib/judge/types'

type ParseResult = {
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
  parsed_output: unknown
}

/** Anthropic 클라이언트 대역. 네트워크 없이 응답 모양만 흉내 낸다. */
function stubClient(result: Partial<ParseResult>, spy = vi.fn()): Anthropic {
  const parse = async (params: unknown) => {
    spy(params)
    return {
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      parsed_output: { results: [] },
      ...result,
    }
  }
  return { messages: { parse } } as unknown as Anthropic
}

function req(id: string, canonical = '무신사', answerText = '무신사가 좋습니다'): JudgeRequest {
  return {
    id,
    answerText,
    brand: { canonical, aliases: [], ambiguous: false },
    matchedAlias: canonical,
  }
}

function verdict(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    isBrandReference: true,
    position: 2,
    sentiment: 'recommended',
    context: '추천 목록에서 언급됨',
    ...over,
  }
}

describe('createClaudeJudge', () => {
  it('판정 결과를 JudgeResponse로 옮긴다', async () => {
    const judge = createClaudeJudge({
      client: stubClient({ parsed_output: { results: [verdict()] } }),
    })
    const [r] = await judge([req('a1')])
    expect(r?.id).toBe('a1')
    expect(r?.verdict).toEqual({
      isBrandReference: true,
      position: 2,
      sentiment: 'recommended',
      context: '추천 목록에서 언급됨',
    })
  })

  it('미언급인데 순위가 붙어 오면 순위를 지운다', async () => {
    // 리포트에 "언급 안 됨 · 3위" 같은 줄이 나가면 안 된다.
    const judge = createClaudeJudge({
      client: stubClient({
        parsed_output: { results: [verdict({ isBrandReference: false, position: 3 })] },
      }),
    })
    const [r] = await judge([req('a1')])
    expect(r?.verdict.position).toBeNull()
  })

  it('언급이면 순위를 그대로 둔다', async () => {
    const judge = createClaudeJudge({
      client: stubClient({
        parsed_output: { results: [verdict({ isBrandReference: true, position: 3 })] },
      }),
    })
    const [r] = await judge([req('a1')])
    expect(r?.verdict.position).toBe(3)
  })

  it('사용량을 콜백으로 보고한다', async () => {
    const onUsage = vi.fn()
    const judge = createClaudeJudge({
      client: stubClient({ usage: { input_tokens: 920, output_tokens: 213 } }),
      onUsage,
    })
    await judge([req('a1')])
    expect(onUsage).toHaveBeenCalledWith({ tokensIn: 920, tokensOut: 213 })
  })

  it('거부 응답이면 던진다', async () => {
    const judge = createClaudeJudge({ client: stubClient({ stop_reason: 'refusal' }) })
    await expect(judge([req('a1')])).rejects.toThrow('거부')
  })

  it('max_tokens에서 잘리면 던진다 (판정 0건과 구분해야 한다)', async () => {
    const judge = createClaudeJudge({
      client: stubClient({ stop_reason: 'max_tokens', parsed_output: { results: [] } }),
    })
    await expect(judge([req('a1')])).rejects.toThrow('max_tokens')
  })

  it('사용량은 실패할 때도 보고한다 (실패해도 과금된다)', async () => {
    const onUsage = vi.fn()
    const judge = createClaudeJudge({
      client: stubClient({
        stop_reason: 'refusal',
        usage: { input_tokens: 900, output_tokens: 10 },
      }),
      onUsage,
    })
    await expect(judge([req('a1')])).rejects.toThrow()
    expect(onUsage).toHaveBeenCalledWith({ tokensIn: 900, tokensOut: 10 })
  })

  it('파싱 결과가 없으면 던진다', async () => {
    const judge = createClaudeJudge({ client: stubClient({ parsed_output: null }) })
    await expect(judge([req('a1')])).rejects.toThrow('파싱')
  })

  it('빈 배치는 API를 호출하지 않는다', async () => {
    const spy = vi.fn()
    const judge = createClaudeJudge({ client: stubClient({}, spy) })
    expect(await judge([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('긴 답변을 잘라 보낸다 (입력 토큰이 곧 원가다)', async () => {
    const spy = vi.fn()
    const judge = createClaudeJudge({ client: stubClient({}, spy) })
    const long = '가'.repeat(ANSWER_MAX_CHARS + 500)
    await judge([req('a1', '무신사', long)])
    const sent = JSON.parse(
      (spy.mock.calls[0]?.[0] as { messages: { content: string }[] }).messages[0]!.content,
    ) as { answer: string }[]
    expect(sent[0]?.answer.length).toBe(ANSWER_MAX_CHARS)
  })

  it('브랜드명과 매칭된 별칭을 함께 보낸다', async () => {
    const spy = vi.fn()
    const judge = createClaudeJudge({ client: stubClient({}, spy) })
    await judge([
      {
        id: 'a1',
        answerText: 'MUSINSA에서 샀다',
        brand: { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false },
        matchedAlias: 'MUSINSA',
      },
    ])
    const sent = JSON.parse(
      (spy.mock.calls[0]?.[0] as { messages: { content: string }[] }).messages[0]!.content,
    ) as { brand: string; matched: string }[]
    expect(sent[0]).toMatchObject({ brand: '무신사', matched: 'MUSINSA' })
  })
})
