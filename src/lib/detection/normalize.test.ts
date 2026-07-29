import { describe, expect, it } from 'vitest'
import { normalizeKo, normalizeWithMap } from '@/lib/detection/normalize'

describe('normalizeKo', () => {
  it('공백을 제거한다 (띄어쓰기 변형 흡수)', () => {
    expect(normalizeKo('무신사 스탠다드')).toBe(normalizeKo('무신사스탠다드'))
  })

  it('영문 대소문자를 통일한다', () => {
    expect(normalizeKo('MUSINSA')).toBe(normalizeKo('musinsa'))
    expect(normalizeKo('Nike')).toBe(normalizeKo('NIKE'))
    expect(normalizeKo('nike')).toBe(normalizeKo('NIKE'))
  })

  it('전각 문자를 반각으로 바꾼다', () => {
    expect(normalizeKo('ＭＵＳＩＮＳＡ')).toBe(normalizeKo('MUSINSA'))
    expect(normalizeKo('ＡＢＣ１２３')).toBe('abc123')
  })

  it('한글 자모를 완성형으로 결합한다 (NFC)', () => {
    // macOS 파일명·일부 브라우저 입력이 NFD로 들어온다.
    const decomposed = '무신사'.normalize('NFD')
    expect(decomposed).not.toBe('무신사') // 전제 확인: 실제로 분해되어 있다
    expect(normalizeKo(decomposed)).toBe(normalizeKo('무신사'))
  })

  it('반각 가타카나·호환 문자도 NFKC로 접는다', () => {
    expect(normalizeKo('㈜무신사')).toContain('무신사')
  })

  it('구두점과 특수문자를 제거한다', () => {
    expect(normalizeKo('나이키-에어')).toBe(normalizeKo('나이키 에어'))
    expect(normalizeKo('L.L.Bean')).toBe(normalizeKo('LLBean'))
    expect(normalizeKo('무신사(MUSINSA)')).toBe('무신사musinsa')
  })

  it('제로폭 문자를 제거한다', () => {
    expect(normalizeKo('무​신‌사')).toBe('무신사')
  })

  it('숫자는 남긴다 (뉴발란스 880 같은 모델명)', () => {
    expect(normalizeKo('뉴발란스 880')).toContain('880')
  })

  it('빈 문자열을 받아도 던지지 않는다', () => {
    expect(normalizeKo('')).toBe('')
  })

  it('구두점만 있는 문자열은 빈 문자열이 된다', () => {
    expect(normalizeKo('++!!')).toBe('')
  })

  it('이모지를 제거해도 뒤 글자가 깨지지 않는다 (서로게이트 쌍)', () => {
    expect(normalizeKo('무신사👟추천')).toBe('무신사추천')
  })
})

describe('normalizeWithMap — 원본 인덱스 복원', () => {
  it('normalized는 normalizeKo와 같다', () => {
    for (const s of [
      '무신사 스탠다드',
      'MUSINSA(무신사)',
      '나이키-에어맥스 270',
      '무신사'.normalize('NFD'),
      'ＮＩＫＥ',
      '',
    ]) {
      expect(normalizeWithMap(s).normalized).toBe(normalizeKo(s))
    }
  })

  it('map의 길이가 normalized 길이와 같다', () => {
    const { normalized, map } = normalizeWithMap('먼저 나이키, 그리고 무신사가 있습니다.')
    expect(map).toHaveLength(normalized.length)
  })

  it('정규화 문자열의 위치를 원본 인덱스로 되돌린다', () => {
    const text = '먼저 나이키, 그리고 무신사가 있습니다.'
    const { normalized, map } = normalizeWithMap(text)
    const at = normalized.indexOf('무신사')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(map[at]).toBe(text.indexOf('무신사'))
  })

  it('NFD 입력에서도 원본 인덱스를 가리킨다', () => {
    const prefix = '먼저 '
    const text = prefix + '무신사'.normalize('NFD') + '가 좋다'
    const { normalized, map } = normalizeWithMap(text)
    const at = normalized.indexOf('무신사')
    expect(at).toBeGreaterThanOrEqual(0)
    // 분해된 첫 자모(초성 ᄆ)의 위치를 가리켜야 한다
    expect(map[at]).toBe(prefix.length)
  })

  it('map은 단조 증가한다 (뒤로 가지 않는다)', () => {
    const { map } = normalizeWithMap('ＡＢ 나이키-에어👟 880 무신사')
    for (let i = 1; i < map.length; i++) {
      expect(map[i]!).toBeGreaterThanOrEqual(map[i - 1]!)
    }
  })

  it('빈 문자열이면 빈 결과', () => {
    expect(normalizeWithMap('')).toEqual({ normalized: '', map: [] })
  })

  // ★ 이 세 불변식이 깨지면 근거 스니펫이 원문의 엉뚱한 곳을 가리킨다.
  //   고객에게 "이 문장에서 언급됐습니다"라고 보여주는 자리라 조용히 틀리면
  //   제품 신뢰가 바로 무너진다. 그래서 표본을 넓게 잡아 한꺼번에 검사한다.
  const SAMPLES = [
    '',
    '무신사',
    '무신사 스탠다드 티셔츠 추천',
    'MUSINSA(무신사)에서 파는 옷',
    '나이키-에어맥스 270과 뉴발란스 880',
    '무신사'.normalize('NFD'),
    ('먼저 ' + '무신사'.normalize('NFD') + '가 좋다').normalize('NFD'),
    'ＮＩＫＥ와 ＡＤＩＤＡＳ',
    '㈜무신사 공식몰',
    '무신사👟추천🇰🇷',
    '무​신‌사',
    '++!!...---',
    'L.L.Bean vs A.P.C.',
    '가나다'.repeat(50),
    '👨‍👩‍👧‍👦 가족',
  ]

  it('불변식 1: normalized가 normalizeKo와 항상 일치한다', () => {
    for (const s of SAMPLES) {
      expect(normalizeWithMap(s).normalized, JSON.stringify(s)).toBe(normalizeKo(s))
    }
  })

  it('불변식 2: map 길이가 normalized 길이와 항상 같다', () => {
    for (const s of SAMPLES) {
      const { normalized, map } = normalizeWithMap(s)
      expect(map.length, JSON.stringify(s)).toBe(normalized.length)
    }
  })

  it('불변식 3: map은 항상 원본 범위 안의 단조 증가 인덱스다', () => {
    for (const s of SAMPLES) {
      const { map } = normalizeWithMap(s)
      for (let i = 0; i < map.length; i++) {
        expect(map[i]!, JSON.stringify(s)).toBeGreaterThanOrEqual(i === 0 ? 0 : map[i - 1]!)
        expect(map[i]!, JSON.stringify(s)).toBeLessThan(s.length)
      }
    }
  })
})
