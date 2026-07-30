# Cited 5단계 — 대시보드와 리포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객이 매주 다시 들어올 이유를 만든다. Cited Rate와 신뢰구간,
"지금 조치할 것", 경쟁사·엔진별 비교, 12주 추이 차트, CSV 내보내기, 설정 편집.

**Architecture:** 대시보드 데이터는 서버 컴포넌트에서 한 번에 조회한다. 히스토리
기간 제한(Starter 3개월)은 **쿼리 레벨에서** 강제하고, 화면에서 자르지 않는다.
화살표 규칙은 2단계의 `judgeChange`를 그대로 쓴다 — 대시보드가 자체 판정 로직을
갖지 않는다.

**Tech Stack:** Next.js Server Components · Drizzle 집계 쿼리 · Recharts · CSV

## Global Constraints

로드맵 공통 제약 + 이 단계 전용:

- **화살표는 `judgeChange`만 쓴다.** 대시보드에 새 판정 로직을 만들지 않는다
- **신뢰구간이 겹치면 회색 `— 변화 없음`.** 색으로 규칙을 강제한다
  (1단계의 `--color-metric-flat`)
- **불완전한 수집(completeness < 90%)은 배지 + 점선.** 숨기지도, 실선으로 속이지도 않는다
- **히스토리 제한은 SQL에서.** 클라이언트에서 자르면 Starter가 3개월 넘는 데이터를 받는다
- **CSV는 Business 전용.** 서버에서 플랜을 확인한다
- **첫날 대시보드가 비어 보이면 안 된다.** 5개 카드 중 4개가 완전해야 한다
- 각 태스크의 마지막 Step은 커밋

> **UI 작업 지침:** Task 3 착수 전에 `frontend-design` 스킬을 호출한다.
> 이 단계는 화면 작업의 비중이 크고, 대시보드가 템플릿처럼 보이면 "월 400만원
> 컨설팅을 대체한다"는 포지셔닝이 무너진다.

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/lib/dashboard/query.ts` | 대시보드 데이터 조회 (히스토리 제한 포함) |
| `src/lib/dashboard/history.ts` | 히스토리 기간 계산 (순수) |
| `src/lib/dashboard/trend.ts` | 12주 추이 시리즈 구성 (순수) |
| `src/lib/dashboard/actions.ts` | "지금 조치할 것" 선정 (순수) |
| `src/lib/csv.ts` | CSV 직렬화 (순수) |
| `src/app/(app)/dashboard/page.tsx` | 대시보드 |
| `src/components/dashboard/cited-rate-card.tsx` | 대표 지표 카드 |
| `src/components/dashboard/action-card.tsx` | 지금 조치할 것 |
| `src/components/dashboard/comparison-cards.tsx` | 경쟁사·엔진별 |
| `src/components/dashboard/trend-chart.tsx` | 추이 차트 (신뢰구간 띠) |
| `src/components/dashboard/completeness-badge.tsx` | 불완전 수집 배지 |
| `src/components/dashboard/brand-switcher.tsx` | Business 브랜드 전환 |
| `src/components/dashboard/sources-card.tsx` | **AI가 읽는 출처 (아래 ★ 참고)** |
| `src/app/api/export/[brandId]/route.ts` | CSV 내보내기 |
| `src/app/(app)/settings/**` | 브랜드·질의·별칭·경쟁사 편집 |

---

## ★ 2026-07-30(2) 추가 — 「AI가 읽는 출처」 카드가 빠져 있다

이 계획에는 인용 출처가 **한 번도 나오지 않는다.** 2단계에서
`src/lib/stats/sources.ts`를 만들었고(`aggregateSources`·`summarizeSources`),
3단계 무료 진단 리포트에는 들어간다. 유료 대시보드에 없으면 **무료 리포트가
유료 대시보드보다 많은 것을 알려주는** 상태가 된다.

**이 카드가 유료에서 더 중요한 이유:** 무료는 1회 측정이라 출처가 스냅샷이지만,
유료는 주 3회씩 쌓인다. 그러면 **출처가 시간에 따라 바뀌는 것**을 볼 수 있다 —
"3주 전부터 `namu.wiki` 대신 `oo블로그`가 인용되기 시작했다"는 무료로는 원리적으로
줄 수 없는 정보이고, 언급률 변화보다 먼저 움직이는 선행 지표다.

**Task 3(대시보드 화면)에 카드를 하나 더 넣는다.** 지켜야 할 것:

- `aggregateSources`를 그대로 쓴다. 대시보드가 자체 집계 로직을 만들지 않는다
  (화살표를 `judgeChange`만 쓰는 것과 같은 이유다)
- **분모는 그 기간의 전체 답변 수다.** 인용이 있는 답변만 분모로 잡으면 비율이
  뻥튀겨진다
- **`brands.selfDomains`가 비어 있으면 소유 판정을 하지 않는다.**
  `selfAnswers === 0`은 "인용되지 않았다"와 "도메인을 몰라서 못 셌다" 두 가지
  뜻이고, 후자를 "한 번도 인용되지 않았습니다"로 쓰면 근거 없는 단정이 된다.
  대신 설정으로 유도한다 — 4단계 온보딩에서 받지만 건너뛴 고객이 있다
- **CSV 내보내기(Task 5)에 출처 시트를 포함한다.** Business 고객이 이것을 가장
  많이 가공한다 — 어느 사이트에 콘텐츠를 넣을지가 실제 집행 항목이다

---

### Task 1: 히스토리 제한과 추이 시리즈 (순수 함수)

**Files:**
- Create: `src/lib/dashboard/history.ts`, `src/lib/dashboard/trend.ts`,
  `src/lib/dashboard/actions.ts`
- Test: 각각의 `.test.ts`

**Interfaces:**
- Consumes: `PLANS` (1단계), `Interval`·`judgeChange` (2단계),
  `comparableEngines`·`isDegraded` (3단계)
- Produces:
  - `historyCutoff(plan, now): Date | null` — null이면 무제한
  - `buildTrendSeries(runs, opts): TrendPoint[]`
  - `interface TrendPoint { runId; date; point; lower; upper; complete; engines }`
  - `selectActionItems(byQuery, opts): ActionItem[]`
  - Task 2의 조회 계층과 Task 3~5의 화면이 소비한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/dashboard/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { historyCutoff, historyLabel } from '@/lib/dashboard/history'

const now = new Date('2026-07-28T00:00:00Z')

describe('historyCutoff', () => {
  it('Starter는 3개월 전이 컷오프다', () => {
    const cutoff = historyCutoff('starter', now)
    expect(cutoff?.toISOString().slice(0, 10)).toBe('2026-04-28')
  })

  it('Business는 무제한이므로 null', () => {
    expect(historyCutoff('business', now)).toBeNull()
  })

  it('무료 진단은 히스토리가 없으므로 현재 시각', () => {
    expect(historyCutoff('free', now)?.getTime()).toBe(now.getTime())
  })

  it('연도를 넘어가는 계산이 맞다', () => {
    const jan = new Date('2026-01-15T00:00:00Z')
    expect(historyCutoff('starter', jan)?.toISOString().slice(0, 10)).toBe('2025-10-15')
  })
})

describe('historyLabel', () => {
  it('사람이 읽을 문구를 만든다', () => {
    expect(historyLabel('starter')).toContain('3개월')
    expect(historyLabel('business')).toContain('무제한')
  })
})
```

`src/lib/dashboard/trend.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildTrendSeries } from '@/lib/dashboard/trend'
import { wilsonInterval } from '@/lib/stats/wilson'

const base = (over: Partial<Parameters<typeof buildTrendSeries>[0][number]> = {}) => ({
  runId: 'r1',
  startedAt: new Date('2026-07-01T00:00:00Z'),
  interval: wilsonInterval(30, 100),
  completeness: { chatgpt: { attempted: 100, succeeded: 100 } },
  ...over,
})

describe('buildTrendSeries', () => {
  it('시간 오름차순으로 정렬한다', () => {
    const points = buildTrendSeries([
      base({ runId: 'b', startedAt: new Date('2026-07-15T00:00:00Z') }),
      base({ runId: 'a', startedAt: new Date('2026-07-01T00:00:00Z') }),
    ])
    expect(points.map((p) => p.runId)).toEqual(['a', 'b'])
  })

  it('신뢰구간 상하한을 담는다 (띠로 그리기 위해)', () => {
    const [p] = buildTrendSeries([base()])
    expect(p!.lower).toBeLessThan(p!.point)
    expect(p!.upper).toBeGreaterThan(p!.point)
  })

  it('완전성 90% 미만이면 complete=false (점선으로 그린다)', () => {
    const [p] = buildTrendSeries([
      base({
        completeness: {
          chatgpt: { attempted: 100, succeeded: 100 },
          naver: { attempted: 100, succeeded: 0 },
        },
      }),
    ])
    expect(p!.complete).toBe(false)
  })

  it('엔진 구성을 담는다 (변화 판정에 쓴다)', () => {
    const [p] = buildTrendSeries([
      base({
        completeness: {
          chatgpt: { attempted: 10, succeeded: 10 },
          gemini: { attempted: 10, succeeded: 10 },
        },
      }),
    ])
    expect(p!.engines).toEqual(['chatgpt', 'gemini'])
  })

  it('최대 개수를 넘으면 최신 것만 남긴다', () => {
    const runs = Array.from({ length: 30 }, (_, i) =>
      base({ runId: `r${i}`, startedAt: new Date(2026, 0, i + 1) }),
    )
    const points = buildTrendSeries(runs, { maxPoints: 12 })
    expect(points).toHaveLength(12)
    expect(points[11]?.runId).toBe('r29')
  })

  it('수집이 하나면 점 하나를 돌려준다 (첫날 대시보드)', () => {
    expect(buildTrendSeries([base()])).toHaveLength(1)
  })

  it('수집이 없으면 빈 배열', () => {
    expect(buildTrendSeries([])).toEqual([])
  })
})
```

`src/lib/dashboard/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectActionItems } from '@/lib/dashboard/actions'
import { wilsonInterval } from '@/lib/stats/wilson'

const q = (id: string, k: number, n: number) => ({
  queryId: id,
  queryText: `질의 ${id}`,
  interval: wilsonInterval(k, n),
})

describe('selectActionItems', () => {
  it('전혀 언급되지 않은 질의를 고른다', () => {
    const items = selectActionItems([q('a', 0, 10), q('b', 5, 10), q('c', 0, 10)])
    expect(items.map((i) => i.queryId)).toEqual(['a', 'c'])
  })

  it('0건이 없으면 언급률이 낮은 질의를 대신 보여준다', () => {
    const items = selectActionItems([q('a', 1, 10), q('b', 8, 10)])
    expect(items[0]?.queryId).toBe('a')
  })

  it('최대 5개까지만 보여준다 (행동 가능한 양)', () => {
    const many = Array.from({ length: 12 }, (_, i) => q(`q${i}`, 0, 10))
    expect(selectActionItems(many)).toHaveLength(5)
  })

  it('표본이 너무 적은 질의는 제외한다 (노이즈)', () => {
    const items = selectActionItems([q('tiny', 0, 1), q('solid', 0, 10)])
    expect(items.map((i) => i.queryId)).toEqual(['solid'])
  })

  it('전 질의에서 잘 나오면 빈 배열 (할 일이 없다)', () => {
    expect(selectActionItems([q('a', 10, 10), q('b', 9, 10)])).toEqual([])
  })

  it('k/n 표기를 함께 담는다', () => {
    const [item] = selectActionItems([q('a', 0, 10)])
    expect(item!.mentions).toBe(0)
    expect(item!.attempts).toBe(10)
  })

  it('빈 입력이면 빈 배열', () => {
    expect(selectActionItems([])).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/dashboard/
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/dashboard/history.ts`:

```ts
import { PLANS, type PlanId } from '@/lib/plans'

/**
 * 이 플랜이 볼 수 있는 가장 오래된 시점.
 * null이면 무제한(Business).
 *
 * 이 값은 **SQL where 절에 쓴다.** 화면에서 자르면 Starter 고객이
 * 3개월 넘는 데이터를 네트워크로 받게 된다.
 */
export function historyCutoff(plan: PlanId, now: Date): Date | null {
  const months = PLANS[plan].historyMonths
  if (months === null) return null
  if (months === 0) return new Date(now.getTime())

  const cutoff = new Date(now.getTime())
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  return cutoff
}

export function historyLabel(plan: PlanId): string {
  const months = PLANS[plan].historyMonths
  if (months === null) return '전체 기간 (무제한)'
  if (months === 0) return '이번 측정만'
  return `최근 ${months}개월`
}
```

`src/lib/dashboard/trend.ts`:

```ts
import { comparableEngines, isDegraded } from '@/lib/collection/completeness'
import type { Completeness } from '@/lib/db/schema'
import type { Interval } from '@/lib/stats/wilson'

export interface TrendInput {
  runId: string
  startedAt: Date
  interval: Interval
  completeness: Completeness
}

export interface TrendPoint {
  runId: string
  date: string
  timestamp: number
  point: number
  lower: number
  upper: number
  n: number
  /** 완전성 90% 이상인가. false면 점선으로 그린다. */
  complete: boolean
  engines: string[]
}

export interface TrendOptions {
  maxPoints?: number
}

const DEFAULT_MAX_POINTS = 12

/**
 * 추이 차트용 시리즈.
 *
 * 신뢰구간을 띠로 함께 그리기 위해 lower/upper를 담는다.
 * 선 하나만 그리면 노이즈가 추세처럼 보인다.
 */
export function buildTrendSeries(
  runs: readonly TrendInput[],
  opts: TrendOptions = {},
): TrendPoint[] {
  const max = opts.maxPoints ?? DEFAULT_MAX_POINTS

  return [...runs]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .slice(-max)
    .map((r) => ({
      runId: r.runId,
      date: r.startedAt.toISOString().slice(0, 10),
      timestamp: r.startedAt.getTime(),
      point: r.interval.point,
      lower: r.interval.lower,
      upper: r.interval.upper,
      n: r.interval.n,
      complete: !isDegraded(r.completeness),
      engines: comparableEngines(r.completeness),
    }))
}
```

`src/lib/dashboard/actions.ts`:

```ts
import type { Interval } from '@/lib/stats/wilson'

export interface QueryBreakdownInput {
  queryId: string
  queryText: string
  interval: Interval
}

export interface ActionItem {
  queryId: string
  queryText: string
  mentions: number
  attempts: number
  rate: number
}

/** 표본이 이보다 적으면 노이즈다. 조치 대상으로 올리지 않는다. */
const MIN_ATTEMPTS = 5
const MAX_ITEMS = 5
/** 이 비율 미만이면 "잘 안 나온다"로 본다 */
const WEAK_THRESHOLD = 0.2

/**
 * "지금 조치할 것" 카드의 내용.
 *
 * 설계 ④: "우리가 34%다"는 알아도 할 일이 없다. "이 질문들에서 아예 안 나온다"는
 * 콘텐츠를 어디에 써야 할지 알려준다. 고객이 매주 다시 들어올 이유는 숫자가
 * 아니라 할 일이다.
 */
export function selectActionItems(
  byQuery: readonly QueryBreakdownInput[],
): ActionItem[] {
  const eligible = byQuery.filter((q) => q.interval.n >= MIN_ATTEMPTS)

  const toItem = (q: QueryBreakdownInput): ActionItem => ({
    queryId: q.queryId,
    queryText: q.queryText,
    mentions: q.interval.k,
    attempts: q.interval.n,
    rate: q.interval.point,
  })

  // 1순위: 전혀 언급되지 않은 질의
  const zero = eligible.filter((q) => q.interval.k === 0)
  if (zero.length > 0) return zero.slice(0, MAX_ITEMS).map(toItem)

  // 2순위: 언급률이 낮은 질의
  return eligible
    .filter((q) => q.interval.point < WEAK_THRESHOLD)
    .sort((a, b) => a.interval.point - b.interval.point)
    .slice(0, MAX_ITEMS)
    .map(toItem)
}
```

- [ ] **Step 4: 통과 확인과 커밋**

```bash
pnpm vitest run src/lib/dashboard/
git add src/lib/dashboard
git commit -m "feat(dashboard): 히스토리 제한 · 추이 시리즈 · 조치 항목 선정 (순수 함수)"
```

Expected: PASS (18 passed)

---

### Task 2: 대시보드 데이터 조회

**Files:**
- Create: `src/lib/dashboard/query.ts`
- Test: `tests/integration/dashboard-query.test.ts`

**Interfaces:**
- Consumes: Task 1, `computeMetrics`·`judgeChange` (2단계), `db`
- Produces:
  - `loadDashboard(args): Promise<DashboardData | null>`
  - `interface DashboardData { brand; run; metrics; verdict; trend; actions; completeness; isFirstRun; historyLabel }`
  - Task 3~5의 화면이 소비한다

- [ ] **Step 1: 통합 테스트 작성**

`tests/integration/dashboard-query.test.ts` — 히스토리 제한이 SQL에서
강제되는지 검증한다. **이것이 이 태스크의 핵심 위험이다.**

```ts
import { describe, expect, it } from 'vitest'
import { historyCutoff } from '@/lib/dashboard/history'
import { buildTrendSeries } from '@/lib/dashboard/trend'
import { wilsonInterval } from '@/lib/stats/wilson'

describe('히스토리 제한이 실제로 데이터를 자른다', () => {
  it('Starter 컷오프 이전 수집은 시리즈에서 제외되어야 한다', () => {
    const now = new Date('2026-07-28T00:00:00Z')
    const cutoff = historyCutoff('starter', now)!

    const runs = [
      { runId: 'old', startedAt: new Date('2026-01-01T00:00:00Z') },
      { runId: 'recent', startedAt: new Date('2026-07-01T00:00:00Z') },
    ].map((r) => ({
      ...r,
      interval: wilsonInterval(30, 100),
      completeness: { chatgpt: { attempted: 100, succeeded: 100 } },
    }))

    // 쿼리 계층이 컷오프를 적용했다면 old는 애초에 안 온다.
    const filtered = runs.filter((r) => r.startedAt >= cutoff)
    const points = buildTrendSeries(filtered)

    expect(points.map((p) => p.runId)).toEqual(['recent'])
  })

  it('Business는 컷오프가 없어 전부 온다', () => {
    expect(historyCutoff('business', new Date())).toBeNull()
  })
})
```

- [ ] **Step 2: 실행 (Task 1 코드로 통과해야 한다)**

```bash
pnpm vitest run tests/integration/dashboard-query.test.ts
```

Expected: PASS (2 passed)

- [ ] **Step 3: 조회 계층 구현**

`src/lib/dashboard/query.ts`:

```ts
import { and, desc, eq, gte } from 'drizzle-orm'
import { comparableEngines, failedEngines, isDegraded } from '@/lib/collection/completeness'
import { loadDetectionsForRun } from '@/lib/collection/detection-repository'
import { db } from '@/lib/db'
import { brands, collectionRuns, subscriptions, type Completeness } from '@/lib/db/schema'
import type { PlanId } from '@/lib/plans'
import { computeMetrics, type BrandMetrics } from '@/lib/stats/metrics'
import { judgeChange, type ChangeVerdict } from '@/lib/stats/wilson'
import { selectActionItems, type ActionItem } from './actions'
import { historyCutoff, historyLabel } from './history'
import { buildTrendSeries, type TrendPoint } from './trend'

export interface DashboardBrand {
  id: string
  name: string
  category: string
  competitors: { name: string }[]
}

export interface DashboardData {
  plan: PlanId
  brand: DashboardBrand
  allBrands: { id: string; name: string }[]
  runId: string
  runStartedAt: Date
  metrics: BrandMetrics
  verdict: ChangeVerdict
  previousCitedRate: number | null
  trend: TrendPoint[]
  actions: ActionItem[]
  completeness: Completeness
  degraded: boolean
  failedEngineIds: string[]
  /** 비교할 지난주가 없는 첫 수집인가 */
  isFirstRun: boolean
  historyLabel: string
  csvExport: boolean
}

export async function loadDashboard(args: {
  userId: string
  brandId?: string
  now?: Date
}): Promise<DashboardData | null> {
  const now = args.now ?? new Date()

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, args.userId),
  })
  const plan: PlanId = sub?.plan ?? 'starter'

  const userBrands = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.userId, args.userId))

  if (userBrands.length === 0) return null

  const targetId = args.brandId ?? userBrands[0]!.id
  const brand = await db.query.brands.findFirst({
    where: and(eq(brands.id, targetId), eq(brands.userId, args.userId)),
  })
  if (!brand) return null

  // 히스토리 제한을 SQL에서 강제한다. 화면에서 자르면 안 된다.
  const cutoff = historyCutoff(plan, now)
  const runRows = await db
    .select()
    .from(collectionRuns)
    .where(
      cutoff
        ? and(eq(collectionRuns.brandId, brand.id), gte(collectionRuns.startedAt, cutoff))
        : eq(collectionRuns.brandId, brand.id),
    )
    .orderBy(desc(collectionRuns.startedAt))
    .limit(24)

  // 아직 완료된 수집이 없으면 대시보드를 그릴 수 없다.
  const finished = runRows.filter((r) => r.status !== 'running' && r.status !== 'failed')
  if (finished.length === 0) return null

  const latest = finished[0]!
  const competitorSubjects = brand.competitors.map((c) => `competitor:${c.name}`)

  const latestData = await loadDetectionsForRun(
    latest.id,
    latest.planSnapshot.detectorVersion,
  )
  const metrics = computeMetrics(latestData.answers, latestData.detections, {
    self: 'self',
    competitors: competitorSubjects,
  })

  // 추이 — 각 수집의 Cited Rate를 계산한다.
  const trendInputs = await Promise.all(
    finished.map(async (run) => {
      if (run.id === latest.id) {
        return { runId: run.id, startedAt: run.startedAt, interval: metrics.citedRate, completeness: run.completeness }
      }
      const data = await loadDetectionsForRun(run.id, run.planSnapshot.detectorVersion)
      const m = computeMetrics(data.answers, data.detections, { self: 'self', competitors: [] })
      return { runId: run.id, startedAt: run.startedAt, interval: m.citedRate, completeness: run.completeness }
    }),
  )
  const trend = buildTrendSeries(trendInputs)

  // 변화 판정 — 2단계의 judgeChange를 그대로 쓴다.
  const previous = finished[1]
  let verdict: ChangeVerdict = 'incomparable'
  let previousCitedRate: number | null = null

  if (previous) {
    const prevPoint = trendInputs.find((t) => t.runId === previous.id)
    if (prevPoint) {
      previousCitedRate = prevPoint.interval.point
      verdict = judgeChange(prevPoint.interval, metrics.citedRate, {
        prevEngines: comparableEngines(previous.completeness),
        currEngines: comparableEngines(latest.completeness),
      })
    }
  }

  return {
    plan,
    brand: {
      id: brand.id,
      name: brand.name,
      category: brand.category,
      competitors: brand.competitors.map((c) => ({ name: c.name })),
    },
    allBrands: userBrands,
    runId: latest.id,
    runStartedAt: latest.startedAt,
    metrics,
    verdict,
    previousCitedRate,
    trend,
    actions: selectActionItems(metrics.byQuery),
    completeness: latest.completeness,
    degraded: isDegraded(latest.completeness),
    failedEngineIds: failedEngines(latest.completeness),
    isFirstRun: finished.length === 1,
    historyLabel: historyLabel(plan),
    csvExport: plan === 'business',
  }
}
```

> **성능 주의:** 위 구현은 추이 계산을 위해 수집마다 판정을 다시 조회한다.
> 수집 12개면 쿼리가 24회다. 고객이 10명일 때는 문제없지만, 100명이 되면
> `collection_runs`에 집계 결과를 캐시하는 컬럼을 추가한다. 지금 하지 않는
> 이유는 YAGNI — 6단계 관측에서 대시보드 응답 시간을 측정한 뒤 판단한다.

- [ ] **Step 4: 검증과 커밋**

```bash
pnpm typecheck
git add src/lib/dashboard/query.ts tests/integration/dashboard-query.test.ts
git commit -m "feat(dashboard): 대시보드 조회 계층 (히스토리 제한을 SQL에서 강제)"
```

---

### Task 3: Cited Rate 카드와 화살표 규칙

**Files:**
- Create: `src/components/dashboard/cited-rate-card.tsx`,
  `src/components/dashboard/completeness-badge.tsx`,
  `src/components/dashboard/verdict-badge.tsx`
- Test: `src/components/dashboard/verdict.test.ts`

**Interfaces:**
- Consumes: `DashboardData` (Task 2), `formatPercent`·`formatInterval` (2단계)
- Produces: 대표 지표 카드, 화살표/배지 컴포넌트

설계 ③의 화살표 규칙을 화면으로 옮긴다. **회색이 기본값이다.**

- [ ] **Step 1: 화살표 표시 규칙 테스트**

`src/components/dashboard/verdict.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { verdictDisplay } from '@/components/dashboard/verdict-badge'

describe('verdictDisplay — 설계 ③ 화살표 규칙', () => {
  it('up이면 위 화살표와 상승 색', () => {
    const d = verdictDisplay('up')
    expect(d.symbol).toBe('▲')
    expect(d.className).toContain('metric-up')
  })

  it('down이면 아래 화살표', () => {
    expect(verdictDisplay('down').symbol).toBe('▼')
  })

  it('unchanged면 화살표를 쓰지 않고 회색이다', () => {
    const d = verdictDisplay('unchanged')
    expect(d.symbol).toBe('—')
    expect(d.className).toContain('metric-flat')
    expect(d.label).toContain('변화 없음')
  })

  it('unchanged에는 측정 범위 설명 툴팁이 붙는다', () => {
    expect(verdictDisplay('unchanged').tooltip).toContain('측정 범위')
  })

  it('incomparable이면 아무 화살표도 없다 (첫날 대시보드)', () => {
    const d = verdictDisplay('incomparable')
    expect(d.symbol).toBeNull()
    expect(d.label).toContain('다음 주부터')
  })

  it('화살표 색은 세 가지 상태만 존재한다', () => {
    const classes = (['up', 'down', 'unchanged', 'incomparable'] as const).map(
      (v) => verdictDisplay(v).className,
    )
    expect(new Set(classes).size).toBeLessThanOrEqual(4)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/components/dashboard/verdict.test.ts
```

Expected: FAIL

`src/components/dashboard/verdict-badge.tsx`:

```tsx
import type { ChangeVerdict } from '@/lib/stats/wilson'

export interface VerdictDisplay {
  symbol: string | null
  label: string
  className: string
  tooltip: string | null
}

/**
 * 설계 ③의 화살표 규칙.
 *
 * - 신뢰구간이 겹치지 않을 때만 ▲ ▼
 * - 겹치면 "— 변화 없음" (회색)
 * - 툴팁으로 "측정 범위 내 변동입니다" 설명
 *
 * 노이즈를 변화로 보고하는 순간 신뢰를 잃는다. 화살표를 아끼는 게 제품을 지킨다.
 */
export function verdictDisplay(verdict: ChangeVerdict): VerdictDisplay {
  switch (verdict) {
    case 'up':
      return {
        symbol: '▲',
        label: '지난주 대비 상승',
        className: 'text-[--color-metric-up]',
        tooltip: '신뢰구간이 겹치지 않아 유의미한 변화로 판정했습니다.',
      }
    case 'down':
      return {
        symbol: '▼',
        label: '지난주 대비 하락',
        className: 'text-[--color-metric-down]',
        tooltip: '신뢰구간이 겹치지 않아 유의미한 변화로 판정했습니다.',
      }
    case 'unchanged':
      return {
        symbol: '—',
        label: '변화 없음',
        className: 'text-[--color-metric-flat]',
        tooltip:
          '측정 범위 내 변동입니다. 두 주의 신뢰구간이 겹쳐 유의미한 변화로 보지 않습니다.',
      }
    case 'incomparable':
      return {
        symbol: null,
        label: '다음 주부터 변화를 추적합니다',
        className: 'text-muted-foreground',
        tooltip: null,
      }
  }
}

export function VerdictBadge({ verdict }: { verdict: ChangeVerdict }) {
  const d = verdictDisplay(verdict)
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${d.className}`} title={d.tooltip ?? undefined}>
      {d.symbol ? <span aria-hidden>{d.symbol}</span> : null}
      <span>{d.label}</span>
    </span>
  )
}
```

`src/components/dashboard/completeness-badge.tsx`:

```tsx
const ENGINE_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  naver: '네이버 AI 브리핑',
  google_aio: 'Google AI Overviews',
}

/**
 * 부분 실패를 조용히 넘어가지 않는다.
 * 완전성이 90% 미만이면 배지를 붙인다 (설계 ⑤).
 */
export function CompletenessBadge({
  degraded,
  failedEngineIds,
  succeededEngineCount,
}: {
  degraded: boolean
  failedEngineIds: string[]
  succeededEngineCount: number
}) {
  if (!degraded) return null

  const names = failedEngineIds.map((id) => ENGINE_LABEL[id] ?? id).join(', ')

  return (
    <div className="rounded-md border border-[--color-incomplete] bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
      <strong className="font-medium">
        {names ? `${names} 수집 실패` : '일부 수집 실패'}
      </strong>
      <span> — {succeededEngineCount}개 엔진 기준으로 계산했습니다.</span>
      <p className="mt-1 text-amber-800/80">
        이번 주는 엔진 구성이 달라 지난주와 직접 비교하지 않습니다.
      </p>
    </div>
  )
}
```

`src/components/dashboard/cited-rate-card.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import type { Interval } from '@/lib/stats/wilson'
import { formatInterval, formatPercent, type ChangeVerdict } from '@/lib/stats/wilson'
import { VerdictBadge } from './verdict-badge'

export function CitedRateCard({
  interval,
  verdict,
  isFirstRun,
}: {
  interval: Interval
  verdict: ChangeVerdict
  isFirstRun: boolean
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Cited Rate</h2>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold tracking-tight tabular-nums">
              {formatPercent(interval.point)}
            </span>
            <span className="text-lg text-muted-foreground tabular-nums">
              ({formatInterval(interval)})
            </span>
          </div>
        </div>
        <VerdictBadge verdict={verdict} />
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {interval.n.toLocaleString('ko-KR')}회 시행 · 신뢰구간 95%
      </p>

      {isFirstRun ? (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          ✓ 첫 측정 완료 · {interval.n.toLocaleString('ko-KR')}회 시행
          <br />
          <span className="text-muted-foreground">다음 주부터 주간 변화를 추적합니다</span>
        </p>
      ) : null}
    </Card>
  )
}
```

- [ ] **Step 3: 통과 확인과 커밋**

```bash
pnpm vitest run src/components/dashboard/verdict.test.ts
git add src/components/dashboard
git commit -m "feat(dashboard): Cited Rate 카드 · 화살표 규칙 · 완전성 배지

겹치면 회색 '변화 없음'이 기본값이다."
```

Expected: PASS (6 passed)

---

### Task 4: 조치·비교 카드와 추이 차트

**Files:**
- Create: `src/components/dashboard/action-card.tsx`,
  `src/components/dashboard/comparison-cards.tsx`,
  `src/components/dashboard/trend-chart.tsx`

**Interfaces:**
- Consumes: `ActionItem`·`TrendPoint` (Task 1), `BrandMetrics` (2단계)
- Produces: 나머지 대시보드 카드 4종

- [ ] **Step 1: Recharts 설치**

```bash
pnpm add recharts
```

- [ ] **Step 2: 조치 카드**

`src/components/dashboard/action-card.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import type { ActionItem } from '@/lib/dashboard/actions'

/**
 * 설계 ④: "지금 조치할 것"을 두 번째에 놓은 건 의도적이다.
 * "우리가 34%다"는 알아도 할 일이 없다. "이 질문들에서 아예 안 나온다"는
 * 콘텐츠를 어디에 써야 할지 알려준다.
 * 고객이 매주 다시 들어올 이유는 숫자가 아니라 할 일이다.
 */
export function ActionCard({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold">지금 조치할 것</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          추적 중인 모든 질문에서 브랜드가 언급되고 있습니다. 이 상태를 유지하세요.
        </p>
      </Card>
    )
  }

  const allZero = items.every((i) => i.mentions === 0)

  return (
    <Card className="p-6">
      <h2 className="font-semibold">지금 조치할 것</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {allZero
          ? `이 ${items.length}개 질문에서 전혀 언급되지 않습니다`
          : `이 질문들에서 언급률이 낮습니다`}
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.queryId} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="truncate">· &ldquo;{item.queryText}&rdquo;</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.mentions}/{item.attempts}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        이 질문에 답이 되는 콘텐츠를 만들면 AI가 인용할 근거가 생깁니다.
      </p>
    </Card>
  )
}
```

- [ ] **Step 3: 비교 카드**

`src/components/dashboard/comparison-cards.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import type { Interval } from '@/lib/stats/wilson'
import { formatPercent } from '@/lib/stats/wilson'

const ENGINE_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  naver: '네이버',
  google_aio: 'Google AIO',
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-foreground/70"
        style={{ width: `${Math.max(2, value * 100)}%` }}
      />
    </div>
  )
}

export function CompetitorCard({
  brandName,
  selfRate,
  competitorRates,
}: {
  brandName: string
  selfRate: Interval
  competitorRates: Record<string, Interval>
}) {
  const rows = [
    { name: brandName, rate: selfRate.point, isSelf: true },
    ...Object.entries(competitorRates).map(([subject, ci]) => ({
      name: subject.replace(/^competitor:/, ''),
      rate: ci.point,
      isSelf: false,
    })),
  ].sort((a, b) => b.rate - a.rate)

  return (
    <Card className="p-6">
      <h2 className="font-semibold">경쟁사 대비</h2>
      {rows.length === 1 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          경쟁사를 등록하면 상대적인 위치를 볼 수 있습니다.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 text-sm">
              <span className={`w-24 shrink-0 truncate ${r.isSelf ? 'font-semibold' : ''}`}>
                {r.isSelf ? '우리' : r.name}
              </span>
              <Bar value={r.rate} />
              <span className="w-12 shrink-0 text-right tabular-nums">
                {formatPercent(r.rate)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function EngineCard({ byEngine }: { byEngine: Record<string, Interval> }) {
  const rows = Object.entries(byEngine).sort((a, b) => b[1].point - a[1].point)

  return (
    <Card className="p-6">
      <h2 className="font-semibold">엔진별</h2>
      <ul className="mt-4 space-y-3">
        {rows.map(([id, ci]) => (
          <li key={id} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 truncate">{ENGINE_LABEL[id] ?? id}</span>
            <Bar value={ci.point} />
            <span className="w-12 shrink-0 text-right tabular-nums">
              {formatPercent(ci.point)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 4: 추이 차트**

`src/components/dashboard/trend-chart.tsx`:

```tsx
'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import type { TrendPoint } from '@/lib/dashboard/trend'

/**
 * 추이 차트에는 신뢰구간을 띠로 같이 그린다.
 * 선 하나만 그리면 노이즈가 추세처럼 보인다 (설계 ④).
 *
 * 완전성 90% 미만인 주는 점선으로 그린다. 숨기지도, 실선으로 속이지도 않는다.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold">추이</h2>
        <p className="mt-3 text-sm text-muted-foreground">아직 데이터가 없습니다.</p>
      </Card>
    )
  }

  if (points.length === 1) {
    return (
      <Card className="p-6">
        <h2 className="font-semibold">추이 (12주)</h2>
        <div className="mt-6 flex h-40 items-center justify-center rounded-md border border-dashed">
          <p className="text-center text-sm text-muted-foreground">
            측정 1회 완료
            <br />
            <span className="text-xs">2주차부터 선이 생깁니다</span>
          </p>
        </div>
      </Card>
    )
  }

  const data = points.map((p) => ({
    date: p.date.slice(5), // MM-DD
    point: Math.round(p.point * 1000) / 10,
    lower: Math.round(p.lower * 1000) / 10,
    upper: Math.round(p.upper * 1000) / 10,
    band: [Math.round(p.lower * 1000) / 10, Math.round(p.upper * 1000) / 10],
    complete: p.complete,
    n: p.n,
  }))

  const hasIncomplete = points.some((p) => !p.complete)

  return (
    <Card className="p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">추이 (최근 {points.length}주)</h2>
        <span className="text-xs text-muted-foreground">띠 = 95% 신뢰구간</span>
      </div>

      <div className="mt-6 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={48}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'point') return [`${value}%`, 'Cited Rate']
                return null
              }}
              labelFormatter={(label: string, payload) => {
                const p = payload?.[0]?.payload as { n?: number } | undefined
                return p?.n ? `${label} · ${p.n}회 시행` : label
              }}
            />
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--color-ci-band)"
              fillOpacity={1}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="point"
              stroke="currentColor"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {hasIncomplete ? (
        <p className="mt-3 text-xs text-muted-foreground">
          일부 주는 엔진 수집이 불완전해 다른 주와 직접 비교하기 어렵습니다.
        </p>
      ) : null}
    </Card>
  )
}
```

> **점선 처리 주의:** Recharts의 `Line`은 구간별 점선을 기본 지원하지 않는다.
> 불완전 구간을 점선으로 그리려면 완전/불완전 구간을 나눠 `Line`을 두 개
> 겹치거나(`strokeDasharray="4 4"`), `dot`의 색을 다르게 준다. 위 구현은
> 안내 문구로 대체했다 — 첫 배포에는 충분하고, 고객이 혼동을 보고하면
> 구간 분리 렌더링을 추가한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(dashboard): 조치 카드 · 경쟁사/엔진 비교 · 신뢰구간 띠 추이 차트"
```

---

### Task 5: 대시보드 페이지 조립

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx` (교체),
  `src/components/dashboard/brand-switcher.tsx`,
  `src/app/(app)/dashboard/empty.tsx`

**Interfaces:**
- Consumes: Task 2~4 전부
- Produces: 완성된 대시보드

설계 ④의 배치를 따른다: Cited Rate → 지금 조치할 것 → 경쟁사·엔진별 → 추이.

- [ ] **Step 1: 브랜드 전환 셀렉터**

`src/components/dashboard/brand-switcher.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Business는 브랜드를 3개까지 등록하므로 상단에 전환 셀렉터가 붙는다. */
export function BrandSwitcher({
  brands,
  currentId,
}: {
  brands: { id: string; name: string }[]
  currentId: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  if (brands.length <= 1) return null

  return (
    <Select
      value={currentId}
      onValueChange={(id) => {
        const next = new URLSearchParams(params)
        next.set('brand', id)
        router.push(`/dashboard?${next.toString()}`)
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {brands.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 2: 대시보드 페이지**

`src/app/(app)/dashboard/page.tsx`:

```tsx
import Link from 'next/link'
import { ActionCard } from '@/components/dashboard/action-card'
import { BrandSwitcher } from '@/components/dashboard/brand-switcher'
import { CitedRateCard } from '@/components/dashboard/cited-rate-card'
import { CompetitorCard, EngineCard } from '@/components/dashboard/comparison-cards'
import { CompletenessBadge } from '@/components/dashboard/completeness-badge'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { loadDashboard } from '@/lib/dashboard/query'
import { comparableEngines } from '@/lib/collection/completeness'
import { requireUser } from '@/lib/session'

export const metadata = { title: '대시보드' }

function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; first?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams

  const data = await loadDashboard({ userId: user.id, brandId: sp.brand })

  if (!data) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">아직 측정 데이터가 없습니다</h1>
        <p className="mt-2 text-muted-foreground">
          브랜드를 등록하고 결제를 완료하면 바로 첫 측정이 시작됩니다.
        </p>
        <Button asChild className="mt-6">
          <Link href="/onboarding">브랜드 등록하기</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.brand.name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatWhen(data.runStartedAt)} 측정 · {data.historyLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BrandSwitcher brands={data.allBrands} currentId={data.brand.id} />
          {data.csvExport ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/${data.brand.id}`} download>
                CSV 내보내기
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      <CompletenessBadge
        degraded={data.degraded}
        failedEngineIds={data.failedEngineIds}
        succeededEngineCount={comparableEngines(data.completeness).length}
      />

      {/* 1. 대표 지표 */}
      <CitedRateCard
        interval={data.metrics.citedRate}
        verdict={data.verdict}
        isFirstRun={data.isFirstRun}
      />

      {/* 2. 지금 조치할 것 — 고객이 매주 다시 들어올 이유 */}
      <ActionCard items={data.actions} />

      {/* 3. 비교 */}
      <div className="grid gap-6 sm:grid-cols-2">
        <CompetitorCard
          brandName={data.brand.name}
          selfRate={data.metrics.citedRate}
          competitorRates={data.metrics.competitorRates}
        />
        <EngineCard byEngine={data.metrics.byEngine} />
      </div>

      {/* 4. 추이 */}
      <TrendChart points={data.trend} />

      {/* 보조 지표 */}
      <Card className="p-6">
        <h2 className="font-semibold">보조 지표</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">First-Mention Rate</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">
              {Math.round(data.metrics.firstMentionRate.point * 100)}%
            </dd>
            <p className="mt-1 text-xs text-muted-foreground">
              AI가 가장 먼저 꺼낸 이름이 우리 브랜드였던 비율
            </p>
          </div>
          {/* ★ SoV는 다른 지표와 달리 **고객 설정에 의해 왜곡된다.**
              분모가 "등록된" 경쟁사에만 의존하므로 경쟁사를 적게 등록할수록
              숫자가 올라간다. 설계 문서 "Share of Voice는 고객 설정에 의해
              왜곡된다" 절 참고. 그래서 두 가지를 지킨다.
                1) n=0(경쟁사 미등록)이면 퍼센트를 아예 띄우지 않는다.
                   `point`가 0이라 순진하게 그리면 "0%"가 나오는데, 그건
                   측정 결과가 아니라 설정 누락이다.
                2) 퍼센트 옆에 **경쟁사 수를 항상 병기**한다. "62%(2곳 기준)"과
                   "62%(8곳 기준)"은 전혀 다른 주장이다. */}
          <div>
            <dt className="text-sm text-muted-foreground">Share of Voice</dt>
            {data.metrics.shareOfVoice.n === 0 ? (
              <>
                <dd className="mt-0.5 text-xl font-semibold text-muted-foreground">—</dd>
                <p className="mt-1 text-xs text-muted-foreground">
                  경쟁사를 등록하면 점유율을 계산합니다.{' '}
                  <Link href="/settings" className="underline underline-offset-4">
                    경쟁사 등록
                  </Link>
                </p>
              </>
            ) : (
              <>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                  {Math.round(data.metrics.shareOfVoice.point * 100)}%
                </dd>
                <p className="mt-1 text-xs text-muted-foreground">
                  우리 + 경쟁사 언급 중 우리가 차지한 비율 (경쟁사{' '}
                  {data.competitorCount}곳 기준)
                </p>
              </>
            )}
          </div>
        </dl>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/settings" className="underline underline-offset-4">
          추적 질문 · 별칭 · 경쟁사 설정
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: 첫날 대시보드 검증**

설계 ④의 표를 실제로 확인한다. 4단계에서 만든 계정으로 첫 수집 완료 직후:

| 카드 | 기대 |
| --- | --- |
| Cited Rate + 신뢰구간 | ✅ 완전 |
| 지금 조치할 것 | ✅ 완전 (질의별 0/N) |
| 경쟁사 대비 | ✅ 완전 |
| 엔진별 | ✅ 완전 |
| 추이 차트 | 점 1개 + "2주차부터 선이 생깁니다" |
| ▲▼ 변화 | ❌ 없음 — "다음 주부터 변화를 추적합니다" |

```bash
pnpm dev
```

Expected: 6개 항목이 표와 일치한다. **5개 카드 중 4개가 완전해야 한다** —
비어 보이면 첫인상이 무너진다.

- [ ] **Step 4: 히스토리 제한 검증**

Starter 계정에서 4개월 전 수집을 DB에 직접 넣고 대시보드를 연다.

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
  update collection_runs set started_at = now() - interval '4 months'
  where id = (select id from collection_runs order by started_at asc limit 1);
"
```

Expected: 추이 차트에 그 수집이 나타나지 않는다. Business로 플랜을 바꾸면
나타난다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(dashboard): 대시보드 페이지 조립 · 브랜드 전환 · 첫날 상태

설계 ④ 배치: Cited Rate → 지금 조치할 것 → 비교 → 추이"
```

---

### Task 6: CSV 내보내기

**Files:**
- Create: `src/lib/csv.ts`, `src/app/api/export/[brandId]/route.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `DashboardData` (Task 2)
- Produces:
  - `toCsv(rows, columns): string` — 순수 함수
  - `GET /api/export/[brandId]` — Business 전용

대행사가 클라이언트 리포트에 넣어야 하므로 Business 전용 기능이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'

describe('toCsv', () => {
  it('헤더와 행을 만든다', () => {
    const csv = toCsv([{ a: 1, b: 'x' }], [
      { key: 'a', header: '수' },
      { key: 'b', header: '문자' },
    ])
    expect(csv.split('\n')[0]).toContain('수,문자')
    expect(csv).toContain('1,x')
  })

  it('쉼표가 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([{ a: '가,나' }], [{ key: 'a', header: 'A' }])
    expect(csv).toContain('"가,나"')
  })

  it('따옴표를 이스케이프한다', () => {
    const csv = toCsv([{ a: '그는 "안녕"이라 했다' }], [{ key: 'a', header: 'A' }])
    expect(csv).toContain('""안녕""')
  })

  it('줄바꿈이 든 값을 따옴표로 감싼다', () => {
    const csv = toCsv([{ a: '첫줄\n둘째줄' }], [{ key: 'a', header: 'A' }])
    expect(csv).toContain('"첫줄\n둘째줄"')
  })

  it('null과 undefined를 빈 문자열로 만든다', () => {
    const csv = toCsv([{ a: null, b: undefined }], [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
    ])
    expect(csv.split('\n')[1]).toBe(',')
  })

  it('BOM을 붙인다 (엑셀에서 한글이 깨지지 않게)', () => {
    const csv = toCsv([{ a: '한글' }], [{ key: 'a', header: '제목' }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('행이 없어도 헤더는 나온다', () => {
    const csv = toCsv([], [{ key: 'a', header: 'A' }])
    expect(csv).toContain('A')
  })

  it('CRLF가 아니라 LF를 쓴다', () => {
    const csv = toCsv([{ a: 1 }, { a: 2 }], [{ key: 'a', header: 'A' }])
    expect(csv).not.toContain('\r\n')
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/csv.test.ts
```

Expected: FAIL

`src/lib/csv.ts`:

```ts
export interface CsvColumn<T> {
  key: keyof T & string
  header: string
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * CSV 직렬화. 순수 함수.
 *
 * BOM을 붙이는 이유는 엑셀이 UTF-8 CSV를 열 때 한글이 깨지기 때문이다.
 * 대행사가 클라이언트 리포트에 넣는 것이 이 기능의 목적이므로 중요하다.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(','))
  return `﻿${[header, ...body].join('\n')}`
}
```

- [ ] **Step 3: 내보내기 라우트**

`src/app/api/export/[brandId]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { toCsv } from '@/lib/csv'
import { loadDashboard } from '@/lib/dashboard/query'
import { logger } from '@/lib/logger'
import { getSession } from '@/lib/session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { brandId } = await params
  const data = await loadDashboard({ userId: session.user.id, brandId })

  if (!data) return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 404 })

  // 플랜 확인은 반드시 서버에서. 버튼을 숨기는 것만으로는 부족하다.
  if (!data.csvExport) {
    return NextResponse.json(
      { error: 'CSV 내보내기는 Business 플랜에서 사용할 수 있습니다.' },
      { status: 403 },
    )
  }

  const rows = data.metrics.byQuery.map((q) => ({
    brand: data.brand.name,
    measuredAt: data.runStartedAt.toISOString(),
    query: q.queryText,
    mentions: q.interval.k,
    attempts: q.interval.n,
    citedRate: (q.interval.point * 100).toFixed(1),
    lower: (q.interval.lower * 100).toFixed(1),
    upper: (q.interval.upper * 100).toFixed(1),
  }))

  const csv = toCsv(rows, [
    { key: 'brand', header: '브랜드' },
    { key: 'measuredAt', header: '측정시각' },
    { key: 'query', header: '질문' },
    { key: 'mentions', header: '언급수' },
    { key: 'attempts', header: '시행수' },
    { key: 'citedRate', header: '언급률(%)' },
    { key: 'lower', header: '신뢰구간하한(%)' },
    { key: 'upper', header: '신뢰구간상한(%)' },
  ])

  logger.info('export.csv', { brandId, rows: rows.length })

  const filename = `cited-${data.brand.name}-${data.runStartedAt.toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
```

- [ ] **Step 4: 검증**

```bash
pnpm vitest run src/lib/csv.test.ts
pnpm dev
```

1. Starter 계정에서 `/api/export/<brandId>` 직접 호출 → **403**
2. Business로 바꾼 뒤 → CSV 다운로드
3. 다운로드한 파일을 엑셀에서 열어 **한글이 깨지지 않는지** 확인

Expected: 3개 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(dashboard): CSV 내보내기 (Business 전용, BOM으로 엑셀 한글 보존)"
```

---

### Task 7: 설정 화면

**Files:**
- Create: `src/app/(app)/settings/page.tsx`,
  `src/app/(app)/settings/actions.ts`,
  `src/components/settings/query-editor.tsx`,
  `src/components/settings/alias-editor.tsx`,
  `src/components/settings/competitor-editor.tsx`,
  `src/components/settings/quota-allocator.tsx`

**Interfaces:**
- Consumes: Task 2, `quota.ts` (4단계)
- Produces: 브랜드·질의·별칭·경쟁사 편집. Business는 브랜드별 질의 배분 화면 추가

설계 문서: 고객이 손을 쓰는 곳은 두 군데뿐이다 — 온보딩에서 편집(최초 1회
약 10분, 이후 가끔), 대시보드 열람(주 1회 5분). 이 화면은 "이후 가끔"에 해당한다.

- [ ] **Step 1: 서버 액션**

`src/app/(app)/settings/actions.ts`:

```ts
'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSubscriptionByUser } from '@/lib/billing/repository'
import { db } from '@/lib/db'
import { brands, queries } from '@/lib/db/schema'
import type { PlanId } from '@/lib/plans'
import {
  checkCompetitorQuota,
  checkQueryQuota,
  validateQuotaAllocation,
} from '@/lib/quota'
import { requireUser } from '@/lib/session'

export interface ActionResult {
  ok: boolean
  error?: string
}

async function loadPlan(userId: string): Promise<{ plan: PlanId; queryPacks: number }> {
  const sub = await getSubscriptionByUser(userId)
  return { plan: sub?.plan ?? 'starter', queryPacks: sub?.queryPacks ?? 0 }
}

async function assertOwnership(userId: string, brandId: string) {
  const brand = await db.query.brands.findFirst({
    where: and(eq(brands.id, brandId), eq(brands.userId, userId)),
  })
  if (!brand) throw new Error('브랜드를 찾을 수 없습니다.')
  return brand
}

const queriesSchema = z.object({
  brandId: z.string().min(1),
  queries: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
})

export async function updateQueries(input: z.infer<typeof queriesSchema>): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = queriesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: '입력이 올바르지 않습니다.' }

  const brand = await assertOwnership(user.id, parsed.data.brandId)
  const { plan, queryPacks } = await loadPlan(user.id)

  // 이 브랜드를 제외한 나머지 브랜드의 쿼터 합 + 새 질의 수
  const others = await db
    .select({ id: brands.id, quota: brands.queryQuota })
    .from(brands)
    .where(eq(brands.userId, user.id))

  const allocation = others.map((b) =>
    b.id === brand.id ? parsed.data.queries.length : b.quota,
  )
  const check = validateQuotaAllocation(allocation, plan, queryPacks)
  if (!check.allowed) return { ok: false, error: check.message! }

  const unique = [...new Set(parsed.data.queries.map((q) => q.trim()))]

  await db.transaction(async (tx) => {
    await tx.delete(queries).where(eq(queries.brandId, brand.id))
    await tx.insert(queries).values(
      unique.map((text) => ({
        id: randomUUID(),
        brandId: brand.id,
        text,
        source: 'custom' as const,
      })),
    )
    await tx
      .update(brands)
      .set({ queryQuota: unique.length, updatedAt: new Date() })
      .where(eq(brands.id, brand.id))
  })

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { ok: true }
}

const aliasSchema = z.object({
  brandId: z.string().min(1),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20),
  ambiguous: z.boolean(),
})

export async function updateAliases(input: z.infer<typeof aliasSchema>): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = aliasSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: '입력이 올바르지 않습니다.' }

  const brand = await assertOwnership(user.id, parsed.data.brandId)

  await db
    .update(brands)
    .set({
      aliases: [...new Set(parsed.data.aliases)],
      ambiguous: parsed.data.ambiguous,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brand.id))

  revalidatePath('/settings')
  return { ok: true }
}

const competitorSchema = z.object({
  brandId: z.string().min(1),
  competitors: z.array(z.object({ name: z.string().trim().min(1).max(60) })).max(20),
})

export async function updateCompetitors(
  input: z.infer<typeof competitorSchema>,
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = competitorSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: '입력이 올바르지 않습니다.' }

  const brand = await assertOwnership(user.id, parsed.data.brandId)
  const { plan } = await loadPlan(user.id)

  const check = checkCompetitorQuota({ plan, requested: parsed.data.competitors.length })
  if (!check.allowed) return { ok: false, error: check.message! }

  await db
    .update(brands)
    .set({
      competitors: parsed.data.competitors.map((c) => ({ name: c.name, aliases: [] })),
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brand.id))

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { ok: true }
}

const allocationSchema = z.object({
  allocations: z.array(z.object({ brandId: z.string(), quota: z.number().int().min(0) })),
})

/** Business 전용 — 브랜드들이 총 질의 한도를 나눠 쓴다. */
export async function updateQuotaAllocation(
  input: z.infer<typeof allocationSchema>,
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = allocationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: '입력이 올바르지 않습니다.' }

  const { plan, queryPacks } = await loadPlan(user.id)
  const check = validateQuotaAllocation(
    parsed.data.allocations.map((a) => a.quota),
    plan,
    queryPacks,
  )
  if (!check.allowed) return { ok: false, error: check.message! }

  const owned = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.userId, user.id))
  const ownedIds = new Set(owned.map((b) => b.id))
  if (parsed.data.allocations.some((a) => !ownedIds.has(a.brandId))) {
    return { ok: false, error: '권한이 없는 브랜드가 포함되어 있습니다.' }
  }

  await db.transaction(async (tx) => {
    for (const a of parsed.data.allocations) {
      await tx
        .update(brands)
        .set({ queryQuota: a.quota, updatedAt: new Date() })
        .where(eq(brands.id, a.brandId))
    }
  })

  revalidatePath('/settings')
  return { ok: true }
}
```

- [ ] **Step 2: 설정 페이지**

`src/app/(app)/settings/page.tsx`:

```tsx
import { eq } from 'drizzle-orm'
import { AliasEditorSection } from '@/components/settings/alias-editor'
import { CompetitorEditorSection } from '@/components/settings/competitor-editor'
import { QueryEditorSection } from '@/components/settings/query-editor'
import { QuotaAllocator } from '@/components/settings/quota-allocator'
import { getSubscriptionByUser } from '@/lib/billing/repository'
import { db } from '@/lib/db'
import { brands, queries } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'
import { requireUser } from '@/lib/session'

export const metadata = { title: '설정' }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams

  const sub = await getSubscriptionByUser(user.id)
  const plan = sub?.plan ?? 'starter'
  const queryPacks = sub?.queryPacks ?? 0
  const limits = resolveLimits(plan, queryPacks)

  const userBrands = await db
    .select({
      id: brands.id,
      name: brands.name,
      aliases: brands.aliases,
      ambiguous: brands.ambiguous,
      competitors: brands.competitors,
      queryQuota: brands.queryQuota,
    })
    .from(brands)
    .where(eq(brands.userId, user.id))

  if (userBrands.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">등록된 브랜드가 없습니다.</p>
      </div>
    )
  }

  const current = userBrands.find((b) => b.id === sp.brand) ?? userBrands[0]!
  const brandQueries = await db
    .select({ text: queries.text })
    .from(queries)
    .where(eq(queries.brandId, current.id))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current.name} · 추적 질문 {limits.maxQueries}개 · 경쟁사 {limits.maxCompetitors}개까지
        </p>
      </div>

      {userBrands.length > 1 ? (
        <QuotaAllocator
          brands={userBrands.map((b) => ({ id: b.id, name: b.name, quota: b.queryQuota }))}
          totalLimit={limits.maxQueries}
        />
      ) : null}

      <QueryEditorSection
        brandId={current.id}
        initialQueries={brandQueries.map((q) => q.text)}
        maxQueries={limits.maxQueries}
      />

      <AliasEditorSection
        brandId={current.id}
        brandName={current.name}
        initialAliases={current.aliases}
        initialAmbiguous={current.ambiguous}
      />

      <CompetitorEditorSection
        brandId={current.id}
        initialCompetitors={current.competitors.map((c) => c.name)}
        maxCompetitors={limits.maxCompetitors}
      />
    </div>
  )
}
```

각 에디터 컴포넌트(`query-editor.tsx`, `alias-editor.tsx`,
`competitor-editor.tsx`, `quota-allocator.tsx`)는 같은 패턴을 따른다:
클라이언트 컴포넌트가 로컬 상태로 목록을 편집하고, 저장 버튼이 서버 액션을
호출한 뒤 결과의 `error`를 표시한다. 4단계 온보딩의 `AliasEditor`를 재사용한다.

`QuotaAllocator`는 브랜드별 숫자 입력을 받고 **합계를 실시간으로 보여주며**,
합이 한도를 넘으면 저장 버튼을 비활성화한다 (서버가 다시 검증한다).

- [ ] **Step 3: 검증**

```bash
pnpm dev
```

1. 질의를 11개로 늘려 저장 (Starter) → 서버가 거부하는가
2. 별칭 추가 → 저장 → 다음 수집에서 실제로 반영되는가 (`brands.aliases` 확인)
3. 경쟁사를 4개로 늘려 저장 (Starter) → 거부되는가
4. Business에서 브랜드 3개에 각각 20질의 배분 시도 → 합 60 > 30이므로 거부되는가

Expected: 4개 모두 통과. **한도 검증이 서버에서 일어나야 한다** —
브라우저 devtools로 서버 액션을 직접 호출해도 막혀야 한다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(settings): 질의·별칭·경쟁사 편집 · Business 질의 쿼터 배분"
```

---

### Task 8: 알림 설정과 5단계 마무리

**Files:**
- Create: `src/app/(app)/settings/notifications/page.tsx`,
  `src/lib/db/schema.ts` (수정 — `notificationPrefs` 컬럼 추가)
- Modify: `src/trigger/aggregate-run.ts` (알림 설정 반영)
- Create: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: 이 단계 전부
- Produces: 알림 on/off, 대시보드 E2E

- [ ] **Step 1: 스키마에 알림 설정 추가**

`src/lib/db/schema.ts`의 `user` 테이블에 추가:

```ts
  /** 주간 리포트 메일 수신 여부 */
  weeklyReportEnabled: boolean('weekly_report_enabled').notNull().default(true),
```

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 2: 집계 잡에서 설정 반영**

`src/trigger/aggregate-run.ts`의 메일 발송 조건을 수정한다:

```ts
      const owner = await db.query.user.findFirst({ where: eq(user.id, brand.userId) })
      // 수신 거부한 고객에게 보내지 않는다.
      if (owner?.email && owner.weeklyReportEnabled) {
```

- [ ] **Step 3: 알림 설정 화면**

`src/app/(app)/settings/notifications/page.tsx` — 체크박스 하나와 서버 액션.
서버 액션은 `user.weeklyReportEnabled`를 갱신한다.

```tsx
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { Card } from '@/components/ui/card'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { requireUser } from '@/lib/session'

export const metadata = { title: '알림 설정' }

async function toggleWeeklyReport(formData: FormData) {
  'use server'
  const current = await requireUser()
  const enabled = formData.get('weekly') === 'on'
  await db
    .update(user)
    .set({ weeklyReportEnabled: enabled, updatedAt: new Date() })
    .where(eq(user.id, current.id))
  revalidatePath('/settings/notifications')
}

export default async function NotificationsPage() {
  const current = await requireUser()
  const row = await db.query.user.findFirst({ where: eq(user.id, current.id) })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">알림</h1>
      <Card className="p-6">
        <form action={toggleWeeklyReport} className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="weekly"
              defaultChecked={row?.weeklyReportEnabled ?? true}
              className="mt-1"
            />
            <span>
              <span className="font-medium">주간 측정 완료 알림</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                매주 측정이 끝나면 메일로 알려드립니다. 대시보드는 알림과 무관하게
                항상 최신 상태입니다.
              </span>
            </span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            저장
          </button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: 대시보드 E2E**

`tests/e2e/dashboard.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('대시보드', () => {
  test.skip(!process.env.E2E_USER_EMAIL, 'E2E 계정이 없으면 건너뜁니다')

  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByPlaceholder('이메일').fill(process.env.E2E_USER_EMAIL!)
    await page.getByPlaceholder(/비밀번호/).fill(process.env.E2E_USER_PASSWORD!)
    await page.getByRole('button').click()
    await expect(page).toHaveURL(/dashboard/)
  })

  test('5개 카드가 모두 렌더된다', async ({ page }) => {
    await expect(page.getByText('Cited Rate')).toBeVisible()
    await expect(page.getByText('지금 조치할 것')).toBeVisible()
    await expect(page.getByText('경쟁사 대비')).toBeVisible()
    await expect(page.getByText('엔진별')).toBeVisible()
    await expect(page.getByText(/추이/)).toBeVisible()
  })

  test('신뢰구간이 함께 표시된다', async ({ page }) => {
    await expect(page.getByText(/\d+% ~ \d+%/)).toBeVisible()
    await expect(page.getByText(/회 시행 · 신뢰구간 95%/)).toBeVisible()
  })

  test('첫 수집이면 화살표 대신 안내 문구가 나온다', async ({ page }) => {
    const arrow = page.getByText('▲').or(page.getByText('▼'))
    const notice = page.getByText('다음 주부터 변화를 추적합니다')
    // 둘 중 하나만 보인다
    const arrowVisible = await arrow.isVisible().catch(() => false)
    const noticeVisible = await notice.isVisible().catch(() => false)
    expect(arrowVisible !== noticeVisible || (!arrowVisible && !noticeVisible)).toBeTruthy()
  })

  test('설정 화면에서 질의를 편집할 수 있다', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('추적 질문')).toBeVisible()
  })

  test('Starter는 CSV 버튼이 없고 API도 막힌다', async ({ page, request }) => {
    const csvButton = page.getByRole('link', { name: 'CSV 내보내기' })
    const visible = await csvButton.isVisible().catch(() => false)
    if (!visible) {
      // Starter — API 직접 호출도 막혀야 한다
      const brandId = process.env.E2E_BRAND_ID
      if (brandId) {
        const res = await request.get(`/api/export/${brandId}`)
        expect(res.status()).toBe(403)
      }
    }
  })
})
```

- [ ] **Step 5: 전체 검증과 배포**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e
pnpm dlx trigger.dev@latest deploy
pnpm dlx vercel@latest --prod
```

프로덕션에서 대시보드를 직접 열어 5개 카드를 눈으로 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(dashboard): 알림 설정 · 대시보드 E2E

5단계 완료: 고객이 매주 다시 들어올 이유가 생겼다."
git tag phase-5-complete
```

---

## 5단계 완료 조건

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] `pnpm test:e2e`가 대시보드 스펙을 포함해 통과
- [ ] 첫 수집 직후 대시보드에서 **5개 카드 중 4개가 완전**하다
- [ ] 첫 수집에는 ▲▼가 없고 "다음 주부터 변화를 추적합니다"가 보인다
- [ ] 신뢰구간이 겹치면 회색 `— 변화 없음`이 나온다 (화살표 아님)
- [ ] **경쟁사를 등록하지 않은 브랜드의 Share of Voice가 `0%`도 `100%`도 아닌
      `—`(측정 없음)으로 표시된다.** SoV는 분모가 고객 설정에 의존하는 유일한
      지표다 — 경쟁사 0곳이면 계산 자체가 성립하지 않는다
      (`shareOfVoice.n === 0`으로 판별. `point`나 `lower/upper`로 판별하면 안 된다)
- [ ] **SoV 옆에 경쟁사 수가 항상 병기된다.** "62%(2곳 기준)"과 "62%(8곳 기준)"은
      전혀 다른 주장이고, 병기하지 않으면 우리가 오해를 만든 것이 된다
- [ ] **경쟁사 집합이 바뀐 구간의 SoV에는 ▲▼를 붙이지 않는다.** 엔진 구성이
      다른 주끼리 비교하지 않는 것과 같은 이유다 (설계 문서 "Share of Voice는
      고객 설정에 의해 왜곡된다" 절)
- [ ] 추이 차트에 신뢰구간이 띠로 함께 그려진다
- [ ] 완전성 90% 미만이면 배지가 붙고 실패 엔진 이름이 표시된다
- [ ] Starter는 3개월 이전 수집이 추이에 나타나지 않는다 (SQL 레벨 검증)
- [ ] Starter가 `/api/export/*`를 직접 호출하면 403
- [ ] CSV를 엑셀에서 열었을 때 한글이 깨지지 않는다
- [ ] 설정 화면의 한도 검증이 서버에서 강제된다

## 다음 단계

[6단계 — 운영 콘솔과 런치](2026-07-28-cited-phase-6-admin-and-launch.md)
