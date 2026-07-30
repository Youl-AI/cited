import { describe, expect, it } from 'vitest'
import { AUDIT_QUERY_COUNT, KNOWN_CATEGORIES, generateAuditQueries } from '@/lib/audit/queries'
import { PLANS } from '@/lib/plans'

describe('generateAuditQueries', () => {
  it('정확히 3개를 만든다', () => {
    // ★ 이 숫자가 곧 원가다. 3 → 4는 무료 진단 원가가 33% 오른다.
    expect(generateAuditQueries('패션', '무신사')).toHaveLength(AUDIT_QUERY_COUNT)
    expect(AUDIT_QUERY_COUNT).toBe(3)
  })

  it('무료 플랜 한도와 같다', () => {
    // ★ 두 곳에서 따로 정하면 갈린다. 질의 수가 한도를 넘으면
    //   validateRunStart가 수집 자체를 거부해 진단이 통째로 실패한다.
    expect(AUDIT_QUERY_COUNT).toBe(PLANS.free.maxQueries)
  })

  it('브랜드명을 질의에 넣지 않는다', () => {
    // ★ 결정적으로 중요하다. "무신사 어때?"라고 물으면 AI는 당연히 무신사를
    //   말하고 언급률이 100%가 된다. 우리가 재려는 것은 **브랜드를 말하지 않은
    //   질문에 AI가 그 브랜드를 꺼내는가**다. 이것이 GEO 측정의 전부다.
    for (const q of generateAuditQueries('패션', '무신사')) {
      expect(q, q).not.toContain('무신사')
    }
  })

  it('모르는 카테고리에서도 브랜드명이 새지 않는다', () => {
    // 일반형 질의는 카테고리 입력을 그대로 끼워 넣는다. 고객이 카테고리 칸에
    // 브랜드명을 적어 넣는 일이 실제로 있다 — 그때도 막아야 한다.
    for (const q of generateAuditQueries('수제 도자기 공방', '가나다')) {
      expect(q, q).not.toContain('가나다')
    }
  })

  it('아는 카테고리는 그 카테고리 문구를 쓴다', () => {
    const qs = generateAuditQueries('화장품', '토리든')
    expect(qs.some((q) => q.includes('화장품') || q.includes('스킨케어'))).toBe(true)
  })

  it('별칭으로 카테고리를 찾는다', () => {
    // 고객은 '뷰티'라고 쓰고 우리 템플릿은 '화장품'이다.
    const qs = generateAuditQueries('뷰티', '토리든')
    expect(qs).toEqual(generateAuditQueries('화장품', '토리든'))
  })

  it('카테고리에 군더더기가 붙어도 찾는다', () => {
    // '온라인 패션 쇼핑몰' 같은 자유 입력이 들어온다.
    expect(generateAuditQueries('온라인 패션 쇼핑몰', 'x')).toEqual(
      generateAuditQueries('패션', 'x'),
    )
  })

  it('모르는 카테고리도 던지지 않고 3개를 만든다', () => {
    const qs = generateAuditQueries('수제 도자기 공방', '가나다')
    expect(qs).toHaveLength(3)
    for (const q of qs) expect(q).toContain('수제 도자기 공방')
  })

  it('카테고리의 앞뒤 공백을 다듬어 넣는다', () => {
    for (const q of generateAuditQueries('  수제 비누  ', 'x')) {
      expect(q).not.toContain('  수제 비누  ')
      expect(q).toContain('수제 비누')
    }
  })

  it('질의가 서로 다르다', () => {
    // 같은 질의를 두 번 돌리면 돈은 두 배로 쓰고 정보는 한 번분이다.
    for (const category of [...KNOWN_CATEGORIES, '수제 도자기 공방']) {
      const qs = generateAuditQueries(category, '테스트브랜드')
      expect(new Set(qs).size, category).toBe(3)
    }
  })

  it('빈 카테고리를 거부한다', () => {
    // 빈 카테고리로 만든 일반형 질의는 "추천해줘"가 되어 아무것도 측정하지 못한다.
    expect(() => generateAuditQueries('', '무신사')).toThrow()
    expect(() => generateAuditQueries('   ', '무신사')).toThrow()
  })

  it('알려진 카테고리 목록을 노출한다 (폼의 자동완성용)', () => {
    expect(KNOWN_CATEGORIES.length).toBeGreaterThan(0)
    for (const c of KNOWN_CATEGORIES) {
      expect(generateAuditQueries(c, '테스트브랜드'), c).toHaveLength(3)
    }
  })

  it('같은 입력에 항상 같은 질의를 준다', () => {
    // ★ 결정적이어야 한다. 재실행 때 질의가 달라지면 첫 실행과 비교할 수 없고,
    //   "왜 숫자가 달라졌냐"에 답할 수가 없다.
    expect(generateAuditQueries('패션', '무신사')).toEqual(generateAuditQueries('패션', '무신사'))
  })

  it('돌려준 배열을 호출자가 바꿔도 다음 호출에 영향이 없다', () => {
    const first = generateAuditQueries('패션', '무신사')
    first[0] = '오염됨'
    expect(generateAuditQueries('패션', '무신사')[0]).not.toBe('오염됨')
  })
})
