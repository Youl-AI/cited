import { relations, sql } from 'drizzle-orm'
import {
  boolean,
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
import type { EngineId, PlanId } from '@/lib/plans'

// ─────────────────────────────────────────────────────────────
// Better Auth 테이블 (auth.ts의 drizzleAdapter가 이 이름을 요구한다)
// ─────────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** 'user' | 'admin' — 관리자 콘솔 접근 판정 (6단계) */
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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

export type SubscriptionStatus =
  | 'active'
  | 'past_due' // 결제 실패, 유예 기간 중 — 수집은 계속
  | 'suspended' // 유예 만료 — 수집 중단, 데이터는 유지
  | 'canceled'

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
    source: text('source').$type<'generated' | 'custom'>().notNull().default('generated'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('queries_brand_idx').on(t.brandId, t.isActive)],
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

export type RunStatus = 'running' | 'succeeded' | 'partial' | 'failed'
export type RunTrigger = 'schedule' | 'signup' | 'manual' | 'free_audit'

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
  (t) => [index('runs_brand_started_idx').on(t.brandId, t.startedAt)],
)

export interface Citation {
  url: string
  title: string
}

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
  ],
)

export type Sentiment = 'recommended' | 'neutral' | 'negative'

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
  ],
)

// ─────────────────────────────────────────────────────────────
// 무료 진단
// ─────────────────────────────────────────────────────────────

export type AuditStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'waitlisted'

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
  ],
)

// ─────────────────────────────────────────────────────────────
// 결제 이력 / 외부 쿼터
// ─────────────────────────────────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    /** 우리가 만든 멱등키. 같은 orderId로 두 번 청구되지 않는다 */
    orderId: text('order_id').notNull(),
    amountKrw: integer('amount_krw').notNull(),
    status: text('status').$type<'paid' | 'failed' | 'canceled'>().notNull(),
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
