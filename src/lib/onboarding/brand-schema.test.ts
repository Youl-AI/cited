import { describe, expect, test } from 'vitest'
import { brandFormSchema } from './brand-schema'

const schema = brandFormSchema(3)

describe('brandFormSchema', () => {
  test('기본형 — 도메인 정규화까지', () => {
    const v = schema.parse({
      name: '무신사',
      category: '패션',
      competitors: ['29CM', ' 지그재그 ', '무신사'],
      siteUrl: 'https://www.musinsa.com/kr',
    })
    expect(v.competitors).toEqual(['29CM', '지그재그']) // 자기 자신·공백 제거
    expect(v.selfDomains).toEqual(['musinsa.com'])
    expect(v.region).toBe('')
  })

  test('지역형 업종은 지역 필수', () => {
    const r = schema.safeParse({ name: '바디텍', category: '필라테스' })
    expect(r.success).toBe(false)
  })

  test('지역형 + 지역 → 통과, 전국형의 지역은 버린다', () => {
    const regional = schema.parse({ name: '바디텍', category: '필라테스', region: '강남' })
    expect(regional.region).toBe('강남')
    const national = schema.parse({ name: '무신사', category: '패션', region: '강남' })
    expect(national.region).toBe('') // generateAuditQueries와 같은 규칙
  })

  test('경쟁사 한도 초과 거부', () => {
    const r = schema.safeParse({
      name: 'a',
      category: '패션',
      competitors: ['b', 'c', 'd', 'e'],
    })
    expect(r.success).toBe(false)
  })

  test('알아볼 수 없는 사이트 주소 거부', () => {
    const r = schema.safeParse({ name: 'a', category: '패션', siteUrl: '무신사' })
    expect(r.success).toBe(false)
  })
})
