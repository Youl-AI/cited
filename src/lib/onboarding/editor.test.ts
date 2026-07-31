import { describe, expect, test } from 'vitest'
import { buildInitialQueries, quotaBlockedReason } from './editor'

const templates = ['t1', 't2', 't3']

describe('buildInitialQueries', () => {
  test('크몽 동결 질의가 있으면 그대로 (연속성 — 크몽 리포트와 비교 가능)', () => {
    const frozen = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10']
    const init = buildInitialQueries({ frozen, templates, quota: 10 })
    expect(init).toEqual({ queries: frozen, source: 'frozen' })
  })

  test('동결 질의 10 + quota 30(business 전환)이면 빈 칸 20개를 붙인다', () => {
    const frozen = Array.from({ length: 10 }, (_, i) => `q${i + 1}`)
    const init = buildInitialQueries({ frozen, templates, quota: 30 })
    expect(init.queries).toHaveLength(30)
    expect(init.queries.slice(0, 10)).toEqual(frozen)
    expect(init.queries[10]).toBe('')
  })

  test('동결 질의가 없으면 템플릿 3 + 빈 칸', () => {
    const init = buildInitialQueries({ frozen: null, templates, quota: 10 })
    expect(init.source).toBe('template')
    expect(init.queries.slice(0, 3)).toEqual(templates)
    expect(init.queries).toHaveLength(10)
    expect(init.queries[3]).toBe('')
  })
})

describe('quotaBlockedReason', () => {
  test('남은 몫이 템플릿 수 이상이면 막지 않는다', () => {
    expect(
      quotaBlockedReason({ quota: 3, queriesOnOtherBrands: 27, maxQueries: 30, minCount: 3 }),
    ).toBeNull()
  })

  // ★ quota=0에서 진짜 이유는 "질의 개수"가 아니라 "다른 브랜드가 다 쓰고 있다"다.
  //   개수 이야기로 번역되면 고객은 영영 엉뚱한 곳을 고친다.
  test('남은 몫이 모자라면 다른 브랜드 사용분을 지목한다', () => {
    const reason = quotaBlockedReason({
      quota: 0,
      queriesOnOtherBrands: 30,
      maxQueries: 30,
      minCount: 3,
    })
    expect(reason).toContain('다른 브랜드가 30개')
    expect(reason).toContain('질의 팩')
  })
})
