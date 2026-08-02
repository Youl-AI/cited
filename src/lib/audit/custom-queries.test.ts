import { describe, expect, it } from 'vitest'
import { createCustomQueryGenerator, validateCustomQueries } from '@/lib/audit/custom-queries'

const ctx = {
  brandName: '바디텍필라테스',
  competitors: ['코어무브'],
  category: '필라테스',
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

  it('템플릿 질의가 하나라도 빠지면 어느 질의인지 말하며 거부한다', () => {
    // ★ 상품 약속이 "템플릿 3 + 맞춤 7"이다 — 운영자가 검수 파일에서 템플릿
    //   줄을 지우면 무료 샘플과의 연속성과 지역 강제가 조용히 사라진다.
    const missingTemplate = template3[2] as string // '수원 요가원 괜찮은 데 알려줘'
    const bad = [...template3.slice(0, 2), ...custom7, '수원 필라테스 주차 되는 곳 있어?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(missingTemplate)
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/템플릿/)
  })

  it('템플릿 3개가 온전하면 통과한다 — 공백·대소문자 차이는 같은 질의로 본다', () => {
    // 검수 중 공백이 어긋난 정도로 템플릿이 "빠졌다"고 하면 운영자만 괴롭다 —
    // 중복 검사와 같은 norm 기준으로 비교한다.
    const padded = [`  ${template3[0] as string}`, ...template3.slice(1), ...custom7]
    expect(() => validateCustomQueries(padded, ctx)).not.toThrow()
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

  // ★ 페이로드가 무상태면 같은 브랜드의 [재생성]은 매번 **바이트까지 같은 요청**이라
  //   같은 후보가 돌아오기 쉽다. 중복이 돌아온 시점에는 크레딧 5회 중 1회가 이미
  //   나갔다 — 클라이언트에서 걸러 봐야 슬롯만 조용히 빈다. 겹치지 말라고 미리 말한다.
  it('기존 질의를 페이로드에 넣는다 — 중복 후보로 크레딧을 태우지 않으려고', async () => {
    let captured = ''
    const generate = createCustomQueryGenerator({
      parse: async (prompt) => {
        captured = prompt
        return { queries: custom7 }
      },
    })
    await generate({ ...args, existing: [...template3, custom7[0]!] })
    for (const q of [...template3, custom7[0]!]) expect(captured).toContain(q)
  })

  it('기존 질의를 넘겨도 프롬프트에 브랜드명·경쟁사명은 들어가지 않는다', async () => {
    let captured = ''
    const generate = createCustomQueryGenerator({
      parse: async (prompt) => {
        captured = prompt
        return { queries: custom7 }
      },
    })
    // 고객이 편집 중인 줄에는 브랜드명이 섞여 있을 수 있다 (확정에서 거부될 줄이라도
    // 편집 중에는 존재한다). 그 줄이 그대로 프롬프트에 실리면 중립성 규칙이 뚫린다.
    await generate({
      ...args,
      existing: ['바디텍필라테스 후기 어때?', '코어무브랑 비교하면?', custom7[0]!],
    })
    expect(captured).not.toContain('바디텍필라테스')
    expect(captured).not.toContain('코어무브')
    expect(captured).toContain(custom7[0]!)
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
