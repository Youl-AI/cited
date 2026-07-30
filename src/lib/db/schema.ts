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

/**
 * 값 목록을 SQL 리터럴 목록으로 만든다.
 *
 * `sql.raw`로 DDL에 그대로 박히는 문자열이므로 작은따옴표를 SQL 표준대로 두 번
 * 반복(`''`)해 이스케이프한다. 지금 값들은 전부 평범한 식별자라 이스케이프가
 * 동작하지 않아도 티가 안 나지만, 아포스트로피가 든 상태값이 하나라도 들어오면
 * 조용히 깨진 DDL이 생성된다. (값은 코드 안 `as const` 배열에서만 오므로 사용자
 * 입력 경로는 없다 — 이건 주입 방어가 아니라 정확성 보장이다.)
 */
function sqlLiteralList(values: readonly string[]): string {
  return values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ')
}

/** notNull 컬럼용: 값이 허용 목록 안에 있는지만 검사한다 */
export function enumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  return check(name, sql`${column} in (${sql.raw(sqlLiteralList(values))})`)
}

/** nullable 컬럼용: NULL이거나 허용 목록 안에 있어야 한다 */
export function nullableEnumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  return check(name, sql`${column} is null or ${column} in (${sql.raw(sqlLiteralList(values))})`)
}

// ─────────────────────────────────────────────────────────────
// Better Auth 테이블 (auth.ts의 drizzleAdapter가 이 이름을 요구한다)
// ─────────────────────────────────────────────────────────────

export const USER_ROLES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * ★ 이 테이블의 행은 hard delete 하지 않는다 — 회원 탈퇴는 익명화로 처리한다.
 *
 * `subscriptions.userId`가 `onDelete: 'restrict'`이고 `payments.subscriptionId`도
 * `restrict`라, 결제 이력이 있는 사용자는 DB가 `DELETE FROM "user"`를 아예 거부한다.
 * 전자상거래법상 대금결제·재화공급 기록은 5년 보존 대상이므로 이건 버그가 아니라
 * 의도된 제약이다. (`subscriptions.userId` 주석 참고.)
 *
 * 아직 익명화 플로우도 `deletedAt` 컬럼도 없다 — 소비자가 생길 때 만든다. 다만 그때
 * 반드시 필요한 것: **익명화된 사용자를 살아있는 사용자와 구별할 방법**. 세션 무효화,
 * 로그인 차단, 재가입 시 이메일 충돌, 관리자 화면 집계, 마케팅 발송 대상에서 제외 —
 * 전부 이 구분에 의존한다. 이름·이메일만 덮어쓰고 표식을 안 남기면 익명화된 계정이
 * 살아있는 고객으로 계속 집계된다.
 */
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
  (t) => [
    index('session_user_idx').on(t.userId),
    // 만료 세션 정리 크론(/api/cron/cleanup-sessions)의 `expires_at < now`
    // 삭제가 매일 도는데, 이 인덱스가 없으면 전량 스캔이다.
    index('session_expires_idx').on(t.expiresAt),
  ],
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
  /**
   * ★ 이 수집 시점의 경쟁사 집합. **Share of Voice 비교 가능성을 지키는 필드다.**
   *
   * SoV는 분모가 "등록된 경쟁사"에 의존하는 유일한 지표라, 고객이 경쟁사를
   * 추가·삭제하면 실제 점유율이 그대로여도 숫자가 움직인다. 이 집합이 다른
   * 기간끼리 SoV를 비교하면 설정 변경을 실제 변화로 보고하게 된다 —
   * `engines`가 다른 주끼리 비교하지 않는 것과 **정확히 같은 이유**다.
   *
   * 5단계 대시보드는 이 집합이 바뀐 구간의 SoV에 ▲▼를 붙이지 않는다.
   * 설계 문서 "Share of Voice는 고객 설정에 의해 왜곡된다" 절 참고.
   */
  competitors: string[]
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
  /**
   * ★ 누적 단위는 **밀리원**이다. 호출당 3.2원을 원 단위로 반올림하면 매번
   *   0.2원이 사라지고, 주 100회면 20원, 고객 100명이면 월 8,600원이 장부에서
   *   사라진다. 원 단위 `estimatedCostKrw`는 화면 표시용 파생값이다.
   */
  estimatedCostMilliKrw: number
  /** 표시용. `estimatedCostMilliKrw`를 반올림한 값 — 이것으로 합산하지 마라 */
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

/**
 * 무료 진단 상태.
 *
 * ★ 기존 값(queued/running/succeeded/failed/waitlisted)은 **자동 실행을 전제한**
 *   이름이었다. 2026-07-30 설계 변경으로 무료 진단이 수동 배송이 되어
 *   신청 → 인증 → 운영자 실행 → 발송 순서가 되었으므로 이름을 바꿨다.
 *   `free_audits`는 아직 0행이라 데이터 마이그레이션이 필요 없었다.
 *
 * 상태 전이는 이 하나뿐이다:
 *
 *   requested ──인증──> verified ──운영자 실행──> running ──┬──> sent
 *                                                            └──> failed ──재실행──> running
 *        └──운영자 거부──> rejected
 */
export const AUDIT_STATUSES = [
  'requested', // 신청됨. 이메일 미인증 — 이 상태에서는 어떤 API도 호출하지 않는다
  'verified', // 인증 완료. 운영자 실행 대기
  'running', // 운영자가 실행 중
  'sent', // 리포트 발송 완료
  'failed', // 실행 실패. 재실행 가능
  'rejected', // 운영자가 거부 (스팸·장난 신청)
] as const
export type AuditStatus = (typeof AUDIT_STATUSES)[number]

/**
 * 이 신청이 어디서 들어왔는가.
 *
 * ★ 크몽 주문은 이메일 인증을 건너뛴다(`audit:new`). 결제가 이미 확인됐으므로
 *   남용 위험이 없지만, **그 사실을 행에 남겨야 한다.** 없으면 나중에
 *   `email_verified = true`인 행 중 어느 것이 실제로 링크를 눌렀고 어느 것이
 *   운영자가 통과시킨 것인지 구분할 수가 없다 — 인증 게이트가 실제로 작동하는지
 *   감사할 수 없게 된다.
 */
export const AUDIT_SOURCES = ['web', 'kmong', 'manual'] as const
export type AuditSource = (typeof AUDIT_SOURCES)[number]

export const freeAudits = pgTable(
  'free_audits',
  {
    id: text('id').primaryKey(),
    brandName: text('brand_name').notNull(),
    category: text('category').notNull(),
    /**
     * ★ notNull이다. 최초 설계는 결과를 보여준 **뒤** 이메일을 받아서 nullable
     * 이었는데, 그 순서 때문에 이메일 인증이 비용을 전혀 방어하지 못했다.
     * 이제는 신청 시점에 받고, 인증 전에는 아무것도 실행하지 않는다.
     */
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    /** 경쟁사. 비어 있으면 Share of Voice는 "측정 없음"이 된다 */
    competitors: jsonb('competitors').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * 고객 사이트 호스트명(`parseHostname`이 정규화한 값). 인용 출처의 소유
     * 판정에 쓴다.
     *
     * ★ 비어 있으면 소유 판정을 **하지 않는다.** 브랜드명에서 추측하지 않는다 —
     *   틀린 추측이 "당신 사이트는 한 번도 인용되지 않았습니다"라는 리포트의
     *   가장 강한 문장을 근거 없이 만든다.
     */
    selfDomains: jsonb('self_domains').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * 이 측정에 쓴 자기 브랜드 별칭.
     *
     * ★ 저장한다. 별칭이 측정 결과를 좌우하므로(영문 별칭이 없으면 ChatGPT
     *   언급률이 구조적으로 0%가 된다), 나중에 "왜 이 리포트가 0%였나"를
     *   물었을 때 어떤 표기로 쟀는지 알아야 한다. 실행 조건을 남기지 않으면
     *   리포트를 재현할 수 없다.
     */
    aliases: jsonb('aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').$type<AuditStatus>().notNull().default('requested'),
    /** 유입 경로. 'web'이 아니면 이메일 인증을 운영자가 통과시킨 것이다 */
    source: text('source').$type<AuditSource>().notNull().default('web'),
    /** 진단 결과 — AuditResult. 발송 전에는 null */
    result: jsonb('result').$type<unknown>(),
    /** 실패 사유. 운영자가 재실행 여부를 판단하는 근거 */
    failureReason: text('failure_reason'),
    /** IP 원문을 저장하지 않는다. HMAC 해시만. 스팸 관측용 */
    ipHash: text('ip_hash').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    // `variant`(결과 화면 노출 순서 실험)와 `convertedEmailAt`은 지웠다.
    // 전자는 결과가 메일로 바뀌어 실험할 화면이 없고, 후자는 이메일이 신청
    // 시점에 들어오므로 "이메일을 입력했는가"라는 전환 지표가 무의미해졌다.
    /** 전환 결과 — 리포트를 받은 뒤 가입했는가 */
    convertedSignupAt: timestamp('converted_signup_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audits_iphash_created_idx').on(t.ipHash, t.createdAt),
    // 운영자 대기 목록이 status로 조회한다. brandName 인덱스는 소비자가 없었다.
    index('audits_status_created_idx').on(t.status, t.createdAt),
    enumCheck('free_audits_status_check', t.status, AUDIT_STATUSES),
    enumCheck('free_audits_source_check', t.source, AUDIT_SOURCES),
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
