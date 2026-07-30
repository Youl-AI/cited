import { describe, expect, it, vi } from 'vitest'
import {
  AUDIT_QUERY_COUNT,
  KNOWN_CATEGORIES,
  generateAuditQueries,
  isRegionalCategory,
} from '@/lib/audit/queries'
import { QUERY_TEMPLATES, REGION_SLOT } from '@/lib/audit/query-templates'
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
    // 지역형 업종은 지역 없이 던지므로(의도) 지역을 넣어 돌린다.
    for (const category of [...KNOWN_CATEGORIES, '수제 도자기 공방']) {
      const qs = isRegionalCategory(category)
        ? generateAuditQueries(category, '테스트브랜드', '수원')
        : generateAuditQueries(category, '테스트브랜드')
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
      // 지역형 업종은 지역 없이 던지므로(의도) 지역을 넣어 돌린다.
      const qs = isRegionalCategory(c)
        ? generateAuditQueries(c, '테스트브랜드', '수원')
        : generateAuditQueries(c, '테스트브랜드')
      expect(qs, c).toHaveLength(3)
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

describe('QUERY_TEMPLATES — 새 업종이 추가될 때마다 자동으로 검사한다', () => {
  it('모든 업종이 정확히 질의 3개를 가진다', () => {
    for (const t of QUERY_TEMPLATES) {
      expect(t.queries.length, t.label).toBe(3)
    }
  })

  it('별칭이 업종 간에 겹치지 않는다 — 겹치면 앞 업종이 조용히 가로챈다', () => {
    const seen = new Map<string, string>()
    for (const t of QUERY_TEMPLATES) {
      for (const alias of t.aliases) {
        expect(seen.has(alias), `'${alias}' — ${seen.get(alias)} vs ${t.label}`).toBe(false)
        seen.set(alias, t.label)
      }
    }
  })

  it('지역형은 모든 질의에, 전국형은 어느 질의에도 {지역}이 없다', () => {
    // regional 플래그와 실제 질의가 어긋나면: 지역형인데 슬롯 없는 질의는
    // 지역 없이도 성립하는 척하고, 전국형에 슬롯이 남으면 '{지역}'이
    // 문자 그대로 AI에게 전송된다.
    for (const t of QUERY_TEMPLATES) {
      for (const q of t.queries) {
        expect(q.includes(REGION_SLOT), `${t.label}: ${q}`).toBe(t.regional)
      }
    }
  })

  it('업종 25개 이상이다 (크몽 커버리지)', () => {
    expect(QUERY_TEMPLATES.length).toBeGreaterThanOrEqual(25)
  })
})

describe('generateAuditQueries — 지역', () => {
  it('지역형 업종은 지역 없이 던진다 — 조용한 강등 금지', () => {
    expect(() => generateAuditQueries('치과', '어느치과')).toThrowError(/지역/)
  })

  it('지역형 업종에 지역을 주면 모든 질의에 지역이 들어간다', () => {
    const out = generateAuditQueries('치과', '어느치과', '수원')
    expect(out).toHaveLength(3)
    for (const q of out) {
      expect(q).toContain('수원')
      expect(q).not.toContain(REGION_SLOT)
    }
  })

  it('전국형 업종은 지역을 무시한다', () => {
    expect(generateAuditQueries('패션', 'x', '수원')).toEqual(
      generateAuditQueries('패션', 'x'),
    )
  })

  it('모르는 업종 + 지역이면 일반형 질의에 지역을 붙인다', () => {
    const out = generateAuditQueries('네일아트 클래스', 'x', '수원')
    for (const q of out) expect(q).toContain('수원')
  })

  it('isRegionalCategory가 템플릿의 regional을 그대로 따른다', () => {
    expect(isRegionalCategory('치과')).toBe(true)
    expect(isRegionalCategory('패션')).toBe(false)
    expect(isRegionalCategory('처음 보는 업종')).toBe(false)
  })

  it('슬롯이 두 번 나오는 질의도 전부 치환한다 (replaceAll 회귀 방지)', async () => {
    // 실제 템플릿엔 아직 슬롯 2개짜리 질의가 없어서, replaceAll을 replace로
    // 바꿔도 위 테스트들은 살아남는다(변이 테스트로 확인). 픽스처로 못박는다.
    vi.resetModules()
    vi.doMock('@/lib/audit/query-templates', async (importOriginal) => {
      const mod = await importOriginal<typeof import('@/lib/audit/query-templates')>()
      return {
        ...mod,
        QUERY_TEMPLATES: [
          ...mod.QUERY_TEMPLATES,
          {
            label: '슬롯2픽스처',
            aliases: ['슬롯2픽스처'],
            regional: true,
            queries: [
              '{지역} 픽스처 어디가 좋아? {지역} 기준으로',
              '{지역}에서 픽스처 추천해줘 — {지역} 한정',
              '{지역} 픽스처 알려줘, {지역} 안에서',
            ] as const,
          },
        ],
      }
    })
    try {
      const { generateAuditQueries: gen } = await import('@/lib/audit/queries')
      const out = gen('슬롯2픽스처', 'x', '수원')
      expect(out).toHaveLength(3)
      for (const q of out) {
        expect(q, q).not.toContain(REGION_SLOT)
        expect(q).toContain('수원')
      }
    } finally {
      vi.doUnmock('@/lib/audit/query-templates')
      vi.resetModules()
    }
  })
})
