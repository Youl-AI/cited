import { describe, expect, it } from 'vitest'
import { chatgptEngine, CHATGPT_MODEL } from '@/lib/engines/chatgpt'
import { estimateCostKrw } from '@/lib/engines/pricing'

describe.skipIf(!process.env.OPENAI_API_KEY)('chatgpt 스모크', () => {
  it('실제 API가 텍스트·인용·사용량을 돌려준다', async () => {
    const answer = await chatgptEngine.run('30대 남자 러닝화 추천해줘', { sampleIndex: 0 })

    expect(answer.text.length).toBeGreaterThan(20)
    expect(answer.usage.calls).toBe(1)
    expect(answer.usage.tokensIn).toBeGreaterThan(0)
    expect(answer.raw).toBeTruthy()

    // ★ 검색이 실제로 실행됐는가. tool_choice: 'required'를 빼면 여기가 0이 되고,
    //   그러면 우리가 재는 것이 실시간 검색 결과가 아니라 모델의 학습 데이터가 된다.
    expect(answer.usage.searches).toBeGreaterThan(0)

    // 검색 본문이 입력 토큰에 실린다. 검색 없이는 4,500 수준이었다.
    expect(answer.usage.tokensIn).toBeGreaterThan(4_000)

    console.log(
      JSON.stringify({
        engine: 'chatgpt',
        model: CHATGPT_MODEL,
        searches: answer.usage.searches,
        tokensIn: answer.usage.tokensIn,
        tokensOut: answer.usage.tokensOut,
        tokensThinking: answer.usage.tokensThinking,
        citations: answer.citations.length,
        chars: answer.text.length,
        estimatedKrw: estimateCostKrw('chatgpt', answer.usage),
      }),
    )
  }, 120_000)

  it('인용 URL에 추적 파라미터가 남지 않는다', async () => {
    const answer = await chatgptEngine.run('가성비 좋은 무선 이어폰 뭐가 있어?', {
      sampleIndex: 0,
    })
    for (const c of answer.citations) {
      expect(c.url).not.toContain('utm_source=openai')
    }
  }, 120_000)
})
