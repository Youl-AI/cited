import { describe, expect, it } from 'vitest'
import { GEMINI_MODEL, geminiEngine } from '@/lib/engines/gemini'
import { estimateCostMilliKrw, estimateFreeAuditCostMilliKrw } from '@/lib/engines/pricing'

/**
 * 실제 Gemini API를 호출한다. `pnpm test:smoke`로만 돈다 — CI의 `pnpm test`에는
 * 포함되지 않는다.
 *
 * 목적은 두 가지다.
 *   1. 응답 스키마가 바뀌면 여기서 먼저 깨진다. 파서는 픽스처로만 검증하므로
 *      실제 응답이 바뀌어도 단위 테스트는 계속 초록색이다.
 *   2. **원가 가정이 여전히 맞는지 확인한다.** 이 설계에서 원가 계산이 이미
 *      두 번 틀렸다. 계산은 틀리고 실측만 맞는다.
 */
const configured = geminiEngine.isConfigured()
const describeIfKey = configured ? describe : describe.skip

if (!configured) {
  console.warn('GEMINI_API_KEY가 없어 Gemini 스모크 테스트를 건너뜁니다.')
}

describeIfKey('Gemini 실제 호출', () => {
  it('한국어 소비자 질의에 브랜드가 담긴 답변과 근거를 돌려준다', async () => {
    const answer = await geminiEngine.run('30대 남자 러닝화 추천해줘', { sampleIndex: 0 })

    expect(answer.text.length).toBeGreaterThan(50)
    // 한국어로 답해야 한다 (systemInstruction이 먹었는지 확인).
    expect(answer.text).toMatch(/[가-힣]/)
    // googleSearch 그라운딩이 실제로 켜져 있어야 근거가 온다. 0건이면
    // 툴이 무시된 것이고, 그러면 우리는 "검색 기반 답변"을 재고 있지 않다.
    expect(answer.citations.length).toBeGreaterThan(0)
    for (const c of answer.citations) {
      expect(c.url).toMatch(/^https?:\/\//)
      expect(c.title.length).toBeGreaterThan(0)
    }
    expect(answer.raw).toBeDefined()

    // 검색 질의 수는 청구 단위다. 0이면 그라운딩이 실제로 안 돈 것이다.
    expect(answer.usage.searches).toBeGreaterThan(0)

    console.log(
      `[${GEMINI_MODEL}] 입력 ${answer.usage.tokensIn} · 사고 ${answer.usage.tokensThinking} · ` +
        `출력 ${answer.usage.tokensOut} · 검색 ${answer.usage.searches}건 · ` +
        `인용 ${answer.citations.length}건`,
    )
  })

  it('실측 사용량이 원가 가정 범위 안에 있다', async () => {
    const answer = await geminiEngine.run('가성비 좋은 무선 이어폰 뭐가 있어?', {
      sampleIndex: 0,
    })
    const { tokensIn = 0, tokensOut = 0, tokensThinking = 0, searches = 0 } = answer.usage

    // ★ 발견 1: grounding으로 가져온 본문은 입력 토큰으로 청구되지 않는다.
    //   입력이 질의문 길이(실측 7~12)를 크게 넘으면 그 가정이 깨진 것이고,
    //   원가 모델 전체를 다시 계산해야 한다.
    expect(tokensIn).toBeLessThan(500)

    // ★ 발견 3: 사고 토큰이 모델 등급에서 폭발한다. flash-lite는 0이었다.
    //   0이 아니게 되면 모델이 바뀌었거나 기본 동작이 바뀐 것이다.
    if (tokensThinking > 0) {
      console.warn(
        `사고 토큰 ${tokensThinking} — flash-lite 실측은 0이었다. 원가를 다시 재라.`,
      )
    }

    // 출력 실측 평균 920. 두 배를 넘으면 원가 추정이 흔들린다.
    expect(tokensOut).toBeLessThan(2000)

    // ★ 청구 단위. 실측은 호출당 2건이었다. 크게 늘면 원가가 그만큼 는다.
    expect(searches).toBeLessThanOrEqual(5)

    const paid = estimateCostMilliKrw('gemini', answer.usage)
    const free = estimateFreeAuditCostMilliKrw('gemini', answer.usage)
    console.log(`호출당 원가: 유료 ${paid / 1000}원 · 무료진단 ${free / 1000}원`)

    // 무료 진단 1건 = 3질의. 150원을 넘으면 3단계 예산 킬스위치를 다시 잡아야 한다.
    // (무료 티어에 그라운딩이 없어 검색 요금이 그대로 붙는다 — 실측 기준 약 127원)
    expect((free * 3) / 1000).toBeLessThanOrEqual(150)
  })
})
