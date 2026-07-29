import { describe, expect, it } from 'vitest'
import { createClaudeJudge } from '@/lib/judge/claude'
import type { JudgeUsage } from '@/lib/judge/types'

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claudeJudge 스모크', () => {
  it('동음이의어를 배제한다', async () => {
    const judge = createClaudeJudge()
    const [r] = await judge([
      {
        id: 't1',
        answerText: '어제 오후에 갑자기 소나기가 쏟아져서 우산을 샀다.',
        brand: { canonical: '소나기', aliases: [], ambiguous: true },
        matchedAlias: '소나기',
      },
    ])
    expect(r?.verdict.isBrandReference).toBe(false)
    // 언급이 아니면 순위도 없어야 한다.
    expect(r?.verdict.position).toBeNull()
  }, 60_000)

  it('언급 순서를 매기고 사용량을 보고한다', async () => {
    const usages: JudgeUsage[] = []
    const judge = createClaudeJudge({ onUsage: (u) => usages.push(u) })
    const [r] = await judge([
      {
        id: 't2',
        answerText:
          '러닝화로는 나이키 페가수스, 아식스 젤카야노, 뉴발란스 880을 추천합니다.',
        brand: { canonical: '아식스', aliases: ['ASICS'], ambiguous: false },
        matchedAlias: '아식스',
      },
    ])
    expect(r?.verdict.isBrandReference).toBe(true)
    expect(r?.verdict.position).toBe(2)
    expect(r?.verdict.sentiment).toBe('recommended')
    expect(r?.verdict.context.length).toBeGreaterThan(0)

    expect(usages).toHaveLength(1)
    expect(usages[0]?.tokensIn).toBeGreaterThan(0)
    expect(usages[0]?.tokensOut).toBeGreaterThan(0)
  }, 60_000)

  it('부정 언급을 negative로 판정한다', async () => {
    const judge = createClaudeJudge()
    const [r] = await judge([
      {
        id: 't3',
        answerText:
          '무신사는 배송이 느리고 반품이 까다로워서 별로였습니다. 차라리 29CM를 쓰세요.',
        brand: { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false },
        matchedAlias: '무신사',
      },
    ])
    expect(r?.verdict.isBrandReference).toBe(true)
    expect(r?.verdict.sentiment).toBe('negative')
  }, 60_000)

  it('배치로 넣은 모든 id를 돌려준다', async () => {
    const judge = createClaudeJudge()
    const answer =
      '온라인 패션 플랫폼은 무신사, 29CM, W컨셉이 대표적입니다. 무신사가 가장 규모가 큽니다.'
    const results = await judge([
      {
        id: 'b1',
        answerText: answer,
        brand: { canonical: '무신사', aliases: [], ambiguous: false },
        matchedAlias: '무신사',
      },
      {
        id: 'b2',
        answerText: answer,
        brand: { canonical: '29CM', aliases: [], ambiguous: false },
        matchedAlias: '29CM',
      },
      {
        id: 'b3',
        answerText: answer,
        brand: { canonical: 'W컨셉', aliases: [], ambiguous: false },
        matchedAlias: 'W컨셉',
      },
    ])
    expect(results.map((r) => r.id).sort()).toEqual(['b1', 'b2', 'b3'])
    expect(results.every((r) => r.verdict.isBrandReference)).toBe(true)
  }, 60_000)

  it('빈 배치는 호출 없이 빈 배열을 돌려준다', async () => {
    let called = false
    const judge = createClaudeJudge({ onUsage: () => (called = true) })
    expect(await judge([])).toEqual([])
    expect(called).toBe(false)
  })
})
