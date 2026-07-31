import { describe, expect, test } from 'vitest'
import { buildInitialQueries } from './editor'

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
