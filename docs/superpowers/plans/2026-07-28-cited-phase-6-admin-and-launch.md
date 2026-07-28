# Cited 6단계 — 운영 콘솔과 런치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 적자를 6개월 뒤가 아니라 첫 달에 발견할 수 있게 만든다. 관리자 콘솔,
실측 원가 관측, SerpApi 쿼터 추적, 주간 스모크 테스트, 재판정 도구, 운영 런북.

**Architecture:** 관리자 화면은 `role='admin'` 사용자만 접근하는 `/admin` 라우트
그룹이다. 원가는 이미 `collection_runs.metrics`에 실행별로 쌓이고 있으므로,
이 단계는 그것을 **읽고 보여주는** 일이 대부분이다. 새 데이터를 만들지 않는다.

**Tech Stack:** Next.js Server Components · Drizzle 집계 쿼리 · Trigger.dev

## Global Constraints

로드맵 공통 제약 + 이 단계 전용:

- **관리자 화면에서 고객 개인정보를 최소한만 노출한다.** 이메일은 마스킹
- **관리자 액션은 전부 로그를 남긴다.** 누가 무엇을 언제 했는지
- **재판정은 기존 판정을 삭제하지 않는다.** 새 버전을 추가한다 (감사 추적)
- **원가 계산은 실측만 쓴다.** `collection_runs.metrics`에 기록된 값
- **스모크 테스트 실패는 알림을 보낸다.** 조용히 실패하면 의미가 없다
- 각 태스크의 마지막 Step은 커밋

> **이 단계의 Task 3(원가 대시보드)은 첫 유료 고객이 생기기 전에 끝나 있어야
> 한다.** 설계 문서: "예상 12%가 실제로 12%인지 30%인지 첫 달에 알 수 있어야
> 한다. 모르고 6개월 운영하면 적자를 쌓는다."

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/app/admin/layout.tsx` | 관리자 가드 + 셸 |
| `src/lib/admin/mask.ts` | 개인정보 마스킹 (순수) |
| `src/lib/admin/cost.ts` | 원가율 계산 (순수) |
| `src/lib/admin/queries.ts` | 관리자 집계 쿼리 |
| `src/app/admin/page.tsx` | 개요 |
| `src/app/admin/customers/page.tsx` | 고객·구독 목록 |
| `src/app/admin/runs/page.tsx` | 수집 모니터 |
| `src/app/admin/cost/page.tsx` | 원가 대시보드 |
| `src/app/admin/quota/page.tsx` | SerpApi 쿼터 |
| `src/app/admin/actions.ts` | 재수집·재판정 액션 |
| `src/lib/serpapi/quota.ts` | 쿼터 예측·알림 판정 (순수) |
| `src/trigger/engine-smoke.ts` | 주간 스모크 테스트 |
| `src/trigger/quota-monitor.ts` | 쿼터 80% 알림 |
| `src/trigger/rejudge.ts` | 재판정 잡 |
| `docs/RUNBOOK.md` | 운영 런북 |
| `docs/superpowers/notes/2026-07-28-launch-checklist.md` | 런치 체크리스트 |

---

### Task 1: 관리자 가드와 마스킹

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/lib/admin/mask.ts`,
  `src/lib/admin/audit-log.ts`
- Test: `src/lib/admin/mask.test.ts`
- Modify: `src/lib/db/schema.ts` (`adminActions` 테이블 추가)

**Interfaces:**
- Consumes: `requireAdmin` (1단계)
- Produces:
  - `maskEmail(email): string`
  - `logAdminAction(args): Promise<void>`
  - `/admin` 라우트 그룹 — 관리자만 접근

- [ ] **Step 1: 마스킹 테스트 작성**

`src/lib/admin/mask.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { maskEmail, maskId } from '@/lib/admin/mask'

describe('maskEmail', () => {
  it('로컬 파트의 앞 2자만 남긴다', () => {
    expect(maskEmail('hongildong@example.com')).toBe('ho********@example.com')
  })

  it('짧은 로컬 파트도 처리한다', () => {
    expect(maskEmail('ab@x.com')).toBe('ab@x.com')
    expect(maskEmail('a@x.com')).toBe('a@x.com')
  })

  it('도메인은 그대로 남긴다 (고객 유형 파악에 필요)', () => {
    expect(maskEmail('someone@company.co.kr')).toContain('@company.co.kr')
  })

  it('이메일이 아니면 전체를 가린다', () => {
    expect(maskEmail('not-an-email')).toBe('***')
  })

  it('빈 문자열을 받아도 던지지 않는다', () => {
    expect(maskEmail('')).toBe('***')
  })
})

describe('maskId', () => {
  it('UUID의 앞 8자만 보여준다', () => {
    expect(maskId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400…')
  })

  it('짧은 ID는 그대로', () => {
    expect(maskId('abc')).toBe('abc')
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/admin/mask.test.ts
```

Expected: FAIL

`src/lib/admin/mask.ts`:

```ts
/**
 * 관리자 화면에서도 고객 개인정보를 최소한만 노출한다.
 * 도메인은 남긴다 — 대행사인지 브랜드인지 파악하는 데 필요하다.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0 || at === email.length - 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return `${local}${domain}`
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 2)}${domain}`
}

export function maskId(id: string): string {
  if (id.length <= 8) return id
  return `${id.slice(0, 8)}…`
}
```

`src/lib/db/schema.ts`에 관리자 감사 로그 테이블 추가:

```ts
export const adminActions = pgTable(
  'admin_actions',
  {
    id: text('id').primaryKey(),
    adminUserId: text('admin_user_id')
      .notNull()
      .references(() => user.id),
    /** 'rerun_collection' | 'rejudge' | 'change_plan' 등 */
    action: text('action').notNull(),
    /** 대상 식별자 (brandId, runId, subscriptionId 등) */
    targetId: text('target_id'),
    detail: jsonb('detail').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_actions_created_idx').on(t.createdAt)],
)
```

```bash
pnpm db:generate && pnpm db:migrate
```

`src/lib/admin/audit-log.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { adminActions } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

/** 관리자 액션은 전부 기록한다. 누가 무엇을 언제 했는지 남아야 한다. */
export async function logAdminAction(args: {
  adminUserId: string
  action: string
  targetId?: string
  detail?: unknown
}): Promise<void> {
  await db.insert(adminActions).values({
    id: randomUUID(),
    adminUserId: args.adminUserId,
    action: args.action,
    targetId: args.targetId ?? null,
    detail: args.detail ?? null,
  })
  logger.info('admin.action', { action: args.action, targetId: args.targetId })
}
```

- [ ] **Step 3: 관리자 레이아웃**

`src/app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { requireAdmin } from '@/lib/session'

const NAV = [
  { href: '/admin', label: '개요' },
  { href: '/admin/customers', label: '고객' },
  { href: '/admin/runs', label: '수집' },
  { href: '/admin/cost', label: '원가' },
  { href: '/admin/quota', label: '쿼터' },
] as const

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-neutral-900 text-neutral-100">
        <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-1 px-6 text-sm">
          <span className="mr-4 font-bold tracking-tight">Cited 운영</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded px-3 py-1 hover:bg-white/10">
              {n.label}
            </Link>
          ))}
          <span className="ml-auto text-neutral-400">{admin.name}</span>
          <Link href="/dashboard" className="ml-3 rounded px-3 py-1 hover:bg-white/10">
            앱으로
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: 관리자 계정 승격**

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
  update \"user\" set role = 'admin' where email = '<본인 이메일>';
"
```

- [ ] **Step 5: 가드 검증**

```bash
pnpm dev
```

1. 일반 계정으로 `/admin` 접근 → `/dashboard`로 리다이렉트
2. 관리자 계정으로 접근 → 관리자 셸이 보임

Expected: 2개 모두 통과

- [ ] **Step 6: 커밋**

```bash
pnpm vitest run src/lib/admin/mask.test.ts
git add -A
git commit -m "feat(admin): 관리자 가드 · 개인정보 마스킹 · 액션 감사 로그"
```

---

### Task 2: 원가율 계산 (순수 함수)

**Files:**
- Create: `src/lib/admin/cost.ts`
- Test: `src/lib/admin/cost.test.ts`

**Interfaces:**
- Consumes: `RunMetrics` (1단계), `monthlyPriceKrw` (1단계)
- Produces:
  - `aggregateCost(runs): CostSummary`
  - `costRatio(costKrw, revenueKrw): number`
  - `projectMonthlyCost(runs, weeksPerMonth): number`
  - `costHealth(ratio): 'healthy' | 'watch' | 'critical'`
  - Task 3의 화면이 소비한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/cost.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  aggregateCost,
  costHealth,
  costRatio,
  projectMonthlyCost,
} from '@/lib/admin/cost'
import type { RunMetrics } from '@/lib/db/schema'

const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
  callsByEngine: { chatgpt: 30, gemini: 30, naver: 20, google_aio: 20 },
  tokensIn: 60_000,
  tokensOut: 12_000,
  estimatedCostKrw: 2_600,
  serpApiCalls: 40,
  durationMs: 480_000,
  stage1PassRate: 0.25,
  ...over,
})

describe('aggregateCost', () => {
  it('여러 수집의 원가를 합산한다', () => {
    const s = aggregateCost([metrics(), metrics(), metrics()])
    expect(s.totalCostKrw).toBe(7_800)
    expect(s.runCount).toBe(3)
  })

  it('엔진별 호출 수를 합산한다', () => {
    const s = aggregateCost([metrics(), metrics()])
    expect(s.callsByEngine.chatgpt).toBe(60)
    expect(s.callsByEngine.naver).toBe(40)
  })

  it('SerpApi 호출을 따로 센다 (선약정이라 별도 추적)', () => {
    expect(aggregateCost([metrics(), metrics()]).serpApiCalls).toBe(80)
  })

  it('1차 통과율 평균을 낸다 (원가를 좌우한다)', () => {
    const s = aggregateCost([
      metrics({ stage1PassRate: 0.2 }),
      metrics({ stage1PassRate: 0.4 }),
    ])
    expect(s.avgStage1PassRate).toBeCloseTo(0.3, 6)
  })

  it('통과율이 null인 수집은 평균에서 제외한다', () => {
    const s = aggregateCost([
      metrics({ stage1PassRate: 0.2 }),
      metrics({ stage1PassRate: null }),
    ])
    expect(s.avgStage1PassRate).toBeCloseTo(0.2, 6)
  })

  it('평균 소요 시간을 낸다', () => {
    const s = aggregateCost([metrics({ durationMs: 300_000 }), metrics({ durationMs: 600_000 })])
    expect(s.avgDurationMs).toBe(450_000)
  })

  it('빈 입력이면 0으로 채운다 (0으로 나누지 않는다)', () => {
    const s = aggregateCost([])
    expect(s.totalCostKrw).toBe(0)
    expect(s.avgStage1PassRate).toBeNull()
    expect(s.avgDurationMs).toBe(0)
  })
})

describe('costRatio', () => {
  it('원가 / 매출', () => {
    expect(costRatio(11_300, 99_000)).toBeCloseTo(0.1141, 4)
  })

  it('매출이 0이면 null (무료 고객)', () => {
    expect(costRatio(5_000, 0)).toBeNull()
  })
})

describe('projectMonthlyCost', () => {
  it('주간 수집 원가를 월 기준으로 환산한다', () => {
    // 주 1회 2,600원 → 월 4.3회 = 11,180원
    expect(projectMonthlyCost([metrics()], 4.3)).toBe(11_180)
  })

  it('여러 수집의 평균을 기준으로 한다', () => {
    const p = projectMonthlyCost(
      [metrics({ estimatedCostKrw: 2_000 }), metrics({ estimatedCostKrw: 4_000 })],
      4.3,
    )
    expect(p).toBe(12_900) // 평균 3,000 × 4.3
  })

  it('정수를 돌려준다', () => {
    expect(Number.isInteger(projectMonthlyCost([metrics()], 4.3))).toBe(true)
  })
})

describe('costHealth — 설계 문서가 예상한 원가율 11~12%', () => {
  it('15% 이하면 건강하다', () => {
    expect(costHealth(0.12)).toBe('healthy')
  })

  it('15~25%는 주시 대상', () => {
    expect(costHealth(0.2)).toBe('watch')
  })

  it('25%를 넘으면 위험 — 요금제를 다시 봐야 한다', () => {
    expect(costHealth(0.3)).toBe('critical')
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/admin/cost.test.ts
```

Expected: FAIL

`src/lib/admin/cost.ts`:

```ts
import type { RunMetrics } from '@/lib/db/schema'
import type { EngineId } from '@/lib/plans'

export interface CostSummary {
  runCount: number
  totalCostKrw: number
  avgCostPerRunKrw: number
  callsByEngine: Partial<Record<EngineId, number>>
  totalCalls: number
  serpApiCalls: number
  tokensIn: number
  tokensOut: number
  /** 1차 정규식 필터 통과율 — 원가를 좌우한다 */
  avgStage1PassRate: number | null
  avgDurationMs: number
}

export function aggregateCost(runs: readonly RunMetrics[]): CostSummary {
  if (runs.length === 0) {
    return {
      runCount: 0,
      totalCostKrw: 0,
      avgCostPerRunKrw: 0,
      callsByEngine: {},
      totalCalls: 0,
      serpApiCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      avgStage1PassRate: null,
      avgDurationMs: 0,
    }
  }

  const callsByEngine: Partial<Record<EngineId, number>> = {}
  let totalCostKrw = 0
  let totalCalls = 0
  let serpApiCalls = 0
  let tokensIn = 0
  let tokensOut = 0
  let durationSum = 0

  const passRates: number[] = []

  for (const m of runs) {
    totalCostKrw += m.estimatedCostKrw
    serpApiCalls += m.serpApiCalls
    tokensIn += m.tokensIn
    tokensOut += m.tokensOut
    durationSum += m.durationMs
    if (m.stage1PassRate !== null) passRates.push(m.stage1PassRate)

    for (const [engine, count] of Object.entries(m.callsByEngine) as [EngineId, number][]) {
      callsByEngine[engine] = (callsByEngine[engine] ?? 0) + count
      totalCalls += count
    }
  }

  return {
    runCount: runs.length,
    totalCostKrw,
    avgCostPerRunKrw: Math.round(totalCostKrw / runs.length),
    callsByEngine,
    totalCalls,
    serpApiCalls,
    tokensIn,
    tokensOut,
    avgStage1PassRate:
      passRates.length > 0 ? passRates.reduce((a, b) => a + b, 0) / passRates.length : null,
    avgDurationMs: Math.round(durationSum / runs.length),
  }
}

export function costRatio(costKrw: number, revenueKrw: number): number | null {
  if (revenueKrw <= 0) return null
  return costKrw / revenueKrw
}

/** 주간 수집 원가를 월 기준으로 환산한다. */
export function projectMonthlyCost(
  runs: readonly RunMetrics[],
  weeksPerMonth: number,
): number {
  if (runs.length === 0) return 0
  const avg = runs.reduce((sum, m) => sum + m.estimatedCostKrw, 0) / runs.length
  return Math.round(avg * weeksPerMonth)
}

export type CostHealth = 'healthy' | 'watch' | 'critical'

/**
 * 설계 문서의 예상 원가율은 Starter 11%, Business 12%다.
 * 15%를 넘으면 주시하고, 25%를 넘으면 요금제를 다시 봐야 한다.
 */
export function costHealth(ratio: number): CostHealth {
  if (ratio <= 0.15) return 'healthy'
  if (ratio <= 0.25) return 'watch'
  return 'critical'
}
```

- [ ] **Step 3: 통과 확인과 커밋**

```bash
pnpm vitest run src/lib/admin/cost.test.ts
git add src/lib/admin/cost.ts src/lib/admin/cost.test.ts
git commit -m "feat(admin): 실측 원가 집계와 원가율 건강도 판정"
```

Expected: PASS (17 passed)

---

### Task 3: 원가 대시보드

**Files:**
- Create: `src/lib/admin/queries.ts`, `src/app/admin/cost/page.tsx`,
  `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: Task 2, `db`
- Produces: 고객별 실제 원가율이 보이는 화면

**설계 문서: "관리자 화면에 고객별 실제 원가율을 띄운다. 예상 12%가 실제로
12%인지 30%인지 첫 달에 알 수 있어야 한다. 모르고 6개월 운영하면 적자를 쌓는다."**

- [ ] **Step 1: 관리자 집계 쿼리**

`src/lib/admin/queries.ts`:

```ts
import { and, count, desc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { aggregateCost, costHealth, costRatio, projectMonthlyCost } from '@/lib/admin/cost'
import type { CostSummary } from '@/lib/admin/cost'
import { db } from '@/lib/db'
import {
  brands,
  collectionRuns,
  freeAudits,
  payments,
  subscriptions,
  user,
  type RunMetrics,
} from '@/lib/db/schema'
import { monthlyPriceKrw, WEEKS_PER_MONTH, type PlanId } from '@/lib/plans'

export interface CustomerCost {
  userId: string
  email: string
  plan: PlanId
  status: string
  queryPacks: number
  revenueKrw: number
  monthlyCostKrw: number
  ratio: number | null
  health: ReturnType<typeof costHealth> | null
  runCount: number
  avgStage1PassRate: number | null
}

/** 고객별 실측 원가율. 이 화면이 이 단계의 존재 이유다. */
export async function loadCustomerCosts(since: Date): Promise<CustomerCost[]> {
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      plan: subscriptions.plan,
      status: subscriptions.status,
      queryPacks: subscriptions.queryPacks,
      metrics: collectionRuns.metrics,
    })
    .from(subscriptions)
    .innerJoin(user, eq(user.id, subscriptions.userId))
    .leftJoin(brands, eq(brands.userId, user.id))
    .leftJoin(
      collectionRuns,
      and(eq(collectionRuns.brandId, brands.id), gte(collectionRuns.startedAt, since)),
    )

  const byUser = new Map<
    string,
    { email: string; plan: PlanId; status: string; queryPacks: number; metrics: RunMetrics[] }
  >()

  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? {
      email: r.email,
      plan: r.plan,
      status: r.status,
      queryPacks: r.queryPacks,
      metrics: [],
    }
    if (r.metrics) entry.metrics.push(r.metrics)
    byUser.set(r.userId, entry)
  }

  return [...byUser.entries()]
    .map(([userId, e]) => {
      const summary: CostSummary = aggregateCost(e.metrics)
      const revenueKrw = monthlyPriceKrw(e.plan, e.queryPacks)
      const monthlyCostKrw = projectMonthlyCost(e.metrics, WEEKS_PER_MONTH)
      const ratio = costRatio(monthlyCostKrw, revenueKrw)
      return {
        userId,
        email: e.email,
        plan: e.plan,
        status: e.status,
        queryPacks: e.queryPacks,
        revenueKrw,
        monthlyCostKrw,
        ratio,
        health: ratio === null ? null : costHealth(ratio),
        runCount: summary.runCount,
        avgStage1PassRate: summary.avgStage1PassRate,
      }
    })
    .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
}

export interface OverviewStats {
  activeSubscriptions: number
  mrrKrw: number
  runsLast7Days: number
  failedRunsLast7Days: number
  auditsLast7Days: number
  auditEmailConversions: number
  totalCostLast30DaysKrw: number
}

export async function loadOverview(now: Date): Promise<OverviewStats> {
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const activeSubs = await db
    .select({ plan: subscriptions.plan, queryPacks: subscriptions.queryPacks })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'))

  const [runs] = await db
    .select({ n: count() })
    .from(collectionRuns)
    .where(gte(collectionRuns.startedAt, d7))

  const [failed] = await db
    .select({ n: count() })
    .from(collectionRuns)
    .where(and(gte(collectionRuns.startedAt, d7), eq(collectionRuns.status, 'failed')))

  const [audits] = await db
    .select({ n: count() })
    .from(freeAudits)
    .where(gte(freeAudits.createdAt, d7))

  const [converted] = await db
    .select({ n: count() })
    .from(freeAudits)
    .where(and(gte(freeAudits.createdAt, d7), isNotNull(freeAudits.email)))

  const costRows = await db
    .select({ metrics: collectionRuns.metrics })
    .from(collectionRuns)
    .where(gte(collectionRuns.startedAt, d30))

  const cost = aggregateCost(
    costRows.map((r) => r.metrics).filter((m): m is RunMetrics => m !== null),
  )

  return {
    activeSubscriptions: activeSubs.length,
    mrrKrw: activeSubs.reduce((sum, s) => sum + monthlyPriceKrw(s.plan, s.queryPacks), 0),
    runsLast7Days: runs?.n ?? 0,
    failedRunsLast7Days: failed?.n ?? 0,
    auditsLast7Days: audits?.n ?? 0,
    auditEmailConversions: converted?.n ?? 0,
    totalCostLast30DaysKrw: cost.totalCostKrw,
  }
}

/** 무료 진단 A/B 결과 — 결과 화면 순서 가설을 데이터로 검증한다. */
export async function loadVariantConversion(since: Date) {
  return db
    .select({
      variant: freeAudits.variant,
      total: count(),
      emailCaptured: sql<number>`count(${freeAudits.email})`,
      signedUp: sql<number>`count(${freeAudits.convertedSignupAt})`,
    })
    .from(freeAudits)
    .where(gte(freeAudits.createdAt, since))
    .groupBy(freeAudits.variant)
}
```

- [ ] **Step 2: 원가 대시보드 화면**

`src/app/admin/cost/page.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { loadCustomerCosts } from '@/lib/admin/queries'
import { maskEmail } from '@/lib/admin/mask'

export const metadata = { title: '원가' }
export const dynamic = 'force-dynamic'

const HEALTH_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-50 text-emerald-700',
  watch: 'bg-amber-50 text-amber-800',
  critical: 'bg-red-50 text-red-700',
}

const HEALTH_LABEL: Record<string, string> = {
  healthy: '정상',
  watch: '주시',
  critical: '위험',
}

export default async function AdminCostPage() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const customers = await loadCustomerCosts(since)

  const paying = customers.filter((c) => c.status === 'active')
  const totalRevenue = paying.reduce((s, c) => s + c.revenueKrw, 0)
  const totalCost = paying.reduce((s, c) => s + c.monthlyCostKrw, 0)
  const overallRatio = totalRevenue > 0 ? totalCost / totalRevenue : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">원가</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          최근 30일 실측 기준. 설계 문서의 예상 원가율은 Starter 11% · Business 12%다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">월 매출 (MRR)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {totalRevenue.toLocaleString('ko-KR')}원
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">월 변동 원가 (실측)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {totalCost.toLocaleString('ko-KR')}원
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">전체 원가율</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {overallRatio === null ? '—' : `${(overallRatio * 100).toFixed(1)}%`}
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">고객</th>
              <th className="px-4 py-3 font-medium">플랜</th>
              <th className="px-4 py-3 text-right font-medium">매출/월</th>
              <th className="px-4 py-3 text-right font-medium">원가/월 (실측)</th>
              <th className="px-4 py-3 text-right font-medium">원가율</th>
              <th className="px-4 py-3 text-right font-medium">1차 통과율</th>
              <th className="px-4 py-3 text-right font-medium">수집</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.userId} className="border-b last:border-0">
                <td className="px-4 py-3">{maskEmail(c.email)}</td>
                <td className="px-4 py-3">
                  {c.plan}
                  {c.queryPacks > 0 ? ` +${c.queryPacks}팩` : ''}
                  <span className="ml-2 text-xs text-muted-foreground">{c.status}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.revenueKrw.toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.monthlyCostKrw.toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.ratio === null ? (
                    '—'
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        HEALTH_STYLE[c.health!] ?? ''
                      }`}
                    >
                      {(c.ratio * 100).toFixed(1)}% {HEALTH_LABEL[c.health!]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.avgStage1PassRate === null
                    ? '—'
                    : `${(c.avgStage1PassRate * 100).toFixed(0)}%`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.runCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">1차 통과율</strong>이 높을수록 LLM 판정
          호출이 늘어 원가가 오른다. 설계 문서는 70~80% 탈락(= 통과율 20~30%)을 가정했다.
          통과율이 50%를 넘으면 별칭 매칭 규칙을 다시 봐야 한다.
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: 개요 화면**

`src/app/admin/page.tsx`:

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { loadOverview, loadVariantConversion } from '@/lib/admin/queries'

export const metadata = { title: '운영 개요' }
export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const now = new Date()
  const stats = await loadOverview(now)
  const variants = await loadVariantConversion(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))

  const tiles = [
    { label: '활성 구독', value: `${stats.activeSubscriptions}명` },
    { label: 'MRR', value: `${stats.mrrKrw.toLocaleString('ko-KR')}원` },
    { label: '7일 수집', value: `${stats.runsLast7Days}회` },
    {
      label: '7일 수집 실패',
      value: `${stats.failedRunsLast7Days}회`,
      alert: stats.failedRunsLast7Days > 0,
    },
    { label: '7일 무료 진단', value: `${stats.auditsLast7Days}건` },
    {
      label: '진단 → 이메일',
      value:
        stats.auditsLast7Days > 0
          ? `${Math.round((stats.auditEmailConversions / stats.auditsLast7Days) * 100)}%`
          : '—',
    },
    {
      label: '30일 변동 원가',
      value: `${stats.totalCostLast30DaysKrw.toLocaleString('ko-KR')}원`,
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">운영 개요</h1>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className={`p-5 ${t.alert ? 'border-red-300 bg-red-50/40' : ''}`}>
            <div className="text-sm text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{t.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="font-semibold">무료 진단 결과 화면 순서 실험</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          설계 ④: &ldquo;이 순서는 가설이지 사실이 아니다.&rdquo; 방문자 200명이면
          데이터로 결론이 난다.
        </p>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">variant</th>
              <th className="pb-2 text-right font-medium">진단</th>
              <th className="pb-2 text-right font-medium">이메일</th>
              <th className="pb-2 text-right font-medium">전환율</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.variant} className="border-t">
                <td className="py-2">{v.variant === 'cba' ? 'C→B→A (증거 먼저)' : 'A→B→C (지표 먼저)'}</td>
                <td className="py-2 text-right tabular-nums">{v.total}</td>
                <td className="py-2 text-right tabular-nums">{v.emailCaptured}</td>
                <td className="py-2 text-right tabular-nums">
                  {v.total > 0 ? `${Math.round((v.emailCaptured / v.total) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {variants.reduce((s, v) => s + v.total, 0) < 200 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            표본이 200건 미만이라 아직 결론을 내리기 이릅니다.
          </p>
        ) : null}
      </Card>

      <div className="flex gap-3 text-sm">
        <Link href="/admin/cost" className="underline underline-offset-4">
          원가 상세
        </Link>
        <Link href="/admin/runs" className="underline underline-offset-4">
          수집 모니터
        </Link>
        <Link href="/admin/quota" className="underline underline-offset-4">
          SerpApi 쿼터
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 실제 데이터로 검증**

```bash
pnpm dev
```

`/admin/cost`를 열어 확인한다:
1. 4단계에서 만든 테스트 고객이 목록에 있는가
2. **원가율이 표시되는가** — `—`가 아니라 실제 숫자
3. 1차 통과율이 표시되는가

Expected: 3개 모두 통과. 원가율이 `—`면 `collection_runs.metrics`가
비어 있다는 뜻이다 — 3단계 수집 잡의 metrics 기록을 확인한다.

**이 숫자를 설계 문서의 예상치와 비교한다.** 크게 벗어나면
`docs/superpowers/notes/2026-07-28-cost-actuals.md`를 갱신하고 사용자에게 보고한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(admin): 고객별 실측 원가율 대시보드 · 운영 개요 · A/B 전환 집계

예상 12%가 실제로 12%인지 첫 달에 알 수 있다."
```

---

### Task 4: 수집 모니터와 재실행

**Files:**
- Create: `src/app/admin/runs/page.tsx`, `src/app/admin/actions.ts`,
  `src/app/admin/customers/page.tsx`

**Interfaces:**
- Consumes: Task 1~3
- Produces:
  - 최근 수집 목록 (완전성·실패·소요시간)
  - `rerunCollection(brandId)` — 수동 재수집
  - 고객 목록

- [ ] **Step 1: 관리자 액션**

`src/app/admin/actions.ts`:

```ts
'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logAdminAction } from '@/lib/admin/audit-log'
import { db } from '@/lib/db'
import { brands, collectionRuns } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/session'
import { collectBrand } from '@/trigger/collect-brand'
import { judgeRun } from '@/trigger/judge-run'

export interface AdminActionResult {
  ok: boolean
  message: string
}

const brandSchema = z.object({ brandId: z.string().min(1) })

export async function rerunCollection(
  input: z.infer<typeof brandSchema>,
): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  const parsed = brandSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: '입력이 올바르지 않습니다.' }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, parsed.data.brandId) })
  if (!brand) return { ok: false, message: '브랜드를 찾을 수 없습니다.' }

  const handle = await collectBrand.trigger({ brandId: brand.id, trigger: 'manual' })

  await logAdminAction({
    adminUserId: admin.id,
    action: 'rerun_collection',
    targetId: brand.id,
    detail: { runId: handle.id },
  })

  revalidatePath('/admin/runs')
  return { ok: true, message: `${brand.name} 재수집을 시작했습니다.` }
}

const runSchema = z.object({ runId: z.string().min(1) })

/** 판정만 다시 돌린다. 수집 데이터는 그대로 두고 원본으로 재판정한다. */
export async function rejudgeRun(input: z.infer<typeof runSchema>): Promise<AdminActionResult> {
  const admin = await requireAdmin()
  const parsed = runSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: '입력이 올바르지 않습니다.' }

  const run = await db.query.collectionRuns.findFirst({
    where: eq(collectionRuns.id, parsed.data.runId),
  })
  if (!run) return { ok: false, message: '수집을 찾을 수 없습니다.' }

  await judgeRun.trigger({ runId: run.id, brandId: run.brandId })

  await logAdminAction({
    adminUserId: admin.id,
    action: 'rejudge_run',
    targetId: run.id,
  })

  revalidatePath('/admin/runs')
  return { ok: true, message: '재판정을 시작했습니다.' }
}
```

- [ ] **Step 2: 수집 모니터**

`src/app/admin/runs/page.tsx`:

```tsx
import { desc, eq } from 'drizzle-orm'
import { RunActions } from '@/components/admin/run-actions'
import { Card } from '@/components/ui/card'
import { completenessRatio, failedEngines } from '@/lib/collection/completeness'
import { db } from '@/lib/db'
import { brands, collectionRuns } from '@/lib/db/schema'

export const metadata = { title: '수집 모니터' }
export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-700',
  running: 'bg-blue-50 text-blue-700',
}

export default async function AdminRunsPage() {
  const runs = await db
    .select({
      id: collectionRuns.id,
      brandId: collectionRuns.brandId,
      brandName: brands.name,
      status: collectionRuns.status,
      trigger: collectionRuns.trigger,
      startedAt: collectionRuns.startedAt,
      finishedAt: collectionRuns.finishedAt,
      completeness: collectionRuns.completeness,
      metrics: collectionRuns.metrics,
    })
    .from(collectionRuns)
    .innerJoin(brands, eq(brands.id, collectionRuns.brandId))
    .orderBy(desc(collectionRuns.startedAt))
    .limit(60)

  const fmt = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(d)
      : '—'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">수집 모니터</h1>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">브랜드</th>
              <th className="px-4 py-3 font-medium">시작</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 text-right font-medium">완전성</th>
              <th className="px-4 py-3 font-medium">실패 엔진</th>
              <th className="px-4 py-3 text-right font-medium">소요</th>
              <th className="px-4 py-3 text-right font-medium">원가</th>
              <th className="px-4 py-3 font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const ratio = completenessRatio(r.completeness)
              const failed = failedEngines(r.completeness)
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{r.brandName}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmt(r.startedAt)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[r.status] ?? ''
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.trigger}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={ratio < 0.9 ? 'text-amber-700' : ''}>
                      {(ratio * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-700">{failed.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.metrics ? `${Math.round(r.metrics.durationMs / 1000)}초` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.metrics ? `${r.metrics.estimatedCostKrw.toLocaleString('ko-KR')}원` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RunActions runId={r.id} brandId={r.brandId} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

`src/components/admin/run-actions.tsx` — 재수집·재판정 버튼. 서버 액션을
호출하고 결과 메시지를 표시하는 클라이언트 컴포넌트.

- [ ] **Step 3: 고객 목록**

`src/app/admin/customers/page.tsx` — `loadCustomerCosts`를 재사용하되
구독 상태·가입일·브랜드 수·마지막 수집 시각을 보여준다. `past_due`와
`suspended`를 위로 정렬해 조치가 필요한 고객이 먼저 보이게 한다.

- [ ] **Step 4: 검증**

```bash
pnpm dev
```

1. `/admin/runs`에서 4단계·5단계의 수집이 보이는가
2. **완전성·소요시간·원가가 채워져 있는가**
3. 재수집 버튼 → Trigger.dev에 새 실행이 뜨는가
4. `admin_actions` 테이블에 기록이 남는가

Expected: 4개 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(admin): 수집 모니터 · 재수집/재판정 액션 · 고객 목록"
```

---

### Task 5: SerpApi 쿼터 추적

**Files:**
- Create: `src/lib/serpapi/quota.ts`, `src/trigger/quota-monitor.ts`,
  `src/app/admin/quota/page.tsx`
- Test: `src/lib/serpapi/quota.test.ts`
- Modify: `src/lib/email/templates.ts` (운영 알림 메일)

**Interfaces:**
- Consumes: `serpapiUsage` 테이블 (1단계), `expectedSerpCallsPerMonth` (1단계)
- Produces:
  - `projectMonthlySerpCalls(customers): number`
  - `quotaVerdict(used, limit): { pct; level; message }`
  - `recommendPlan(projected): SerpPlan`
  - `quotaMonitor` — 매일 도는 쿼터 감시 잡

설계 문서: **업그레이드 판단은 고객 수가 아니라 예상 호출량으로 한다.**
Starter와 Business의 소비량이 3배 차이나므로 고객 수는 기준이 될 수 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/serpapi/quota.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SERP_PLANS,
  projectMonthlySerpCalls,
  quotaVerdict,
  recommendPlan,
} from '@/lib/serpapi/quota'

describe('projectMonthlySerpCalls', () => {
  it('Starter 10질의 = 172건/월', () => {
    expect(projectMonthlySerpCalls([{ plan: 'starter', queryCount: 10 }])).toBe(172)
  })

  it('Business 30질의 = 516건/월', () => {
    expect(projectMonthlySerpCalls([{ plan: 'business', queryCount: 30 }])).toBe(516)
  })

  it('고객별 호출량을 합산한다 (고객 수가 아니라 호출량이 기준)', () => {
    const total = projectMonthlySerpCalls([
      { plan: 'starter', queryCount: 10 },
      { plan: 'starter', queryCount: 10 },
      { plan: 'business', queryCount: 30 },
    ])
    expect(total).toBe(172 + 172 + 516)
  })

  it('무료 플랜은 SERP를 쓰지 않는다', () => {
    expect(projectMonthlySerpCalls([{ plan: 'free', queryCount: 3 }])).toBe(0)
  })

  it('고객이 없으면 0', () => {
    expect(projectMonthlySerpCalls([])).toBe(0)
  })
})

describe('recommendPlan — 설계 문서의 업그레이드 기준', () => {
  it('Starter 5명(860건)은 Starter 플랜(1,000건)으로 감당된다', () => {
    expect(recommendPlan(860)).toBe('starter')
  })

  it('Business 2명(1,032건)이면 Developer로 올려야 한다', () => {
    // "Business 두 번째 계약이 곧 업그레이드 시점이다"
    expect(recommendPlan(1_032)).toBe('developer')
  })

  it('5,000건을 넘으면 Production', () => {
    expect(recommendPlan(6_000)).toBe('production')
  })

  it('여유를 두고 판단한다 (한도의 100%까지 쓰지 않는다)', () => {
    // Starter 한도 1,000건의 85%인 850건이면 아직 Starter
    expect(recommendPlan(850)).toBe('starter')
    // 90%를 넘으면 다음 플랜
    expect(recommendPlan(950)).toBe('developer')
  })
})

describe('quotaVerdict', () => {
  it('80% 미만이면 정상', () => {
    expect(quotaVerdict(700, 1000).level).toBe('ok')
  })

  it('80%에 도달하면 경고 (설계 문서 기준)', () => {
    const v = quotaVerdict(800, 1000)
    expect(v.level).toBe('warning')
    expect(v.pct).toBe(80)
  })

  it('95%를 넘으면 위험', () => {
    expect(quotaVerdict(960, 1000).level).toBe('critical')
  })

  it('한도가 0이면 던지지 않는다', () => {
    expect(quotaVerdict(10, 0).level).toBe('critical')
  })

  it('경고 메시지에 잔여 건수가 들어간다', () => {
    expect(quotaVerdict(800, 1000).message).toContain('200')
  })
})

describe('SERP_PLANS', () => {
  it('설계 문서의 플랜 표와 일치한다', () => {
    expect(SERP_PLANS.starter.searches).toBe(1_000)
    expect(SERP_PLANS.developer.searches).toBe(5_000)
    expect(SERP_PLANS.production.searches).toBe(15_000)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/serpapi/quota.test.ts
```

Expected: FAIL

`src/lib/serpapi/quota.ts`:

```ts
import { expectedSerpCallsPerMonth, type PlanId } from '@/lib/plans'

export type SerpPlan = 'starter' | 'developer' | 'production'

/** 설계 문서의 SerpApi 플랜 표 */
export const SERP_PLANS: Record<SerpPlan, { searches: number; usd: number }> = {
  starter: { searches: 1_000, usd: 25 },
  developer: { searches: 5_000, usd: 75 },
  production: { searches: 15_000, usd: 150 },
}

/** 한도의 이 비율을 넘으면 다음 플랜을 권한다. 100%까지 쓰지 않는다. */
const HEADROOM = 0.9

export interface CustomerUsage {
  plan: PlanId
  queryCount: number
}

/**
 * 예상 월 SerpApi 호출량.
 *
 * 설계 문서: "업그레이드 판단은 고객 수가 아니라 예상 호출량으로 한다.
 * Starter와 Business의 소비량이 3배 차이나므로 고객 수는 기준이 될 수 없다."
 */
export function projectMonthlySerpCalls(customers: readonly CustomerUsage[]): number {
  return customers.reduce(
    (sum, c) => sum + expectedSerpCallsPerMonth(c.plan, c.queryCount),
    0,
  )
}

export function recommendPlan(projectedCalls: number): SerpPlan {
  if (projectedCalls <= SERP_PLANS.starter.searches * HEADROOM) return 'starter'
  if (projectedCalls <= SERP_PLANS.developer.searches * HEADROOM) return 'developer'
  return 'production'
}

export type QuotaLevel = 'ok' | 'warning' | 'critical'

export interface QuotaVerdict {
  pct: number
  level: QuotaLevel
  remaining: number
  message: string
}

/** 설계 문서: "80% 도달 시 알림" */
export function quotaVerdict(used: number, limit: number): QuotaVerdict {
  if (limit <= 0) {
    return {
      pct: 100,
      level: 'critical',
      remaining: 0,
      message: 'SerpApi 플랜 한도가 설정되지 않았습니다.',
    }
  }
  const pct = Math.round((used / limit) * 100)
  const remaining = Math.max(0, limit - used)

  const level: QuotaLevel = pct >= 95 ? 'critical' : pct >= 80 ? 'warning' : 'ok'

  const message =
    level === 'ok'
      ? `이번 달 ${used.toLocaleString('ko-KR')} / ${limit.toLocaleString('ko-KR')}건 사용`
      : `SerpApi 쿼터 ${pct}% 소진 — 잔여 ${remaining.toLocaleString('ko-KR')}건. Automatic Early Renewal이 켜져 있는지 확인하세요.`

  return { pct, level, remaining, message }
}
```

- [ ] **Step 3: 운영 알림 메일 템플릿**

`src/lib/email/templates.ts`에 추가:

```ts
export function opsAlertEmail(params: {
  title: string
  body: string
  adminUrl: string
}): EmailContent {
  return {
    subject: `[Cited 운영] ${params.title}`,
    html: layout(
      `<p><strong>${escapeHtml(params.title)}</strong></p>
<p style="white-space:pre-wrap">${escapeHtml(params.body)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(params.adminUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">운영 콘솔 열기</a></p>`,
    ),
  }
}
```

`.env.example`에 추가: `OPS_ALERT_EMAIL=` (운영 알림 수신 주소).
`src/lib/env.ts` 스키마에도 추가 (optional).

- [ ] **Step 4: 쿼터 감시 잡**

`src/trigger/quota-monitor.ts`:

```ts
import { logger, schedules } from '@trigger.dev/sdk'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { brands, queries, serpapiUsage, subscriptions } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { opsAlertEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import {
  projectMonthlySerpCalls,
  quotaVerdict,
  recommendPlan,
  SERP_PLANS,
} from '@/lib/serpapi/quota'

export const quotaMonitor = schedules.task({
  id: 'quota-monitor',
  cron: { pattern: '0 0 * * *', timezone: 'Asia/Seoul' }, // 매일 KST 오전 9시
  maxDuration: 300,
  run: async (payload) => {
    const period = payload.timestamp.toISOString().slice(0, 7)

    const usage = await db.query.serpapiUsage.findFirst({
      where: eq(serpapiUsage.period, period),
    })

    // 예상 호출량 — 고객 수가 아니라 질의 수로 계산한다.
    const rows = await db
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        queryCount: sql<number>`count(${queries.id})`,
      })
      .from(subscriptions)
      .innerJoin(brands, eq(brands.userId, subscriptions.userId))
      .leftJoin(queries, eq(queries.brandId, brands.id))
      .groupBy(subscriptions.plan, subscriptions.status, brands.id)

    const active = rows.filter((r) => r.status === 'active' || r.status === 'past_due')
    const projected = projectMonthlySerpCalls(
      active.map((r) => ({ plan: r.plan, queryCount: Number(r.queryCount) })),
    )
    const recommended = recommendPlan(projected)

    const limit = usage?.planLimit ?? SERP_PLANS.starter.searches
    const used = usage?.used ?? 0
    const verdict = quotaVerdict(used, limit)

    logger.info('quota-monitor', {
      period,
      used,
      limit,
      pct: verdict.pct,
      projected,
      recommended,
    })

    const needsAlert = verdict.level !== 'ok' && !(usage?.alerted80 ?? false)
    const needsUpgrade = SERP_PLANS[recommended].searches > limit

    if ((needsAlert || needsUpgrade) && env.OPS_ALERT_EMAIL) {
      const lines = [
        verdict.message,
        '',
        `예상 월 호출량: ${projected.toLocaleString('ko-KR')}건`,
        `현재 플랜 한도: ${limit.toLocaleString('ko-KR')}건`,
        needsUpgrade
          ? `권장 플랜: ${recommended} ($${SERP_PLANS[recommended].usd}/월, ${SERP_PLANS[recommended].searches.toLocaleString('ko-KR')}건)`
          : '플랜 업그레이드는 아직 필요하지 않습니다.',
      ]

      await sendEmail({
        to: env.OPS_ALERT_EMAIL,
        content: opsAlertEmail({
          title: needsUpgrade ? 'SerpApi 플랜 업그레이드 필요' : `SerpApi 쿼터 ${verdict.pct}% 소진`,
          body: lines.join('\n'),
          adminUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/quota`,
        }),
      })

      if (needsAlert && usage) {
        await db
          .update(serpapiUsage)
          .set({ alerted80: true, updatedAt: new Date() })
          .where(eq(serpapiUsage.period, period))
      }
    }

    return { used, limit, pct: verdict.pct, projected, recommended }
  },
})
```

- [ ] **Step 5: 쿼터 화면**

`src/app/admin/quota/page.tsx` — 현재 사용량, 예상 호출량, 권장 플랜,
플랜별 감당 가능 고객 수를 보여준다. 설계 문서의 표를 그대로 옮긴다:

```
| 플랜 | 건수 | 감당 가능 |
| Starter $25 | 1,000건 | Starter 5명 또는 Business 1명 |
| Developer $75 | 5,000건 | Starter 29명 또는 Business 9명 |
| Production $150 | 15,000건 | |
```

`planLimit`을 관리자가 수정할 수 있는 폼도 넣는다 (SerpApi 플랜을 올렸을 때).

- [ ] **Step 6: 검증과 커밋**

```bash
pnpm vitest run src/lib/serpapi/quota.test.ts
pnpm dev
```

`/admin/quota`에서 예상 호출량과 권장 플랜이 보이는지 확인한다.
Trigger.dev에서 `quota-monitor`를 수동 실행해 알림 로직을 확인한다
(`planLimit`을 임시로 낮춰 80%를 넘겨본다).

```bash
git add -A
git commit -m "feat(admin): SerpApi 쿼터 추적 · 80% 알림 · 예상 호출량 기반 업그레이드 판단

고객 수가 아니라 호출량으로 판단한다."
```

Expected: PASS (14 passed)

---

### Task 6: 주간 스모크 테스트

**Files:**
- Create: `src/trigger/engine-smoke.ts`
- Modify: `src/lib/email/templates.ts` (사용)

**Interfaces:**
- Consumes: `allEngines` (2단계), `claudeJudge` (2단계)
- Produces: `engineSmoke` — 주 1회, 각 엔진에 실제 1회 호출

설계 ⑤: "주 1회 스모크 테스트를 돌려 각 엔진에 실제 1회 호출한다. 스키마
변경이나 인증 만료를 조기에 발견하기 위해서고 비용은 무시할 수준이다.
**네이버는 외부 공급자에 의존하므로 이 스모크 테스트가 특히 중요하다.**"

- [ ] **Step 1: 스모크 잡 구현**

`src/trigger/engine-smoke.ts`:

```ts
import { logger, schedules } from '@trigger.dev/sdk'
import { detectMentions } from '@/lib/detection'
import { allEngines } from '@/lib/engines'
import { sendEmail } from '@/lib/email/send'
import { opsAlertEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { claudeJudge } from '@/lib/judge/claude'

const SMOKE_QUERY = '30대 남자 러닝화 추천해줘'
/** 이 질의에서 거의 항상 언급되는 브랜드. 판정기가 살아 있는지 확인한다. */
const SMOKE_BRAND = { canonical: '나이키', aliases: ['NIKE', 'Nike'], ambiguous: false }

interface EngineResult {
  engineId: string
  ok: boolean
  textLength: number
  citations: number
  elapsedMs: number
  error: string | null
}

export const engineSmoke = schedules.task({
  id: 'engine-smoke',
  // 매주 일요일 KST 오전 10시 — 월요일 수집 전에 문제를 발견한다.
  cron: { pattern: '0 1 * * 0', timezone: 'Asia/Seoul' },
  maxDuration: 600,
  run: async () => {
    const results: EngineResult[] = []

    for (const engine of allEngines()) {
      if (!engine.isConfigured()) {
        results.push({
          engineId: engine.id,
          ok: false,
          textLength: 0,
          citations: 0,
          elapsedMs: 0,
          error: 'API 키가 설정되지 않았습니다',
        })
        continue
      }

      const started = Date.now()
      try {
        const answer = await engine.run(SMOKE_QUERY, { sampleIndex: 0 })
        // 응답이 왔지만 파싱이 실패해 텍스트가 비면 스키마가 바뀐 것이다.
        const ok = answer.text.length > 0 || engine.tier === 'serp'
        results.push({
          engineId: engine.id,
          ok,
          textLength: answer.text.length,
          citations: answer.citations.length,
          elapsedMs: Date.now() - started,
          error: ok ? null : '응답은 왔으나 텍스트를 파싱하지 못했습니다 (스키마 변경 의심)',
        })
      } catch (error) {
        results.push({
          engineId: engine.id,
          ok: false,
          textLength: 0,
          citations: 0,
          elapsedMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 판정기도 함께 확인한다.
    let judgeOk = false
    let judgeError: string | null = null
    try {
      const detections = await detectMentions(
        [
          {
            answerId: 'smoke',
            answerText: '러닝화로는 나이키 페가수스를 가장 추천합니다.',
            self: SMOKE_BRAND,
            competitors: [],
          },
        ],
        claudeJudge,
      )
      judgeOk = detections.some((d) => d.subject === 'self' && d.mentioned)
      if (!judgeOk) judgeError = '명백한 언급을 판정하지 못했습니다'
    } catch (error) {
      judgeError = error instanceof Error ? error.message : String(error)
    }

    const failures = results.filter((r) => !r.ok)
    logger.info('engine-smoke.done', {
      total: results.length,
      failures: failures.length,
      judgeOk,
    })

    // 조용히 실패하면 스모크 테스트의 의미가 없다.
    if ((failures.length > 0 || !judgeOk) && env.OPS_ALERT_EMAIL) {
      const lines = [
        ...failures.map((f) => `❌ ${f.engineId}: ${f.error}`),
        ...(judgeOk ? [] : [`❌ 판정기: ${judgeError}`]),
        '',
        '정상:',
        ...results
          .filter((r) => r.ok)
          .map(
            (r) =>
              `✓ ${r.engineId} — ${r.textLength}자, 인용 ${r.citations}건, ${Math.round(r.elapsedMs / 1000)}초`,
          ),
        '',
        '네이버가 실패한 경우 SerpApi 응답 스키마가 바뀌었을 수 있습니다.',
        'tests/fixtures/engines/ 의 픽스처를 갱신하고 파서를 확인하세요.',
      ]

      await sendEmail({
        to: env.OPS_ALERT_EMAIL,
        content: opsAlertEmail({
          title: `엔진 스모크 테스트 실패 (${failures.length + (judgeOk ? 0 : 1)}건)`,
          body: lines.join('\n'),
          adminUrl: `${env.NEXT_PUBLIC_APP_URL}/admin/runs`,
        }),
      })
    }

    return { results, judgeOk }
  },
})
```

- [ ] **Step 2: 수동 실행 검증**

Trigger.dev 대시보드에서 `engine-smoke`를 수동 실행한다.

Expected:
- 4개 엔진 모두 `ok: true`
- `judgeOk: true`
- 실패가 없으면 메일이 오지 않는다

**실패 경로 검증:** `SERPAPI_API_KEY`를 임시로 잘못된 값으로 바꾸고 다시
실행한다. 알림 메일이 오는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "feat(ops): 주간 엔진 스모크 테스트 · 실패 시 운영 알림

네이버는 외부 공급자 의존이라 이 테스트가 특히 중요하다."
```

---

### Task 7: 재판정 도구

**Files:**
- Create: `src/trigger/rejudge.ts`, `src/app/admin/rejudge/page.tsx`
- Modify: `src/app/admin/actions.ts` (일괄 재판정 추가)

**Interfaces:**
- Consumes: `judgeRun` (3단계), `DETECTOR_VERSION` (2단계)
- Produces:
  - `rejudgeAll` — 판정 버전이 올라갔을 때 과거 답변 전체를 재판정
  - 재판정 관리 화면

설계 ③의 재판정 정책:
- 기존 `detections`를 **삭제하지 않고** 새 버전 판정을 추가한다 (감사 추적)
- 대시보드는 최신 버전 기준으로 표시한다
- 지표가 유의미하게 바뀌면 고객에게 공지한다. 숨기면 나중에 더 큰 문제가 된다

- [ ] **Step 1: 재판정 잡**

`src/trigger/rejudge.ts`:

```ts
import { logger, metadata, task } from '@trigger.dev/sdk'
import { desc, eq, gte, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { collectionRuns, detections } from '@/lib/db/schema'
import { DETECTOR_VERSION } from '@/lib/detection'
import { judgeRun } from './judge-run'

export interface RejudgePayload {
  /** 이 버전 미만의 판정을 가진 수집을 재판정한다 */
  targetVersion?: number
  /** 이 시점 이후 수집만 (선택) */
  since?: string
  /** 시험 실행 — 대상만 세고 실제로 돌리지 않는다 */
  dryRun?: boolean
}

/**
 * 판정 로직이 바뀌었을 때 과거 답변을 재판정한다.
 *
 * 설계 ③ 재판정 정책:
 * - 기존 detections를 삭제하지 않고 새 버전 판정을 추가한다 (감사 추적)
 * - 대시보드는 최신 버전 기준으로 표시한다
 * - 지표가 유의미하게 바뀌면 고객에게 공지한다
 */
export const rejudgeAll = task({
  id: 'rejudge-all',
  maxDuration: 3600,
  run: async (payload: RejudgePayload) => {
    const target = payload.targetVersion ?? DETECTOR_VERSION

    const rows = await db
      .select({
        id: collectionRuns.id,
        brandId: collectionRuns.brandId,
        startedAt: collectionRuns.startedAt,
        planSnapshot: collectionRuns.planSnapshot,
      })
      .from(collectionRuns)
      .where(
        payload.since
          ? sql`${collectionRuns.status} != 'failed' and ${collectionRuns.startedAt} >= ${new Date(payload.since)}`
          : ne(collectionRuns.status, 'failed'),
      )
      .orderBy(desc(collectionRuns.startedAt))

    // 이미 최신 버전으로 판정된 수집은 건너뛴다.
    const stale = rows.filter((r) => r.planSnapshot.detectorVersion < target)

    logger.info('rejudge.plan', {
      total: rows.length,
      stale: stale.length,
      targetVersion: target,
      dryRun: payload.dryRun ?? false,
    })

    if (payload.dryRun) {
      return { candidates: stale.length, triggered: 0, targetVersion: target }
    }

    metadata.set('progress', { total: stale.length, done: 0 })

    // 한 번에 다 던지면 판정 LLM rate limit에 걸린다. 순차로 간다.
    let done = 0
    for (const run of stale) {
      await judgeRun.triggerAndWait({
        runId: run.id,
        brandId: run.brandId,
        detectorVersion: target,
      })
      done++
      metadata.set('progress', { total: stale.length, done })
    }

    logger.info('rejudge.done', { triggered: done, targetVersion: target })
    return { candidates: stale.length, triggered: done, targetVersion: target }
  },
})
```

> **주의:** `judgeRun`은 `saveDetections`에서 `onConflictDoNothing`을 쓰므로
> 같은 `(answer, subject, version)` 조합은 중복 저장되지 않는다. 재판정이
> 두 번 돌아도 안전하다. 기존 버전 판정은 그대로 남아 감사 추적이 된다.

- [ ] **Step 2: 재판정 관리 화면**

`src/app/admin/rejudge/page.tsx` — 현재 `DETECTOR_VERSION`, 버전별 판정 수,
재판정 대상 수를 보여주고 `dryRun` 후 실행하는 버튼을 둔다.

```tsx
import { count, sql } from 'drizzle-orm'
import { Card } from '@/components/ui/card'
import { db } from '@/lib/db'
import { detections } from '@/lib/db/schema'
import { DETECTOR_VERSION } from '@/lib/detection'
import { RejudgeControls } from '@/components/admin/rejudge-controls'

export const metadata = { title: '재판정' }
export const dynamic = 'force-dynamic'

export default async function RejudgePage() {
  const byVersion = await db
    .select({
      version: detections.detectorVersion,
      total: count(),
      unresolved: sql<number>`count(*) filter (where ${detections.unresolved})`,
    })
    .from(detections)
    .groupBy(detections.detectorVersion)
    .orderBy(detections.detectorVersion)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">재판정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          현재 판정 버전: <strong>v{DETECTOR_VERSION}</strong> · 기존 판정은 삭제하지 않고
          새 버전을 추가합니다 (감사 추적).
        </p>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">판정 버전</th>
              <th className="px-4 py-3 text-right font-medium">판정 수</th>
              <th className="px-4 py-3 text-right font-medium">미판정</th>
            </tr>
          </thead>
          <tbody>
            {byVersion.map((v) => (
              <tr key={v.version} className="border-b last:border-0">
                <td className="px-4 py-3">
                  v{v.version}
                  {v.version === DETECTOR_VERSION ? (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      현재
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {Number(v.total).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {Number(v.unresolved).toLocaleString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <RejudgeControls currentVersion={DETECTOR_VERSION} />

      <Card className="p-5 text-sm text-muted-foreground">
        <p>
          재판정 후 지표가 유의미하게 바뀌면 <strong className="text-foreground">고객에게 공지한다.</strong>
          숨기면 나중에 더 큰 문제가 된다 (설계 ③).
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: 검증**

Trigger.dev에서 `rejudge-all`을 `{ "dryRun": true }`로 실행한다.

Expected: `candidates`가 0이다 (아직 버전이 1뿐이므로).

버전 변경을 흉내내려면 `DETECTOR_VERSION`을 2로 올리고 `dryRun`을 다시 돌린다.
`candidates`가 기존 수집 수와 같아야 한다. 확인 후 원복한다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(admin): 재판정 잡과 관리 화면

기존 판정을 삭제하지 않고 새 버전을 추가한다 (감사 추적)."
```

---

### Task 8: 운영 런북

**Files:**
- Create: `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: 전 단계의 운영 지식
- Produces: 장애 시 볼 문서

설계 ⑤의 "장애 유형별 대응" 표를 실행 가능한 절차로 옮긴다.

- [ ] **Step 1: 런북 작성**

`docs/RUNBOOK.md`:

````markdown
# Cited 운영 런북

장애가 났을 때 이 문서부터 본다. 각 절차는 복사해 실행할 수 있는 명령으로 쓴다.

## 먼저 볼 곳

| 증상 | 확인 |
| --- | --- |
| 아무것도 안 됨 | `curl https://<도메인>/api/health` |
| 수집이 안 돎 | Trigger.dev 대시보드 > Runs |
| 숫자가 이상함 | `/admin/runs` 완전성 컬럼 |
| 원가가 이상함 | `/admin/cost` |
| 결제가 안 됨 | 토스 대시보드 + `/admin/customers` |

---

## 1. 엔진 호출 실패

**증상:** `/admin/runs`에서 완전성이 90% 미만, 특정 엔진의 실패 엔진 컬럼에 이름이 뜸

**대응 (설계 ⑤):**

Trigger.dev의 지수 백오프가 3회 재시도한다. 429는 더 긴 대기, 400류는 즉시 포기 후 기록.
자동 재시도로 해결되지 않으면:

```bash
# 1. 해당 엔진이 실제로 살아있는지 확인
pnpm probe:engine chatgpt "30대 남자 러닝화 추천해줘"

# 2. 스키마가 바뀌었는지 확인 (텍스트가 비어 나오면 스키마 변경)
pnpm test:smoke
```

- **응답은 오는데 텍스트가 빔** → 파서를 고쳐야 한다.
  `tests/fixtures/engines/`의 픽스처를 갱신하고 계약 테스트를 실행한다.
- **401/403** → API 키 만료. Vercel 환경변수를 갱신하고 재배포.
- **429가 계속됨** → `src/lib/collection/queues.ts`의 동시성을 낮춘다.

**부분 실패는 정상 동작이다.** 데이터를 버리지 않고 `completeness`에 기록하며,
대시보드에 배지가 붙는다. 조치가 필요한 것은 **같은 엔진이 2주 연속 실패**할 때다.

---

## 2. SerpApi 쿼터 소진

**증상:** 쿼터 80% 알림 메일, 또는 네이버·Google AIO가 전부 실패

**대응:**

Automatic Early Renewal이 켜져 있으면 하드 스톱이 아니라 조기 갱신된다.
갱신이 실패한 경우에만 SERP를 스킵하고 LLM은 계속된다.

```bash
# 1. 잔여 확인
curl -s "https://serpapi.com/account?api_key=$SERPAPI_API_KEY" | jq

# 2. Early Renewal 상태 확인 — SerpApi 대시보드 > Billing
```

- **Early Renewal이 꺼져 있음** → 즉시 켠다. 예상 못 한 청구보다 고객 서비스
  중단이 훨씬 비싸다.
- **플랜 자체가 부족함** → `/admin/quota`의 권장 플랜으로 업그레이드.
  차액만 결제하고 갱신일이 유지되며 즉시 반영된다.
  업그레이드 후 `/admin/quota`에서 `planLimit`을 갱신한다.

---

## 3. 네이버 경로 차단

**증상:** 네이버 엔진만 지속적으로 실패. SerpApi 계정은 정상.

**이것이 이 제품 최대의 기술 리스크다.**

**대응:**

1. SerpApi 상태 페이지 확인 — 그쪽 장애면 기다린다
2. 실제 응답을 받아 구조가 바뀌었는지 확인:

```bash
curl -s "https://serpapi.com/search.json?engine=naver&query=러닝화+추천&api_key=$SERPAPI_API_KEY" | jq 'keys'
```

3. `ai_overview` 키가 사라졌다면 → `src/lib/engines/naver.ts`의 파서를 고친다
4. SerpApi가 네이버 지원을 중단했다면 → **공급자 교체.**
   `Engine` 인터페이스 덕에 `src/lib/engines/naver.ts` 하나를 교체하면 된다.
   대체 후보: ScraperAPI, Bright Data
5. 교체에 시간이 걸리면 → 고객에게 공지한다. 약관 제7조가 이 상황을 다룬다.

**절대 하지 않는 것:** 자체 스크래핑. robots.txt 위반은 법적 분쟁에서 불리하고,
차단당하는 순간 유료 고객의 서비스가 멈춘다.

---

## 4. 판정 LLM 실패

**증상:** `/admin/rejudge`의 미판정 수가 늘어남

**대응:**

판정 실패는 **데이터 손실이 아니다.** 원본이 `answers.raw`에 있으므로 언제든
재판정할 수 있다. 수집과 판정을 분리한 배당금이다.

```bash
# Anthropic API 상태 확인
pnpm test:smoke
```

해결 후 `/admin/rejudge`에서 재판정을 실행한다.

---

## 5. 결제 실패

**증상:** `/admin/customers`에서 `past_due` 또는 `suspended` 고객

**대응:**

자동 처리가 이미 돌고 있다:
- 첫 실패 → `past_due`, 유예 7일, 실패 메일 발송, **수집은 계속**
- 유예 만료 → `suspended`, 중단 메일, 수집 중단, **과거 데이터는 유지**

수동 개입이 필요한 경우:
- 고객이 카드를 바꿨는데 반영이 안 됨 → `/billing`에서 재등록하도록 안내
- 토스 쪽 장애 → `billing-cycle`을 수동 재실행 (멱등키가 이중 청구를 막는다)

```bash
# 특정 고객의 결제 이력 확인
psql "$DATABASE_URL_UNPOOLED" -c "
  select p.order_id, p.amount_krw, p.status, p.failure_code, p.created_at
  from payments p join subscriptions s on s.id = p.subscription_id
  join \"user\" u on u.id = s.user_id
  where u.email = '<이메일>' order by p.created_at desc limit 10;
"
```

---

## 6. 무료 진단 폭주

**증상:** `/admin` 개요의 7일 진단 수가 급증, 원가 상승

**대응:**

일일 상한(100건)이 이미 작동하고 있어야 한다. 그럼에도 원가가 문제면:

```ts
// src/lib/audit/limits.ts
export const DAILY_GLOBAL_LIMIT = 100  // 이 값을 낮춘다
```

상한 소진 시 에러가 아니라 대기 등록으로 받으므로 리드는 계속 확보된다.

**무료 진단은 트래픽이 늘수록 순수 적자다.** 일 100건 = 월 3,000건 =
변동비 약 24만원. 이것이 감당 가능한 상한이다.

---

## 7. 판정 정확도 회귀

**증상:** CI의 골드 라벨 게이트 실패, 또는 고객이 "이 답변에 우리 나오는데
왜 미포함이냐"고 문의

**대응:**

```bash
# 1. 현재 정확도 확인
ANTHROPIC_API_KEY=... pnpm vitest run tests/golden/regression.test.ts
```

출력의 FP/FN 사례를 본다:
- **FN(놓침)이 많음** → 1차 매칭이 좁다. 별칭 추가 또는 `normalizeKo` 수정
- **FP(오탐)가 많음** → 2차 프롬프트 수정, `needsStage2` 조건 확대

고쳤으면:
1. `DETECTOR_VERSION`을 올린다
2. 골드 라벨 회귀 테스트 통과 확인
3. 배포
4. `/admin/rejudge`에서 재판정
5. **지표가 유의미하게 바뀌었으면 고객에게 공지한다**

고객 문의로 발견한 사례는 골드 라벨 세트에 추가한다. 같은 실수를 두 번 하지 않는다.

---

## 8. 대시보드가 느림

**증상:** 대시보드 로딩이 5초 이상

**원인:** `loadDashboard`가 추이 계산을 위해 수집마다 판정을 다시 조회한다.
수집 12개면 쿼리 24회다.

**대응:**

`collection_runs`에 집계 결과 캐시 컬럼(`citedRate`, `firstMentionRate` 등)을
추가하고 `aggregate-run` 잡에서 채운다. `loadDashboard`는 그 값을 읽는다.

지금 하지 않은 이유는 YAGNI다. 고객 10명일 때는 문제없다.

---

## 9. 배포 롤백

```bash
# Vercel — 이전 배포로 즉시 롤백
pnpm dlx vercel@latest rollback

# Trigger.dev — 이전 버전으로
pnpm dlx trigger.dev@latest deploy --version <이전 버전>

# DB 마이그레이션 롤백은 자동이 아니다.
# drizzle/ 의 SQL을 보고 역방향 SQL을 직접 작성해 적용한다.
```

**DB 마이그레이션은 항상 하위 호환으로 만든다.** 컬럼 삭제는 두 번의 배포로
나눈다 (1: 코드에서 사용 중단 → 2: 컬럼 삭제).

---

## 10. 백업과 복구

Neon은 Point-in-Time Restore를 제공한다 (무료 티어는 7일).

```bash
# 논리 백업 (주 1회 수동, 또는 크론)
pg_dump "$DATABASE_URL_UNPOOLED" --no-owner --no-acl -Fc > backup-$(date +%Y%m%d).dump

# 복구
pg_restore -d "$DATABASE_URL_UNPOOLED" --clean --no-owner backup-YYYYMMDD.dump
```

**복구 우선순위:**
1. `user`, `subscriptions`, `payments` — 잃으면 매출이 끊긴다
2. `brands`, `queries` — 잃으면 고객이 온보딩을 다시 해야 한다
3. `answers`, `detections` — 잃으면 시계열이 끊긴다. **소급 수집이 불가능하다**
4. `free_audits` — 잃어도 서비스는 돈다

---

## 정기 점검 (월 1회)

- [ ] `/admin/cost`에서 원가율이 15% 이하인지
- [ ] `/admin/quota`에서 SerpApi 플랜이 적절한지
- [ ] `engine-smoke`가 4주 연속 통과했는지
- [ ] 골드 라벨 세트에 새 사례가 추가되었는지
- [ ] `pg_dump` 백업이 복구 가능한지 (실제로 복구해본다)
- [ ] 약관·개인정보처리방침이 실제 처리와 일치하는지
````

- [ ] **Step 2: 커밋**

```bash
git add docs/RUNBOOK.md
git commit -m "docs: 운영 런북 (장애 유형별 대응 절차)"
```

---

### Task 9: 런치 체크리스트와 최종 검증

**Files:**
- Create: `docs/superpowers/notes/2026-07-28-launch-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 전 단계
- Produces: 정식 런치 판정

- [ ] **Step 1: 전체 자동 검증**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
ANTHROPIC_API_KEY=... pnpm vitest run tests/golden/regression.test.ts
pnpm test:smoke
```

Expected: 7개 명령 전부 종료 코드 0

- [ ] **Step 2: 런치 체크리스트 작성과 실행**

`docs/superpowers/notes/2026-07-28-launch-checklist.md`:

```markdown
# Cited 정식 런치 체크리스트

각 항목을 **실제로 확인하고** 체크한다. 추측으로 체크하지 않는다.

## 법적 · 사업

- [ ] 사업자 등록 완료, `src/lib/business-info.ts` 값 채움
- [ ] `src/lib/business-info.test.ts`의 skip이 풀렸고 통과
- [ ] 통신판매업 신고 완료, 신고번호 표시됨
- [ ] 이용약관에 제7조(제3자 플랫폼 의존성) 포함
- [ ] 개인정보처리방침의 수탁자 목록이 실제 사용 서비스와 일치
- [ ] 개인정보처리방침의 수집 항목이 실제 DB 스키마와 일치
- [ ] 토스페이먼츠 계약 완료, 수수료율 기록됨
- [ ] 도메인 확보, HTTPS 적용

## 기능

- [ ] 무료 진단: 랜딩 → 진행 → 결과(C→B→A) → 이메일 게이트
- [ ] 가입 → 이메일 인증 → 로그인
- [ ] 온보딩: 브랜드 → 별칭 → 질문 → 경쟁사 → 결제
- [ ] **실제 카드로 결제 성공** (검증 후 환불)
- [ ] 결제 즉시 첫 수집 트리거, 5~15분 내 완료
- [ ] 대시보드 5개 카드 중 4개가 첫날부터 완전
- [ ] 4개 엔진(네이버 포함) 모두 수집 성공
- [ ] 주간 리포트 메일 수신
- [ ] 설정에서 질의·별칭·경쟁사 편집
- [ ] Business에서 CSV 내보내기, 엑셀에서 한글 정상
- [ ] 해지 → 다음 청구가 멈춤

## 안전장치

- [ ] 무료 진단 IP 일일 상한 3회 작동
- [ ] 무료 진단 브랜드 월 1회 작동
- [ ] 무료 진단 전체 일일 상한 100회 설정
- [ ] 플랜 한도(브랜드·질의·경쟁사)가 서버에서 강제됨
- [ ] Starter가 `/api/export/*` 호출 시 403
- [ ] Starter가 3개월 이전 데이터를 받지 않음 (SQL 레벨)
- [ ] 같은 orderId로 이중 청구되지 않음
- [ ] 결제 실패 → past_due → 유예 7일 → suspended 전이
- [ ] 일반 계정이 `/admin` 접근 시 리다이렉트

## 관측

- [ ] `/admin/cost`에 실측 원가율이 표시됨
- [ ] `/admin/runs`에 완전성·소요시간·원가가 채워짐
- [ ] `/admin/quota`에 예상 호출량과 권장 플랜이 보임
- [ ] `engine-smoke` 주간 실행 등록됨
- [ ] `quota-monitor` 일간 실행 등록됨
- [ ] Sentry에 에러가 수집됨 (일부러 에러를 내 확인)
- [ ] `OPS_ALERT_EMAIL`로 알림이 실제로 도착

## 인프라

- [ ] Trigger.dev 스케줄 5개가 전부 등록됨: `daily-scheduler`, `audit-waitlist`,
      `billing-cycle`, `quota-monitor`, `engine-smoke` (무료 티어 한도 10개 이내)
- [ ] SerpApi Automatic Early Renewal **켜짐**
- [ ] Vercel 프로덕션 환경변수 전부 등록 (`.env.example`과 대조)
- [ ] Neon 백업 정책 확인, `pg_dump` 1회 실행 성공
- [ ] CI가 main 푸시에서 통과

## 품질

- [ ] 골드 라벨 200건, recall ≥95%, precision ≥90%
- [ ] CI에 골드 라벨 게이트 연결됨
- [ ] `pnpm test:e2e`가 프로덕션 URL에서 통과
- [ ] `src/lib/detection/`·`src/lib/stats/`에서 I/O import 시 lint 에러

## 실측 기록

아래 값을 실제로 채운다. 비어 있으면 런치하지 않는다.

| 항목 | 설계 추정 | 실측 |
| --- | --- | --- |
| 측정 1회당 원가 | 50~110원 | __원 |
| Starter 월 원가 | 11,300원 | __원 |
| Starter 원가율 | 11% | __% |
| Business 월 원가 | 34,000원 | __원 |
| Business 원가율 | 12% | __% |
| 1차 판정 통과율 | 20~30% | __% |
| 월 고정비 | 68,000원 | __원 |
| 토스 수수료율 | 3% | __% |
| **손익분기** | Starter 2명 | **Starter __명** |
| 첫 수집 소요 시간 | 5~15분 | __분 |
| Trigger.dev 월 크레딧 | 미확정 | $__ |

## 실측이 설계와 크게 다를 때

- **원가율이 25%를 넘음** → 요금제를 다시 본다. 질의 수를 줄이거나 가격을 올린다
- **1차 통과율이 50%를 넘음** → 별칭 매칭이 너무 넓다. 판정 원가가 예상보다 높다
- **손익분기가 Starter 5명을 넘음** → 무료 진단 상한을 낮추거나 고정비를 줄인다
- **첫 수집이 20분을 넘음** → 동시성을 올리거나 온보딩 문구를 수정한다

## 런치 판정

위 항목을 전부 만족하면 런치한다.
만족하지 못한 항목이 있으면 여기에 적고, 그것이 런치를 막는지 판단한다.

**미충족 항목:**
-

**런치 결정:** (예 / 아니오)
**결정일:**
```

- [ ] **Step 3: 체크리스트를 실제로 실행**

위 문서의 모든 항목을 **하나씩 실제로 확인한다.** 확인하지 않은 항목을
체크하면 이 문서 전체가 무의미해진다.

특히 실측 표를 반드시 채운다 — 설계 문서가 "계산은 틀리고 실측만 맞는다"고
못박은 지점이다.

- [ ] **Step 4: README 갱신**

`README.md`에 운영 섹션을 추가한다:

````markdown
## 운영

- 장애 대응: [docs/RUNBOOK.md](docs/RUNBOOK.md)
- 관리자 콘솔: `/admin` (role='admin' 필요)
- 런치 체크리스트: [docs/superpowers/notes/2026-07-28-launch-checklist.md](docs/superpowers/notes/2026-07-28-launch-checklist.md)

### 정기 잡

| 잡 | 주기 | 하는 일 |
| --- | --- | --- |
| `daily-scheduler` | 매일 09:00 KST | 오늘 요일에 해당하는 브랜드 수집 |
| `billing-cycle` | 매일 10:00 KST | 기간이 끝난 구독 청구 |
| `quota-monitor` | 매일 09:00 KST | SerpApi 쿼터 감시, 80% 알림 |
| `audit-waitlist` | 매일 14:00 KST | 상한으로 대기 등록된 무료 진단 처리 |
| `engine-smoke` | 매주 일 10:00 KST | 엔진 4종 + 판정기 실호출 검증 |

### 판정 로직을 바꿀 때

1. `tests/golden/regression.test.ts` 통과 확인 (recall ≥95%, precision ≥90%)
2. `DETECTOR_VERSION` 증가
3. 배포
4. `/admin/rejudge`에서 재판정
5. 지표가 유의미하게 바뀌면 **고객에게 공지**
````

- [ ] **Step 5: 최종 커밋과 태그**

```bash
git add -A
git commit -m "docs: 런치 체크리스트와 운영 문서

6단계 완료: 적자를 첫 달에 발견할 수 있다."
git tag phase-6-complete
```

---

## 6단계 완료 조건

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] `/admin/cost`에 **실측** 고객별 원가율이 표시된다
- [ ] `/admin/runs`에 완전성·소요시간·원가가 채워져 있다
- [ ] `/admin/quota`에 예상 호출량과 권장 플랜이 보인다
- [ ] `engine-smoke`가 4개 엔진 + 판정기를 실제로 호출해 통과한다
- [ ] `engine-smoke` 실패 시 `OPS_ALERT_EMAIL`로 알림이 실제로 온다
- [ ] `quota-monitor`가 80% 도달 시 알림을 보낸다 (임계값을 낮춰 검증)
- [ ] 재판정이 기존 판정을 삭제하지 않고 새 버전을 추가한다
- [ ] 관리자 액션이 `admin_actions`에 기록된다
- [ ] `docs/RUNBOOK.md`가 있고 각 절차가 실행 가능한 명령을 담고 있다
- [ ] 런치 체크리스트의 **실측 표가 채워져 있다**

---

## 전체 완료

여섯 단계가 끝나면 아래가 성립한다.

- 방문자가 랜딩에서 20초 만에 실제 AI 답변 기반 진단을 받는다
- 결제하면 그 순간 첫 수집이 돌고 5~15분 뒤 완성된 대시보드를 본다
- 매주 자동으로 측정이 쌓이고, 신뢰구간이 겹치지 않을 때만 화살표가 뜬다
- 판정 정확도는 골드 라벨 200건으로 CI에서 강제된다
- 실측 원가율을 첫 달에 알 수 있다
- 엔진이 죽어도 데이터를 버리지 않고 기록한 뒤 배지를 붙인다
- 장애가 나면 런북을 본다

**남은 것은 설계 문서가 "2단계로 미룬다"고 한 것들이다:**
팀 계정(초대·권한·멀티테넌시), 진짜 종량제 과금. 요청이 실제로 들어오면 만든다.
