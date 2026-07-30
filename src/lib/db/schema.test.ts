import { getTableColumns } from 'drizzle-orm'
import { getTableConfig, PgDialect, pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { ENGINE_TIER, PLANS } from '@/lib/plans'
import {
  answers,
  AUDIT_SOURCES,
  AUDIT_STATUSES,
  brands,
  collectionRuns,
  detections,
  enumCheck,
  freeAudits,
  nullableEnumCheck,
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

  it('free_audits가 수동 배송 플로우의 필드를 갖는다', () => {
    // ★ 2026-07-30 설계 변경으로 `variant`(결과 화면 노출 순서 A/B)와
    //   `convertedEmailAt`이 사라졌다. 결과가 메일로 바뀌어 실험할 화면이 없고,
    //   이메일은 신청 시점에 받으므로 "이메일을 입력했는가"가 전환 지표가 아니다.
    const cols = Object.keys(getTableColumns(freeAudits))
    expect(cols).not.toContain('variant')
    expect(cols).not.toContain('convertedEmailAt')

    expect(cols).toContain('ipHash')
    expect(cols).toContain('email')
    // 운영자 실행 경로
    expect(cols).toContain('verifiedAt')
    expect(cols).toContain('sentAt')
    expect(cols).toContain('failureReason')
    // 인증 게이트 감사용 — 'web'이 아니면 운영자가 통과시킨 것이다
    expect(cols).toContain('source')
    // 리포트 구성 입력
    expect(cols).toContain('competitors')
    expect(cols).toContain('selfDomains')
    // 측정 조건 — 별칭이 언급률을 좌우하므로 재현에 필요하다
    expect(cols).toContain('aliases')
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

describe('CHECK 제약이 의도한 컬럼에 의도한 값 목록으로 걸려 있다', () => {
  // 값 목록만 대조하면 제약이 "엉뚱한 컬럼"에 걸려도 통과한다 —
  // enumCheck('payments_status_check', t.failureCode, PAYMENT_STATUSES)처럼.
  // 그래서 렌더된 SQL이 참조하는 컬럼까지 같이 단언한다.
  it.each([
    ['user.role', user, 'user_role_check', '"user"."role"', USER_ROLES],
    [
      'subscriptions.status',
      subscriptions,
      'subscriptions_status_check',
      '"subscriptions"."status"',
      SUBSCRIPTION_STATUSES,
    ],
    [
      'subscriptions.plan',
      subscriptions,
      'subscriptions_plan_check',
      '"subscriptions"."plan"',
      Object.keys(PLANS),
    ],
    ['queries.source', queries, 'queries_source_check', '"queries"."source"', QUERY_SOURCES],
    [
      'collection_runs.status',
      collectionRuns,
      'collection_runs_status_check',
      '"collection_runs"."status"',
      RUN_STATUSES,
    ],
    [
      'collection_runs.trigger',
      collectionRuns,
      'collection_runs_trigger_check',
      '"collection_runs"."trigger"',
      RUN_TRIGGERS,
    ],
    [
      'answers.engine_id',
      answers,
      'answers_engine_id_check',
      '"answers"."engine_id"',
      Object.keys(ENGINE_TIER),
    ],
    [
      'free_audits.status',
      freeAudits,
      'free_audits_status_check',
      '"free_audits"."status"',
      AUDIT_STATUSES,
    ],
    [
      'free_audits.source',
      freeAudits,
      'free_audits_source_check',
      '"free_audits"."source"',
      AUDIT_SOURCES,
    ],
    ['payments.status', payments, 'payments_status_check', '"payments"."status"', PAYMENT_STATUSES],
  ] as const)(
    '%s: 의도한 컬럼을 참조하고 CHECK 값 목록 == 유니온 값 목록',
    (_label, table, checkName, columnRef, values) => {
      const sqlText = checkSqlText(table, checkName)
      expect(sqlText).toContain(columnRef)
      expect(extractQuotedValues(sqlText).sort()).toEqual([...values].sort())
    },
  )

  it('detections.sentiment는 nullable이라 NULL이거나 목록 안에 있어야 한다', () => {
    const sqlText = checkSqlText(detections, 'detections_sentiment_check')
    expect(sqlText).toContain('"detections"."sentiment"')
    expect(sqlText.toLowerCase()).toContain('is null')
    expect(extractQuotedValues(sqlText).sort()).toEqual([...SENTIMENTS].sort())
  })
})

// ─────────────────────────────────────────────────────────────
// enumCheck 헬퍼가 값의 작은따옴표를 이스케이프한다
// ─────────────────────────────────────────────────────────────
// 지금 스키마의 상태값은 전부 평범한 식별자라 이스케이프 버그가 있어도 티가 안 난다.
// 아포스트로피가 든 값이 처음 들어오는 날 조용히 깨진 DDL이 나오는 걸 막기 위해,
// 스키마와 무관한 픽스처 테이블로 헬퍼 자체를 검증한다.
// (이 테이블은 schema.ts에 없으므로 drizzle-kit이 마이그레이션으로 만들지 않는다.)

const quoteFixture = pgTable(
  'quote_fixture',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    note: text('note'),
  },
  (t) => [
    enumCheck('quote_fixture_label_check', t.label, ["it's", 'plain']),
    nullableEnumCheck('quote_fixture_note_check', t.note, ["o'clock"]),
  ],
)

describe('enumCheck는 값의 작은따옴표를 SQL 표준대로 이스케이프한다', () => {
  it('notNull용 enumCheck: 작은따옴표가 두 번 반복된다', () => {
    const sqlText = checkSqlText(quoteFixture, 'quote_fixture_label_check')
    expect(sqlText).toContain(`in ('it''s', 'plain')`)
    // 이스케이프가 없으면 리터럴이 'it'에서 끊기고 s'가 식별자로 새어 나간다
    expect(sqlText).not.toContain(`'it's'`)
  })

  it('nullable용 nullableEnumCheck도 같은 이스케이프를 적용한다', () => {
    const sqlText = checkSqlText(quoteFixture, 'quote_fixture_note_check')
    expect(sqlText).toContain(`in ('o''clock')`)
  })

  it('이스케이프 후 SQL의 작은따옴표 개수가 짝수다 (리터럴이 닫힌다)', () => {
    const sqlText = checkSqlText(quoteFixture, 'quote_fixture_label_check')
    expect((sqlText.match(/'/g) ?? []).length % 2).toBe(0)
  })
})
