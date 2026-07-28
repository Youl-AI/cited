import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { ENGINE_TIER, PLANS } from '@/lib/plans'
import type { EngineId, PlanId } from '@/lib/plans'

// ─────────────────────────────────────────────────────────────
// CHECK 제약 헬퍼
// ─────────────────────────────────────────────────────────────
// pgEnum이 아니라 check()를 쓴다: 상태값을 추가/변경할 때 `ALTER TYPE ... ADD VALUE`
// (트랜잭션 안에서 못 돌리는 버전이 있고, 값을 빼는 것도 사실상 불가능) 없이 평범한
// 마이그레이션으로 처리할 수 있어 상태값이 자주 바뀌는 지금 단계에 더 유연하다.
//
// 허용 값 목록은 반드시 `as const` 배열 하나에서만 선언하고, TypeScript 유니온 타입과
// SQL CHECK 목록을 둘 다 그 배열에서 파생시킨다. 유니온과 검증 목록을 손으로 두 번
// 적으면 갈라진다 — Task 2·3에서 겪은 문제라 여기서는 그 경로 자체를 막는다.

/** notNull 컬럼용: 값이 허용 목록 안에 있는지만 검사한다 */
function enumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  const list = values.map((v) => `'${v}'`).join(', ')
  return check(name, sql`${column} in (${sql.raw(list)})`)
}

/** nullable 컬럼용: NULL이거나 허용 목록 안에 있어야 한다 */
function nullableEnumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  const list = values.map((v) => `'${v}'`).join(', ')
  return check(name, sql`${column} is null or ${column} in (${sql.raw(list)})`)
}

// ─────────────────────────────────────────────────────────────
// Better Auth 테이블 (auth.ts의 drizzleAdapter가 이 이름을 요구한다)
// ─────────────────────────────────────────────────────────────

export const USER_ROLES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /** 관리자 콘솔 접근 판정 (6단계) */
    role: text('role').$type<UserRole>().notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [enumCheck('user_role_check', t.role, USER_ROLES)],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ─────────────────────────────────────────────────────────────
// 구독
// ─────────────────────────────────────────────────────────────

/**
 * 'past_due' = 결제 실패, 유예 기간 중 — 수집은 계속
 * 'suspended' = 유예 만료 — 수집 중단, 데이터는 유지
 */
export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'suspended', 'canceled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * 플랜 id 허용 목록. `@/lib/plans`의 `PLANS`는 `satisfies Record<PlanId, PlanConfig>`로
 * 선언돼 있어 키가 `PlanId`와 정확히 일치함을 컴파일러가 보장한다 — 여기서 다시
 * 손으로 나열하면 유니온과 목록이 갈라질 수 있으므로 `Object.keys`로 파생시킨다.
 */
const PLAN_IDS = Object.keys(PLANS) as readonly PlanId[]

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      // RESTRICT(cascade 아님): 결제 이력이 있는 구독은 DB 레벨에서 하드 삭제가
      // 막힌다. 전자상거래법상 대금결제·재화공급 기록은 5년 보존 대상이라 계정
      // 상태와 무관하게 남아야 한다. 회원 탈퇴는 이 행을 지우는 게 아니라 user를
      // 익명화(soft delete)하는 방식으로 처리해야 한다 — 탈퇴 플로우는 이후
      // 단계에서 설계한다. "왜 cascade가 아니지?" 하고 되돌리지 말 것.
      .references(() => user.id, { onDelete: 'restrict' }),
    plan: text('plan').$type<PlanId>().notNull(),
    status: text('status').$type<SubscriptionStatus>().notNull().default('active'),
    /** ★ 구매한 질의 팩 수. 한도 = PLANS[plan].maxQueries + queryPacks * 10 */
    queryPacks: integer('query_packs').notNull().default(0),
    /** 토스 빌링키. 카드 정보는 저장하지 않는다. */
    billingKey: text('billing_key'),
    /** 토스 customerKey — 우리가 발급한 불변 식별자 */
    customerKey: text('customer_key'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** 결제 실패 후 유예 만료 시각. status=past_due일 때만 채워진다 */
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_user_idx').on(t.userId),
    index('subscriptions_period_end_idx').on(t.currentPeriodEnd),
    enumCheck('subscriptions_status_check', t.status, SUBSCRIPTION_STATUSES),
    enumCheck('subscriptions_plan_check', t.plan, PLAN_IDS),
  ],
)

// ─────────────────────────────────────────────────────────────
// 브랜드 / 질의
// ─────────────────────────────────────────────────────────────

export const brands = pgTable(
  'brands',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    /** 표기 변형·축약어·오탈자. 온보딩에서 자동 생성 후 고객이 편집 */
    aliases: jsonb('aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 브랜드명이 일반어와 겹치는가. true면 2차 LLM 판정을 무조건 거친다 */
    ambiguous: boolean('ambiguous').notNull().default(false),
    competitors: jsonb('competitors')
      .$type<{ name: string; aliases: string[] }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Business에서 브랜드들이 총 질의 한도를 나눠 쓰기 위한 필드 */
    queryQuota: integer('query_quota').notNull().default(0),
    /** 0=일 … 6=토. 가입 요일 기준. 수집 부하를 요일별로 분산한다 */
    collectionWeekday: smallint('collection_weekday').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('brands_user_idx').on(t.userId),
    index('brands_weekday_idx').on(t.collectionWeekday, t.isActive),
  ],
)

export const QUERY_SOURCES = ['generated', 'custom'] as const
export type QuerySource = (typeof QUERY_SOURCES)[number]

export const queries = pgTable(
  'queries',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** 'generated' = 자동 생성, 'custom' = 고객이 직접 입력 */
    source: text('source').$type<QuerySource>().notNull().default('generated'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('queries_brand_idx').on(t.brandId, t.isActive),
    enumCheck('queries_source_check', t.source, QUERY_SOURCES),
  ],
)

// ─────────────────────────────────────────────────────────────
// 수집
// ─────────────────────────────────────────────────────────────

/** ★ 수집 당시의 플랜 설정을 통째로 박제한다. 없으면 시계열 비교가 무의미해진다. */
export interface PlanSnapshot {
  plan: PlanId
  queryPacks: number
  engines: EngineId[]
  samples: { llm: number; serp: number }
  queryIds: string[]
  detectorVersion: number
}

/** 엔진별 시도/성공 수. 90% 미만이면 대시보드에 배지를 붙인다. */
export type Completeness = Partial<
  Record<EngineId, { attempted: number; succeeded: number }>
>

/** 실측 원가·성능 지표. 6단계 관리자 화면이 소비한다. */
export interface RunMetrics {
  callsByEngine: Partial<Record<EngineId, number>>
  tokensIn: number
  tokensOut: number
  estimatedCostKrw: number
  serpApiCalls: number
  durationMs: number
  /** 1차 정규식 필터 통과율 — 원가를 좌우한다 */
  stage1PassRate: number | null
}

export const RUN_STATUSES = ['running', 'succeeded', 'partial', 'failed'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const RUN_TRIGGERS = ['schedule', 'signup', 'manual', 'free_audit'] as const
export type RunTrigger = (typeof RUN_TRIGGERS)[number]

export const collectionRuns = pgTable(
  'collection_runs',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** ★ 수집 당시 플랜 설정 박제 */
    planSnapshot: jsonb('plan_snapshot').$type<PlanSnapshot>().notNull(),
    completeness: jsonb('completeness').$type<Completeness>().notNull().default(sql`'{}'::jsonb`),
    metrics: jsonb('metrics').$type<RunMetrics | null>(),
    status: text('status').$type<RunStatus>().notNull().default('running'),
    trigger: text('trigger').$type<RunTrigger>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_brand_started_idx').on(t.brandId, t.startedAt),
    enumCheck('collection_runs_status_check', t.status, RUN_STATUSES),
    enumCheck('collection_runs_trigger_check', t.trigger, RUN_TRIGGERS),
  ],
)

export interface Citation {
  url: string
  title: string
}

/**
 * 엔진 id 허용 목록. `@/lib/plans`의 `ENGINE_TIER`는 `Record<EngineId, EngineTier>`
 * 타입의 객체 리터럴로 선언돼 있어 키가 `EngineId`와 정확히 일치함을 컴파일러가
 * 보장한다 — 여기서 다시 손으로 나열하지 않고 `Object.keys`로 파생시킨다.
 */
const ENGINE_IDS = Object.keys(ENGINE_TIER) as readonly EngineId[]

export const answers = pgTable(
  'answers',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    queryId: text('query_id').notNull(),
    /** 질의 텍스트 스냅샷 — 질의가 나중에 수정되어도 이 시점 텍스트가 남는다 */
    queryText: text('query_text').notNull(),
    engineId: text('engine_id').$type<EngineId>().notNull(),
    sampleIndex: smallint('sample_index').notNull(),
    text: text('text').notNull(),
    citations: jsonb('citations').$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    /** ★ 엔진 응답 원본. 판정 로직 개선 후 재판정하기 위해 절대 버리지 않는다 */
    raw: jsonb('raw').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('answers_run_idx').on(t.runId),
    uniqueIndex('answers_unique_idx').on(t.runId, t.queryId, t.engineId, t.sampleIndex),
    enumCheck('answers_engine_id_check', t.engineId, ENGINE_IDS),
  ],
)

export const SENTIMENTS = ['recommended', 'neutral', 'negative'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const detections = pgTable(
  'detections',
  {
    id: text('id').primaryKey(),
    answerId: text('answer_id')
      .notNull()
      .references(() => answers.id, { onDelete: 'cascade' }),
    /** 'self' | 'competitor:<name>' — 우리 브랜드인지 경쟁사인지 */
    subject: text('subject').notNull(),
    mentioned: boolean('mentioned').notNull(),
    /** 답변에서 몇 번째로 언급된 브랜드인가. 이 제품에서 가장 값진 필드 */
    position: integer('position'),
    sentiment: text('sentiment').$type<Sentiment>(),
    /** 한 줄 요약 — 고객에게 그대로 노출한다 */
    context: text('context'),
    /** ★ 어느 버전 로직이 매긴 판정인가. 기존 판정을 지우지 않고 추가한다 */
    detectorVersion: integer('detector_version').notNull(),
    /** 2차 LLM 판정이 실패하면 true. 데이터 손실이 아니라 미판정으로 남긴다 */
    unresolved: boolean('unresolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('detections_answer_idx').on(t.answerId),
    uniqueIndex('detections_unique_idx').on(t.answerId, t.subject, t.detectorVersion),
    nullableEnumCheck('detections_sentiment_check', t.sentiment, SENTIMENTS),
  ],
)

// ─────────────────────────────────────────────────────────────
// 무료 진단
// ─────────────────────────────────────────────────────────────

export const AUDIT_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'waitlisted'] as const
export type AuditStatus = (typeof AUDIT_STATUSES)[number]

export const freeAudits = pgTable(
  'free_audits',
  {
    id: text('id').primaryKey(),
    brandName: text('brand_name').notNull(),
    category: text('category').notNull(),
    /** 결과 확인 후 게이트에서 입력받는다. 진단 시작 시점에는 null */
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    status: text('status').$type<AuditStatus>().notNull().default('queued'),
    /** 진단 결과 요약 — 지표·증거·순위 */
    result: jsonb('result').$type<unknown>(),
    /** IP 원문을 저장하지 않는다. HMAC 해시만. */
    ipHash: text('ip_hash').notNull(),
    /** 결과 화면 노출 순서 실험 — 'cba' | 'abc' 등 */
    variant: text('variant').notNull().default('cba'),
    /** 전환 결과 — 이메일 입력했는가, 가입했는가 */
    convertedEmailAt: timestamp('converted_email_at', { withTimezone: true }),
    convertedSignupAt: timestamp('converted_signup_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audits_iphash_created_idx').on(t.ipHash, t.createdAt),
    index('audits_brand_created_idx').on(t.brandName, t.createdAt),
    enumCheck('free_audits_status_check', t.status, AUDIT_STATUSES),
  ],
)

// ─────────────────────────────────────────────────────────────
// 결제 이력 / 외부 쿼터
// ─────────────────────────────────────────────────────────────

export const PAYMENT_STATUSES = ['paid', 'failed', 'canceled'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      // RESTRICT(cascade 아님): 결제 기록은 전자상거래법상 5년 보존 대상이다.
      // 구독이 취소·삭제되어도 그 구독에 달린 결제 이력은 지워지면 안 된다.
      // subscriptions.userId와 같은 이유 — 자세한 내용은 그쪽 주석 참고.
      .references(() => subscriptions.id, { onDelete: 'restrict' }),
    /** 우리가 만든 멱등키. 같은 orderId로 두 번 청구되지 않는다 */
    orderId: text('order_id').notNull(),
    amountKrw: integer('amount_krw').notNull(),
    status: text('status').$type<PaymentStatus>().notNull(),
    /** 토스 응답 원본 (카드번호 마스킹된 형태로만 들어온다) */
    raw: jsonb('raw').$type<unknown>(),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_order_idx').on(t.orderId),
    index('payments_subscription_idx').on(t.subscriptionId, t.createdAt),
    enumCheck('payments_status_check', t.status, PAYMENT_STATUSES),
  ],
)

/** SerpApi는 선약정이므로 잔여 건수를 직접 추적한다 (설계 ⑤ 관측) */
export const serpapiUsage = pgTable('serpapi_usage', {
  /** 'YYYY-MM' */
  period: varchar('period', { length: 7 }).primaryKey(),
  planLimit: integer('plan_limit').notNull(),
  used: integer('used').notNull().default(0),
  alerted80: boolean('alerted_80').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────────────────────
// 관계
// ─────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [user.id],
    references: [subscriptions.userId],
  }),
  brands: many(brands),
}))

export const brandRelations = relations(brands, ({ one, many }) => ({
  owner: one(user, { fields: [brands.userId], references: [user.id] }),
  queries: many(queries),
  runs: many(collectionRuns),
}))

export const runRelations = relations(collectionRuns, ({ one, many }) => ({
  brand: one(brands, { fields: [collectionRuns.brandId], references: [brands.id] }),
  answers: many(answers),
}))

export const answerRelations = relations(answers, ({ one, many }) => ({
  run: one(collectionRuns, { fields: [answers.runId], references: [collectionRuns.id] }),
  detections: many(detections),
}))

// ─────────────────────────────────────────────────────────────
// 추론 타입
// ─────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type Brand = typeof brands.$inferSelect
export type Query = typeof queries.$inferSelect
export type CollectionRun = typeof collectionRuns.$inferSelect
export type Answer = typeof answers.$inferSelect
export type Detection = typeof detections.$inferSelect
export type FreeAudit = typeof freeAudits.$inferSelect
export type Payment = typeof payments.$inferSelect
