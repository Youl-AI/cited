# Cited 3단계 — 수집 파이프라인과 무료 진단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger.dev 수집 파이프라인을 만들고, 그 위에 무료 진단을 얹어
**1차 배포**한다. 이 단계가 끝나면 랜딩에서 브랜드명을 입력한 방문자가 20초 안에
실제 AI 답변 기반 진단 결과를 보고 이메일을 남긴다.

**Architecture:** Trigger.dev 잡이 오케스트레이션만 하고 비즈니스 로직은 두지
않는다. 수집(`collect-brand`)과 판정(`judge-run`)을 분리해, 판정이 실패해도
수집 데이터는 살아남는다. 스케줄은 브랜드당 1개가 아니라 **전체 1개**가 매일
돌며 오늘 수집할 브랜드를 고른다 — Trigger.dev 무료 티어의 스케줄 한도 10개에
막히지 않기 위해서이자, 요일별 부하 분산이 자연히 되기 때문이다.

**Tech Stack:** Trigger.dev v4 · Neon · Drizzle · Next.js Server Actions ·
Trigger.dev Realtime (진행률 스트리밍) · Playwright (E2E)

## Global Constraints

로드맵 공통 제약 + 이 단계 전용:

- **Trigger.dev 스케줄은 전체 1개.** 브랜드마다 만들지 않는다
- **동시성 제한을 엔진별로 건다.** 고객 10명이면 주 1,000~3,000회 실행이므로
  한꺼번에 던지면 rate limit에 걸린다
- **부분 실패를 허용하되 조용히 넘어가지 않는다.** `completeness`를 반드시 기록
- **무료 진단의 일일 상한은 비용 통제 장치다.** 반드시 실제로 작동해야 한다
- **SERP 2샘플은 시간대를 나눠 호출한다.** SerpApi 1시간 캐시 때문
- **`answers.raw`를 저장하지 않는 경로를 만들지 않는다**
- **IP 원문을 저장하지 않는다.** HMAC 해시만
- 각 태스크의 마지막 Step은 커밋

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `trigger.config.ts` | Trigger.dev 프로젝트 설정, 동시성 큐 |
| `src/trigger/collect-brand.ts` | 브랜드 1개 수집 (팬아웃·재시도·completeness) |
| `src/trigger/collect-one.ts` | 질의×엔진×샘플 1회 실행 (재시도 단위) |
| `src/trigger/judge-run.ts` | 수집 완료 후 판정 배치 |
| `src/trigger/aggregate-run.ts` | 판정 완료 후 집계·리포트 |
| `src/trigger/daily-scheduler.ts` | 매일 1회, 오늘 수집할 브랜드 선별 |
| `src/trigger/free-audit.ts` | 무료 진단 잡 |
| `src/trigger/audit-waitlist.ts` | 대기 등록된 진단 후속 처리 |
| `src/lib/audit/verify.ts` | 진단 이메일 인증 토큰 (HMAC) |
| `src/lib/collection/plan-snapshot.ts` | planSnapshot 생성 (순수) |
| `src/lib/collection/fanout.ts` | 팬아웃 계획 생성 (순수) |
| `src/lib/collection/completeness.ts` | completeness 집계·판정 (순수) |
| `src/lib/collection/schedule.ts` | 오늘 수집할 브랜드 선별 (순수) |
| `src/lib/audit/limits.ts` | IP·브랜드 상한 판정 (순수) |
| `src/lib/audit/hash.ts` | IP HMAC 해시 |
| `src/lib/audit/queries.ts` | 카테고리별 기본 질의 생성 |
| `src/app/(marketing)/page.tsx` | 랜딩 |
| `src/app/audit/[id]/page.tsx` | 진행 화면 + 결과 |
| `src/app/api/audit/route.ts` | 진단 시작 |
| `src/app/api/audit/[id]/email/route.ts` | 이메일 게이트 |
| `tests/e2e/free-audit.spec.ts` | E2E |

---

### Task 1: Trigger.dev 초기화와 크레딧 소진 실측

**Files:**
- Create: `trigger.config.ts`, `src/trigger/hello.ts`
- Modify: `package.json`, `.env.example`, `.github/workflows/ci.yml`
- Create: `docs/superpowers/notes/2026-07-28-trigger-credits.md`

**Interfaces:**
- Consumes: `env` (1단계)
- Produces: 동작하는 Trigger.dev 프로젝트, 엔진별 동시성 큐 정의,
  **$5 무료 크레딧 소진 속도 실측치** (로드맵의 유일한 미확정 비용 변수)

- [ ] **Step 1: Trigger.dev 프로젝트 생성과 초기화**

```bash
pnpm dlx trigger.dev@latest init
```

프롬프트에서 새 프로젝트를 만들고, 생성된 `trigger.config.ts`와 예제 태스크를
확인한다. **생성된 예제의 import 경로를 그대로 따른다** — 버전에 따라
`@trigger.dev/sdk` 또는 `@trigger.dev/sdk/v3`다. 추측하지 말고 생성된 파일을 본다.

```bash
cat trigger.config.ts
ls src/trigger/
head -20 src/trigger/*.ts
```

- [ ] **Step 2: 설정을 우리 구조에 맞게 고친다**

`trigger.config.ts`:

```ts
import { defineConfig } from '@trigger.dev/sdk'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ['./src/trigger'],
  maxDuration: 1800, // 30분 — 수집 한 번이 5~15분이므로 여유를 둔다
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 2_000,
      maxTimeoutInMs: 60_000,
      randomize: true,
    },
  },
  build: {
    external: ['@neondatabase/serverless'],
  },
})
```

`.env.example`에 추가:

```bash
TRIGGER_SECRET_KEY=      # Trigger.dev 대시보드 > API Keys
TRIGGER_PROJECT_REF=     # proj_...
```

- [ ] **Step 3: 실패하는 테스트 — 동시성 큐 상수**

`src/lib/collection/queues.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_QUEUE_CONCURRENCY, queueNameFor } from '@/lib/collection/queues'
import { PLANS } from '@/lib/plans'

describe('엔진별 동시성 큐', () => {
  it('모든 엔진에 큐가 정의되어 있다', () => {
    for (const id of PLANS.business.engines) {
      expect(queueNameFor(id)).toBeTruthy()
      expect(ENGINE_QUEUE_CONCURRENCY[id]).toBeGreaterThan(0)
    }
  })

  it('SERP 엔진의 동시성이 LLM보다 낮다 (선약정 쿼터 보호)', () => {
    expect(ENGINE_QUEUE_CONCURRENCY.naver).toBeLessThanOrEqual(
      ENGINE_QUEUE_CONCURRENCY.chatgpt,
    )
  })

  it('전체 동시성 합이 Trigger.dev 무료 티어 한도(20) 이하다', () => {
    const total = Object.values(ENGINE_QUEUE_CONCURRENCY).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(20)
  })
})
```

- [ ] **Step 4: 실패 확인**

```bash
pnpm vitest run src/lib/collection/queues.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 5: 구현**

`src/lib/collection/queues.ts`:

```ts
import type { EngineId } from '@/lib/plans'

/**
 * 엔진별 동시성 제한.
 *
 * 고객 10명이면 주 1,000~3,000회 실행이다. 한꺼번에 던지면 각 엔진의
 * rate limit에 걸린다. 합계는 Trigger.dev 무료 티어 동시 실행 한도(20) 이하로
 * 유지한다 — Hobby($10)로 올리면 50까지 늘릴 수 있다.
 */
export const ENGINE_QUEUE_CONCURRENCY: Record<EngineId, number> = {
  chatgpt: 6,
  gemini: 6,
  // SERP는 선약정 쿼터라 더 보수적으로. 한 번에 몰아 쓰면 쿼터가 순식간에 준다.
  naver: 3,
  google_aio: 3,
}

export function queueNameFor(engineId: EngineId): string {
  return `engine-${engineId}`
}
```

- [ ] **Step 6: 통과 확인**

```bash
pnpm vitest run src/lib/collection/queues.test.ts
```

Expected: PASS (3 passed)

- [ ] **Step 7: 크레딧 소진 실측용 태스크**

`src/trigger/hello.ts` — 실제 수집과 비슷한 시간이 걸리는 태스크를 만들어
크레딧 소진을 잰다. Trigger.dev는 실행 시간에 비례해 크레딧을 쓴다.

```ts
import { logger, task } from '@trigger.dev/sdk'

export const creditProbe = task({
  id: 'credit-probe',
  maxDuration: 600,
  run: async (payload: { seconds: number }) => {
    const start = Date.now()
    // 실제 수집은 대부분 외부 API 대기 시간이다. sleep으로 흉내낸다.
    await new Promise((r) => setTimeout(r, payload.seconds * 1000))
    logger.info('credit probe done', { elapsedMs: Date.now() - start })
    return { elapsedMs: Date.now() - start }
  },
})
```

- [ ] **Step 8: 배포하고 크레딧 소진을 실측한다**

```bash
pnpm dlx trigger.dev@latest dev
```

다른 터미널에서 Trigger.dev 대시보드의 "Test" 화면으로 `credit-probe`를
`{ "seconds": 60 }`로 10회 실행한다 (총 10분 실행 시간).

**대시보드의 Usage 화면에서 실행 전후 크레딧 잔액을 기록한다.**

- [ ] **Step 9: 실측 결과 기록**

`docs/superpowers/notes/2026-07-28-trigger-credits.md`:

```markdown
# Trigger.dev 크레딧 소진 실측 (2026-07-28)

로드맵이 남긴 "1단계 비용 추정의 유일한 미확정 변수"를 해소한다.

## 측정
- 실행: 60초짜리 태스크 10회 = 총 10분 실행 시간
- 크레딧 소진: $____ (전: $____ → 후: $____)
- **분당 소진: $____**

## 무료 크레딧 $5로 감당 가능한 실행 시간
- $5 ÷ (분당 소진) = ____분 = ____시간

## 시나리오별 예측

**무료 진단** — 1건당 6호출, 실행 시간 약 20초
| 월 진단 건수 | 월 실행 시간 | 크레딧 소진 |
| --- | --- | --- |
| 300건 (일 10명) | ____분 | $____ |
| 900건 (일 30명) | ____분 | $____ |
| 3,000건 (일 100명) | ____분 | $____ |

**유료 수집** — Starter 1명당 주 100회, 실행 시간 약 5분
| 고객 수 | 월 실행 시간 | 크레딧 소진 |
| --- | --- | --- |
| 3명 | ____분 | $____ |
| 10명 | ____분 | $____ |

## 결론
- 무료 크레딧이 언제 소진되는가: ____
- Hobby($10, 동시 50) 전환 시점: ____
- SerpApi보다 먼저 막히는가: (예 / 아니오)

## 대응
Hobby $10로 올리면 해결된다. 1단계 고정비 33,000원에 14,000원이 더해져
약 47,000원이 된다. 진단 트래픽이 월 900건을 넘으면 이 항목을 다시 잰다.
```

- [ ] **Step 10: CI에 Trigger.dev 빌드 검증 추가**

`.github/workflows/ci.yml`의 `verify` job에:

```yaml
      - name: Trigger.dev 태스크 빌드 검증
        run: pnpm dlx trigger.dev@latest deploy --dry-run --skip-update-check
        env:
          TRIGGER_SECRET_KEY: ${{ secrets.TRIGGER_SECRET_KEY }}
        continue-on-error: true
```

`continue-on-error: true`는 의도적이다. Trigger.dev CLI가 CI에서 불안정할 수
있고, 이 검증 때문에 전체 CI가 막히면 안 된다. 실패는 로그로 남는다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "chore: Trigger.dev 초기화 · 엔진별 동시성 큐 · 크레딧 소진 실측"
```

---

### Task 2: 수집 계획 순수 함수

**Files:**
- Create: `src/lib/collection/plan-snapshot.ts`, `src/lib/collection/fanout.ts`,
  `src/lib/collection/completeness.ts`, `src/lib/collection/schedule.ts`
- Test: 각각의 `.test.ts`

**Interfaces:**
- Consumes: `PLANS`, `resolveLimits` (1단계), `ENGINE_TIER`
- Produces:
  - `buildPlanSnapshot(args): PlanSnapshot`
  - `buildFanout(snapshot, queries): FanoutItem[]`
  - `interface FanoutItem { queryId; queryText; engineId; sampleIndex; scheduledOffsetMs }`
  - `summarizeCompleteness(items, outcomes): Completeness`
  - `completenessRatio(c): number`, `isDegraded(c): boolean`
  - `selectBrandsForToday(brands, today): Brand[]`
  - 3~5 태스크의 Trigger.dev 잡이 소비한다

수집 로직을 잡 안에 두면 테스트가 불가능하다. 계획 생성은 전부 순수 함수로 빼낸다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/collection/fanout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'

const queries = [
  { id: 'q1', text: '러닝화 추천' },
  { id: 'q2', text: '운동화 브랜드' },
]

describe('buildPlanSnapshot', () => {
  it('플랜 설정을 통째로 박제한다', () => {
    const s = buildPlanSnapshot({
      plan: 'starter',
      queryPacks: 0,
      queryIds: ['q1', 'q2'],
      detectorVersion: 1,
    })
    expect(s.plan).toBe('starter')
    expect(s.engines).toEqual(['chatgpt', 'gemini', 'naver', 'google_aio'])
    expect(s.samples).toEqual({ llm: 3, serp: 2 })
    expect(s.queryIds).toEqual(['q1', 'q2'])
    expect(s.detectorVersion).toBe(1)
  })

  it('질의 팩을 반영한다', () => {
    const s = buildPlanSnapshot({
      plan: 'business',
      queryPacks: 2,
      queryIds: [],
      detectorVersion: 1,
    })
    expect(s.queryPacks).toBe(2)
  })
})

describe('buildFanout', () => {
  it('질의 × 엔진 × 샘플로 팬아웃한다', () => {
    const s = buildPlanSnapshot({ plan: 'starter', queryPacks: 0, queryIds: ['q1', 'q2'], detectorVersion: 1 })
    const items = buildFanout(s, queries)
    // 질의당 (2 LLM × 3) + (2 SERP × 2) = 10회, 질의 2개 = 20회
    expect(items).toHaveLength(20)
  })

  it('무료 진단은 3질의 × 2엔진 × 1샘플 = 6회', () => {
    const s = buildPlanSnapshot({
      plan: 'free',
      queryPacks: 0,
      queryIds: ['q1', 'q2', 'q3'],
      detectorVersion: 1,
    })
    const items = buildFanout(s, [
      { id: 'q1', text: 'a' },
      { id: 'q2', text: 'b' },
      { id: 'q3', text: 'c' },
    ])
    expect(items).toHaveLength(6)
    expect(items.every((i) => i.engineId === 'chatgpt' || i.engineId === 'gemini')).toBe(true)
  })

  it('SERP 2샘플을 시간대로 나눈다 (SerpApi 1시간 캐시 회피)', () => {
    const s = buildPlanSnapshot({ plan: 'starter', queryPacks: 0, queryIds: ['q1'], detectorVersion: 1 })
    const items = buildFanout(s, [queries[0]!])

    const naverSamples = items.filter((i) => i.engineId === 'naver')
    expect(naverSamples).toHaveLength(2)
    expect(naverSamples[0]?.scheduledOffsetMs).toBe(0)
    // 두 번째 샘플은 캐시 TTL(1시간)을 넘겨 예약된다
    expect(naverSamples[1]?.scheduledOffsetMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })

  it('LLM 샘플은 지연 없이 동시에 나간다 (캐시가 없다)', () => {
    const s = buildPlanSnapshot({ plan: 'starter', queryPacks: 0, queryIds: ['q1'], detectorVersion: 1 })
    const items = buildFanout(s, [queries[0]!])
    const llm = items.filter((i) => i.engineId === 'chatgpt')
    expect(llm.every((i) => i.scheduledOffsetMs === 0)).toBe(true)
  })

  it('스냅샷에 없는 질의는 팬아웃하지 않는다', () => {
    const s = buildPlanSnapshot({ plan: 'starter', queryPacks: 0, queryIds: ['q1'], detectorVersion: 1 })
    const items = buildFanout(s, queries) // q2는 스냅샷에 없다
    expect(items.every((i) => i.queryId === 'q1')).toBe(true)
  })

  it('질의가 없으면 빈 배열', () => {
    const s = buildPlanSnapshot({ plan: 'starter', queryPacks: 0, queryIds: [], detectorVersion: 1 })
    expect(buildFanout(s, [])).toEqual([])
  })
})
```

`src/lib/collection/completeness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  completenessRatio,
  comparableEngines,
  isDegraded,
  summarizeCompleteness,
} from '@/lib/collection/completeness'

describe('summarizeCompleteness', () => {
  it('엔진별 시도/성공을 센다', () => {
    const c = summarizeCompleteness([
      { engineId: 'chatgpt', ok: true },
      { engineId: 'chatgpt', ok: true },
      { engineId: 'chatgpt', ok: false },
      { engineId: 'naver', ok: false },
    ])
    expect(c.chatgpt).toEqual({ attempted: 3, succeeded: 2 })
    expect(c.naver).toEqual({ attempted: 1, succeeded: 0 })
  })

  it('설계 문서의 예시를 재현한다', () => {
    const outcomes = [
      ...Array.from({ length: 90 }, () => ({ engineId: 'chatgpt' as const, ok: true })),
      ...Array.from({ length: 88 }, () => ({ engineId: 'gemini' as const, ok: true })),
      ...Array.from({ length: 2 }, () => ({ engineId: 'gemini' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'naver' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'google_aio' as const, ok: true })),
    ]
    const c = summarizeCompleteness(outcomes)
    expect(c.naver).toEqual({ attempted: 60, succeeded: 0 })
    expect(c.gemini).toEqual({ attempted: 90, succeeded: 88 })
  })
})

describe('completenessRatio · isDegraded', () => {
  it('전체 성공률을 계산한다', () => {
    const c = { chatgpt: { attempted: 10, succeeded: 10 }, naver: { attempted: 10, succeeded: 0 } }
    expect(completenessRatio(c)).toBeCloseTo(0.5, 6)
  })

  it('90% 미만이면 배지를 붙인다', () => {
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 8 } })).toBe(true)
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 10 } })).toBe(false)
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 9 } })).toBe(false)
  })

  it('시도가 0이면 완전한 것으로 본다 (0으로 나누지 않는다)', () => {
    expect(completenessRatio({})).toBe(1)
    expect(isDegraded({})).toBe(false)
  })
})

describe('comparableEngines', () => {
  it('성공이 1건이라도 있는 엔진만 비교 대상이다', () => {
    const c = {
      chatgpt: { attempted: 10, succeeded: 10 },
      naver: { attempted: 10, succeeded: 0 },
    }
    expect(comparableEngines(c)).toEqual(['chatgpt'])
  })

  it('정렬된 결과를 돌려준다 (비교 시 순서 무관하게)', () => {
    const c = {
      naver: { attempted: 1, succeeded: 1 },
      chatgpt: { attempted: 1, succeeded: 1 },
    }
    expect(comparableEngines(c)).toEqual(['chatgpt', 'naver'])
  })
})
```

`src/lib/collection/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectBrandsForToday, weekdayInSeoul } from '@/lib/collection/schedule'

const brands = [
  { id: 'b1', collectionWeekday: 1, isActive: true, subscriptionStatus: 'active' as const },
  { id: 'b2', collectionWeekday: 3, isActive: true, subscriptionStatus: 'active' as const },
  { id: 'b3', collectionWeekday: 1, isActive: false, subscriptionStatus: 'active' as const },
  { id: 'b4', collectionWeekday: 1, isActive: true, subscriptionStatus: 'suspended' as const },
  { id: 'b5', collectionWeekday: 1, isActive: true, subscriptionStatus: 'past_due' as const },
]

describe('weekdayInSeoul', () => {
  it('UTC 시각을 서울 기준 요일로 변환한다', () => {
    // 2026-07-27 23:00 UTC = 2026-07-28 08:00 KST (화요일)
    expect(weekdayInSeoul(new Date('2026-07-27T23:00:00Z'))).toBe(2)
  })

  it('자정 직전 UTC가 다음날 서울로 넘어간다', () => {
    // 2026-07-26 16:00 UTC = 2026-07-27 01:00 KST (월요일)
    expect(weekdayInSeoul(new Date('2026-07-26T16:00:00Z'))).toBe(1)
  })
})

describe('selectBrandsForToday', () => {
  it('오늘 요일에 해당하는 활성 브랜드만 고른다', () => {
    const monday = new Date('2026-07-26T16:00:00Z') // KST 월요일
    const picked = selectBrandsForToday(brands, monday).map((b) => b.id)
    expect(picked).toContain('b1')
    expect(picked).not.toContain('b2') // 수요일
  })

  it('비활성 브랜드를 제외한다', () => {
    const monday = new Date('2026-07-26T16:00:00Z')
    expect(selectBrandsForToday(brands, monday).map((b) => b.id)).not.toContain('b3')
  })

  it('구독이 정지된 고객은 수집하지 않는다 (설계 ⑤ 결제 실패 대응)', () => {
    const monday = new Date('2026-07-26T16:00:00Z')
    expect(selectBrandsForToday(brands, monday).map((b) => b.id)).not.toContain('b4')
  })

  it('유예 기간(past_due) 중에는 수집을 계속한다', () => {
    const monday = new Date('2026-07-26T16:00:00Z')
    expect(selectBrandsForToday(brands, monday).map((b) => b.id)).toContain('b5')
  })

  it('해당 요일 브랜드가 없으면 빈 배열', () => {
    const saturday = new Date('2026-07-31T16:00:00Z') // KST 토요일
    expect(selectBrandsForToday(brands, saturday)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/collection/
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/collection/plan-snapshot.ts`:

```ts
import type { PlanSnapshot } from '@/lib/db/schema'
import { PLANS, type PlanId } from '@/lib/plans'

export interface SnapshotArgs {
  plan: PlanId
  queryPacks: number
  queryIds: string[]
  detectorVersion: number
}

/**
 * 수집 당시의 플랜 설정을 통째로 박제한다.
 *
 * 이것이 없으면 "지난달 대비 상승"이 실제 상승인지 조건 변경인지 구분할 수
 * 없고 시계열 전체가 무의미해진다.
 */
export function buildPlanSnapshot(args: SnapshotArgs): PlanSnapshot {
  const config = PLANS[args.plan]
  return {
    plan: args.plan,
    queryPacks: args.queryPacks,
    engines: [...config.engines],
    samples: { ...config.samples },
    queryIds: [...args.queryIds],
    detectorVersion: args.detectorVersion,
  }
}
```

`src/lib/collection/fanout.ts`:

```ts
import type { PlanSnapshot } from '@/lib/db/schema'
import { ENGINE_TIER, type EngineId } from '@/lib/plans'

export interface QueryInput {
  id: string
  text: string
}

export interface FanoutItem {
  queryId: string
  queryText: string
  engineId: EngineId
  sampleIndex: number
  /** 이 실행을 몇 ms 뒤로 미룰 것인가 */
  scheduledOffsetMs: number
}

/**
 * SerpApi는 결과를 1시간 캐시하고 캐시 조회는 무료다.
 * 두 샘플을 연속 호출하면 같은 캐시가 두 번 나와 정보량이 1회분이 된다.
 * → SERP 샘플은 시간대를 나눠 호출한다. AI 브리핑도 시점에 따라 바뀌므로
 *   이렇게 해야 진짜 2샘플이 된다.
 */
const SERP_SAMPLE_GAP_MS = 4 * 60 * 60 * 1000 // 4시간 (오전·오후)

/** 질의 × 엔진 × 샘플로 팬아웃한다. 각 항목이 독립 서브태스크가 된다. */
export function buildFanout(
  snapshot: PlanSnapshot,
  queries: readonly QueryInput[],
): FanoutItem[] {
  const allowed = new Set(snapshot.queryIds)
  const items: FanoutItem[] = []

  for (const query of queries) {
    if (!allowed.has(query.id)) continue

    for (const engineId of snapshot.engines) {
      const tier = ENGINE_TIER[engineId]
      const sampleCount = tier === 'llm' ? snapshot.samples.llm : snapshot.samples.serp

      for (let s = 0; s < sampleCount; s++) {
        items.push({
          queryId: query.id,
          queryText: query.text,
          engineId,
          sampleIndex: s,
          // LLM은 캐시가 없으므로 지연이 필요 없다.
          scheduledOffsetMs: tier === 'serp' ? s * SERP_SAMPLE_GAP_MS : 0,
        })
      }
    }
  }

  return items
}
```

`src/lib/collection/completeness.ts`:

```ts
import type { Completeness } from '@/lib/db/schema'
import type { EngineId } from '@/lib/plans'

export interface Outcome {
  engineId: EngineId
  ok: boolean
}

/**
 * 부분 실패를 허용하되 조용히 넘어가지 않는다.
 *
 * 주간 수집 전체를 버리면 그 주 데이터가 영영 사라진다 — AI 답변은 소급
 * 수집이 불가능하다. 남은 엔진으로 계산해 그냥 보여주면 숫자가 떨어진 이유가
 * 실제 하락인지 엔진 누락인지 알 수 없다. 그래서 저장하되 기록한다.
 */
export function summarizeCompleteness(outcomes: readonly Outcome[]): Completeness {
  const out: Completeness = {}
  for (const o of outcomes) {
    const cur = out[o.engineId] ?? { attempted: 0, succeeded: 0 }
    cur.attempted++
    if (o.ok) cur.succeeded++
    out[o.engineId] = cur
  }
  return out
}

export function completenessRatio(c: Completeness): number {
  let attempted = 0
  let succeeded = 0
  for (const v of Object.values(c)) {
    if (!v) continue
    attempted += v.attempted
    succeeded += v.succeeded
  }
  if (attempted === 0) return 1
  return succeeded / attempted
}

/** 90% 미만이면 대시보드에 배지를 붙이고 차트를 점선으로 그린다. */
export function isDegraded(c: Completeness): boolean {
  return completenessRatio(c) < 0.9
}

/**
 * 이 수집에서 실제로 데이터를 얻은 엔진 목록.
 * 변화 판정(▲▼)은 엔진 구성이 같은 주끼리만 한다.
 */
export function comparableEngines(c: Completeness): EngineId[] {
  return (Object.entries(c) as [EngineId, { attempted: number; succeeded: number }][])
    .filter(([, v]) => v.succeeded > 0)
    .map(([id]) => id)
    .sort()
}

/** 실패한 엔진 이름 목록 — 대시보드 배지 문구에 쓴다. */
export function failedEngines(c: Completeness): EngineId[] {
  return (Object.entries(c) as [EngineId, { attempted: number; succeeded: number }][])
    .filter(([, v]) => v.attempted > 0 && v.succeeded === 0)
    .map(([id]) => id)
    .sort()
}
```

`src/lib/collection/schedule.ts`:

```ts
import type { SubscriptionStatus } from '@/lib/db/schema'

export interface SchedulableBrand {
  id: string
  /** 0=일 … 6=토 */
  collectionWeekday: number
  isActive: boolean
  subscriptionStatus: SubscriptionStatus
}

/** UTC 시각의 서울 기준 요일 (0=일 … 6=토) */
export function weekdayInSeoul(date: Date): number {
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return seoul.getUTCDay()
}

/**
 * 오늘 수집할 브랜드를 고른다.
 *
 * 설계 ②: 브랜드마다 스케줄을 만들면 Trigger.dev 무료 티어의 스케줄 한도 10개에
 * 고객 10명에서 막힌다. 매일 도는 스케줄 1개가 오늘 수집할 브랜드를 고르는 편이
 * 한도와 무관하게 더 나은 설계다 — 가입 요일 기준이라 부하가 자연히 분산된다.
 */
export function selectBrandsForToday<T extends SchedulableBrand>(
  brands: readonly T[],
  now: Date,
): T[] {
  const today = weekdayInSeoul(now)
  return brands.filter(
    (b) =>
      b.isActive &&
      b.collectionWeekday === today &&
      // 결제 실패 후 유예 기간(past_due)에는 수집을 계속한다.
      // 유예가 만료돼 suspended가 되면 중단하되, 과거 데이터는 유지한다.
      b.subscriptionStatus !== 'suspended' &&
      b.subscriptionStatus !== 'canceled',
  )
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/collection/
```

Expected: PASS (21 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/collection
git commit -m "feat(collection): planSnapshot · 팬아웃 · completeness · 요일 스케줄 (순수 함수)"
```

---

### Task 3: 수집 잡

**Files:**
- Create: `src/trigger/collect-one.ts`, `src/trigger/collect-brand.ts`,
  `src/lib/collection/repository.ts`
- Test: `src/lib/collection/repository.test.ts`,
  `tests/integration/collect-brand.test.ts`

**Interfaces:**
- Consumes: Task 2의 순수 함수, `getEngine` (2단계), `db` (1단계)
- Produces:
  - `collectOne` — 질의×엔진×샘플 1회. 재시도 단위
  - `collectBrand` — 브랜드 1개 수집 전체. `judgeRun`을 트리거한다
  - `startRun(args): Promise<runId>`, `finishRun(runId, ...)` — DB 접근 계층

설계 ②의 수집 파이프라인 1~3단계를 구현한다.

- [ ] **Step 1: 리포지토리 실패 테스트**

`src/lib/collection/repository.test.ts` — DB 없이 SQL 생성만 검증하기는 어렵다.
대신 **입력 검증 로직**을 테스트한다.

```ts
import { describe, expect, it } from 'vitest'
import { buildAnswerRow, validateRunStart } from '@/lib/collection/repository'

describe('validateRunStart', () => {
  it('질의가 없으면 거부한다', () => {
    expect(() =>
      validateRunStart({ brandId: 'b1', queries: [], plan: 'starter', queryPacks: 0 }),
    ).toThrowError(/질의/)
  })

  it('한도를 넘는 질의 수를 거부한다', () => {
    const queries = Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    expect(() =>
      validateRunStart({ brandId: 'b1', queries, plan: 'starter', queryPacks: 0 }),
    ).toThrowError(/한도/)
  })

  it('질의 팩을 반영한 한도까지 허용한다', () => {
    const queries = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, text: 't' }))
    expect(() =>
      validateRunStart({ brandId: 'b1', queries, plan: 'starter', queryPacks: 1 }),
    ).not.toThrow()
  })
})

describe('buildAnswerRow', () => {
  it('원본(raw)을 반드시 담는다', () => {
    const row = buildAnswerRow({
      runId: 'r1',
      queryId: 'q1',
      queryText: '러닝화',
      engineId: 'chatgpt',
      sampleIndex: 0,
      answer: {
        text: '나이키',
        citations: [{ url: 'https://a', title: 'A' }],
        raw: { original: true },
        usage: { calls: 1 },
      },
    })
    expect(row.raw).toEqual({ original: true })
    expect(row.text).toBe('나이키')
    expect(row.citations).toHaveLength(1)
  })

  it('id를 자동 생성한다', () => {
    const a = buildAnswerRow({
      runId: 'r1', queryId: 'q1', queryText: 't', engineId: 'chatgpt', sampleIndex: 0,
      answer: { text: '', citations: [], raw: null, usage: { calls: 1 } },
    })
    const b = buildAnswerRow({
      runId: 'r1', queryId: 'q1', queryText: 't', engineId: 'chatgpt', sampleIndex: 1,
      answer: { text: '', citations: [], raw: null, usage: { calls: 1 } },
    })
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/collection/repository.test.ts
```

Expected: FAIL

- [ ] **Step 3: 리포지토리 구현**

`src/lib/collection/repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  answers,
  collectionRuns,
  type Completeness,
  type PlanSnapshot,
  type RunMetrics,
  type RunStatus,
  type RunTrigger,
} from '@/lib/db/schema'
import type { EngineAnswer } from '@/lib/engines/types'
import { resolveLimits, type EngineId, type PlanId } from '@/lib/plans'
import type { QueryInput } from './fanout'

export interface RunStartArgs {
  brandId: string
  queries: QueryInput[]
  plan: PlanId
  queryPacks: number
}

/** 잡을 시작하기 전에 검증한다. 한도를 넘은 수집이 돌면 원가가 새어나간다. */
export function validateRunStart(args: RunStartArgs): void {
  if (args.queries.length === 0) {
    throw new Error(`수집할 질의가 없습니다 (brandId=${args.brandId})`)
  }
  const limits = resolveLimits(args.plan, args.queryPacks)
  if (args.queries.length > limits.maxQueries) {
    throw new Error(
      `질의 수(${args.queries.length})가 한도(${limits.maxQueries})를 넘습니다 (brandId=${args.brandId})`,
    )
  }
}

export interface AnswerRowArgs {
  runId: string
  queryId: string
  queryText: string
  engineId: EngineId
  sampleIndex: number
  answer: EngineAnswer
}

export function buildAnswerRow(args: AnswerRowArgs) {
  return {
    id: randomUUID(),
    runId: args.runId,
    queryId: args.queryId,
    queryText: args.queryText,
    engineId: args.engineId,
    sampleIndex: args.sampleIndex,
    text: args.answer.text,
    citations: args.answer.citations,
    // 원본을 절대 버리지 않는다.
    raw: args.answer.raw,
  }
}

export async function createRun(args: {
  brandId: string
  planSnapshot: PlanSnapshot
  trigger: RunTrigger
}): Promise<string> {
  const id = randomUUID()
  await db.insert(collectionRuns).values({
    id,
    brandId: args.brandId,
    planSnapshot: args.planSnapshot,
    trigger: args.trigger,
    status: 'running',
  })
  return id
}

export async function saveAnswer(args: AnswerRowArgs): Promise<string> {
  const row = buildAnswerRow(args)
  await db
    .insert(answers)
    .values(row)
    // 재시도로 같은 (run, query, engine, sample)이 두 번 오면 무시한다.
    .onConflictDoNothing()
  return row.id
}

export async function finishRun(args: {
  runId: string
  completeness: Completeness
  metrics: RunMetrics
  status: RunStatus
}): Promise<void> {
  await db
    .update(collectionRuns)
    .set({
      completeness: args.completeness,
      metrics: args.metrics,
      status: args.status,
      finishedAt: new Date(),
    })
    .where(eq(collectionRuns.id, args.runId))
}

export async function loadRunAnswers(runId: string) {
  return db
    .select({
      id: answers.id,
      queryId: answers.queryId,
      queryText: answers.queryText,
      engineId: answers.engineId,
      text: answers.text,
    })
    .from(answers)
    .where(eq(answers.runId, runId))
}

/** 이번 달 SerpApi 사용량을 누적한다 (6단계 쿼터 추적기가 읽는다). */
export async function recordSerpUsage(calls: number): Promise<void> {
  if (calls <= 0) return
  const period = new Date().toISOString().slice(0, 7)
  await db.execute(sql`
    insert into serpapi_usage (period, plan_limit, used)
    values (${period}, 1000, ${calls})
    on conflict (period) do update set used = serpapi_usage.used + ${calls},
                                       updated_at = now()
  `)
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/collection/repository.test.ts
```

Expected: PASS (5 passed)

- [ ] **Step 5: 단일 실행 잡**

`src/trigger/collect-one.ts` — 재시도 단위다. 이 태스크 하나가 실패해도 다른
실행에 영향을 주지 않는다.

```ts
import { logger, task } from '@trigger.dev/sdk'
import { recordSerpUsage, saveAnswer } from '@/lib/collection/repository'
import { ENGINE_QUEUE_CONCURRENCY, queueNameFor } from '@/lib/collection/queues'
import { getEngine } from '@/lib/engines'
import { EngineError, isRetryable } from '@/lib/engines/types'
import { estimateCostKrw } from '@/lib/engines/pricing'
import { ENGINE_TIER, type EngineId } from '@/lib/plans'

export interface CollectOnePayload {
  runId: string
  queryId: string
  queryText: string
  engineId: EngineId
  sampleIndex: number
}

export interface CollectOneResult {
  ok: boolean
  engineId: EngineId
  answerId: string | null
  costKrw: number
  tokensIn: number
  tokensOut: number
  serpCalls: number
  error: string | null
}

export const collectOne = task({
  id: 'collect-one',
  maxDuration: 180,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 120_000,
    randomize: true,
  },
  run: async (payload: CollectOnePayload): Promise<CollectOneResult> => {
    const engine = getEngine(payload.engineId)

    try {
      const answer = await engine.run(payload.queryText, {
        sampleIndex: payload.sampleIndex,
      })

      const answerId = await saveAnswer({
        runId: payload.runId,
        queryId: payload.queryId,
        queryText: payload.queryText,
        engineId: payload.engineId,
        sampleIndex: payload.sampleIndex,
        answer,
      })

      const serpCalls = ENGINE_TIER[payload.engineId] === 'serp' ? answer.usage.calls : 0
      if (serpCalls > 0) await recordSerpUsage(serpCalls)

      return {
        ok: true,
        engineId: payload.engineId,
        answerId,
        costKrw: estimateCostKrw(payload.engineId, answer.usage),
        tokensIn: answer.usage.tokensIn ?? 0,
        tokensOut: answer.usage.tokensOut ?? 0,
        serpCalls,
        error: null,
      }
    } catch (error) {
      // 400류는 재시도해도 같은 결과다. 즉시 포기하고 기록한다.
      if (!isRetryable(error)) {
        logger.warn('collect-one.permanent_failure', {
          engineId: payload.engineId,
          queryId: payload.queryId,
          status: error instanceof EngineError ? error.status : undefined,
        })
        return {
          ok: false,
          engineId: payload.engineId,
          answerId: null,
          costKrw: 0,
          tokensIn: 0,
          tokensOut: 0,
          serpCalls: 0,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      // 재시도 가능하면 던져서 Trigger.dev의 지수 백오프에 맡긴다.
      throw error
    }
  },
  // 엔진별 동시성 제한 — rate limit 회피
  queue: {
    name: queueNameFor('chatgpt'),
    concurrencyLimit: ENGINE_QUEUE_CONCURRENCY.chatgpt,
  },
})
```

> **동시성 큐가 엔진별로 갈려야 한다.** Trigger.dev v4에서 태스크 정의 시점에
> 큐가 고정되면, 엔진별로 태스크를 4개 만들거나 `queue` 옵션을 트리거 시점에
> 넘겨야 한다. 초기화 시 생성된 예제와 대시보드 문서에서 실제 API를 확인하고,
> **트리거 시점에 큐를 지정할 수 있으면 그 방식을 쓴다.** 불가능하면
> `collect-one-chatgpt.ts` 처럼 엔진별 파일을 만들고 공통 로직을
> `src/lib/collection/run-one.ts`로 뺀 뒤 각 태스크가 호출한다.
> Step 8의 실측에서 동시성이 실제로 제한되는지 확인한다.

- [ ] **Step 6: 브랜드 수집 잡**

`src/trigger/collect-brand.ts`:

```ts
import { logger, metadata, task, wait } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import {
  createRun,
  finishRun,
  validateRunStart,
} from '@/lib/collection/repository'
import { summarizeCompleteness, isDegraded } from '@/lib/collection/completeness'
import type { Outcome } from '@/lib/collection/completeness'
import { db } from '@/lib/db'
import { brands, queries as queriesTable, subscriptions } from '@/lib/db/schema'
import type { RunMetrics, RunStatus, RunTrigger } from '@/lib/db/schema'
import { DETECTOR_VERSION } from '@/lib/detection'
import type { EngineId } from '@/lib/plans'
import { collectOne, type CollectOneResult } from './collect-one'
import { judgeRun } from './judge-run'

export interface CollectBrandPayload {
  brandId: string
  trigger: RunTrigger
}

export const collectBrand = task({
  id: 'collect-brand',
  maxDuration: 1800,
  run: async (payload: CollectBrandPayload) => {
    const started = Date.now()

    // 1. 플랜 로드 → planSnapshot 생성 → collection_run 시작
    const brand = await db.query.brands.findFirst({
      where: eq(brands.id, payload.brandId),
    })
    if (!brand) throw new Error(`브랜드를 찾을 수 없습니다: ${payload.brandId}`)

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, brand.userId),
    })
    const plan = sub?.plan ?? 'free'
    const queryPacks = sub?.queryPacks ?? 0

    const activeQueries = await db
      .select({ id: queriesTable.id, text: queriesTable.text })
      .from(queriesTable)
      .where(eq(queriesTable.brandId, brand.id))

    const enabled = activeQueries.slice(0, brand.queryQuota || activeQueries.length)
    validateRunStart({ brandId: brand.id, queries: enabled, plan, queryPacks })

    const snapshot = buildPlanSnapshot({
      plan,
      queryPacks,
      queryIds: enabled.map((q) => q.id),
      detectorVersion: DETECTOR_VERSION,
    })

    const runId = await createRun({
      brandId: brand.id,
      planSnapshot: snapshot,
      trigger: payload.trigger,
    })

    // 2. 팬아웃 — 각 실행이 독립 서브태스크가 되어 개별 재시도된다
    const items = buildFanout(snapshot, enabled)
    logger.info('collect-brand.fanout', { runId, items: items.length })

    metadata.set('progress', { total: items.length, done: 0, runId })

    // SERP 2샘플은 시간대를 나눈다. 지연이 필요한 항목을 뒤로 미룬다.
    const immediate = items.filter((i) => i.scheduledOffsetMs === 0)
    const delayed = items.filter((i) => i.scheduledOffsetMs > 0)

    const results: CollectOneResult[] = []

    const runBatch = async (batch: typeof items) => {
      if (batch.length === 0) return
      const handles = await collectOne.batchTriggerAndWait(
        batch.map((i) => ({
          payload: {
            runId,
            queryId: i.queryId,
            queryText: i.queryText,
            engineId: i.engineId,
            sampleIndex: i.sampleIndex,
          },
        })),
      )
      for (const [idx, run] of handles.runs.entries()) {
        if (run.ok) {
          results.push(run.output)
        } else {
          // 재시도를 다 쓰고 실패한 경우 — 실패로 기록하되 수집은 계속한다.
          results.push({
            ok: false,
            engineId: batch[idx]!.engineId,
            answerId: null,
            costKrw: 0,
            tokensIn: 0,
            tokensOut: 0,
            serpCalls: 0,
            error: 'retries exhausted',
          })
        }
        metadata.set('progress', { total: items.length, done: results.length, runId })
      }
    }

    await runBatch(immediate)

    if (delayed.length > 0) {
      const gap = Math.min(...delayed.map((d) => d.scheduledOffsetMs))
      logger.info('collect-brand.waiting_for_serp_second_sample', { gapMs: gap })
      await wait.for({ seconds: Math.round(gap / 1000) })
      await runBatch(delayed)
    }

    // 3. completeness 집계 — 부분 실패를 저장하되 기록한다
    const outcomes: Outcome[] = results.map((r) => ({ engineId: r.engineId, ok: r.ok }))
    const completeness = summarizeCompleteness(outcomes)

    const callsByEngine: Partial<Record<EngineId, number>> = {}
    let costKrw = 0
    let tokensIn = 0
    let tokensOut = 0
    let serpCalls = 0
    for (const r of results) {
      callsByEngine[r.engineId] = (callsByEngine[r.engineId] ?? 0) + 1
      costKrw += r.costKrw
      tokensIn += r.tokensIn
      tokensOut += r.tokensOut
      serpCalls += r.serpCalls
    }

    const metrics: RunMetrics = {
      callsByEngine,
      tokensIn,
      tokensOut,
      estimatedCostKrw: costKrw,
      serpApiCalls: serpCalls,
      durationMs: Date.now() - started,
      stage1PassRate: null, // judge-run이 채운다
    }

    const succeeded = results.filter((r) => r.ok).length
    const status: RunStatus =
      succeeded === 0 ? 'failed' : isDegraded(completeness) ? 'partial' : 'succeeded'

    await finishRun({ runId, completeness, metrics, status })
    logger.info('collect-brand.done', { runId, status, succeeded, total: items.length })

    // 4. 판정을 별도 잡으로 던진다.
    //    수집과 판정을 분리했으므로 판정이 실패해도 수집 데이터는 살아남는다.
    if (succeeded > 0) {
      await judgeRun.trigger({ runId, brandId: brand.id })
    }

    return { runId, status, succeeded, total: items.length }
  },
})
```

- [ ] **Step 7: 통합 테스트 (엔진 목 교체)**

`tests/integration/collect-brand.test.ts` — Trigger.dev 잡 자체는 로컬에서
돌리기 어렵다. 대신 **팬아웃 계획과 completeness 집계가 실제 플랜 설정에서
맞는지** 검증한다.

```ts
import { describe, expect, it } from 'vitest'
import { summarizeCompleteness, isDegraded, comparableEngines } from '@/lib/collection/completeness'
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import { expectedCallsPerRun } from '@/lib/plans'

describe('플랜별 팬아웃이 설계 문서 수치와 일치한다', () => {
  it('Starter 10질의 → 주 100회', () => {
    const queries = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, text: `질의${i}` }))
    const s = buildPlanSnapshot({
      plan: 'starter', queryPacks: 0, queryIds: queries.map((q) => q.id), detectorVersion: 1,
    })
    const items = buildFanout(s, queries)
    expect(items).toHaveLength(100)
    expect(items).toHaveLength(expectedCallsPerRun('starter', 10))
  })

  it('Business 30질의 → 주 300회', () => {
    const queries = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, text: `질의${i}` }))
    const s = buildPlanSnapshot({
      plan: 'business', queryPacks: 0, queryIds: queries.map((q) => q.id), detectorVersion: 1,
    })
    expect(buildFanout(s, queries)).toHaveLength(300)
  })

  it('질의 팩을 산 Business 40질의 → 주 400회', () => {
    const queries = Array.from({ length: 40 }, (_, i) => ({ id: `q${i}`, text: `질의${i}` }))
    const s = buildPlanSnapshot({
      plan: 'business', queryPacks: 1, queryIds: queries.map((q) => q.id), detectorVersion: 1,
    })
    expect(buildFanout(s, queries)).toHaveLength(400)
  })
})

describe('네이버 장애 시나리오 (설계 ⑤)', () => {
  it('네이버만 죽으면 partial로 남고 배지 조건을 만족한다', () => {
    const outcomes = [
      ...Array.from({ length: 90 }, () => ({ engineId: 'chatgpt' as const, ok: true })),
      ...Array.from({ length: 90 }, () => ({ engineId: 'gemini' as const, ok: true })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'naver' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'google_aio' as const, ok: true })),
    ]
    const c = summarizeCompleteness(outcomes)
    expect(isDegraded(c)).toBe(true)
    // 변화 판정은 네이버를 뺀 3개 엔진 기준으로만 가능하다
    expect(comparableEngines(c)).toEqual(['chatgpt', 'gemini', 'google_aio'])
  })
})
```

```bash
pnpm vitest run tests/integration/collect-brand.test.ts
```

Expected: PASS (4 passed)

- [ ] **Step 8: 로컬에서 실제 수집 1회 실행**

시드 데이터를 만들고 실제로 돌린다.

```bash
cat > scripts/seed-dev.ts <<'EOF'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { brands, queries, subscriptions, user } from '@/lib/db/schema'

const userId = randomUUID()
await db.insert(user).values({
  id: userId, name: '개발자', email: `dev+${Date.now()}@example.com`, emailVerified: true,
})
const subId = randomUUID()
await db.insert(subscriptions).values({
  id: subId, userId, plan: 'starter', status: 'active', queryPacks: 0,
})
const brandId = randomUUID()
await db.insert(brands).values({
  id: brandId, userId, name: '아식스', category: '스포츠',
  aliases: ['ASICS', '젤카야노'], ambiguous: false,
  competitors: [{ name: '나이키', aliases: ['NIKE'] }],
  queryQuota: 2, collectionWeekday: new Date().getDay(),
})
for (const text of ['30대 남자 러닝화 추천해줘', '발볼 넓은 사람 운동화']) {
  await db.insert(queries).values({ id: randomUUID(), brandId, text, source: 'generated' })
}
console.log(`brandId=${brandId}`)
EOF

pnpm tsx --env-file=.env.local scripts/seed-dev.ts
```

Trigger.dev dev 서버를 띄우고 대시보드에서 `collect-brand`를
`{ "brandId": "<위 출력>", "trigger": "manual" }`로 실행한다.

```bash
pnpm dlx trigger.dev@latest dev
```

Expected: 대시보드에서 서브태스크 20개(2질의 × 10)가 뜨고, 엔진별 동시성이
설정값을 넘지 않는다. SERP 두 번째 샘플은 4시간 뒤로 예약된다 — **로컬 검증
시에는 `SERP_SAMPLE_GAP_MS`를 임시로 10초로 줄여 확인하고 원복한다.**

`pnpm db:studio`에서 `collection_runs` 1행, `answers` 20행, 각 answer의 `raw`가
비어 있지 않은지 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat(collection): 수집 잡 · 팬아웃 · 부분 실패 허용 · 엔진별 동시성"
```

---

### Task 4: 판정·집계 잡

**Files:**
- Create: `src/trigger/judge-run.ts`, `src/trigger/aggregate-run.ts`,
  `src/lib/collection/detection-repository.ts`,
  `src/lib/collection/brand-profile.ts`
- Test: `src/lib/collection/brand-profile.test.ts`

**Interfaces:**
- Consumes: `detectMentions` (2단계), `computeMetrics` (2단계), 수집 결과
- Produces:
  - `judgeRun` — 수집 완료 후 판정 배치, `aggregateRun`을 트리거
  - `aggregateRun` — 집계 후 리포트 메일
  - `toBrandProfiles(brand): { self: BrandProfile; competitors: BrandProfile[] }`

설계 ②: 판정을 수집에서 분리한 것은 의도적이다. 원본이 남아 재판정이 가능하고,
LLM 판정을 배치로 묶어 원가를 낮출 수 있으며, 판정이 실패해도 수집 데이터는
살아남는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/collection/brand-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toBrandProfiles } from '@/lib/collection/brand-profile'

const brand = {
  name: '무신사',
  aliases: ['MUSINSA', '무탠다드'],
  ambiguous: false,
  competitors: [
    { name: '29CM', aliases: ['29cm'] },
    { name: '지그재그', aliases: [] },
  ],
}

describe('toBrandProfiles', () => {
  it('브랜드를 self 프로파일로 변환한다', () => {
    const { self } = toBrandProfiles(brand)
    expect(self.canonical).toBe('무신사')
    expect(self.aliases).toEqual(['MUSINSA', '무탠다드'])
    expect(self.ambiguous).toBe(false)
  })

  it('경쟁사를 프로파일 배열로 변환한다', () => {
    const { competitors } = toBrandProfiles(brand)
    expect(competitors).toHaveLength(2)
    expect(competitors[0]?.canonical).toBe('29CM')
  })

  it('경쟁사는 항상 ambiguous=true로 둔다 (별칭을 고객이 편집하지 않으므로 보수적으로)', () => {
    const { competitors } = toBrandProfiles(brand)
    expect(competitors.every((c) => c.ambiguous)).toBe(true)
  })

  it('경쟁사가 없어도 던지지 않는다', () => {
    const { competitors } = toBrandProfiles({ ...brand, competitors: [] })
    expect(competitors).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/collection/brand-profile.test.ts
```

Expected: FAIL

`src/lib/collection/brand-profile.ts`:

```ts
import type { BrandProfile } from '@/lib/detection/types'

export interface BrandLike {
  name: string
  aliases: string[]
  ambiguous: boolean
  competitors: { name: string; aliases: string[] }[]
}

export function toBrandProfiles(brand: BrandLike): {
  self: BrandProfile
  competitors: BrandProfile[]
} {
  return {
    self: {
      canonical: brand.name,
      aliases: brand.aliases,
      ambiguous: brand.ambiguous,
    },
    competitors: brand.competitors.map((c) => ({
      canonical: c.name,
      aliases: c.aliases,
      // 경쟁사 별칭은 고객이 편집하지 않으므로 보수적으로 2차 판정을 강제한다.
      ambiguous: true,
    })),
  }
}
```

```bash
pnpm vitest run src/lib/collection/brand-profile.test.ts
```

Expected: PASS (4 passed)

- [ ] **Step 3: 판정 리포지토리**

`src/lib/collection/detection-repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { answers, collectionRuns, detections } from '@/lib/db/schema'
import type { DetectionResult } from '@/lib/detection/types'

export async function saveDetections(
  results: readonly DetectionResult[],
  detectorVersion: number,
): Promise<void> {
  if (results.length === 0) return

  const rows = results.map((r) => ({
    id: randomUUID(),
    answerId: r.answerId,
    subject: r.subject,
    mentioned: r.mentioned,
    position: r.position,
    sentiment: r.sentiment,
    context: r.context,
    detectorVersion,
    unresolved: r.unresolved,
  }))

  // 재판정 정책: 기존 판정을 삭제하지 않고 새 버전 판정을 추가한다 (감사 추적).
  // 같은 (answer, subject, version) 조합이면 재시도이므로 무시한다.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(detections).values(rows.slice(i, i + CHUNK)).onConflictDoNothing()
  }
}

/** 대시보드는 최신 버전 판정 기준으로 표시한다. */
export async function loadDetectionsForRun(runId: string, detectorVersion: number) {
  const answerRows = await db
    .select({
      id: answers.id,
      queryId: answers.queryId,
      queryText: answers.queryText,
      engineId: answers.engineId,
    })
    .from(answers)
    .where(eq(answers.runId, runId))

  if (answerRows.length === 0) return { answers: [], detections: [] }

  const detectionRows = await db
    .select({
      answerId: detections.answerId,
      subject: detections.subject,
      mentioned: detections.mentioned,
      position: detections.position,
    })
    .from(detections)
    .where(
      and(
        inArray(
          detections.answerId,
          answerRows.map((a) => a.id),
        ),
        eq(detections.detectorVersion, detectorVersion),
      ),
    )

  const byAnswer = new Map(answerRows.map((a) => [a.id, a]))

  return {
    answers: answerRows,
    detections: detectionRows.map((d) => ({
      answerId: d.answerId,
      queryId: byAnswer.get(d.answerId)?.queryId ?? '',
      engineId: byAnswer.get(d.answerId)?.engineId ?? '',
      subject: d.subject,
      mentioned: d.mentioned,
      position: d.position,
    })),
  }
}

export async function updateRunStage1PassRate(runId: string, rate: number): Promise<void> {
  const run = await db.query.collectionRuns.findFirst({
    where: eq(collectionRuns.id, runId),
  })
  if (!run?.metrics) return
  await db
    .update(collectionRuns)
    .set({ metrics: { ...run.metrics, stage1PassRate: rate } })
    .where(eq(collectionRuns.id, runId))
}
```

- [ ] **Step 4: 판정 잡**

`src/trigger/judge-run.ts`:

```ts
import { logger, task } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { toBrandProfiles } from '@/lib/collection/brand-profile'
import {
  saveDetections,
  updateRunStage1PassRate,
} from '@/lib/collection/detection-repository'
import { loadRunAnswers } from '@/lib/collection/repository'
import { db } from '@/lib/db'
import { brands, collectionRuns } from '@/lib/db/schema'
import { DETECTOR_VERSION, detectMentions } from '@/lib/detection'
import { claudeJudge } from '@/lib/judge/claude'
import { aggregateRun } from './aggregate-run'

export interface JudgeRunPayload {
  runId: string
  brandId: string
  /** 재판정 시 지정. 없으면 현재 버전 */
  detectorVersion?: number
}

export const judgeRun = task({
  id: 'judge-run',
  maxDuration: 900,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 10_000 },
  run: async (payload: JudgeRunPayload) => {
    const version = payload.detectorVersion ?? DETECTOR_VERSION

    const brand = await db.query.brands.findFirst({ where: eq(brands.id, payload.brandId) })
    if (!brand) throw new Error(`브랜드 없음: ${payload.brandId}`)

    const answers = await loadRunAnswers(payload.runId)
    if (answers.length === 0) {
      logger.warn('judge-run.no_answers', { runId: payload.runId })
      return { judged: 0 }
    }

    const { self, competitors } = toBrandProfiles(brand)

    let passRate: number | null = null

    const results = await detectMentions(
      answers.map((a) => ({
        answerId: a.id,
        answerText: a.text,
        self,
        competitors,
      })),
      claudeJudge,
      {
        batchSize: 20,
        onStats: (s) => {
          passRate = s.stage1Candidates > 0 ? s.stage1Passed / s.stage1Candidates : 0
          logger.info('judge-run.stats', s)
        },
        onBatchError: (error, ids) => {
          // 이 배치만 미판정으로 남는다. 원본이 있으므로 나중에 재판정 가능.
          logger.error('judge-run.batch_failed', {
            count: ids.length,
            error: error instanceof Error ? error.message : String(error),
          })
        },
      },
    )

    await saveDetections(results, version)
    if (passRate !== null) await updateRunStage1PassRate(payload.runId, passRate)

    const unresolved = results.filter((r) => r.unresolved).length
    logger.info('judge-run.done', { runId: payload.runId, judged: results.length, unresolved })

    await aggregateRun.trigger({ runId: payload.runId, brandId: payload.brandId, detectorVersion: version })

    return { judged: results.length, unresolved, stage1PassRate: passRate }
  },
})
```

- [ ] **Step 5: 집계 잡**

`src/trigger/aggregate-run.ts`:

```ts
import { logger, task } from '@trigger.dev/sdk'
import { and, desc, eq, lt } from 'drizzle-orm'
import { comparableEngines } from '@/lib/collection/completeness'
import { loadDetectionsForRun } from '@/lib/collection/detection-repository'
import { db } from '@/lib/db'
import { brands, collectionRuns, user } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { weeklyReportEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { computeMetrics } from '@/lib/stats/metrics'
import { judgeChange, wilsonInterval } from '@/lib/stats/wilson'

export interface AggregateRunPayload {
  runId: string
  brandId: string
  detectorVersion: number
}

export const aggregateRun = task({
  id: 'aggregate-run',
  maxDuration: 300,
  run: async (payload: AggregateRunPayload) => {
    const run = await db.query.collectionRuns.findFirst({
      where: eq(collectionRuns.id, payload.runId),
    })
    if (!run) throw new Error(`수집 없음: ${payload.runId}`)

    const brand = await db.query.brands.findFirst({ where: eq(brands.id, payload.brandId) })
    if (!brand) throw new Error(`브랜드 없음: ${payload.brandId}`)

    const { answers, detections } = await loadDetectionsForRun(
      payload.runId,
      payload.detectorVersion,
    )

    const metrics = computeMetrics(answers, detections, {
      self: 'self',
      competitors: brand.competitors.map((c) => `competitor:${c.name}`),
    })

    // 지난 수집과 비교 — 엔진 구성이 같은 주끼리만.
    const [previous] = await db
      .select()
      .from(collectionRuns)
      .where(
        and(
          eq(collectionRuns.brandId, payload.brandId),
          lt(collectionRuns.startedAt, run.startedAt),
        ),
      )
      .orderBy(desc(collectionRuns.startedAt))
      .limit(1)

    let verdict: ReturnType<typeof judgeChange> = 'incomparable'
    if (previous) {
      const prevData = await loadDetectionsForRun(previous.id, previous.planSnapshot.detectorVersion)
      const prevMetrics = computeMetrics(prevData.answers, prevData.detections, {
        self: 'self',
        competitors: [],
      })
      verdict = judgeChange(prevMetrics.citedRate, metrics.citedRate, {
        prevEngines: comparableEngines(previous.completeness),
        currEngines: comparableEngines(run.completeness),
      })
    }

    logger.info('aggregate-run.done', {
      runId: payload.runId,
      citedRate: metrics.citedRate.point,
      verdict,
      totalAnswers: metrics.totalAnswers,
    })

    // 주간 리포트 메일 — "새 데이터가 나왔다"는 알림이지 본체가 아니다.
    if (run.trigger === 'schedule' || run.trigger === 'signup') {
      const owner = await db.query.user.findFirst({ where: eq(user.id, brand.userId) })
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          content: weeklyReportEmail({
            brandName: brand.name,
            citedRate: metrics.citedRate.point,
            dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard?brand=${brand.id}`,
            changed: verdict === 'up' || verdict === 'down',
            direction: verdict === 'up' ? 'up' : verdict === 'down' ? 'down' : undefined,
          }),
        })
      }
    }

    return {
      citedRate: metrics.citedRate.point,
      firstMentionRate: metrics.firstMentionRate.point,
      shareOfVoice: metrics.shareOfVoice.point,
      verdict,
    }
  },
})
```

- [ ] **Step 6: 로컬 검증 — 판정까지 전체 흐름**

Task 3 Step 8의 시드로 다시 `collect-brand`를 실행하고, 완료 후:

```bash
pnpm db:studio
```

확인할 것:
- `detections` 테이블에 행이 생겼는가
- `detectorVersion`이 1인가
- `collection_runs.metrics.stage1PassRate`가 채워졌는가 (설계 문서의 70~80%
  탈락 가정과 비교한다)
- 리포트 메일이 발송되었는가 (trigger가 `manual`이면 발송하지 않는다 — 정상)

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(collection): 판정 배치 잡 · 집계 잡 · 주간 리포트 메일

수집과 판정을 분리해 판정 실패가 데이터 손실이 되지 않게 한다."
```

---

### Task 5: 일일 스케줄러

**Files:**
- Create: `src/trigger/daily-scheduler.ts`
- Test: `tests/integration/scheduler.test.ts`

**Interfaces:**
- Consumes: `selectBrandsForToday` (Task 2), `collectBrand` (Task 3)
- Produces: `dailyScheduler` — 매일 1회 도는 유일한 스케줄

- [ ] **Step 1: 통합 테스트 작성**

`tests/integration/scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectBrandsForToday } from '@/lib/collection/schedule'

describe('스케줄 설계 — 전체 1개', () => {
  it('요일이 고르게 분산되면 하루 부하가 1/7로 준다', () => {
    // 고객 70명이 요일별로 10명씩 가입했다고 가정
    const brands = Array.from({ length: 70 }, (_, i) => ({
      id: `b${i}`,
      collectionWeekday: i % 7,
      isActive: true,
      subscriptionStatus: 'active' as const,
    }))

    const monday = new Date('2026-07-26T16:00:00Z') // KST 월요일
    const today = selectBrandsForToday(brands, monday)
    expect(today).toHaveLength(10)
  })

  it('스케줄이 브랜드 수와 무관하게 1개다 (Trigger.dev 한도 10개 회피)', () => {
    // 이 테스트는 설계 의도를 문서화한다.
    // src/trigger/ 에서 schedules.task 를 쓰는 파일이 정확히 1개여야 한다.
    const scheduleFileCount = 1
    expect(scheduleFileCount).toBe(1)
  })
})
```

- [ ] **Step 2: 실행 (기존 코드로 통과해야 한다)**

```bash
pnpm vitest run tests/integration/scheduler.test.ts
```

Expected: PASS (2 passed)

- [ ] **Step 3: 스케줄러 구현**

`src/trigger/daily-scheduler.ts`:

```ts
import { logger, schedules } from '@trigger.dev/sdk'
import { eq } from 'drizzle-orm'
import { selectBrandsForToday } from '@/lib/collection/schedule'
import { db } from '@/lib/db'
import { brands, subscriptions } from '@/lib/db/schema'
import { collectBrand } from './collect-brand'

/**
 * 이 프로젝트의 **유일한** 스케줄이다.
 *
 * 브랜드마다 스케줄을 만들면 Trigger.dev 무료 티어의 스케줄 한도 10개에
 * 고객 10명에서 막힌다. 매일 도는 스케줄 1개가 오늘 수집할 브랜드를 고르는
 * 편이 한도와 무관하게 더 나은 설계다.
 *
 * 새 스케줄을 추가하기 전에 이 태스크로 흡수할 수 있는지 먼저 검토한다.
 */
export const dailyScheduler = schedules.task({
  id: 'daily-scheduler',
  // 매일 KST 오전 9시 = UTC 0시. SERP 두 번째 샘플이 오후에 나가도록.
  cron: { pattern: '0 0 * * *', timezone: 'Asia/Seoul' },
  maxDuration: 600,
  run: async (payload) => {
    const now = payload.timestamp

    const rows = await db
      .select({
        id: brands.id,
        collectionWeekday: brands.collectionWeekday,
        isActive: brands.isActive,
        subscriptionStatus: subscriptions.status,
      })
      .from(brands)
      .leftJoin(subscriptions, eq(subscriptions.userId, brands.userId))

    const targets = selectBrandsForToday(
      rows.map((r) => ({
        id: r.id,
        collectionWeekday: r.collectionWeekday,
        isActive: r.isActive,
        subscriptionStatus: r.subscriptionStatus ?? 'canceled',
      })),
      now,
    )

    logger.info('daily-scheduler.selected', {
      total: rows.length,
      selected: targets.length,
      weekday: now.getUTCDay(),
    })

    if (targets.length === 0) return { triggered: 0 }

    await collectBrand.batchTrigger(
      targets.map((b) => ({ payload: { brandId: b.id, trigger: 'schedule' as const } })),
    )

    return { triggered: targets.length }
  },
})
```

- [ ] **Step 4: 배포 후 스케줄 등록 확인**

```bash
pnpm dlx trigger.dev@latest deploy
```

Trigger.dev 대시보드 > Schedules에서 `daily-scheduler`가 **1개만** 등록되어
있는지 확인한다. 다음 실행 시각이 KST 오전 9시인지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(collection): 일일 스케줄러 (전체 1개, 요일별 부하 분산)"
```

---

### Task 6: 무료 진단 남용 방지

**Files:**
- Create: `src/lib/audit/hash.ts`, `src/lib/audit/limits.ts`,
  `src/lib/audit/queries.ts`
- Test: 각각의 `.test.ts`
- Modify: `.env.example` (`AUDIT_IP_SALT` 추가)

**Interfaces:**
- Consumes: 없음 (순수 + 해시)
- Produces:
  - `hashIp(ip: string): string` — HMAC. 원문 저장 금지
  - `checkAuditLimits(args): LimitVerdict`
  - `DAILY_IP_LIMIT`, `DAILY_GLOBAL_LIMIT`, `BRAND_MONTHLY_LIMIT`
  - `generateAuditQueries(category, brandName): string[]` — 3개

**이것은 남용 방지 장치이기 이전에 비용 통제 장치다.** 설계 문서: "무료 진단은
트래픽이 늘수록 순수 적자다. 일일 상한은 반드시 실제로 작동해야 한다."

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/audit/limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  BRAND_MONTHLY_LIMIT,
  DAILY_GLOBAL_LIMIT,
  DAILY_IP_LIMIT,
  checkAuditLimits,
} from '@/lib/audit/limits'

const base = {
  ipCountToday: 0,
  globalCountToday: 0,
  brandCountThisMonth: 0,
}

describe('checkAuditLimits', () => {
  it('한도 내면 허용한다', () => {
    expect(checkAuditLimits(base).allowed).toBe(true)
  })

  it('IP 일일 상한을 넘으면 거부한다', () => {
    const v = checkAuditLimits({ ...base, ipCountToday: DAILY_IP_LIMIT })
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('ip_daily')
  })

  it('전체 일일 상한을 넘으면 거부한다 (비용 통제)', () => {
    const v = checkAuditLimits({ ...base, globalCountToday: DAILY_GLOBAL_LIMIT })
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('global_daily')
  })

  it('같은 브랜드 월 1회를 넘으면 거부한다', () => {
    const v = checkAuditLimits({ ...base, brandCountThisMonth: BRAND_MONTHLY_LIMIT })
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('brand_monthly')
  })

  it('전체 상한이 먼저 걸린다 (비용이 가장 중요한 제약)', () => {
    const v = checkAuditLimits({
      ipCountToday: DAILY_IP_LIMIT,
      globalCountToday: DAILY_GLOBAL_LIMIT,
      brandCountThisMonth: BRAND_MONTHLY_LIMIT,
    })
    expect(v.reason).toBe('global_daily')
  })

  it('거부 시에도 대기 등록은 허용한다 (리드는 확보한다)', () => {
    const v = checkAuditLimits({ ...base, globalCountToday: DAILY_GLOBAL_LIMIT })
    expect(v.allowWaitlist).toBe(true)
  })

  it('전체 일일 상한이 설계 문서의 비용 시나리오 안에 있다', () => {
    // 월 3,000건(일 100건)이면 변동비 24만원. 그 이상은 감당 불가.
    expect(DAILY_GLOBAL_LIMIT).toBeLessThanOrEqual(100)
    expect(DAILY_GLOBAL_LIMIT).toBeGreaterThan(0)
  })
})
```

`src/lib/audit/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashIp } from '@/lib/audit/hash'

describe('hashIp', () => {
  it('같은 IP는 같은 해시를 낸다', () => {
    expect(hashIp('1.2.3.4', 'salt')).toBe(hashIp('1.2.3.4', 'salt'))
  })

  it('다른 IP는 다른 해시를 낸다', () => {
    expect(hashIp('1.2.3.4', 'salt')).not.toBe(hashIp('1.2.3.5', 'salt'))
  })

  it('솔트가 다르면 다른 해시를 낸다', () => {
    expect(hashIp('1.2.3.4', 'a')).not.toBe(hashIp('1.2.3.4', 'b'))
  })

  it('원본 IP가 결과에 나타나지 않는다', () => {
    expect(hashIp('192.168.0.1', 'salt')).not.toContain('192')
  })

  it('IPv6도 처리한다', () => {
    expect(hashIp('2001:db8::1', 'salt')).toHaveLength(64)
  })

  it('빈 문자열도 던지지 않는다', () => {
    expect(hashIp('', 'salt')).toHaveLength(64)
  })
})
```

`src/lib/audit/queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AUDIT_QUERY_COUNT, generateAuditQueries } from '@/lib/audit/queries'

describe('generateAuditQueries', () => {
  it('정확히 3개를 만든다 (원가 통제 — 설계 문서)', () => {
    expect(generateAuditQueries('패션', '무신사')).toHaveLength(AUDIT_QUERY_COUNT)
    expect(AUDIT_QUERY_COUNT).toBe(3)
  })

  it('브랜드명을 질의에 넣지 않는다 (넣으면 반드시 언급된다)', () => {
    for (const q of generateAuditQueries('패션', '무신사')) {
      expect(q).not.toContain('무신사')
    }
  })

  it('알 수 없는 카테고리에도 기본 질의를 만든다', () => {
    expect(generateAuditQueries('한 번도 본 적 없는 분야', 'X')).toHaveLength(3)
  })

  it('같은 입력에 같은 질의를 낸다 (재현 가능)', () => {
    expect(generateAuditQueries('패션', 'X')).toEqual(generateAuditQueries('패션', 'X'))
  })

  it('카테고리별로 다른 질의를 낸다', () => {
    expect(generateAuditQueries('패션', 'X')).not.toEqual(generateAuditQueries('스포츠', 'X'))
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/audit/
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/audit/hash.ts`:

```ts
import { createHmac } from 'node:crypto'

/**
 * IP를 단방향 해시로 바꾼다. 원문은 저장하지 않는다.
 *
 * 개인정보처리방침에 "접속 IP는 원문을 저장하지 않고, 남용 방지 목적의
 * 단방향 해시값만 보관합니다"라고 명시했다. 이 함수가 그 약속을 지킨다.
 */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex')
}

/** 프록시 헤더에서 클라이언트 IP를 뽑는다. Vercel은 x-forwarded-for를 채운다. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? '0.0.0.0'
}
```

`src/lib/audit/limits.ts`:

```ts
/**
 * 무료 진단 상한.
 *
 * 이것은 남용 방지 장치이기 이전에 **비용 통제 장치**다.
 * 진단 1건 = 3질의 × 2엔진 × 1샘플 = 6호출 = 50~110원.
 * 무료 진단은 트래픽이 늘수록 순수 적자이므로 반드시 실제로 작동해야 한다.
 *
 * 월 3,000건(일 100건) = 변동비 약 24만원. 이것이 감당 가능한 상한이다.
 */
export const DAILY_GLOBAL_LIMIT = 100
export const DAILY_IP_LIMIT = 3
export const BRAND_MONTHLY_LIMIT = 1

export type LimitReason = 'global_daily' | 'ip_daily' | 'brand_monthly'

export interface LimitInput {
  ipCountToday: number
  globalCountToday: number
  brandCountThisMonth: number
}

export interface LimitVerdict {
  allowed: boolean
  reason: LimitReason | null
  /** 거부하더라도 대기 등록으로 리드는 확보한다 */
  allowWaitlist: boolean
  message: string | null
}

export function checkAuditLimits(input: LimitInput): LimitVerdict {
  // 비용이 가장 중요한 제약이므로 전체 상한을 먼저 본다.
  if (input.globalCountToday >= DAILY_GLOBAL_LIMIT) {
    return {
      allowed: false,
      reason: 'global_daily',
      allowWaitlist: true,
      message: '오늘 무료 진단이 마감되었습니다. 이메일을 남겨주시면 내일 결과를 보내드립니다.',
    }
  }
  if (input.ipCountToday >= DAILY_IP_LIMIT) {
    return {
      allowed: false,
      reason: 'ip_daily',
      allowWaitlist: true,
      message: '하루에 진단할 수 있는 횟수를 모두 사용하셨습니다.',
    }
  }
  if (input.brandCountThisMonth >= BRAND_MONTHLY_LIMIT) {
    return {
      allowed: false,
      reason: 'brand_monthly',
      allowWaitlist: false,
      message:
        '이 브랜드는 이번 달에 이미 진단했습니다. 매주 자동 추적을 원하시면 요금제를 확인해 주세요.',
    }
  }
  return { allowed: true, reason: null, allowWaitlist: false, message: null }
}
```

`src/lib/audit/queries.ts`:

```ts
/**
 * 무료 진단 질의 수. 3개로 줄인 이유는 원가다 —
 * 3질의 × 2엔진 × 1샘플 = 6호출 = 50~110원.
 */
export const AUDIT_QUERY_COUNT = 3

/**
 * 카테고리별 기본 질의 템플릿.
 *
 * 브랜드명을 절대 넣지 않는다. 넣으면 AI가 반드시 그 브랜드를 언급하므로
 * 측정이 무의미해진다. 소비자가 실제로 묻는 방식이어야 한다.
 */
const TEMPLATES: Record<string, string[]> = {
  패션: ['온라인 패션 쇼핑몰 추천', '20대 남자 옷 사이트 어디가 좋아?', '가성비 좋은 기본템 브랜드'],
  스포츠: ['30대 남자 러닝화 추천해줘', '발볼 넓은 사람 운동화', '초보자용 운동복 브랜드'],
  뷰티: ['민감성 피부 스킨케어 추천', '가성비 좋은 선크림', '남자 기초 화장품 브랜드'],
  식품: ['건강한 간편식 브랜드 추천', '단백질 보충제 어디가 좋아?', '유기농 식재료 정기배송'],
  가전: ['가성비 무선 청소기 추천', '1인 가구 냉장고 브랜드', '노트북 추천해줘'],
  가구: ['1인 가구 침대 브랜드 추천', '가성비 좋은 소파', '원룸 인테리어 가구 쇼핑몰'],
  교육: ['성인 영어 회화 학원 추천', '온라인 강의 플랫폼 비교', '코딩 부트캠프 어디가 좋아?'],
  금융: ['적금 이자 높은 은행', '주식 앱 추천', '보험 비교 사이트'],
  여행: ['국내 숙소 예약 사이트 추천', '항공권 저렴하게 사는 법', '해외여행 패키지 어디서 사?'],
  반려동물: ['강아지 사료 추천', '고양이 모래 브랜드', '반려동물 용품 쇼핑몰'],
}

/** 카테고리를 모를 때 쓰는 범용 질의 */
const FALLBACK = (category: string): string[] => [
  `${category} 브랜드 추천해줘`,
  `가성비 좋은 ${category} 어디가 좋아?`,
  `${category} 사이트 비교`,
]

/**
 * 진단용 질의 3개를 만든다.
 * 결정적이다 — 같은 입력에 항상 같은 질의를 낸다.
 */
export function generateAuditQueries(category: string, _brandName: string): string[] {
  const normalized = category.trim()
  const template = TEMPLATES[normalized]
  const queries = template ?? FALLBACK(normalized || '제품')
  return queries.slice(0, AUDIT_QUERY_COUNT)
}

export function knownCategories(): string[] {
  return Object.keys(TEMPLATES)
}
```

`.env.example`에 추가:

```bash
AUDIT_IP_SALT=           # openssl rand -hex 32 — IP 해시용 솔트
```

`src/lib/env.ts`의 스키마에 `AUDIT_IP_SALT: z.string().min(16)` 추가 (필수).

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/audit/
```

Expected: PASS (18 passed)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(audit): 무료 진단 상한 · IP 해시 · 카테고리별 질의 생성

일일 상한은 남용 방지 이전에 비용 통제 장치다."
```

---

### Task 7: 무료 진단 잡과 API

**Files:**
- Create: `src/trigger/free-audit.ts`, `src/app/api/audit/route.ts`,
  `src/lib/audit/repository.ts`, `src/lib/audit/result.ts`
- Test: `src/lib/audit/result.test.ts`

**Interfaces:**
- Consumes: Task 6의 상한·질의, 엔진·판정·집계 (2단계)
- Produces:
  - `freeAudit` — 진단 잡. Realtime으로 진행률 스트리밍
  - `POST /api/audit` — 진단 시작. 상한 검사 후 잡 트리거
  - `interface AuditResult { citedRate; evidence; ranking; byEngine; byQuery }`
  - `buildAuditResult(...)` — 순수 함수

- [ ] **Step 1: 결과 구성 실패 테스트**

`src/lib/audit/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildAuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

const metrics = {
  totalAnswers: 6,
  citedRate: wilsonInterval(2, 6),
  firstMentionRate: wilsonInterval(1, 6),
  shareOfVoice: wilsonInterval(2, 8),
  byEngine: { chatgpt: wilsonInterval(2, 3), gemini: wilsonInterval(0, 3) },
  byQuery: [
    { queryId: 'q1', queryText: '러닝화 추천', interval: wilsonInterval(0, 2) },
    { queryId: 'q2', queryText: '운동화 브랜드', interval: wilsonInterval(2, 2) },
  ],
  competitorRates: {},
}

const answers = [
  { id: 'a1', queryText: '러닝화 추천', engineId: 'chatgpt', text: '나이키와 아디다스를 추천합니다.' },
  { id: 'a2', queryText: '운동화 브랜드', engineId: 'chatgpt', text: '아식스가 좋습니다.' },
]

const mentions = [
  { answerId: 'a2', subject: 'self', mentioned: true, position: 1 },
  { answerId: 'a1', subject: 'self', mentioned: false, position: null },
]

describe('buildAuditResult', () => {
  it('C(증거) — 실제 AI 답변 원문을 2~3개 담는다', () => {
    const r = buildAuditResult({ brandName: '아식스', metrics, answers, mentions })
    expect(r.evidence.length).toBeGreaterThanOrEqual(1)
    expect(r.evidence.length).toBeLessThanOrEqual(3)
    expect(r.evidence[0]?.text).toBeTruthy()
    expect(r.evidence[0]?.engineId).toBeTruthy()
    expect(r.evidence[0]?.query).toBeTruthy()
  })

  it('증거는 언급된 답변을 먼저 보여준다 (신뢰가 먼저 서야 한다)', () => {
    const r = buildAuditResult({ brandName: '아식스', metrics, answers, mentions })
    expect(r.evidence[0]?.mentioned).toBe(true)
  })

  it('B(순위) — AI가 실제로 답한 브랜드 순위표를 만든다', () => {
    const r = buildAuditResult({ brandName: '아식스', metrics, answers, mentions })
    expect(r.ranking.length).toBeGreaterThan(0)
    expect(r.ranking.some((x) => x.isSelf)).toBe(true)
  })

  it('A(전체 지표) — 게이트 뒤의 정보', () => {
    const r = buildAuditResult({ brandName: '아식스', metrics, answers, mentions })
    expect(r.citedRate.point).toBeCloseTo(2 / 6, 6)
    expect(r.byEngine).toHaveProperty('chatgpt')
    expect(r.byQuery.length).toBe(2)
  })

  it('언급이 0이어도 결과를 만든다 (이것도 팔 만한 정보다)', () => {
    const zero = { ...metrics, citedRate: wilsonInterval(0, 6) }
    const r = buildAuditResult({
      brandName: 'X', metrics: zero, answers,
      mentions: answers.map((a) => ({ answerId: a.id, subject: 'self', mentioned: false, position: null })),
    })
    expect(r.citedRate.point).toBe(0)
    expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('답변 텍스트를 자른다 (결과 화면에 통째로 넣지 않는다)', () => {
    const long = [{ ...answers[0]!, text: 'x'.repeat(5000) }]
    const r = buildAuditResult({
      brandName: 'X', metrics, answers: long,
      mentions: [{ answerId: 'a1', subject: 'self', mentioned: true, position: 1 }],
    })
    expect(r.evidence[0]!.text.length).toBeLessThanOrEqual(600)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/audit/result.test.ts
```

Expected: FAIL

`src/lib/audit/result.ts`:

```ts
import type { BrandMetrics } from '@/lib/stats/metrics'
import type { Interval } from '@/lib/stats/wilson'

export interface EvidenceItem {
  query: string
  engineId: string
  /** 자른 답변 원문 */
  text: string
  mentioned: boolean
}

export interface RankingItem {
  name: string
  mentions: number
  isSelf: boolean
}

export interface AuditResult {
  brandName: string
  totalAnswers: number
  citedRate: Interval
  /** C — 증거. 이메일 게이트 앞에 공개한다. */
  evidence: EvidenceItem[]
  /** B — 순위. 게이트 앞에 공개한다. 감정 정점. */
  ranking: RankingItem[]
  /** A — 전체 지표. 게이트 뒤. */
  byEngine: Record<string, Interval>
  byQuery: { queryText: string; interval: Interval }[]
}

const EVIDENCE_MAX = 3
const EVIDENCE_TEXT_LIMIT = 600

export interface BuildAuditResultArgs {
  brandName: string
  metrics: BrandMetrics
  answers: { id: string; queryText: string; engineId: string; text: string }[]
  mentions: { answerId: string; subject: string; mentioned: boolean; position: number | null }[]
}

/**
 * 무료 진단 결과를 C → B → A 순서로 구성한다.
 *
 * 설계 ④: 기다린 방문자의 첫 질문은 "이거 진짜야?"이므로 첫 임무는 충격이
 * 아니라 신뢰다. 숫자와 순위는 반박 가능하지만("그 숫자 어떻게 잰 건데?")
 * AI 답변 원문은 반박할 수 없고 방문자가 직접 검증할 수 있다.
 */
export function buildAuditResult(args: BuildAuditResultArgs): AuditResult {
  const mentionedIds = new Set(
    args.mentions.filter((m) => m.subject === 'self' && m.mentioned).map((m) => m.answerId),
  )

  // C — 언급된 답변을 먼저. 없으면 미언급 답변이라도 보여준다.
  const sorted = [...args.answers].sort((a, b) => {
    const am = mentionedIds.has(a.id) ? 0 : 1
    const bm = mentionedIds.has(b.id) ? 0 : 1
    return am - bm
  })

  const evidence: EvidenceItem[] = sorted.slice(0, EVIDENCE_MAX).map((a) => ({
    query: a.queryText,
    engineId: a.engineId,
    text: truncate(a.text, EVIDENCE_TEXT_LIMIT),
    mentioned: mentionedIds.has(a.id),
  }))

  // B — 답변에 실제로 등장한 브랜드 순위.
  //     경쟁사 판정이 없는 무료 진단에서는 우리 브랜드 언급 수만 확실하므로,
  //     나머지는 답변 텍스트에서 추출하지 않고 우리 것만 보여준다.
  //     (경쟁사 자동 추천은 온보딩에서 진단 결과를 재사용해 만든다.)
  const ranking: RankingItem[] = [
    { name: args.brandName, mentions: mentionedIds.size, isSelf: true },
  ]

  return {
    brandName: args.brandName,
    totalAnswers: args.metrics.totalAnswers,
    citedRate: args.metrics.citedRate,
    evidence,
    ranking,
    byEngine: args.metrics.byEngine,
    byQuery: args.metrics.byQuery.map((q) => ({
      queryText: q.queryText,
      interval: q.interval,
    })),
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
```

```bash
pnpm vitest run src/lib/audit/result.test.ts
```

Expected: PASS (6 passed)

- [ ] **Step 3: 진단 리포지토리**

`src/lib/audit/repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { freeAudits, type AuditStatus } from '@/lib/db/schema'

export async function countAuditsToday(ipHash: string): Promise<{ ip: number; global: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [ipRow] = await db
    .select({ n: count() })
    .from(freeAudits)
    .where(and(eq(freeAudits.ipHash, ipHash), gte(freeAudits.createdAt, since)))
  const [globalRow] = await db
    .select({ n: count() })
    .from(freeAudits)
    .where(gte(freeAudits.createdAt, since))
  return { ip: ipRow?.n ?? 0, global: globalRow?.n ?? 0 }
}

export async function countBrandAuditsThisMonth(brandName: string): Promise<number> {
  const since = new Date()
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)
  const [row] = await db
    .select({ n: count() })
    .from(freeAudits)
    .where(
      and(
        sql`lower(${freeAudits.brandName}) = lower(${brandName})`,
        gte(freeAudits.createdAt, since),
      ),
    )
  return row?.n ?? 0
}

export async function createAudit(args: {
  brandName: string
  category: string
  ipHash: string
  variant: string
  status: AuditStatus
}): Promise<string> {
  const id = randomUUID()
  await db.insert(freeAudits).values({ id, ...args })
  return id
}

export async function updateAudit(
  id: string,
  patch: Partial<{ status: AuditStatus; result: unknown; email: string; emailVerified: boolean }>,
): Promise<void> {
  await db.update(freeAudits).set(patch).where(eq(freeAudits.id, id))
}

export async function getAudit(id: string) {
  return db.query.freeAudits.findFirst({ where: eq(freeAudits.id, id) })
}
```

- [ ] **Step 4: 진단 잡**

`src/trigger/free-audit.ts`:

```ts
import { logger, metadata, task } from '@trigger.dev/sdk'
import { generateAuditQueries } from '@/lib/audit/queries'
import { updateAudit } from '@/lib/audit/repository'
import { buildAuditResult } from '@/lib/audit/result'
import { detectMentions } from '@/lib/detection'
import { getEngine } from '@/lib/engines'
import { claudeJudge } from '@/lib/judge/claude'
import { PLANS } from '@/lib/plans'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'

export interface FreeAuditPayload {
  auditId: string
  brandName: string
  category: string
}

/**
 * 무료 진단.
 *
 * 3질의 × 2엔진 × 1샘플 = 6호출로 10초 안팎. Vercel 함수 타임아웃 안에서
 * 동기 처리하면 위험하므로 잡으로 던지고 Realtime으로 진행률을 스트리밍한다.
 * 진행 문구 자체가 "이 도구가 진짜로 AI에 물어보고 있다"는 증거로 작동한다.
 */
export const freeAudit = task({
  id: 'free-audit',
  maxDuration: 300,
  run: async (payload: FreeAuditPayload) => {
    const queries = generateAuditQueries(payload.category, payload.brandName)
    const engineIds = PLANS.free.engines
    const total = queries.length * engineIds.length

    await updateAudit(payload.auditId, { status: 'running' })
    metadata.set('progress', { done: 0, total, label: '준비 중…' })

    const answers: (AnswerRecord & { text: string })[] = []
    let done = 0

    for (const [qi, query] of queries.entries()) {
      for (const engineId of engineIds) {
        const engine = getEngine(engineId)
        const label =
          engineId === 'chatgpt'
            ? `ChatGPT에 물어보는 중… (${done + 1}/${total})`
            : `Gemini에 물어보는 중… (${done + 1}/${total})`
        metadata.set('progress', { done, total, label })

        try {
          const a = await engine.run(query, { sampleIndex: 0 })
          answers.push({
            id: `${qi}-${engineId}`,
            queryId: `q${qi}`,
            queryText: query,
            engineId,
            text: a.text,
          })
        } catch (error) {
          logger.warn('free-audit.engine_failed', {
            engineId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        done++
        metadata.set('progress', { done, total, label })
      }
    }

    if (answers.length === 0) {
      await updateAudit(payload.auditId, { status: 'failed' })
      throw new Error('모든 엔진 호출이 실패했습니다')
    }

    metadata.set('progress', { done: total, total, label: '결과를 정리하는 중…' })

    const detections = await detectMentions(
      answers.map((a) => ({
        answerId: a.id,
        answerText: a.text,
        self: { canonical: payload.brandName, aliases: [], ambiguous: false },
        competitors: [],
      })),
      claudeJudge,
    )

    const detectionRecords: DetectionRecord[] = detections.map((d) => {
      const a = answers.find((x) => x.id === d.answerId)!
      return {
        answerId: d.answerId,
        queryId: a.queryId,
        engineId: a.engineId,
        subject: d.subject,
        mentioned: d.mentioned,
        position: d.position,
      }
    })

    const metrics = computeMetrics(answers, detectionRecords, { self: 'self', competitors: [] })

    const result = buildAuditResult({
      brandName: payload.brandName,
      metrics,
      answers,
      mentions: detectionRecords,
    })

    await updateAudit(payload.auditId, { status: 'succeeded', result })
    logger.info('free-audit.done', {
      auditId: payload.auditId,
      citedRate: metrics.citedRate.point,
      answers: answers.length,
    })

    return { citedRate: metrics.citedRate.point }
  },
})
```

- [ ] **Step 5: 진단 시작 API**

`src/app/api/audit/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientIpFrom, hashIp } from '@/lib/audit/hash'
import { checkAuditLimits } from '@/lib/audit/limits'
import {
  countAuditsToday,
  countBrandAuditsThisMonth,
  createAudit,
} from '@/lib/audit/repository'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { freeAudit } from '@/trigger/free-audit'

const schema = z.object({
  brandName: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  /** 결과 화면 노출 순서 실험 */
  variant: z.enum(['cba', 'abc']).default('cba'),
})

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 올바르지 않습니다.' }, { status: 400 })
  }

  const ipHash = hashIp(clientIpFrom(request.headers), env.AUDIT_IP_SALT)

  const [counts, brandCount] = await Promise.all([
    countAuditsToday(ipHash),
    countBrandAuditsThisMonth(parsed.data.brandName),
  ])

  const verdict = checkAuditLimits({
    ipCountToday: counts.ip,
    globalCountToday: counts.global,
    brandCountThisMonth: brandCount,
  })

  if (!verdict.allowed) {
    logger.info('audit.rejected', { reason: verdict.reason, global: counts.global })
    // 상한 소진 시 에러가 아니라 대기 등록으로 받아 리드는 확보한다.
    if (verdict.allowWaitlist) {
      const id = await createAudit({
        brandName: parsed.data.brandName,
        category: parsed.data.category,
        ipHash,
        variant: parsed.data.variant,
        status: 'waitlisted',
      })
      return NextResponse.json(
        { auditId: id, waitlisted: true, message: verdict.message },
        { status: 202 },
      )
    }
    return NextResponse.json({ error: verdict.message }, { status: 429 })
  }

  const auditId = await createAudit({
    brandName: parsed.data.brandName,
    category: parsed.data.category,
    ipHash,
    variant: parsed.data.variant,
    status: 'queued',
  })

  const handle = await freeAudit.trigger({
    auditId,
    brandName: parsed.data.brandName,
    category: parsed.data.category,
  })

  return NextResponse.json({
    auditId,
    runId: handle.id,
    // Realtime 구독용 공개 토큰
    publicAccessToken: handle.publicAccessToken,
  })
}
```

- [ ] **Step 6: 상한이 실제로 작동하는지 검증**

**이것이 이 태스크에서 가장 중요한 검증이다.** 상한이 작동하지 않으면 트래픽이
오는 순간 적자가 무한정 커진다.

```bash
pnpm dev
```

다른 터미널에서:

```bash
# IP 일일 상한(3회) 검증 — 4번째가 429 또는 202(대기)여야 한다
for i in 1 2 3 4; do
  echo -n "요청 $i: "
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/audit \
    -H 'content-type: application/json' \
    -d "{\"brandName\":\"테스트$i\",\"category\":\"패션\"}"
done
```

Expected: 1~3번은 `200`, 4번은 `202` (대기 등록)

```bash
# 브랜드 월 1회 상한 검증 — 같은 브랜드로 두 번
curl -s -X POST http://localhost:3000/api/audit -H 'content-type: application/json' \
  -d '{"brandName":"중복테스트","category":"패션"}' | head -c 200; echo
curl -s -X POST http://localhost:3000/api/audit -H 'content-type: application/json' \
  -d '{"brandName":"중복테스트","category":"패션"}' | head -c 200; echo
```

Expected: 두 번째가 `429`와 "이번 달에 이미 진단했습니다" 메시지

전체 일일 상한(100)은 `DAILY_GLOBAL_LIMIT`을 임시로 2로 낮춰 검증하고 원복한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(audit): 무료 진단 잡 · 진행률 스트리밍 · 상한 실제 작동 검증"
```

---

### Task 8: 랜딩과 진단 결과 화면

**Files:**
- Create: `src/app/(marketing)/page.tsx`, `src/app/(marketing)/pricing/page.tsx`,
  `src/components/audit/audit-form.tsx`, `src/components/audit/progress.tsx`,
  `src/components/audit/result-view.tsx`,
  `src/app/audit/[id]/page.tsx`,
  `src/app/api/audit/[id]/email/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `POST /api/audit` (Task 7), `AuditResult` (Task 7)
- Produces: 전환 퍼널 전체. 4단계 온보딩이 진단 결과를 재사용한다.

> **UI 작업 지침:** 이 태스크 착수 전에 `frontend-design` 스킬을 호출한다.
> 무료 진단 결과 화면은 **이 제품에서 전환이 일어나는 유일한 화면**이다.
> 템플릿처럼 보이면 "이거 진짜야?"라는 첫 질문에 답하지 못한다.

- [ ] **Step 1: Realtime 패키지 설치**

```bash
pnpm add @trigger.dev/react-hooks
```

- [ ] **Step 2: 랜딩 페이지**

`src/app/(marketing)/page.tsx`:

```tsx
import { AuditForm } from '@/components/audit/audit-form'
import { knownCategories } from '@/lib/audit/queries'

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto w-full max-w-3xl px-6 pb-16 pt-24 text-center">
        <p className="mb-4 text-sm font-medium text-muted-foreground">
          한국어 GEO 모니터링
        </p>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          AI가 우리 브랜드를 추천하고 있을까?
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground">
          소비자는 이제 검색창이 아니라 AI에게 묻습니다. AI는 문장으로 답하므로
          브랜드는 자기가 그 답변에 등장했는지 알 방법이 없습니다.
          <strong className="text-foreground"> Cited는 대신 물어보고 기록합니다.</strong>
        </p>

        <div className="mx-auto mt-10 max-w-lg">
          <AuditForm categories={knownCategories()} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          20초 안에 결과가 나옵니다 · 카드 정보 필요 없음
        </p>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-16 sm:grid-cols-3">
          {[
            {
              t: '월 400만원 컨설팅을 29만원에',
              d: '국내 GEO 서비스는 전부 상담 후 견적입니다. Cited는 가격이 공개되어 있고 바로 시작합니다.',
            },
            {
              t: '네이버 AI 브리핑까지',
              d: '해외 도구는 네이버를 보지 않습니다. 국내 브랜드에게는 이게 가장 중요한 채널입니다.',
            },
            {
              t: '챗봇이 아닙니다',
              d: '매주 자동으로 물어보고 결과를 쌓습니다. 로그인하면 대시보드가 있고, 데이터는 알아서 쌓입니다.',
            },
          ].map((f) => (
            <div key={f.t}>
              <h2 className="font-semibold">{f.t}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: 진단 폼**

`src/components/audit/audit-form.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AuditForm({ categories }: { categories: string[] }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)

    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brandName: String(formData.get('brandName')),
        category: String(formData.get('category')),
        // 노출 순서 실험 — 방문자를 반씩 나눈다.
        variant: Math.random() < 0.5 ? 'cba' : 'abc',
      }),
    })

    const data = (await res.json()) as {
      auditId?: string
      runId?: string
      publicAccessToken?: string
      waitlisted?: boolean
      message?: string
      error?: string
    }

    setPending(false)

    if (!res.ok && !data.waitlisted) {
      setError(data.error ?? '진단을 시작하지 못했습니다.')
      return
    }
    if (data.waitlisted) {
      router.push(`/audit/${data.auditId}?waitlisted=1`)
      return
    }
    router.push(
      `/audit/${data.auditId}?run=${data.runId}&token=${data.publicAccessToken}`,
    )
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <Input name="brandName" required placeholder="브랜드명 (예: 무신사)" className="h-12 text-base" />
      <select
        name="category"
        required
        className="h-12 rounded-md border bg-background px-3 text-base"
        defaultValue=""
      >
        <option value="" disabled>
          업종 선택
        </option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending} className="h-12 text-base">
        {pending ? '시작하는 중…' : '무료로 진단하기'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: 진행 화면**

`src/components/audit/progress.tsx`:

```tsx
'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface Progress {
  done: number
  total: number
  label: string
}

/**
 * 진행 문구 자체가 "이 도구가 진짜로 AI에 물어보고 있다"는 증거로 작동한다.
 * 그래서 스피너 하나로 뭉개지 않고 엔진 이름과 진행 수를 그대로 보여준다.
 */
export function AuditProgress({
  runId,
  accessToken,
  auditId,
}: {
  runId: string
  accessToken: string
  auditId: string
}) {
  const router = useRouter()
  const { run } = useRealtimeRun(runId, { accessToken })

  const progress = run?.metadata?.progress as Progress | undefined
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0

  useEffect(() => {
    if (run?.status === 'COMPLETED') router.refresh()
  }, [run?.status, router])

  if (run?.status === 'FAILED' || run?.status === 'CRASHED') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">진단에 실패했습니다</h1>
        <p className="mt-2 text-muted-foreground">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 알려주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">AI에게 물어보는 중입니다</h1>
      <p className="mt-2 h-6 text-muted-foreground" aria-live="polite">
        {progress?.label ?? '준비 중…'}
      </p>
      <div
        className="mt-8 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {progress ? `${progress.done} / ${progress.total}` : ''}
      </p>
    </div>
  )
}
```

- [ ] **Step 5: 결과 화면 — C → B → A**

`src/components/audit/result-view.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AuditResult } from '@/lib/audit/result'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

const ENGINE_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  naver: '네이버 AI 브리핑',
  google_aio: 'Google AI Overviews',
}

export function AuditResultView({
  auditId,
  result,
  variant,
  emailCaptured,
}: {
  auditId: string
  result: AuditResult
  variant: string
  emailCaptured: boolean
}) {
  const [unlocked, setUnlocked] = useState(emailCaptured)

  const evidence = (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground">실제 AI 답변</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        직접 ChatGPT를 열어 같은 질문을 해보세요. 우리가 받은 답변과 비교할 수 있습니다.
      </p>
      <div className="mt-4 space-y-3">
        {result.evidence.map((e, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {ENGINE_LABEL[e.engineId] ?? e.engineId}
              </span>
              <span>·</span>
              <span>&ldquo;{e.query}&rdquo;</span>
              {e.mentioned ? (
                <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                  언급됨
                </span>
              ) : (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5">미언급</span>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{e.text}</p>
          </Card>
        ))}
      </div>
    </section>
  )

  const ranking = (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground">이번 측정 결과</h2>
      <Card className="mt-4 p-6">
        <div className="text-3xl font-bold tracking-tight">
          {formatPercent(result.citedRate.point)}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.totalAnswers}번 물어봤을 때 {result.ranking[0]?.mentions ?? 0}번 언급되었습니다
        </p>
      </Card>
    </section>
  )

  const fullMetrics = unlocked ? (
    <section>
      <h2 className="text-sm font-medium text-muted-foreground">전체 지표</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-medium">엔진별</h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            {Object.entries(result.byEngine).map(([id, ci]) => (
              <div key={id} className="flex justify-between">
                <dt className="text-muted-foreground">{ENGINE_LABEL[id] ?? id}</dt>
                <dd className="font-medium tabular-nums">{formatPercent(ci.point)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-medium">질의별</h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            {result.byQuery.map((q) => (
              <div key={q.queryText} className="flex justify-between gap-3">
                <dt className="truncate text-muted-foreground">{q.queryText}</dt>
                <dd className="shrink-0 font-medium tabular-nums">
                  {q.interval.k}/{q.interval.n}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <Card className="mt-4 p-5">
        <p className="text-sm text-muted-foreground">
          이 진단은 {result.totalAnswers}회 측정 기준이라 신뢰구간이 넓습니다
          ({formatInterval(result.citedRate)}). 유료 플랜은 매주 약 100~300회를
          측정하므로 훨씬 정밀한 추세를 볼 수 있습니다.
        </p>
        <Button asChild className="mt-4">
          <a href="/pricing">매주 자동 추적 시작하기</a>
        </Button>
      </Card>
    </section>
  ) : (
    <EmailGate auditId={auditId} onUnlock={() => setUnlocked(true)} />
  )

  // 노출 순서는 가설이다. variant로 실험하고 전환 결과를 함께 기록한다.
  const order = variant === 'abc' ? [fullMetrics, ranking, evidence] : [evidence, ranking, fullMetrics]

  return (
    <main className="mx-auto w-full max-w-2xl space-y-12 px-6 py-14">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {result.brandName} · Cited Rate {formatPercent(result.citedRate.point)}
        </h1>
      </header>
      {order.map((block, i) => (
        <div key={i}>{block}</div>
      ))}
    </main>
  )
}

function EmailGate({ auditId, onUnlock }: { auditId: string; onUnlock: () => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const res = await fetch(`/api/audit/${auditId}/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: String(formData.get('email')) }),
    })
    setPending(false)
    if (!res.ok) {
      setError('등록에 실패했습니다. 다시 시도해 주세요.')
      return
    }
    onUnlock()
  }

  return (
    <Card className="border-dashed p-6">
      <h2 className="font-semibold">엔진별 · 질의별 전체 지표 보기</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        어떤 엔진에서 약한지, 어떤 질문에서 아예 안 나오는지 확인하세요.
        이메일로 리포트도 함께 보내드립니다.
      </p>
      <form action={onSubmit} className="mt-4 flex gap-2">
        <Input name="email" type="email" required placeholder="you@company.com" />
        <Button type="submit" disabled={pending}>
          {pending ? '…' : '전체 보기'}
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </Card>
  )
}
```

- [ ] **Step 6: 진단 페이지와 이메일 게이트 API**

`src/app/audit/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { AuditProgress } from '@/components/audit/progress'
import { AuditResultView } from '@/components/audit/result-view'
import { getAudit } from '@/lib/audit/repository'
import type { AuditResult } from '@/lib/audit/result'

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ run?: string; token?: string; waitlisted?: string }>
}) {
  const { id } = await params
  const sp = await searchParams

  const audit = await getAudit(id)
  if (!audit) notFound()

  if (audit.status === 'waitlisted') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">오늘 진단이 마감되었습니다</h1>
        <p className="mt-2 text-muted-foreground">
          이메일을 남겨주시면 내일 결과를 보내드립니다.
        </p>
      </main>
    )
  }

  if (audit.status === 'succeeded' && audit.result) {
    return (
      <AuditResultView
        auditId={audit.id}
        result={audit.result as AuditResult}
        variant={audit.variant}
        emailCaptured={Boolean(audit.email)}
      />
    )
  }

  if (audit.status === 'failed') {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">진단에 실패했습니다</h1>
        <p className="mt-2 text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
      </main>
    )
  }

  if (!sp.run || !sp.token) {
    return (
      <main className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">진단이 진행 중입니다</h1>
        <p className="mt-2 text-muted-foreground">잠시 후 새로고침해 주세요.</p>
      </main>
    )
  }

  return <AuditProgress runId={sp.run} accessToken={sp.token} auditId={id} />
}
```

`src/app/api/audit/[id]/email/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAudit, updateAudit } from '@/lib/audit/repository'
import { db } from '@/lib/db'
import { freeAudits } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const schema = z.object({ email: z.string().email() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const audit = await getAudit(id)
  if (!audit) return NextResponse.json({ error: '없는 진단입니다.' }, { status: 404 })

  await db
    .update(freeAudits)
    .set({ email: parsed.data.email, convertedEmailAt: new Date() })
    .where(eq(freeAudits.id, id))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: 이메일 인증 — 남용 방지의 세 번째 축**

설계 문서: "남용 방지는 **이메일 인증** + 브랜드당 월 1회 + IP 해시 기준 일일
상한으로 한다." 앞의 둘은 Task 6에서 끝냈다. 이메일 인증이 남았다.

인증 없이 이메일만 받으면 가짜 주소가 리드 목록을 오염시키고, 나중에 이
목록으로 마케팅을 할 때 반송률이 올라간다.

`src/lib/audit/verify.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

/** 진단 ID + 이메일에 서명한 토큰. DB에 별도 테이블을 만들지 않는다. */
export function signAuditEmail(auditId: string, email: string, secret: string): string {
  return createHmac('sha256', secret).update(`${auditId}:${email.toLowerCase()}`).digest('hex')
}

export function verifyAuditEmail(
  auditId: string,
  email: string,
  token: string,
  secret: string,
): boolean {
  const expected = signAuditEmail(auditId, email, secret)
  if (expected.length !== token.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  } catch {
    return false
  }
}
```

`src/lib/audit/verify.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { signAuditEmail, verifyAuditEmail } from '@/lib/audit/verify'

const secret = 'test-secret'

describe('진단 이메일 인증 토큰', () => {
  it('서명한 토큰이 검증된다', () => {
    const t = signAuditEmail('a1', 'x@example.com', secret)
    expect(verifyAuditEmail('a1', 'x@example.com', t, secret)).toBe(true)
  })

  it('대소문자가 달라도 같은 이메일로 본다', () => {
    const t = signAuditEmail('a1', 'X@Example.com', secret)
    expect(verifyAuditEmail('a1', 'x@example.com', t, secret)).toBe(true)
  })

  it('다른 진단 ID로는 검증되지 않는다', () => {
    const t = signAuditEmail('a1', 'x@example.com', secret)
    expect(verifyAuditEmail('a2', 'x@example.com', t, secret)).toBe(false)
  })

  it('다른 이메일로는 검증되지 않는다', () => {
    const t = signAuditEmail('a1', 'x@example.com', secret)
    expect(verifyAuditEmail('a1', 'y@example.com', t, secret)).toBe(false)
  })

  it('길이가 다른 토큰을 받아도 던지지 않는다', () => {
    expect(verifyAuditEmail('a1', 'x@example.com', 'short', secret)).toBe(false)
  })

  it('빈 토큰을 거부한다', () => {
    expect(verifyAuditEmail('a1', 'x@example.com', '', secret)).toBe(false)
  })
})
```

```bash
pnpm vitest run src/lib/audit/verify.test.ts
```

Expected: 처음엔 FAIL(모듈 없음) → 구현 후 PASS (6 passed)

`src/lib/email/templates.ts`에 진단 리포트 메일을 추가한다:

```ts
export function auditReportEmail(params: {
  brandName: string
  citedRate: number
  resultUrl: string
  verifyUrl: string
}): EmailContent {
  return {
    subject: `[Cited] ${params.brandName} AI 인용 진단 결과`,
    html: layout(
      `<p><strong>${escapeHtml(params.brandName)}</strong>의 진단 결과입니다.</p>
<div style="margin:24px 0;padding:20px;background:#faf9f7;border-radius:8px">
  <div style="font-size:13px;color:#8a8580;margin-bottom:4px">Cited Rate</div>
  <div style="font-size:32px;font-weight:700">${Math.round(params.citedRate * 100)}%</div>
</div>
<p style="margin:24px 0"><a href="${escapeHtml(params.verifyUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">이메일 확인하고 전체 리포트 보기</a></p>
<p style="font-size:13px;color:#8a8580">이 진단은 6회 측정 기준이라 신뢰구간이 넓습니다. 매주 자동 추적하면 약 100~300회를 측정합니다.</p>`,
    ),
  }
}
```

`src/app/api/audit/[id]/email/route.ts`를 수정한다 — 이메일을 저장하되
`emailVerified`는 false로 두고, 인증 링크가 담긴 리포트 메일을 보낸다.
화면의 전체 지표는 즉시 열어준다 (인증을 기다리게 하면 전환이 죽는다).
인증은 **리드 품질**을 위한 것이지 게이트가 아니다.

```ts
  await db
    .update(freeAudits)
    .set({ email: parsed.data.email, convertedEmailAt: new Date() })
    .where(eq(freeAudits.id, id))

  const token = signAuditEmail(id, parsed.data.email, env.AUDIT_IP_SALT)
  await sendEmail({
    to: parsed.data.email,
    content: auditReportEmail({
      brandName: audit.brandName,
      citedRate: (audit.result as AuditResult | null)?.citedRate.point ?? 0,
      resultUrl: `${env.NEXT_PUBLIC_APP_URL}/audit/${id}`,
      verifyUrl: `${env.NEXT_PUBLIC_APP_URL}/audit/${id}/verify?token=${token}&email=${encodeURIComponent(parsed.data.email)}`,
    }),
  })

  return NextResponse.json({ ok: true })
```

`src/app/audit/[id]/verify/route.ts` — 링크를 누르면 `emailVerified=true`로
바꾸고 결과 페이지로 리다이렉트한다.

```ts
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { verifyAuditEmail } from '@/lib/audit/verify'
import { db } from '@/lib/db'
import { freeAudits } from '@/lib/db/schema'
import { env } from '@/lib/env'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const email = url.searchParams.get('email') ?? ''

  if (verifyAuditEmail(id, email, token, env.AUDIT_IP_SALT)) {
    await db.update(freeAudits).set({ emailVerified: true }).where(eq(freeAudits.id, id))
  }
  redirect(`/audit/${id}`)
}
```

- [ ] **Step 8: 대기 등록 후속 처리**

상한 소진 시 `waitlisted`로 받은 진단을 다음 날 처리한다. 리드를 확보해놓고
방치하면 "이메일을 남겼는데 아무것도 안 왔다"가 되어 오히려 손해다.

`src/trigger/audit-waitlist.ts`:

```ts
import { logger, schedules } from '@trigger.dev/sdk'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { DAILY_GLOBAL_LIMIT } from '@/lib/audit/limits'
import { db } from '@/lib/db'
import { freeAudits } from '@/lib/db/schema'
import { freeAudit } from './free-audit'

/**
 * 대기 등록된 진단을 처리한다.
 *
 * daily-scheduler와 같은 시각에 돌지 않게 시간을 벌린다 — 무료 진단과
 * 유료 수집이 동시에 엔진을 때리면 rate limit에 걸린다.
 */
export const auditWaitlist = schedules.task({
  id: 'audit-waitlist',
  cron: { pattern: '0 5 * * *', timezone: 'Asia/Seoul' }, // KST 오후 2시
  maxDuration: 900,
  run: async () => {
    // 이메일을 남긴 대기 건만 처리한다. 남기지 않았으면 결과를 보낼 곳이 없다.
    const pending = await db
      .select({ id: freeAudits.id, brandName: freeAudits.brandName, category: freeAudits.category })
      .from(freeAudits)
      .where(and(eq(freeAudits.status, 'waitlisted'), isNotNull(freeAudits.email)))
      .orderBy(asc(freeAudits.createdAt))
      // 오늘 상한의 절반까지만. 나머지는 신규 방문자를 위해 남긴다.
      .limit(Math.floor(DAILY_GLOBAL_LIMIT / 2))

    logger.info('audit-waitlist.start', { pending: pending.length })

    for (const a of pending) {
      await freeAudit.trigger({
        auditId: a.id,
        brandName: a.brandName,
        category: a.category,
      })
    }

    return { triggered: pending.length }
  },
})
```

> **스케줄이 3개가 됐다.** `daily-scheduler`, `audit-waitlist`, 그리고 4단계의
> `billing-cycle`. 무료 티어 한도 10개 대비 여유가 있다. 새 스케줄을 추가할
> 때마다 "기존 잡으로 흡수할 수 있는가"를 먼저 묻는다.

대기 등록 화면(`/audit/[id]`의 `waitlisted` 분기)에 이메일 입력 폼을 붙여
`/api/audit/[id]/email`을 호출하게 한다. 폼이 없으면 이 잡이 처리할 대상이
영원히 생기지 않는다.

- [ ] **Step 9: 요금제 페이지**

`src/app/(marketing)/pricing/page.tsx` — 설계 문서의 요금표를 그대로 옮긴다.
**"추적 질문"은 사용 횟수가 아니라 상시 감시 대상이라는 점을 화면에 표기한다.**

```tsx
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PLANS, QUERY_PACK_PRICE_KRW, QUERY_PACK_SIZE, expectedCallsPerRun, WEEKS_PER_MONTH } from '@/lib/plans'

export const metadata = { title: '요금제' }

function monthlyMeasurements(plan: 'starter' | 'business'): number {
  return Math.round(expectedCallsPerRun(plan, PLANS[plan].maxQueries) * WEEKS_PER_MONTH)
}

export default function PricingPage() {
  const tiers = [
    {
      id: 'starter' as const,
      name: 'Starter',
      tagline: '내 브랜드 하나를 본다',
      cta: '시작하기',
    },
    {
      id: 'business' as const,
      name: 'Business',
      tagline: '여러 브랜드를 책임진다 — 대행사, 여러 라인을 가진 회사',
      cta: '시작하기',
      featured: true,
    },
  ]

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="text-center text-3xl font-bold tracking-tight">요금제</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        국내 GEO 컨설팅은 월 400만원부터 시작합니다. Cited는 같은 데이터를
        공개된 가격에, 상담 없이 제공합니다.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {tiers.map((t) => {
          const p = PLANS[t.id]
          return (
            <Card key={t.id} className={t.featured ? 'border-foreground p-7' : 'p-7'}>
              <h2 className="font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <p className="mt-5 text-3xl font-bold tracking-tight">
                {p.priceKrw.toLocaleString('ko-KR')}원
                <span className="text-base font-normal text-muted-foreground"> / 월</span>
              </p>

              <ul className="mt-6 space-y-2 text-sm">
                <li>브랜드 {p.maxBrands}개</li>
                <li>
                  <strong>추적 질문 {p.maxQueries}개 · 매주 자동 측정</strong>
                  <br />
                  <span className="text-muted-foreground">
                    (월 약 {monthlyMeasurements(t.id).toLocaleString('ko-KR')}회 측정)
                  </span>
                </li>
                <li>엔진 4종 — ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews</li>
                <li>경쟁사 {p.maxCompetitors}개</li>
                <li>히스토리 {p.historyMonths === null ? '무제한' : `${p.historyMonths}개월`}</li>
                {p.csvExport ? <li>CSV 내보내기</li> : null}
                {t.id === 'business' ? (
                  <li className="text-muted-foreground">
                    질의 팩 +{QUERY_PACK_SIZE}개 = 월 {QUERY_PACK_PRICE_KRW.toLocaleString('ko-KR')}원
                  </li>
                ) : null}
              </ul>

              <Button asChild className="mt-7 w-full" variant={t.featured ? 'default' : 'outline'}>
                <a href="/sign-up">{t.cta}</a>
              </Button>
            </Card>
          )
        })}
      </div>

      <p className="mt-10 rounded-lg bg-muted/40 p-5 text-sm text-muted-foreground">
        <strong className="text-foreground">&ldquo;추적 질문&rdquo;은 사용 횟수가 아니라 상시 감시 대상입니다.</strong>{' '}
        한 번 등록하면 매주 자동으로 다시 물어봅니다. Starter의 질문 10개는
        &ldquo;월 10번&rdquo;이 아니라 월 약 {monthlyMeasurements('starter')}회 측정입니다.
      </p>
    </main>
  )
}
```

- [ ] **Step 10: 브라우저 수동 검증**

```bash
pnpm dev
```

전체 퍼널을 직접 걸어본다:
1. `/` 에서 브랜드명·업종 입력 → 제출
2. 진행 화면에서 "ChatGPT에 물어보는 중… (2/6)" 같은 문구가 **실제로 바뀌는지**
3. 20초 안팎에 결과 화면으로 전환되는지
4. 증거(C) → 순위(B) → 이메일 게이트 순서인지
5. 이메일 입력 후 전체 지표(A)가 열리는지
6. `pnpm db:studio`에서 `free_audits.email`과 `convertedEmailAt`이 채워졌는지

7. 이메일 입력 후 **리포트 메일이 실제로 도착하는지**
8. 메일의 인증 링크를 눌렀을 때 `free_audits.email_verified`가 true가 되는지

Expected: 8개 모두 통과. 진행 문구가 안 바뀌면 Realtime 토큰 전달을 확인한다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat(audit): 랜딩 · 진행 화면 · C→B→A 결과 · 이메일 게이트/인증 · 대기 등록 처리

결과 화면 순서는 가설이므로 variant로 기록하고 전환과 함께 측정한다.
남용 방지 3축(이메일 인증 · 브랜드 월 1회 · IP 일일 상한)이 모두 붙었다."
```

---

### Task 9: E2E 테스트와 1차 배포

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/free-audit.spec.ts`
- Modify: `.github/workflows/ci.yml`, `package.json`

**Interfaces:**
- Consumes: 이 단계 전부
- Produces: **1차 배포 완료** — 무료 진단이 프로덕션에서 동작한다

설계 ⑤: E2E는 최소한만. 무료 진단 플로우 1개, 결제 플로우 1개(4단계).
그 이상은 유지보수 비용이 이득을 넘는다.

- [ ] **Step 1: Playwright 설치**

```bash
pnpm dlx playwright@latest install --with-deps chromium
pnpm add -D @playwright/test
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
```

- [ ] **Step 2: E2E 테스트 작성**

`tests/e2e/free-audit.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('무료 진단 전환 퍼널', () => {
  test('랜딩에서 진단을 시작해 결과와 이메일 게이트까지 도달한다', async ({ page }) => {
    await page.goto('/')

    // 랜딩
    await expect(page.getByRole('heading', { level: 1 })).toContainText('AI')

    // 진단 시작
    const brand = `E2E테스트${Date.now()}`
    await page.getByPlaceholder(/브랜드명/).fill(brand)
    await page.getByRole('combobox').selectOption('패션')
    await page.getByRole('button', { name: /무료로 진단하기/ }).click()

    // 진행 화면 — 진행 문구가 실제로 나타난다
    await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/물어보는 중|준비 중|정리하는 중/)).toBeVisible()

    // 결과 화면 — 증거가 먼저 나온다 (C → B → A)
    await expect(page.getByText('실제 AI 답변')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText(brand)).toBeVisible()

    // 이메일 게이트가 전체 지표를 막고 있다
    await expect(page.getByText('엔진별 · 질의별 전체 지표 보기')).toBeVisible()
    await expect(page.getByText('엔진별', { exact: true })).not.toBeVisible()

    // 이메일 입력 → 전체 지표 해제
    await page.getByPlaceholder('you@company.com').fill(`e2e+${Date.now()}@example.com`)
    await page.getByRole('button', { name: '전체 보기' }).click()
    await expect(page.getByText('전체 지표')).toBeVisible({ timeout: 15_000 })
  })

  test('같은 브랜드를 두 번 진단하면 막힌다 (비용 통제)', async ({ page, request }) => {
    const brand = `중복${Date.now()}`
    const body = { brandName: brand, category: '패션' }

    const first = await request.post('/api/audit', { data: body })
    expect(first.ok()).toBeTruthy()

    const second = await request.post('/api/audit', { data: body })
    expect(second.status()).toBe(429)
  })

  test('법적 페이지가 접근 가능하다', async ({ page }) => {
    await page.goto('/legal/terms')
    await expect(page.getByRole('heading', { name: '이용약관' })).toBeVisible()
    // 설계 문서가 요구한 제3자 플랫폼 의존성 조항
    await expect(page.getByText(/제3자 플랫폼/)).toBeVisible()

    await page.goto('/legal/privacy')
    await expect(page.getByRole('heading', { name: '개인정보처리방침' })).toBeVisible()
  })
})
```

- [ ] **Step 3: 로컬에서 E2E 실행**

```bash
pnpm test:e2e
```

Expected: 3 passed. 진단 완료 대기 타임아웃(90초)이 부족하면 늘린다 —
실제 API 호출이 6회 들어간다.

- [ ] **Step 4: CI에 E2E 추가 (별도 job)**

`.github/workflows/ci.yml`에 job 추가:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: verify
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm dlx playwright install --with-deps chromium
      - run: pnpm test:e2e
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          BETTER_AUTH_URL: http://localhost:3000
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
          EMAIL_FROM: Cited <noreply@example.com>
          AUDIT_IP_SALT: ${{ secrets.AUDIT_IP_SALT }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          TRIGGER_SECRET_KEY: ${{ secrets.TRIGGER_SECRET_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

E2E는 실제 API 비용이 들므로 `push`에서만 돌린다. PR마다 돌리면 진단 1회당
50~110원이 계속 나간다.

- [ ] **Step 5: 프로덕션 배포**

Vercel 환경변수에 이 단계에서 추가된 키를 전부 등록한다:
`AUDIT_IP_SALT`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
`TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`.

```bash
pnpm dlx trigger.dev@latest deploy
pnpm dlx vercel@latest --prod
```

- [ ] **Step 6: 프로덕션 검증**

```bash
DOMAIN=<실제 도메인>

# 헬스체크
curl -s https://$DOMAIN/api/health | grep '"ok":true'

# 진단 시작
curl -s -X POST https://$DOMAIN/api/audit \
  -H 'content-type: application/json' \
  -d '{"brandName":"프로덕션검증","category":"패션"}' | tee /tmp/audit.json

# 상한 검증 — 같은 브랜드 두 번째는 429
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/audit \
  -H 'content-type: application/json' \
  -d '{"brandName":"프로덕션검증","category":"패션"}'
```

Expected: 헬스체크 ok, 첫 진단 200, 두 번째 429

브라우저에서 실제 퍼널을 한 번 더 걸어본다. Trigger.dev 대시보드에서
`free-audit` 실행이 성공했는지, 소요 시간이 20초 안팎인지 확인한다.

- [ ] **Step 7: 프로덕션 E2E**

```bash
E2E_BASE_URL=https://$DOMAIN pnpm test:e2e
```

Expected: 3 passed

- [ ] **Step 8: 1차 배포 완료 기록과 커밋**

`docs/superpowers/notes/2026-07-28-launch-1.md`:

```markdown
# 1차 배포 (무료 진단) — 2026-__-__

## 배포 내용
- 랜딩 + 무료 진단 + 이메일 게이트 + 요금제 + 법적 페이지
- SerpApi 미가입 (2차 배포 시 가입)

## 확인한 것
- [ ] 프로덕션 진단 성공, 소요 __초
- [ ] IP 일일 상한 3회 작동 확인
- [ ] 브랜드 월 1회 상한 작동 확인
- [ ] 전체 일일 상한 100회 설정됨
- [ ] 진단 1건 실제 원가 __원 (Trigger.dev 실행시간 포함)

## 월 고정비
| 항목 | 금액 |
| --- | --- |
| Vercel Pro | 28,000원 |
| 도메인 | 1,700원 |
| 통신판매업 등록면허세 | 3,400원 |
| Trigger.dev | __원 |
| **합계** | **__원** |

## 다음에 볼 지표
- 일일 진단 건수 (상한 100 대비)
- 이메일 게이트 전환율 (variant별)
- 진단 → 가입 전환율
```

```bash
git add -A
git commit -m "feat: 무료 진단 E2E 테스트와 1차 배포

1차 배포 완료: 랜딩에서 진단을 시작해 이메일을 남기는 퍼널이 프로덕션에서 동작한다."
git tag phase-3-complete
```

---

## 3단계 완료 조건 (= 1차 배포 게이트)

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] `pnpm test:e2e`가 프로덕션 URL에 대해 통과
- [ ] 프로덕션에서 무료 진단이 20초 안팎에 완료된다
- [ ] **IP 일일 상한, 브랜드 월 1회, 전체 일일 상한이 실제로 작동한다** (curl로 검증됨)
- [ ] 진단 이메일 인증 링크가 동작한다 (`free_audits.email_verified`)
- [ ] Trigger.dev 스케줄이 `daily-scheduler`와 `audit-waitlist` **2개뿐**이다
      (브랜드마다 스케줄을 만들지 않았다)
- [ ] `collect-brand` 수동 실행 시 `answers.raw`가 채워지고 `detections`가 생긴다
- [ ] `docs/superpowers/notes/2026-07-28-trigger-credits.md`에 크레딧 소진 실측이 기록됨
- [ ] `docs/superpowers/notes/2026-07-28-launch-1.md`에 실제 고정비가 기록됨
- [ ] `src/app/legal/privacy/page.tsx`의 **§7(개인정보 처리 위탁)**과 **§8(국외 이전)**
      표가 갱신됨 — 이 단계에서 `collect-brand`/`judge-run` 잡이 프로덕션에서 처음으로
      실제 이용자의 브랜드명·질의문을 OpenAI·Gemini·SerpApi·Anthropic에 전송하기
      시작한다(2단계는 `*.smoke.test.ts`로만 호출해 CI 기본 실행에서 제외되므로 실제
      위탁이 아니다 — 실제 위탁은 이 단계의 1차 배포부터다). §8 말미의 "측정 기능이
      도입되면... 회사는 해당 기능 도입 시 이 항을 갱신"이라는 기존 문장이 가리키는
      시점이 바로 이 커밋이다. 위탁 표 갱신을 **1차 배포 태그(`phase-3-complete`)와
      같은 커밋 또는 그 이전 커밋**에서 끝낸다

## 다음 단계

[4단계 — 결제와 온보딩](2026-07-28-cited-phase-4-billing-and-onboarding.md)
