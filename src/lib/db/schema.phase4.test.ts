import { getTableConfig } from 'drizzle-orm/pg-core'
import type { AnyPgTable } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'vitest'
import { brands, collectionRuns, subscriptions } from './schema'

function columnNames(table: AnyPgTable): string[] {
  return getTableConfig(table).columns.map((c) => c.name)
}

describe('4단계 additive 컬럼', () => {
  test('subscriptions.from_audit_id — 크몽 진단 연결(plan:grant --from-audit)', () => {
    expect(columnNames(subscriptions)).toContain('from_audit_id')
  })

  test('brands — region · self_domains · query_generations · queries_frozen_at', () => {
    const cols = columnNames(brands)
    for (const name of ['region', 'self_domains', 'query_generations', 'queries_frozen_at']) {
      expect(cols).toContain(name)
    }
  })

  test('collection_runs.result — 회차 결과 스냅샷', () => {
    expect(columnNames(collectionRuns)).toContain('result')
  })

  test('query_generations 기본값 0 · self_domains 기본값 [] (notNull)', () => {
    const cols = getTableConfig(brands).columns
    const gen = cols.find((c) => c.name === 'query_generations')
    const domains = cols.find((c) => c.name === 'self_domains')
    expect(gen?.notNull).toBe(true)
    expect(domains?.notNull).toBe(true)
  })
})
