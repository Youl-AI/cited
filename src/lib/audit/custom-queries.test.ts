import { describe, expect, it } from 'vitest'
import { createCustomQueryGenerator, validateCustomQueries } from '@/lib/audit/custom-queries'

const ctx = {
  brandName: '바디텍필라테스',
  competitors: ['코어무브'],
  regional: true,
  region: '수원',
  requiredCount: 10,
}

const template3 = [
  '수원 필라테스 어디가 좋아?',
  '수원에서 기구 필라테스 배울 만한 곳 추천해줘',
  '수원 요가원 괜찮은 데 알려줘',
]

const custom7 = [
  '수원 필라테스 그룹레슨 가격 어느 정도야?',
  '수원 필라테스 1:1 레슨 어디가 괜찮아?',
  '기구 필라테스랑 매트 필라테스 차이가 뭐야?',
  '수원 산후조리 필라테스 추천해줘',
  '수원역 근처 필라테스 알려줘',
  '필라테스 처음 시작할 때 뭘 봐야 해?',
  '수원 필라테스 체험 수업 있는 곳 어디야?',
]

describe('validateCustomQueries', () => {
  it('템플릿 3 + 맞춤 7 = 10개를 통과시킨다', () => {
    expect(validateCustomQueries([...template3, ...custom7], ctx)).toHaveLength(10)
  })

  it('브랜드명이 든 질의를 거부한다 — 이름을 대면 측정이 무효다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '바디텍필라테스 어때?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/브랜드명/)
  })

  it('브랜드명 대소문자·공백 변형도 거부한다', () => {
    const englishCtx = { ...ctx, brandName: 'BodyTec' }
    const bad = [...template3, ...custom7.slice(0, 6), 'bodytec 후기 어때?']
    expect(() => validateCustomQueries(bad, englishCtx)).toThrowError(/브랜드명/)
  })

  it('경쟁사명이 든 질의를 거부한다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '코어무브랑 비교하면 어디가 나아?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/경쟁사/)
  })

  it('개수가 다르면 거부한다', () => {
    expect(() => validateCustomQueries(template3, ctx)).toThrowError(/10개/)
  })

  it('중복 질의를 거부한다', () => {
    const dup = [...template3, ...custom7.slice(0, 6), template3[0] as string]
    expect(() => validateCustomQueries(dup, ctx)).toThrowError(/중복/)
  })

  it('빈 줄·공백만인 질의를 거부한다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '   ']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/비어/)
  })

  it('지역형인데 지역이 하나도 없는 맞춤 질의가 과반이면 경고가 아니라 통과다', () => {
    // 일부 질의는 지역 없이도 성립한다("기구 필라테스랑 매트 차이") —
    // 전부 막으면 좋은 질의를 못 쓴다. 지역 강제는 **템플릿 3개**가 맡는다.
    expect(() => validateCustomQueries([...template3, ...custom7], ctx)).not.toThrow()
  })

  it('앞뒤 공백을 정돈해 돌려준다', () => {
    const padded = [...template3, ...custom7.slice(0, 6), `  ${custom7[6] as string}  `]
    const out = validateCustomQueries(padded, ctx)
    expect(out[9]).toBe(custom7[6])
  })

  it('{지역} 슬롯이 남아 있으면 거부한다 — 치환 안 된 채 AI에 가면 안 된다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '{지역} 필라테스 몇 시까지 해?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/지역.*슬롯|슬롯/)
  })
})

describe('createCustomQueryGenerator', () => {
  const args = {
    brandName: '바디텍필라테스',
    category: '필라테스',
    region: '수원',
    brief: '기구 필라테스 전문, 그룹·개인 레슨',
    competitors: ['코어무브'],
    count: 7,
  }

  it('parse가 돌려준 후보를 그대로 전달한다', async () => {
    const generate = createCustomQueryGenerator({
      parse: async () => ({ queries: custom7 }),
    })
    await expect(generate(args)).resolves.toEqual(custom7)
  })

  it('프롬프트에 브랜드명을 넣지 않는다 — 생성 모델이 이름을 질의에 섞는 것을 원천 차단', async () => {
    let captured = ''
    const generate = createCustomQueryGenerator({
      parse: async (prompt) => {
        captured = prompt
        return { queries: custom7 }
      },
    })
    await generate(args)
    expect(captured).not.toContain('바디텍필라테스')
    expect(captured).not.toContain('코어무브')
    expect(captured).toContain('필라테스')
    expect(captured).toContain('수원')
    expect(captured).toContain('기구 필라테스 전문')
  })

  it('생성 실패는 그대로 던진다 — 조용히 빈 배열을 주면 검수 없이 부족한 채 동결된다', async () => {
    const generate = createCustomQueryGenerator({
      parse: async () => {
        throw new Error('api down')
      },
    })
    await expect(generate(args)).rejects.toThrow('api down')
  })
})
