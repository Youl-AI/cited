import { isSQLWrapper } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'vitest'
import type { AnyPgTable } from 'drizzle-orm/pg-core'
import { brands, collectionRuns, subscriptions } from './schema'

function columnNames(table: AnyPgTable): string[] {
  return getTableConfig(table).columns.map((c) => c.name)
}

function column(table: AnyPgTable, name: string) {
  const found = getTableConfig(table).columns.find((c) => c.name === name)
  if (!found) throw new Error(`컬럼 "${name}"을 찾을 수 없다`)
  return found
}

// schema.test.ts와 같은 이유로 PgDialect를 쓴다: drizzle-kit generate가 DDL을
// 만들 때 타는 경로와 동일하므로, 라이브 DB 없이도 마이그레이션에 실릴 DEFAULT
// 표현식을 그대로 확인할 수 있다. 스칼라 기본값(0 등)은 `.default`에 원시값이
// 그대로 들어오고, `sql\`...\`` 기본값은 SQL 객체로 들어오므로 렌더해서 대조한다.
const dialect = new PgDialect()

/** SQL 표현식 기본값을 DDL에 실릴 텍스트로 렌더한다. 표현식이 아니면 실패시킨다. */
function defaultSqlText(table: AnyPgTable, name: string): string {
  const def = column(table, name).default
  if (!isSQLWrapper(def)) {
    throw new Error(`${name}의 기본값이 SQL 표현식이 아니다 (실제: ${String(def)})`)
  }
  return dialect.sqlToQuery(def.getSQL()).sql
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

  // NOT NULL만 단언하면 나중에 누가 `.default(...)`를 지워도 이 테스트는 통과한다.
  // 그런데 이미 행이 있는 운영 테이블에 DEFAULT 없는 NOT NULL 열을 추가하면
  // 마이그레이션이 그 자리에서 실패한다 — 이 프로젝트가 막으려는 사고가 정확히
  // 그것이므로, notNull과 기본값을 항상 짝으로 단언한다.
  test('query_generations 기본값 0 · self_domains 기본값 [] (notNull)', () => {
    const gen = column(brands, 'query_generations')
    expect(gen.notNull).toBe(true)
    expect(gen.hasDefault).toBe(true)
    expect(gen.default).toBe(0)

    const domains = column(brands, 'self_domains')
    expect(domains.notNull).toBe(true)
    expect(domains.hasDefault).toBe(true)
    // jsonb 기본값은 `sql\`'[]'::jsonb\``이라 원시값 비교가 불가능하다.
    // 렌더된 DDL 텍스트가 곧 마이그레이션에 실릴 DEFAULT 절이다.
    expect(defaultSqlText(brands, 'self_domains')).toBe(`'[]'::jsonb`)
  })

  // 반대쪽 절반 — 이 열들은 nullable이므로 DEFAULT가 없어도 안전하다.
  // (nullable인데 기본값까지 생기면 "값 없음"과 "기본값"이 뒤섞여 의미가 바뀐다.)
  test('queries_frozen_at · region · result · from_audit_id는 DEFAULT 없는 nullable이다', () => {
    for (const [table, name] of [
      [brands, 'queries_frozen_at'],
      [brands, 'region'],
      [collectionRuns, 'result'],
      [subscriptions, 'from_audit_id'],
    ] as const) {
      const col = column(table, name)
      expect(col.notNull, name).toBe(false)
      expect(col.hasDefault, name).toBe(false)
    }
  })
})
