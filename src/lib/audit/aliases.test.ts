import { describe, expect, it } from 'vitest'
import {
  ALIAS_MODEL,
  MAX_ALIASES,
  createAliasGenerator,
  sanitizeAliases,
  toBrandProfiles,
} from '@/lib/audit/aliases'

describe('sanitizeAliases', () => {
  it('정상 별칭을 통과시킨다', () => {
    // ★ 계획서 원안은 'Musinsa'까지 세 개를 기대했지만, 같은 파일의 다음 테스트
    //   ("대소문자만 다른 중복을 하나로 합친다")와 모순이었다. 1차 매칭은
    //   `normalizeKo`가 소문자화하므로 대소문자를 구분하지 않는다 —
    //   'MUSINSA'와 'Musinsa'를 둘 다 남기면 1차 후보만 두 배가 되고 2차 판정
    //   원가가 늘어난다. 재현율은 1도 늘지 않는다.
    expect(sanitizeAliases('무신사', ['MUSINSA', 'Musinsa', '무탠다드'], '패션')).toEqual([
      'MUSINSA',
      '무탠다드',
    ])
  })

  it('표준명 자체를 별칭에서 뺀다', () => {
    // 1차 매칭이 canonical을 이미 본다. 중복은 후보를 두 배로 만들고
    // 2차 판정 원가만 늘린다.
    expect(sanitizeAliases('무신사', ['무신사', 'MUSINSA'], '패션')).toEqual(['MUSINSA'])
  })

  it('표준명과 대소문자만 다른 값도 뺀다', () => {
    expect(sanitizeAliases('ASICS', ['asics', '아식스'], '스포츠')).toEqual(['아식스'])
  })

  it('대소문자만 다른 중복을 하나로 합친다', () => {
    // 1차 매칭이 대소문자를 무시하므로 'ASICS'와 'asics'는 같은 별칭이다.
    const out = sanitizeAliases('아식스', ['ASICS', 'asics', 'Asics'], '스포츠')
    expect(out).toEqual(['ASICS'])
  })

  it('한 글자 별칭을 버린다', () => {
    // ★ 'A' 하나가 별칭이면 거의 모든 영문 답변에 걸린다. 1차 후보가 폭발하고
    //   2차 판정 원가가 답변 수만큼 늘어난다.
    expect(sanitizeAliases('아식스', ['A', 'ASICS'], '스포츠')).toEqual(['ASICS'])
  })

  it('두 글자 별칭은 남긴다', () => {
    // 'LG'·'CJ'처럼 두 글자가 정당한 표기인 브랜드가 실제로 많다.
    expect(sanitizeAliases('엘지', ['LG'], '가전')).toEqual(['LG'])
  })

  it('카테고리 일반어를 별칭으로 받지 않는다', () => {
    // ★ '패션'이 별칭이면 패션 질의의 모든 답변에 걸려 언급률이 100%가 된다.
    //   0%를 100%로 바꾸는 오류이고, 고객은 그것을 기뻐하며 믿는다.
    expect(sanitizeAliases('무신사', ['패션', '쇼핑몰', 'MUSINSA'], '패션')).toEqual(['MUSINSA'])
  })

  it('목록에 없는 카테고리도 그 입력값 자체는 막는다', () => {
    // 고객이 '수제 비누'를 직접 입력하면 그 단어가 별칭이 되면 안 된다.
    expect(sanitizeAliases('솝공방', ['수제 비누', 'Soap Gongbang'], '수제 비누')).toEqual([
      'Soap Gongbang',
    ])
  })

  it('공백만 있는 값과 빈 문자열을 버린다', () => {
    expect(sanitizeAliases('무신사', ['', '   ', 'MUSINSA'], '패션')).toEqual(['MUSINSA'])
  })

  it('앞뒤 공백을 다듬는다', () => {
    expect(sanitizeAliases('무신사', ['  MUSINSA  '], '패션')).toEqual(['MUSINSA'])
  })

  it('개수를 상한에서 자른다', () => {
    const many = Array.from({ length: 30 }, (_, i) => `별칭${i}`)
    expect(sanitizeAliases('무신사', many, '패션')).toHaveLength(MAX_ALIASES)
  })

  it('너무 긴 값을 버린다 (문장을 별칭으로 준 경우)', () => {
    // ★ 계획서의 상한 40자로는 이 문장(27자)이 통과했다. 한글은 한 글자가
    //   한 단어에 가까워서 영어 기준 상한이 문장을 못 막는다.
    const sentence = '무신사는 한국의 대표적인 온라인 패션 플랫폼입니다'
    expect(sentence.length).toBeGreaterThan(24)
    expect(sanitizeAliases('무신사', [sentence, 'MUSINSA'], '패션')).toEqual(['MUSINSA'])
  })

  it('가장 긴 정당한 표기는 남긴다', () => {
    // 상한을 더 내리면 실제 브랜드 표기가 잘린다.
    expect(sanitizeAliases('노스페이스', ['The North Face Korea'], '패션')).toEqual([
      'The North Face Korea',
    ])
  })

  // ★ 2026-07-30(3) 추가 — 계획서에 없던 방어. 이유는 아래 주석 참고.
  it('다른 등록 브랜드의 이름을 별칭으로 받지 않는다', () => {
    // ★★ 이게 가장 위험한 오염이다. '29CM'이 무신사의 별칭이 되면 29CM 언급이
    //     전부 무신사 언급으로 집계된다 — **우리 언급률과 Share of Voice가
    //     동시에 부풀려진다.** 숫자가 좋아 보이는 방향의 오류라 아무도 의심하지
    //     않는다. 계획서의 SYSTEM_PROMPT는 "경쟁사 이름을 넣지 마세요"라고
    //     지시하지만, 지시는 검증이 아니다.
    expect(sanitizeAliases('무신사', ['29CM', 'MUSINSA'], '패션', ['29CM', 'W컨셉'])).toEqual([
      'MUSINSA',
    ])
  })

  it('다른 브랜드 이름은 대소문자·공백을 무시하고 막는다', () => {
    expect(sanitizeAliases('무신사', [' 29cm ', 'MUSINSA'], '패션', ['29CM'])).toEqual(['MUSINSA'])
  })

  it('자기 이름은 others에 있어도 문제되지 않는다', () => {
    // 호출자가 전체 브랜드 목록을 그대로 넘겨도 동작해야 한다.
    expect(sanitizeAliases('무신사', ['MUSINSA'], '패션', ['무신사', '29CM'])).toEqual(['MUSINSA'])
  })

  it('입력 배열을 변형하지 않는다', () => {
    const raw = ['무신사', 'MUSINSA', '패션']
    sanitizeAliases('무신사', raw, '패션')
    expect(raw).toEqual(['무신사', 'MUSINSA', '패션'])
  })
})

describe('createAliasGenerator', () => {
  it('모델 응답을 요청한 브랜드에만 매핑한다', async () => {
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [
          { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false },
          { canonical: '29CM', aliases: ['29cm'], ambiguous: false },
          // 요청하지 않은 브랜드를 끼워 넣었다 — 버려야 한다
          { canonical: '쿠팡', aliases: ['Coupang'], ambiguous: false },
        ],
      }),
    })
    const out = await generate(['무신사', '29CM'], '패션')
    expect(out.map((b) => b.canonical)).toEqual(['무신사', '29CM'])
  })

  it('응답에서 빠진 브랜드를 별칭 없이 채운다', async () => {
    // ★ 조용히 빠뜨리면 그 브랜드가 측정에서 통째로 사라진다. 경쟁사가
    //   사라지면 Share of Voice 분모가 줄어 우리 점유율이 올라간다.
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [{ canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false }],
      }),
    })
    const out = await generate(['무신사', '29CM'], '패션')
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ canonical: '29CM', aliases: [], ambiguous: false })
  })

  it('입력 순서를 유지한다', async () => {
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [
          { canonical: '29CM', aliases: [], ambiguous: false },
          { canonical: '무신사', aliases: [], ambiguous: false },
        ],
      }),
    })
    const out = await generate(['무신사', '29CM'], '패션')
    expect(out.map((b) => b.canonical)).toEqual(['무신사', '29CM'])
  })

  it('모델이 이름의 공백·대소문자를 바꿔 돌려줘도 매칭한다', async () => {
    // ★ 계획서는 `brands.includes(b.canonical)`로 정확히 비교한다. 모델이
    //   ' 29cm '처럼 돌려주면 그 브랜드가 조용히 별칭 0개가 되고, 경쟁사면
    //   Share of Voice가 우리에게 유리한 쪽으로 틀린다.
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [{ canonical: ' 29cm ', aliases: ['29CM 쇼핑'], ambiguous: false }],
      }),
    })
    const out = await generate(['29CM'], '패션')
    // 돌려주는 canonical은 **요청한 표기**여야 한다. 모델 표기를 그대로 쓰면
    // 판정의 subject가 신청 내용과 어긋난다.
    expect(out[0]?.canonical).toBe('29CM')
    expect(out[0]?.aliases).toEqual(['29CM 쇼핑'])
  })

  it('브랜드가 없으면 호출하지 않는다', async () => {
    let called = 0
    const generate = createAliasGenerator({
      parse: async () => {
        called++
        return { brands: [] }
      },
    })
    expect(await generate([], '패션')).toEqual([])
    expect(called).toBe(0)
  })

  it('호출이 실패하면 별칭 없이 진행한다 (측정을 중단하지 않는다)', async () => {
    // ★ 별칭 생성 실패로 진단 전체를 죽이면 안 된다 — 이미 결제된 주문일 수도
    //   있다. 다만 **조용히** 넘어가지 않는다. onError로 알리고, 리포트의
    //   aliases가 비어 있으면 운영자가 그것을 보고 판단한다.
    const errors: unknown[] = []
    const generate = createAliasGenerator({
      parse: async () => {
        throw new Error('rate limited')
      },
      onError: (e) => errors.push(e),
    })
    const out = await generate(['무신사'], '패션')
    expect(out).toEqual([{ canonical: '무신사', aliases: [], ambiguous: false }])
    expect(errors).toHaveLength(1)
  })

  it('onError가 없어도 실패를 삼키고 진행한다', async () => {
    const generate = createAliasGenerator({
      parse: async () => {
        throw new Error('boom')
      },
    })
    await expect(generate(['무신사'], '패션')).resolves.toHaveLength(1)
  })

  it('생성된 별칭도 검증을 거친다', async () => {
    // 모델이 카테고리 일반어를 돌려주는 일이 실제로 있다.
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [{ canonical: '무신사', aliases: ['패션', 'MUSINSA'], ambiguous: false }],
      }),
    })
    const out = await generate(['무신사'], '패션')
    expect(out[0]?.aliases).toEqual(['MUSINSA'])
  })

  it('다른 등록 브랜드 이름이 별칭으로 새지 않는다', async () => {
    // ★ 프롬프트가 금지해도 모델은 넣는다. 여기서 막지 않으면 29CM 언급이
    //   무신사 언급으로 집계되어 우리 숫자가 부풀려진다.
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [
          { canonical: '무신사', aliases: ['29CM', 'MUSINSA'], ambiguous: false },
          { canonical: '29CM', aliases: ['무신사', '29cm.co.kr'], ambiguous: false },
        ],
      }),
    })
    const out = await generate(['무신사', '29CM'], '패션')
    expect(out[0]?.aliases).toEqual(['MUSINSA'])
    expect(out[1]?.aliases).toEqual(['29cm.co.kr'])
  })

  it('ambiguous를 그대로 전달한다', async () => {
    const generate = createAliasGenerator({
      parse: async () => ({
        brands: [{ canonical: '당근', aliases: ['당근마켓', 'Karrot'], ambiguous: true }],
      }),
    })
    const out = await generate(['당근'], '중고거래')
    expect(out[0]?.ambiguous).toBe(true)
  })

  it('parse에 브랜드와 카테고리를 그대로 넘긴다', async () => {
    let seen: { brands: readonly string[]; category: string } | null = null
    const generate = createAliasGenerator({
      parse: async (brands, category) => {
        seen = { brands, category }
        return { brands: [] }
      },
    })
    await generate(['무신사', '29CM'], '패션')
    expect(seen).toEqual({ brands: ['무신사', '29CM'], category: '패션' })
  })

  it('중복된 브랜드 입력을 한 번만 요청하고 한 번만 돌려준다', async () => {
    // 신청 폼이 중복을 걷어내지만, 운영자 CLI(`audit:new`)는 그 경로를 타지 않는다.
    // 중복이 남으면 판정 subject가 겹쳐 언급 수가 두 배로 세어진다.
    let requested: readonly string[] = []
    const generate = createAliasGenerator({
      parse: async (brands) => {
        requested = brands
        return { brands: [] }
      },
    })
    const out = await generate(['무신사', '무신사', '29CM'], '패션')
    expect(requested).toEqual(['무신사', '29CM'])
    expect(out.map((b) => b.canonical)).toEqual(['무신사', '29CM'])
  })

  it('빈 이름과 공백 이름은 요청하지 않는다', async () => {
    // 빈 canonical은 1차 매칭에서 모든 답변에 걸린다.
    const generate = createAliasGenerator({ parse: async () => ({ brands: [] }) })
    expect(await generate(['', '   '], '패션')).toEqual([])
  })
})

describe('toBrandProfiles', () => {
  it('BrandProfile로 그대로 변환한다', () => {
    const profiles = toBrandProfiles([
      { canonical: '당근', aliases: ['당근마켓', 'Karrot'], ambiguous: true },
    ])
    expect(profiles[0]).toEqual({
      canonical: '당근',
      aliases: ['당근마켓', 'Karrot'],
      ambiguous: true,
    })
  })

  it('별칭 배열을 복사한다', () => {
    const suggestion = { canonical: '당근', aliases: ['Karrot'], ambiguous: true }
    const profiles = toBrandProfiles([suggestion])
    profiles[0]!.aliases.push('X')
    expect(suggestion.aliases).toEqual(['Karrot'])
  })
})

describe('ALIAS_MODEL', () => {
  it('판정 모델과 같은 저가 모델로 시작한다', () => {
    // 진단 1건당 1회 호출이라 원가 영향이 거의 없지만, 별칭 누락은 리포트를
    // 통째로 거짓으로 만든다. 실측(scripts/probe-aliases.mts)이 통과 기준을
    // 못 넘으면 claude-sonnet-5로 올린다.
    expect(ALIAS_MODEL).toBe('claude-haiku-4-5')
  })
})
