import { getTableColumns } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { ENGINE_TIER, PLANS } from '@/lib/plans'
import {
  answers,
  AUDIT_STATUSES,
  brands,
  collectionRuns,
  detections,
  freeAudits,
  payments,
  PAYMENT_STATUSES,
  queries,
  QUERY_SOURCES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SENTIMENTS,
  SUBSCRIPTION_STATUSES,
  subscriptions,
  user,
  USER_ROLES,
} from '@/lib/db/schema'
import type { AnyPgTable } from 'drizzle-orm/pg-core'

describe('설계 ②의 핵심 필드', () => {
  it('collection_runs가 planSnapshot과 completeness를 가진다', () => {
    const cols = Object.keys(getTableColumns(collectionRuns))
    expect(cols).toContain('planSnapshot')
    expect(cols).toContain('completeness')
    expect(cols).toContain('metrics')
  })

  it('answers가 원본(raw)을 보관한다', () => {
    const cols = Object.keys(getTableColumns(answers))
    expect(cols).toContain('raw')
    expect(cols).toContain('citations')
    expect(cols).toContain('sampleIndex')
  })

  it('detections가 detectorVersion과 position을 가진다', () => {
    const cols = Object.keys(getTableColumns(detections))
    expect(cols).toContain('detectorVersion')
    expect(cols).toContain('position')
    expect(cols).toContain('sentiment')
    expect(cols).toContain('subject')
  })

  it('subscriptions가 queryPacks를 가진다', () => {
    expect(Object.keys(getTableColumns(subscriptions))).toContain('queryPacks')
  })

  it('brands가 별칭·경쟁사·질의쿼터를 가진다', () => {
    const cols = Object.keys(getTableColumns(brands))
    expect(cols).toContain('aliases')
    expect(cols).toContain('competitors')
    expect(cols).toContain('queryQuota')
    expect(cols).toContain('ambiguous')
    expect(cols).toContain('collectionWeekday')
  })

  it('queries가 source를 구분한다', () => {
    expect(Object.keys(getTableColumns(queries))).toContain('source')
  })

  it('free_audits가 A/B variant와 ipHash를 기록한다', () => {
    const cols = Object.keys(getTableColumns(freeAudits))
    expect(cols).toContain('variant')
    expect(cols).toContain('ipHash')
    expect(cols).toContain('email')
  })
})

// ─────────────────────────────────────────────────────────────
// 리뷰 지적 #2: 상태 컬럼 CHECK 제약이 TypeScript 유니온과 갈라지지 않는가
// ─────────────────────────────────────────────────────────────
// 라이브 DB 없이는 실제 INSERT가 막히는지 검증할 수 없으므로, drizzle-orm이
// 실제로 만드는 CHECK SQL 텍스트를 PgDialect로 렌더링해 값 목록을 대조한다.
// drizzle-kit generate가 만드는 마이그레이션도 같은 PgDialect 경로를 타므로
// 이 렌더 결과가 곧 drizzle/0000_*.sql에 실린 CHECK와 동일하다.

const dialect = new PgDialect()

/** 값이 홑따옴표로 감싸인 SQL 토큰을 전부 뽑아 원래 문자열로 되돌린다 */
function extractQuotedValues(sqlText: string): string[] {
  const matches = sqlText.match(/'([^']*)'/g) ?? []
  return matches.map((m) => m.slice(1, -1))
}

function checkSqlText(table: AnyPgTable, checkName: string): string {
  const found = getTableConfig(table).checks.find((c) => c.name === checkName)
  if (!found) throw new Error(`check constraint "${checkName}"을 찾을 수 없다`)
  return dialect.sqlToQuery(found.value).sql
}

describe('CHECK 제약 값 목록이 TypeScript 유니온과 정확히 일치한다', () => {
  it.each([
    ['user', user, 'user_role_check', USER_ROLES],
    ['subscriptions.status', subscriptions, 'subscriptions_status_check', SUBSCRIPTION_STATUSES],
    ['subscriptions.plan', subscriptions, 'subscriptions_plan_check', Object.keys(PLANS)],
    ['queries.source', queries, 'queries_source_check', QUERY_SOURCES],
    ['collection_runs.status', collectionRuns, 'collection_runs_status_check', RUN_STATUSES],
    ['collection_runs.trigger', collectionRuns, 'collection_runs_trigger_check', RUN_TRIGGERS],
    ['answers.engine_id', answers, 'answers_engine_id_check', Object.keys(ENGINE_TIER)],
    ['free_audits.status', freeAudits, 'free_audits_status_check', AUDIT_STATUSES],
    ['payments.status', payments, 'payments_status_check', PAYMENT_STATUSES],
  ] as const)('%s: CHECK 값 목록 == 유니온 값 목록', (_label, table, checkName, values) => {
    const sqlText = checkSqlText(table, checkName)
    expect(extractQuotedValues(sqlText).sort()).toEqual([...values].sort())
  })

  it('detections.sentiment는 nullable이라 NULL이거나 목록 안에 있어야 한다', () => {
    const sqlText = checkSqlText(detections, 'detections_sentiment_check')
    expect(sqlText.toLowerCase()).toContain('is null')
    expect(extractQuotedValues(sqlText).sort()).toEqual([...SENTIMENTS].sort())
  })

  it('허용되지 않는 값은 어느 CHECK 목록에도 나타나지 않는다', () => {
    const sqlText = checkSqlText(subscriptions, 'subscriptions_status_check')
    expect(extractQuotedValues(sqlText)).not.toContain('bogus')
  })
})
