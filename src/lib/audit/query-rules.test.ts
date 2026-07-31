import { describe, expect, test } from 'vitest'
import { checkCustomQueries, normalizeQueryKey, validateCustomQueries } from './query-rules'
import { generateAuditQueries } from '@/lib/audit/queries'

const templates = generateAuditQueries('패션', '무신사')
const ctx = {
  brandName: '무신사',
  competitors: ['29CM'] as const,
  category: '패션',
  requiredCount: 5,
}
const valid = [...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘']

describe('query-rules (custom-queries에서 이동)', () => {
  test('유효 세트 통과 — 이동 후에도 로직 동일', () => {
    expect(validateCustomQueries(valid, ctx)).toHaveLength(5)
  })

  test('브랜드명 포함 거부', () => {
    const bad = [...templates, '무신사 어때?', '겨울 코트 브랜드 추천해줘']
    expect(() => validateCustomQueries(bad, ctx)).toThrow(/브랜드명/)
  })

  test('checkCustomQueries — 던지지 않고 이유를 돌려준다 (화면 실시간 검증용)', () => {
    const ok = checkCustomQueries(valid, ctx)
    expect(ok).toEqual({ ok: true, queries: valid })
    const bad = checkCustomQueries([...templates, '29CM 대신 뭐 써?', 'x'], ctx)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain('경쟁사명')
  })

  test('normalizeQueryKey — 공백·대소문자를 뭉갠다', () => {
    expect(normalizeQueryKey('바디텍 필라테스')).toBe(normalizeQueryKey('바디텍필라테스'))
  })
})
