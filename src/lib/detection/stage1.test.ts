import { describe, expect, it } from 'vitest'
import { stage1Match } from '@/lib/detection/stage1'
import type { BrandProfile } from '@/lib/detection/types'

const musinsa: BrandProfile = {
  canonical: '무신사',
  aliases: ['MUSINSA', 'Musinsa', '무신사스탠다드', '무탠다드'],
  ambiguous: false,
}

const ambiguous: BrandProfile = {
  canonical: '소나기',
  aliases: ['소나기'],
  ambiguous: true,
}

describe('stage1Match — recall 우선', () => {
  it('정확한 브랜드명을 찾는다', () => {
    const hits = stage1Match('무신사에서 파는 옷이 괜찮습니다.', musinsa)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.alias).toBe('무신사')
  })

  it('띄어쓰기 변형을 찾는다', () => {
    expect(stage1Match('무신사 스탠다드 티셔츠', musinsa).length).toBeGreaterThan(0)
  })

  it('영문 표기를 찾는다', () => {
    expect(stage1Match('MUSINSA is a Korean platform.', musinsa).length).toBe(1)
  })

  it('커뮤니티 축약어를 찾는다', () => {
    expect(stage1Match('무탠다드 맨투맨 추천', musinsa)[0]?.alias).toBe('무탠다드')
  })

  it('언급이 없으면 빈 배열', () => {
    expect(stage1Match('나이키와 아디다스를 추천합니다.', musinsa)).toEqual([])
  })

  it('언급 위치를 원본 텍스트 인덱스로 돌려준다', () => {
    const text = '먼저 나이키, 그리고 무신사가 있습니다.'
    const hits = stage1Match(text, musinsa)
    expect(hits[0]?.index).toBe(text.indexOf('무신사'))
  })

  it('같은 브랜드가 여러 번 나오면 첫 위치만 돌려준다', () => {
    const hits = stage1Match('무신사는 좋다. 무신사 추천.', musinsa)
    expect(hits).toHaveLength(1)
  })

  it('여러 별칭이 걸리면 가장 앞선 위치를 돌려준다', () => {
    const text = '무탠다드가 좋고, 무신사도 좋다.'
    const hits = stage1Match(text, musinsa)
    expect(hits[0]?.index).toBe(text.indexOf('무탠다드'))
  })
})

describe('stage1Match — 한국어 표기 변형', () => {
  // ★ 여기서 놓친 것은 영원히 복구되지 않는다. 2차는 1차가 넘긴 것만 본다.
  const 조사 = ['가', '는', '를', '에서', '의', '도', '와', '만', '으로', '보다', '까지', '조차']

  it.each(조사)('조사 "%s"가 붙어도 찾는다', (josa) => {
    const hits = stage1Match(`저는 무신사${josa} 좋아합니다.`, musinsa)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.alias).toBe('무신사')
  })

  it('영문 표기에 한글 조사가 붙어도 찾고, 2차로 끌려가지 않는다', () => {
    // 한국어 문장에서 'MUSINSA는'은 정상적인 표기다. 이걸 경계 위반으로
    // 취급하면 영문 별칭이 사실상 전부 2차로 넘어가 원가가 무너진다.
    const hits = stage1Match('MUSINSA는 한국 플랫폼입니다.', musinsa)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.needsStage2).toBe(false)
  })

  it('대소문자를 가리지 않는다', () => {
    for (const form of ['musinsa', 'MUSINSA', 'MuSiNsA']) {
      expect(stage1Match(`${form} 좋아요`, musinsa), form).toHaveLength(1)
    }
  })

  it('전각 표기를 찾는다', () => {
    expect(stage1Match('ＭＵＳＩＮＳＡ 추천', musinsa)).toHaveLength(1)
  })

  it('NFD로 분해된 한글도 찾고, 위치는 원본을 가리킨다', () => {
    const prefix = '요즘 '
    const text = prefix + '무신사'.normalize('NFD') + '가 좋다'
    const hits = stage1Match(text, musinsa)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.index).toBe(prefix.length)
  })

  it('괄호·구두점이 끼어도 찾는다', () => {
    expect(stage1Match('(무신사)에서 샀어요', musinsa)).toHaveLength(1)
    expect(stage1Match('무신사, 29CM 추천', musinsa)).toHaveLength(1)
  })

  it('영문·한글 혼용 표기를 찾는다', () => {
    expect(stage1Match('무신사(MUSINSA) 스탠다드', musinsa)).toHaveLength(1)
  })

  it('띄어쓰기가 다른 합성 별칭을 찾는다', () => {
    for (const form of ['무신사스탠다드', '무신사 스탠다드', '무신사  스탠다드']) {
      expect(stage1Match(`${form} 반팔`, musinsa), form).toHaveLength(1)
    }
  })

  it('제로폭 문자가 끼어 있어도 찾는다', () => {
    expect(stage1Match('무​신‌사 추천', musinsa)).toHaveLength(1)
  })
})

describe('stage1Match — 2차 판정 필요 여부', () => {
  it('ambiguous 브랜드는 무조건 2차를 거친다', () => {
    const hits = stage1Match('오후에 소나기가 내렸다.', ambiguous)
    expect(hits[0]?.needsStage2).toBe(true)
  })

  it('명백한 브랜드는 2차를 건너뛸 수 있다 (원가 절감)', () => {
    const hits = stage1Match('무신사에서 샀습니다.', musinsa)
    expect(hits[0]?.needsStage2).toBe(false)
  })

  it('짧은 별칭(2자 이하)은 ambiguous가 아니어도 2차를 거친다', () => {
    const short: BrandProfile = { canonical: '미미', aliases: [], ambiguous: false }
    expect(stage1Match('미미한 차이입니다.', short)[0]?.needsStage2).toBe(true)
  })

  it('경쟁사 이름이 함께 나오면 순서 판정을 위해 2차를 거친다', () => {
    const hits = stage1Match('무신사에서 샀습니다.', musinsa, {
      otherBrandsPresent: true,
    })
    expect(hits[0]?.needsStage2).toBe(true)
  })

  it('짧은 별칭이 목록에 있어도, 긴 별칭으로 맞았으면 2차를 건너뛴다', () => {
    // 계획서는 후보 전체의 최단 길이를 봤다. 그러면 'MU' 하나 때문에
    // '무신사'로 정확히 맞은 건까지 전부 2차 비용을 문다.
    const withShort: BrandProfile = { ...musinsa, aliases: [...musinsa.aliases, 'MU'] }
    const hits = stage1Match('무신사에서 샀습니다.', withShort)
    expect(hits[0]?.alias).toBe('무신사')
    expect(hits[0]?.needsStage2).toBe(false)
  })

  it('같은 자리에서 겹치면 더 긴 별칭을 고른다', () => {
    const brand: BrandProfile = { canonical: '미미', aliases: ['미미화장품'], ambiguous: false }
    const hits = stage1Match('미미화장품이 좋다', brand)
    expect(hits[0]?.alias).toBe('미미화장품')
    // 짧은 쪽('미미')을 골랐다면 2차로 끌려갔을 것이다.
    expect(hits[0]?.needsStage2).toBe(false)
  })
})

describe('stage1Match — 부분 문자열 오탐은 버리지 않고 2차로 넘긴다', () => {
  const cited: BrandProfile = { canonical: 'Cited', aliases: [], ambiguous: false }

  it('영문 브랜드명이 다른 단어 안에 박히면 2차를 거친다', () => {
    // ★ 우리 브랜드가 정확히 이 사례다: 'cited'는 'excited' 안에 있다.
    //   이 검사가 없으면 오탐이 검증 없이 최종 결과에 올라간다.
    const hits = stage1Match('I am excited about this.', cited)
    expect(hits).toHaveLength(1) // recall — 버리지 않는다
    expect(hits[0]?.needsStage2).toBe(true) // 그러나 확인은 받는다
  })

  it('영문 브랜드명이 단어로 서 있으면 2차를 건너뛴다', () => {
    const hits = stage1Match('Cited is a monitoring tool.', cited)
    expect(hits[0]?.needsStage2).toBe(false)
  })

  it('뒤에 라틴 문자가 붙으면 2차를 거친다 (복수형·파생어)', () => {
    const nike: BrandProfile = { canonical: 'Nike', aliases: [], ambiguous: false }
    expect(stage1Match('Nikes are popular.', nike)[0]?.needsStage2).toBe(true)
    expect(stage1Match('Nike is popular.', nike)[0]?.needsStage2).toBe(false)
  })

  it('한글 합성어 안에 박힌 일반어 별칭은 2차를 거친다', () => {
    const std: BrandProfile = { canonical: '스탠다드', aliases: [], ambiguous: false }
    expect(stage1Match('무신사스탠다드 반팔', std)[0]?.needsStage2).toBe(true)
    expect(stage1Match('스탠다드 반팔', std)[0]?.needsStage2).toBe(false)
  })

  it('모델명 뒤에 숫자가 이어지면 2차를 거친다', () => {
    const nb: BrandProfile = { canonical: '뉴발란스 880', aliases: [], ambiguous: false }
    expect(stage1Match('뉴발란스 8801 신제품', nb)[0]?.needsStage2).toBe(true)
    expect(stage1Match('뉴발란스 880 추천', nb)[0]?.needsStage2).toBe(false)
  })
})

describe('stage1Match — 방어', () => {
  it('빈 텍스트를 받아도 던지지 않는다', () => {
    expect(stage1Match('', musinsa)).toEqual([])
  })

  it('별칭이 비어도 canonical은 검사한다', () => {
    const bare: BrandProfile = { canonical: '나이키', aliases: [], ambiguous: false }
    expect(stage1Match('나이키 좋아요', bare)).toHaveLength(1)
  })

  it('정규식 특수문자가 든 브랜드명도 안전하다', () => {
    const weird: BrandProfile = { canonical: 'C++', aliases: ['C++'], ambiguous: false }
    expect(() => stage1Match('C++ 좋아요', weird)).not.toThrow()
  })

  it('브랜드명이 전부 구두점이면 매칭하지 않는다', () => {
    // 정규화하면 빈 문자열이 된다. indexOf('')는 0을 돌려주므로
    // 걸러내지 않으면 **모든 텍스트가 이 브랜드를 언급한 것**이 된다.
    const punct: BrandProfile = { canonical: '+++', aliases: ['...'], ambiguous: false }
    expect(stage1Match('아무 상관 없는 문장입니다.', punct)).toEqual([])
  })

  it('canonical이 비어 있고 별칭만 있어도 동작한다', () => {
    const onlyAlias: BrandProfile = { canonical: '', aliases: ['무신사'], ambiguous: false }
    expect(stage1Match('무신사 좋아요', onlyAlias)).toHaveLength(1)
  })

  it('별칭이 중복돼도 결과가 하나다', () => {
    const dup: BrandProfile = {
      canonical: '무신사',
      aliases: ['무신사', ' 무신사 ', '무신사'],
      ambiguous: false,
    }
    expect(stage1Match('무신사 좋아요', dup)).toHaveLength(1)
  })

  it('텍스트가 구두점뿐이어도 던지지 않는다', () => {
    expect(stage1Match('...!!!???', musinsa)).toEqual([])
  })

  it('입력을 변형하지 않는다', () => {
    const brand: BrandProfile = { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false }
    const snapshot = JSON.stringify(brand)
    stage1Match('무신사 좋아요', brand)
    expect(JSON.stringify(brand)).toBe(snapshot)
  })

  it('긴 텍스트에서도 위치가 정확하다', () => {
    const filler = '이것은 관련 없는 문장입니다. '.repeat(200)
    const text = filler + '그리고 무신사가 있습니다.'
    const hits = stage1Match(text, musinsa)
    expect(hits[0]?.index).toBe(text.indexOf('무신사'))
  })
})
