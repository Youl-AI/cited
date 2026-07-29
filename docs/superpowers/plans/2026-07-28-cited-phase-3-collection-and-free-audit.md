# Cited 3단계 — 수집 코어와 무료 진단(수동 배송) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집·판정 파이프라인의 **코어**를 프레임워크 없이 만들고, 그 위에
무료 진단을 **운영자가 직접 실행해 메일로 보내는** 형태로 얹어 **1차 배포**한다.
이 단계가 끝나면 방문자가 랜딩에서 진단을 신청하고, 이메일을 인증하고,
운영자가 CLI로 실행해 리포트를 메일로 받는다.

**Architecture:** 수집·판정 로직은 **잡 프레임워크를 모르는 순수 함수**
(`runCollection`, `runDetection`)로 만든다. 3단계에서는 운영자 CLI가 이 함수를
직접 부르고, 4단계에서 Trigger.dev 잡이 **같은 함수를 감싸기만** 한다.
무료 진단은 자동 실행하지 않으므로 잡 큐·진행률 스트리밍·남용 방지가 필요 없다.

**Tech Stack:** Neon · Drizzle · Next.js Server Actions · Resend · tsx(운영자 CLI)
· Playwright (E2E)

---

## ★ 2026-07-30 설계 변경 — 무료 진단을 수동 배송으로 바꾼다

최초 계획서는 무료 진단을 **자동 실행 + 즉시 결과 화면**으로 잡았다. 그 전제를
바꾼다. 이유는 비용이 아니다 — 자동화해도 일 20건이면 월 76,000원이고, 그 정도를
아끼자고 제품을 바꾸지는 않는다.

**바꾸는 진짜 이유 세 가지:**

1. **공격면이 사라진다.** 누구도 API를 직접 트리거할 수 없으면 Turnstile·IP
   상한·예산 킬스위치·브랜드 캐시가 전부 필요 없다. 최초 계획의 Task 6 전체가
   방어하려던 위협 자체가 없어진다.
2. **자동 공개 전에 실물을 본다.** 지금 판정·통계·Share of Voice를 **한 번도
   실제 답변에 돌려보지 않고** 만들었다. 결과 50건을 눈으로 보기 전에 자동
   공개로 넘어가면, 틀린 것을 고객 화면에 띄우고 나서 알게 된다.
3. **이메일 인증이 비로소 게이트가 된다.** 최초 계획에서는 잡이 이메일 수집보다
   **먼저** 시작돼 인증이 비용을 전혀 방어하지 못했다. 순서가 뒤집히면
   (신청 → 인증 → 운영자 실행) 인증이 실제 관문이 된다.

**무료 진단의 내용은 부풀리지 않는다.** `src/lib/plans.ts`의 `free` 설정
(3질의 · 1샘플 · 이력 0개월)을 그대로 쓴다. 수동이라 여유가 생겼다고 질의 수나
모델 등급을 올리면 유료 플랜을 자기잠식한다.

**다만 모델·엔진은 유료와 같아야 한다.** 무료를 저가 모델로 돌리면 같은 브랜드
같은 질의인데 언급률이 다르게 나오고, 전환한 고객이 "무료에선 33%였는데 유료는
18%네요"라고 물었을 때 답할 수가 없다. 이는 `judgeChange`가 엔진 구성이 다른
주끼리 `incomparable`을 돌려주는 것과 **정확히 같은 이유**다. 무료와 유료를
가르는 축은 **질의 수 · 측정 횟수 · 지속성**이지 품질이 아니다.

**1회 측정의 넓은 신뢰구간이 곧 세일즈 포인트다.** 3질의 1회 측정에서 1건
언급이면 33%지만 Wilson 구간은 [2%, 87%]다. 이것을 숨기지 말고 그대로 보여준다 —
"주 3회 측정하면 이 구간이 좁혀집니다"가 정직하면서도 가장 강한 결제 이유다.
그리고 **1회 측정으로는 ▲▼가 원리적으로 나올 수 없다.** 고객이 사는 것은 숫자가
아니라 변화이고, 그것은 무료로 줄 수가 없다.

### 이 변경으로 달라진 것

| 항목 | 최초 계획 | 이 계획 |
| --- | --- | --- |
| Trigger.dev 초기화·스케줄러 | 3단계 | **4단계로 이동** (돌릴 대상이 4단계에 생긴다) |
| 수집·판정 로직 | Trigger.dev 잡 안 | **프레임워크 없는 코어 함수** |
| 무료 진단 실행 | 공개 API가 자동 트리거 | **운영자 CLI** |
| Turnstile·IP 상한·예산 킬스위치·브랜드 캐시 | Task 6 전체 | **삭제** |
| 진행률 스트리밍(Realtime) | Task 8 | **삭제** |
| 이메일 | 결과 확인 **후** 게이트 | **신청 시 필수 · 인증 후 실행** |
| 결과 전달 | 즉시 화면 | 메일 + `/audit/[id]` 링크 |
| 무료 진단 이력 저장 | `collection_runs`·`answers` | **저장하지 않는다** (아래 참고) |

**무료 진단은 `collection_runs`/`answers`에 쓰지 않는다.** `free_audits.result`
하나에만 담는다. 무료 플랜은 `historyMonths: 0`이라 이력이 제품에 없고, 저장하면
`collection_runs.brand_id`를 채우려고 가짜 브랜드 행을 만들어야 한다. 유료 경로는
그대로 두 테이블에 쓴다.

---

## Global Constraints

로드맵 공통 제약 + 이 단계 전용:

- **수집·판정 코어는 잡 프레임워크를 import하지 않는다.** `@trigger.dev/*`를
  `src/lib/collection/**`·`src/lib/detection/**`에서 참조 금지 (4단계에서
  잡이 이 함수를 감싼다)
- **동시성 제한을 엔진별로 건다.** 한꺼번에 던지면 rate limit에 걸린다
- **부분 실패를 허용하되 조용히 넘어가지 않는다.** `completeness`를 반드시 기록
- **SERP 2샘플은 시간대를 나눠 호출한다.** SerpApi 1시간 캐시 때문
- **`answers.raw`를 저장하지 않는 경로를 만들지 않는다** (유료 경로)
- **IP 원문을 저장하지 않는다.** HMAC 해시만
- **무료 진단은 이메일 인증 전에 어떤 API도 호출하지 않는다**
- **무료 진단과 유료 측정은 같은 모델·같은 엔진을 쓴다.** `GEMINI_MODEL` 하나만
  둔다 (2단계 `FREE_AUDIT_PRICING`은 **단가표일 뿐 모델 분기가 아니다**)
- 각 태스크의 마지막 Step은 커밋

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/lib/collection/plan-snapshot.ts` | planSnapshot 생성 (순수) |
| `src/lib/collection/fanout.ts` | 팬아웃 계획 생성 (순수) |
| `src/lib/collection/completeness.ts` | completeness 집계·판정 (순수) |
| `src/lib/collection/run.ts` | **수집 실행 코어** — 팬아웃을 실제로 돌린다 |
| `src/lib/collection/repository.ts` | 수집 결과 DB 저장 (유료 경로) |
| `src/lib/detection/pipeline.ts` | **판정·집계 코어** — 1차→2차→지표 |
| `src/lib/audit/queries.ts` | 카테고리별 기본 질의 3개 생성 |
| `src/lib/audit/token.ts` | 진단 이메일 인증 토큰 (HMAC) |
| `src/lib/audit/repository.ts` | 진단 신청 CRUD |
| `src/lib/audit/result.ts` | `buildAuditResult` — 리포트 구성 (순수) |
| `src/lib/email/templates.ts` | 인증·운영자 알림·리포트 메일 (기존 파일 확장) |
| `src/app/api/audit/request/route.ts` | 진단 신청 접수 |
| `src/app/api/audit/verify/route.ts` | 이메일 인증 |
| `src/app/(marketing)/page.tsx` | 랜딩 |
| `src/app/(marketing)/pricing/page.tsx` | 요금제 |
| `src/app/audit/requested/page.tsx` | 신청 완료 안내 |
| `src/app/audit/[id]/page.tsx` | 리포트 |
| `src/components/audit/request-form.tsx` | 신청 폼 |
| `src/components/audit/result-view.tsx` | 리포트 본문 (메일·웹 공용) |
| `scripts/audit-list.mts` | 운영자 CLI — 대기 목록 |
| `scripts/audit-run.mts` | 운영자 CLI — 실행·발송 |
| `tests/e2e/free-audit.spec.ts` | E2E |

---

### Task 1: 수집 계획 순수 함수

> ### ★ 2026-07-30 조정 — 이 태스크에서 두 가지가 바뀐다
>
> **① `src/lib/collection/schedule.ts`(`selectBrandsForToday`)를 만들지 않는다.**
> 오늘 수집할 브랜드를 고르는 함수인데, 그것을 쓰는 일일 스케줄러가 4단계로
> 옮겨갔다. 3단계에는 소비자가 없다. **4단계에서 스케줄러와 함께 만든다.**
> 아래 본문에서 해당 Step은 이미 제거했다 — 되살리지 마라.
>
> **② 원가 필드는 밀리원 정수로 만든다.** 2단계에서 `estimateCostMilliKrw`가
> 누적 단위가 됐다. 아래 본문에 `costKrw`가 나오면 전부 **`costMilliKrw`**로
> 읽고, 화면에 보일 때만 1000으로 나눈다. 호출당 3.2원을 원 단위로 반올림하면
> 매번 0.2원이 사라지고 그 누락이 그대로 원가 집계의 오차가 된다.

**Files:**
- Create: `src/lib/collection/plan-snapshot.ts`, `src/lib/collection/fanout.ts`,
  `src/lib/collection/completeness.ts`
- Test: 각각의 `.test.ts`

**Interfaces:**
- Consumes: `PLANS`, `resolveLimits` (1단계), `ENGINE_TIER`
- Produces:
  - `buildPlanSnapshot(args): PlanSnapshot`
  - `buildFanout(snapshot, queries): FanoutItem[]`
  - `interface FanoutItem { queryId; queryText; engineId; sampleIndex; scheduledOffsetMs }`
  - `summarizeCompleteness(items, outcomes): Completeness`
  - `completenessRatio(c): number`, `isDegraded(c): boolean`
  - Task 2의 `runCollection`이 `FanoutItem[]`을 소비한다
  - (`selectBrandsForToday`는 만들지 않는다 — 위 조정 블록 참고)

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

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/collection/
```

Expected: PASS (schedule 관련을 뺀 나머지 전부)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/collection
git commit -m "feat(collection): planSnapshot · 팬아웃 · completeness (순수 함수)"
```

---

### Task 2: 수집 실행 코어

> ### ★ 2026-07-30 조정 — Trigger.dev 잡이 아니라 **코어 함수**를 만든다
>
> 아래 본문은 `collectOne`/`collectBrand`를 Trigger.dev 잡으로 정의한다.
> **잡 껍데기는 4단계로 옮겼다.** 여기서는 같은 로직을 프레임워크 없는 함수로
> 만든다. 이유는 두 가지다.
>
> - 3단계에는 잡을 돌릴 소비자가 없다. 무료 진단은 **운영자 CLI**가 부르고,
>   유료 주간 수집은 4단계에 생긴다.
> - 잡 안에 로직이 있으면 테스트가 불가능하다. CLI로 먼저 실제 API에 돌려보고,
>   4단계에서 검증된 함수를 감싸기만 하는 순서가 위험이 훨씬 낮다.
>
> **만들 것 (`src/lib/collection/run.ts`):**
>
> ```ts
> import type { EngineId } from '@/lib/plans'
> import type { FanoutItem } from '@/lib/collection/fanout'
> import type { Completeness } from '@/lib/collection/completeness'
>
> export interface CollectedAnswer {
>   queryId: string
>   queryText: string
>   engineId: EngineId
>   sampleIndex: number
>   text: string
>   citations: { url: string; title: string }[]
>   raw: unknown
>   usage: { calls: number; searches?: number; tokensIn?: number; tokensOut?: number; tokensThinking?: number }
>   costMilliKrw: number
> }
>
> export interface CollectOneOutcome {
>   engineId: EngineId
>   ok: boolean
>   answer: CollectedAnswer | null
>   error: string | null
> }
>
> export interface CollectionResult {
>   answers: CollectedAnswer[]
>   outcomes: CollectOneOutcome[]
>   completeness: Completeness
>   costMilliKrw: number
>   durationMs: number
> }
>
> export interface RunCollectionDeps {
>   /** 기본값은 `getEngine`. 테스트가 가짜 엔진을 주입한다. */
>   runOne?: (item: FanoutItem) => Promise<CollectedAnswer>
>   /** 기본값은 setTimeout. 테스트가 즉시 반환하게 바꾼다. */
>   sleep?: (ms: number) => Promise<void>
>   /** 진행률 통지. CLI가 콘솔에, 4단계 잡이 metadata.set에 연결한다. */
>   onProgress?: (done: number, total: number) => void
>   /** 엔진별 동시 실행 수. 기본값은 ENGINE_QUEUE_CONCURRENCY. */
>   concurrency?: Partial<Record<EngineId, number>>
> }
>
> export async function runCollection(
>   items: FanoutItem[],
>   deps?: RunCollectionDeps,
> ): Promise<CollectionResult>
> ```
>
> **본문을 옮길 때의 대응표:**
>
> | 아래 본문 | `run.ts`에서 |
> | --- | --- |
> | `collectOne.batchTriggerAndWait(batch)` | `deps.runOne`을 엔진별 동시성 상한 안에서 병렬 실행 |
> | 재시도(`retry: { maxAttempts: 3 }`) | 2단계 `isRetryable(error)` + `backoffHint`로 직접 구현 |
> | `wait.for({ seconds })` | `deps.sleep(ms)` |
> | `metadata.set('progress', …)` | `deps.onProgress(done, total)` |
> | `logger.info(...)` | `console.info(...)` |
> | `await judgeRun.trigger(...)` | **하지 않는다.** 호출자가 `runDetection`을 이어서 부른다 |
> | `throw new Error('브랜드를 찾을 수 없습니다')` | 브랜드 로드는 호출자 책임. `runCollection`은 `FanoutItem[]`만 받는다 |
>
> **재시도는 반드시 직접 구현한다.** Trigger.dev의 `maxAttempts: 3`이 사라지면
> 재시도가 통째로 없어진다. 2단계가 `EngineError.retryable`과 `backoffHint`를
> 만들어 둔 이유가 이것이다 — `'long'`은 429라 더 길게 쉬어야 하고,
> `isRetryable`이 `false`면(400류·취소) 즉시 포기한다.
>
> **`repository.ts`는 그대로 만든다.** 유료 경로가 쓴다. 다만 무료 진단은
> 이 저장 계층을 **부르지 않는다**(Global Constraints 참고).

> **개인정보처리방침을 함께 고쳐야 하는 태스크다.** 여기서 만드는
> `collect-brand`/`collect-one`이 **이용자의 브랜드명·질의문을 OpenAI·Gemini·
> SerpApi·Anthropic에 처음으로 실제 전송하는 코드**다. 그 순간 이들은 새 수탁자가
> 되므로 `src/app/legal/privacy/page.tsx`의 **§7(개인정보 처리 위탁)**과
> **§8(국외 이전)** 표를 갱신해야 한다. §8은 개인정보보호법 제28조의8 제2항의
> 법정 고지사항이고, §8 말미의 "측정 기능이 도입되면… 이 항을 갱신"이라는 기존
> 문장이 가리키는 시점이 바로 이 코드다.
> 갱신 자체는 프로덕션 배포 전까지 끝내면 되며(2단계 `*.smoke.test.ts`는 CI
> 기본 실행에서 제외되므로 실제 위탁이 아니다), 완료 확인은 이 문서 맨 끝
> **3단계 완료 조건**의 해당 항목에서 한다. 이 코드를 쓰면서 방침 갱신을
> 미룰 수는 있어도, 잊어서는 안 된다.

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

### Task 3: 판정·집계 코어

> ### ★ 2026-07-30 조정 — Trigger.dev 잡이 아니라 **코어 함수**를 만든다
>
> 아래 본문은 `judgeRun`/`aggregateRun`을 Trigger.dev 잡으로 정의한다.
> **잡 껍데기는 4단계로 옮겼다.** 여기서는 같은 로직을 하나의 프레임워크 없는
> 함수로 만든다.
>
> **만들 것 (`src/lib/detection/pipeline.ts`):**
>
> ```ts
> import type { BrandProfile, DetectionResult } from '@/lib/detection/types'
> import type { JudgeFn } from '@/lib/judge/types'
> import type { BrandMetrics } from '@/lib/stats/metrics'
> import type { CollectedAnswer } from '@/lib/collection/run'
>
> export interface DetectionInput {
>   answers: CollectedAnswer[]
>   /** 고객 브랜드 */
>   self: BrandProfile
>   /** 경쟁사. 비어 있으면 Share of Voice는 n=0("측정 없음")이 된다 */
>   competitors: BrandProfile[]
> }
>
> export interface DetectionOutput {
>   /** answerId(=queryId:engineId:sampleIndex) → 대상별 판정 */
>   detections: Map<string, DetectionResult[]>
>   metrics: BrandMetrics
>   /** 1차를 통과해 2차로 간 비율. 원가 관측용 */
>   stage1PassRate: number
>   /** 2차 판정에 쓴 비용 */
>   judgeCostMilliKrw: number
>   /** 2차가 실패해 미판정으로 남은 건수 */
>   unresolved: number
> }
>
> export async function runDetection(
>   input: DetectionInput,
>   judge: JudgeFn,
> ): Promise<DetectionOutput>
> ```
>
> **본문을 옮길 때의 대응표:**
>
> | 아래 본문 | `pipeline.ts`에서 |
> | --- | --- |
> | `judgeRun` + `aggregateRun` 두 잡 | **한 함수**. 나눈 이유는 잡 재시도 경계였는데 그 경계가 없다 |
> | `await aggregateRun.trigger(...)` | 같은 함수 안에서 이어서 계산 |
> | DB에서 `answers` 로드 | 인자로 받는다. 무료 진단은 DB에 answers가 없다 |
> | `detections` 테이블 기록 | **하지 않는다.** 호출자가 필요하면 저장한다 |
> | `claudeJudge` 직접 참조 | `judge: JudgeFn`을 주입받는다 (2단계 Task 8의 경계 유지) |
>
> **`judge`를 주입받는 것이 중요하다.** 2단계가 `runStage2(items, judge)`로
> 판정기를 주입 가능하게 만들어 둔 이유가 여기서 살아난다 — 골든 라벨 회귀
> 테스트를 API 키 없이 가짜 판정기로 돌릴 수 있다.
>
> **판정 실패는 던지지 말고 `unresolved`로 센다.** 2차 LLM이 하나 실패했다고
> 진단 전체를 버리면 안 된다. 이미 돈을 쓴 수집 데이터다.

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

### Task 4: 진단 신청 — 스키마 · 인증 토큰 · 리포지토리

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/audit/token.ts`, `src/lib/audit/queries.ts`,
  `src/lib/audit/repository.ts`
- Test: `src/lib/audit/token.test.ts`, `src/lib/audit/queries.test.ts`
- Create: `drizzle/` 마이그레이션 (생성물)

**Interfaces:**
- Consumes: `env` (1단계), `db`·`schema` (1단계)
- Produces:
  - `AUDIT_STATUSES = ['requested','verified','running','sent','failed','rejected']`
  - `createVerifyToken(auditId, email): string`
  - `readVerifyToken(token): { auditId: string; email: string } | null`
  - `generateAuditQueries(category, brandName): string[]` — 정확히 3개
  - `createAuditRequest(args): Promise<FreeAudit>`
  - `markVerified(auditId, email): Promise<FreeAudit | null>`
  - `listPendingAudits(): Promise<FreeAudit[]>`
  - `markRunning/markSent/markFailed(auditId, ...)`
  - `countRecentByIpHash(ipHash, sinceHours): Promise<number>`
  - Task 5의 API와 Task 7의 CLI가 소비한다

**상태 전이는 이 하나뿐이다.** 다른 전이는 없다:

```
requested ──인증──> verified ──운영자 실행──> running ──┬──> sent
                                                        └──> failed ──재실행──> running
     └──운영자 거부──> rejected
```

- [ ] **Step 1: 스키마 상태값 교체**

`src/lib/db/schema.ts`의 `AUDIT_STATUSES`와 `freeAudits`를 바꾼다.
기존 값(`queued`/`running`/`succeeded`/`failed`/`waitlisted`)은 **자동 실행을
전제한 이름**이라 수동 플로우에 맞지 않는다. `free_audits`는 현재 0행이므로
데이터 마이그레이션이 필요 없다.

```ts
export const AUDIT_STATUSES = [
  'requested', // 신청됨. 이메일 미인증 — 이 상태에서는 어떤 API도 호출하지 않는다
  'verified', // 인증 완료. 운영자 실행 대기
  'running', // 운영자가 실행 중
  'sent', // 리포트 발송 완료
  'failed', // 실행 실패. 재실행 가능
  'rejected', // 운영자가 거부 (스팸·장난 신청)
] as const
export type AuditStatus = (typeof AUDIT_STATUSES)[number]

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
    competitors: jsonb('competitors').$type<string[]>().notNull().default([]),
    status: text('status').$type<AuditStatus>().notNull().default('requested'),
    /** 진단 결과 — AuditResult (Task 6). 발송 전에는 null */
    result: jsonb('result').$type<unknown>(),
    /** 실패 사유. 운영자가 재실행 여부를 판단하는 근거 */
    failureReason: text('failure_reason'),
    /** IP 원문을 저장하지 않는다. HMAC 해시만. 스팸 관측용 */
    ipHash: text('ip_hash').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** 전환 결과 — 리포트를 받은 뒤 가입했는가 */
    convertedSignupAt: timestamp('converted_signup_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audits_iphash_created_idx').on(t.ipHash, t.createdAt),
    index('audits_status_created_idx').on(t.status, t.createdAt),
    enumCheck('free_audits_status_check', t.status, AUDIT_STATUSES),
  ],
)
```

`variant`·`convertedEmailAt` 컬럼은 지운다. 전자는 결과 화면 노출 순서 실험용인데
화면이 메일로 바뀌었고, 후자는 이메일이 이제 신청 시점에 들어오므로 의미가 없다.

- [ ] **Step 2: 마이그레이션 생성과 적용**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: `free_audits` 테이블에 `competitors`·`failure_reason`·`verified_at`·
`sent_at` 추가, `variant`·`converted_email_at` 삭제, `email`이 NOT NULL,
`free_audits_status_check` 제약이 새 6개 값으로 교체.

적용 후 확인:

```bash
node --env-file=.env.local -e "
const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);
sql\`select column_name,is_nullable from information_schema.columns where table_name='free_audits' order by column_name\`.then(r=>console.table(r))"
```

Expected: `email`의 `is_nullable`이 `NO`, `competitors`·`failure_reason`·
`sent_at`·`verified_at`이 목록에 있고 `variant`·`converted_email_at`이 없다.

- [ ] **Step 3: 인증 토큰 실패 테스트**

`src/lib/audit/token.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createVerifyToken, readVerifyToken, VERIFY_TTL_MS } from '@/lib/audit/token'

describe('진단 이메일 인증 토큰', () => {
  it('만든 토큰을 되읽는다', () => {
    const token = createVerifyToken('aud_1', 'a@example.com')
    expect(readVerifyToken(token)).toEqual({ auditId: 'aud_1', email: 'a@example.com' })
  })

  it('URL에 그대로 넣을 수 있다 (base64url)', () => {
    const token = createVerifyToken('aud_1', 'a+b@example.com')
    expect(token).toBe(encodeURIComponent(token))
  })

  it('한 글자만 바뀌어도 거부한다', () => {
    const token = createVerifyToken('aud_1', 'a@example.com')
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect(readVerifyToken(tampered)).toBeNull()
  })

  it('페이로드를 바꿔치기하면 거부한다', () => {
    // 서명 없이 페이로드만 만들어 붙인 위조 토큰
    const forged = Buffer.from(
      JSON.stringify({ auditId: 'aud_2', email: 'x@example.com', exp: Date.now() + 1000 }),
    ).toString('base64url')
    expect(readVerifyToken(`${forged}.deadbeef`)).toBeNull()
  })

  it('만료된 토큰을 거부한다', () => {
    vi.useFakeTimers()
    try {
      const token = createVerifyToken('aud_1', 'a@example.com')
      vi.advanceTimersByTime(VERIFY_TTL_MS + 1)
      expect(readVerifyToken(token)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('만료 직전에는 통과한다', () => {
    vi.useFakeTimers()
    try {
      const token = createVerifyToken('aud_1', 'a@example.com')
      vi.advanceTimersByTime(VERIFY_TTL_MS - 1000)
      expect(readVerifyToken(token)?.auditId).toBe('aud_1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('형식이 깨진 입력에 던지지 않는다', () => {
    for (const bad of ['', '.', 'a.b.c', 'notbase64!!!.sig', '없는토큰']) {
      expect(readVerifyToken(bad), bad).toBeNull()
    }
  })
})
```

- [ ] **Step 4: 실패 확인**

```bash
pnpm vitest run src/lib/audit/token.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 5: 토큰 구현**

`src/lib/audit/token.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/** 인증 링크 유효기간. 메일을 하루 뒤에 열어보는 사람이 흔하다. */
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ★ 인증 키를 BETTER_AUTH_SECRET 그대로 쓰지 않고 용도 문자열로 한 번 파생한다.
 *   같은 키를 두 목적(로그인 세션 / 진단 인증)에 쓰면, 한쪽에서 서명한 값이
 *   다른 쪽에서 유효해질 여지가 생긴다. env 변수를 늘리지 않으면서 키를
 *   분리하는 표준적인 방법이다.
 */
function key(): Buffer {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update('cited:audit-verify:v1').digest()
}

function sign(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}

export function createVerifyToken(auditId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ auditId, email, exp: Date.now() + VERIFY_TTL_MS }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readVerifyToken(token: string): { auditId: string; email: string } | null {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payload = token.slice(0, dot)
  const provided = token.slice(dot + 1)

  // ★ 길이가 다르면 timingSafeEqual이 **던진다.** 길이를 먼저 비교하면 조기
  //   반환이 생기지만, 길이는 비밀이 아니므로(서명 길이는 고정) 문제되지 않는다.
  const expected = sign(payload)
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { auditId, email, exp } = parsed as Record<string, unknown>
    if (typeof auditId !== 'string' || typeof email !== 'string' || typeof exp !== 'number') {
      return null
    }
    if (Date.now() > exp) return null
    return { auditId, email }
  } catch {
    return null
  }
}
```

- [ ] **Step 6: 통과 확인**

```bash
pnpm vitest run src/lib/audit/token.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 7: 기본 질의 생성 실패 테스트**

`src/lib/audit/queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AUDIT_QUERY_COUNT, generateAuditQueries, KNOWN_CATEGORIES } from '@/lib/audit/queries'

describe('generateAuditQueries', () => {
  it('정확히 3개를 만든다', () => {
    // ★ 이 숫자가 곧 원가다. 3 → 4는 무료 진단 원가가 33% 오른다.
    expect(generateAuditQueries('패션', '무신사')).toHaveLength(AUDIT_QUERY_COUNT)
    expect(AUDIT_QUERY_COUNT).toBe(3)
  })

  it('브랜드명을 질의에 넣지 않는다', () => {
    // ★ 결정적으로 중요하다. "무신사 어때?"라고 물으면 AI는 당연히 무신사를
    //   말하고 언급률이 100%가 된다. 우리가 재려는 것은 **브랜드를 말하지 않은
    //   질문에 AI가 그 브랜드를 꺼내는가**다.
    for (const q of generateAuditQueries('패션', '무신사')) {
      expect(q, q).not.toContain('무신사')
    }
  })

  it('아는 카테고리는 그 카테고리 문구를 쓴다', () => {
    const qs = generateAuditQueries('화장품', '토리든')
    expect(qs.some((q) => q.includes('화장품') || q.includes('스킨케어'))).toBe(true)
  })

  it('모르는 카테고리도 던지지 않고 3개를 만든다', () => {
    const qs = generateAuditQueries('수제 도자기 공방', '가나다')
    expect(qs).toHaveLength(3)
    for (const q of qs) expect(q).toContain('수제 도자기 공방')
  })

  it('질의가 서로 다르다', () => {
    const qs = generateAuditQueries('패션', '무신사')
    expect(new Set(qs).size).toBe(3)
  })

  it('빈 카테고리를 거부한다', () => {
    expect(() => generateAuditQueries('', '무신사')).toThrow()
    expect(() => generateAuditQueries('   ', '무신사')).toThrow()
  })

  it('알려진 카테고리 목록을 노출한다 (폼의 자동완성용)', () => {
    expect(KNOWN_CATEGORIES.length).toBeGreaterThan(0)
    for (const c of KNOWN_CATEGORIES) {
      expect(generateAuditQueries(c, '테스트브랜드')).toHaveLength(3)
    }
  })
})
```

- [ ] **Step 8: 실패 확인**

```bash
pnpm vitest run src/lib/audit/queries.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 9: 질의 생성 구현**

`src/lib/audit/queries.ts`:

```ts
/**
 * 무료 진단용 기본 질의 3개.
 *
 * ★ 브랜드명을 질의에 넣지 않는다. "무신사 어때?"라고 물으면 AI는 당연히
 *   무신사를 말한다. 우리가 재는 것은 **브랜드를 언급하지 않은 소비자 질문에
 *   AI가 그 브랜드를 자발적으로 꺼내는가**다. 이것이 GEO 측정의 전부다.
 *
 * ★ 3개인 이유는 원가다(설계 문서 "무료 진단 플로우"). 이 숫자를 올리려면
 *   `src/lib/plans.ts`의 `free.maxQueries`와 함께 올려야 하고, 그 전에
 *   무료 진단 월 예산을 다시 계산해야 한다.
 *
 * 순수 함수다. 외부 I/O 없음.
 */
export const AUDIT_QUERY_COUNT = 3

interface CategoryTemplate {
  /** 폼에서 고르는 이름 */
  label: string
  /** 이 카테고리로 인정할 입력 (부분 일치) */
  aliases: string[]
  queries: [string, string, string]
}

const TEMPLATES: CategoryTemplate[] = [
  {
    label: '패션',
    aliases: ['패션', '의류', '옷', '쇼핑몰'],
    queries: [
      '30대 남자 옷 어디서 사는 게 좋아?',
      '가성비 좋은 온라인 패션 쇼핑몰 추천해줘',
      '요즘 인기 있는 국내 패션 브랜드 알려줘',
    ],
  },
  {
    label: '화장품',
    aliases: ['화장품', '뷰티', '스킨케어', '코스메틱'],
    queries: [
      '건성 피부에 맞는 수분크림 추천해줘',
      '가성비 좋은 국내 스킨케어 브랜드 뭐가 있어?',
      '올리브영에서 잘 팔리는 화장품 알려줘',
    ],
  },
  {
    label: '식품',
    aliases: ['식품', '음식', '먹거리', '간편식', '밀키트'],
    queries: [
      '간편하게 먹을 수 있는 밀키트 추천해줘',
      '선물하기 좋은 국내 식품 브랜드 알려줘',
      '요즘 인기 있는 건강식품 뭐가 있어?',
    ],
  },
  {
    label: '가전',
    aliases: ['가전', '전자제품', '전자기기', '디지털'],
    queries: [
      '자취방에 놓기 좋은 소형가전 추천해줘',
      '가성비 좋은 무선 이어폰 뭐가 있어?',
      '요즘 잘 나가는 국내 가전 브랜드 알려줘',
    ],
  },
  {
    label: '교육',
    aliases: ['교육', '학원', '강의', '인강', '온라인 강의'],
    queries: [
      '온라인으로 코딩 배우려면 어디가 좋아?',
      '직장인이 듣기 좋은 온라인 강의 플랫폼 추천해줘',
      '국내 이러닝 서비스 뭐가 있어?',
    ],
  },
]

export const KNOWN_CATEGORIES = TEMPLATES.map((t) => t.label)

/**
 * @param category 고객이 고르거나 입력한 카테고리
 * @param brandName 브랜드명. **질의에는 넣지 않는다.** 향후 카테고리 추론에
 *   쓸 수 있도록 받아두되, 지금은 의도적으로 사용하지 않는다.
 */
export function generateAuditQueries(category: string, brandName: string): string[] {
  void brandName
  const trimmed = category.trim()
  if (!trimmed) throw new Error('카테고리가 비어 있습니다')

  const matched = TEMPLATES.find((t) => t.aliases.some((a) => trimmed.includes(a)))
  if (matched) return [...matched.queries]

  // 모르는 카테고리 — 입력을 그대로 넣어 일반형 질의를 만든다.
  // 억지로 가까운 카테고리에 끼워 맞추면 엉뚱한 질의로 측정하게 된다.
  return [
    `${trimmed} 추천해줘`,
    `가성비 좋은 ${trimmed} 브랜드 뭐가 있어?`,
    `요즘 인기 있는 ${trimmed} 알려줘`,
  ]
}
```

- [ ] **Step 10: 통과 확인**

```bash
pnpm vitest run src/lib/audit/queries.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 11: 리포지토리 구현**

`src/lib/audit/repository.ts` — DB 접근만 모은다. 순수 로직을 두지 않는다.

```ts
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { createHmac, randomBytes } from 'node:crypto'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import type { FreeAudit } from '@/lib/db/schema'

/** 추측 불가능한 ID. `/audit/<id>`가 곧 비공개 링크라 짧으면 안 된다. */
function newAuditId(): string {
  return `aud_${randomBytes(16).toString('base64url')}`
}

/** IP 원문은 저장하지 않는다. 토큰과 같은 이유로 용도별 키를 파생한다. */
export function hashIp(ip: string): string {
  const key = createHmac('sha256', env.BETTER_AUTH_SECRET).update('cited:audit-ip:v1').digest()
  return createHmac('sha256', key).update(ip).digest('base64url')
}

export async function createAuditRequest(args: {
  brandName: string
  category: string
  email: string
  competitors: string[]
  ipHash: string
}): Promise<FreeAudit> {
  const rows = await db
    .insert(schema.freeAudits)
    .values({ id: newAuditId(), status: 'requested', ...args })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('진단 신청을 저장하지 못했습니다')
  return created
}

/**
 * 인증 처리. **토큰의 이메일이 저장된 이메일과 같을 때만** 넘어간다.
 * 다르면 다른 신청의 토큰을 가져다 쓴 것이다.
 */
export async function markVerified(auditId: string, email: string): Promise<FreeAudit | null> {
  const rows = await db
    .update(schema.freeAudits)
    .set({ emailVerified: true, status: 'verified', verifiedAt: new Date() })
    .where(
      and(
        eq(schema.freeAudits.id, auditId),
        eq(schema.freeAudits.email, email),
        // 이미 실행됐거나 발송된 건을 되돌리지 않는다. 재인증은 무해해야 한다.
        eq(schema.freeAudits.status, 'requested'),
      ),
    )
    .returning()
  return rows[0] ?? null
}

export async function getAudit(auditId: string): Promise<FreeAudit | null> {
  const row = await db.query.freeAudits.findFirst({
    where: eq(schema.freeAudits.id, auditId),
  })
  return row ?? null
}

/** 운영자 대기 목록. 오래된 것부터 — 먼저 신청한 사람이 먼저 받아야 한다. */
export async function listPendingAudits(): Promise<FreeAudit[]> {
  return db
    .select()
    .from(schema.freeAudits)
    .where(sql`${schema.freeAudits.status} in ('verified', 'failed')`)
    .orderBy(schema.freeAudits.createdAt)
}

export async function listRecentAudits(limit = 20): Promise<FreeAudit[]> {
  return db
    .select()
    .from(schema.freeAudits)
    .orderBy(desc(schema.freeAudits.createdAt))
    .limit(limit)
}

export async function markRunning(auditId: string): Promise<void> {
  await db
    .update(schema.freeAudits)
    .set({ status: 'running', failureReason: null })
    .where(eq(schema.freeAudits.id, auditId))
}

export async function markSent(auditId: string, result: unknown): Promise<void> {
  await db
    .update(schema.freeAudits)
    .set({ status: 'sent', result, sentAt: new Date() })
    .where(eq(schema.freeAudits.id, auditId))
}

export async function markFailed(auditId: string, reason: string): Promise<void> {
  await db
    .update(schema.freeAudits)
    .set({ status: 'failed', failureReason: reason.slice(0, 500) })
    .where(eq(schema.freeAudits.id, auditId))
}

/** 같은 IP의 최근 신청 수. 신청 테이블이 스팸으로 차는 것만 막는다. */
export async function countRecentByIpHash(ipHash: string, sinceHours: number): Promise<number> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.freeAudits)
    .where(and(eq(schema.freeAudits.ipHash, ipHash), gte(schema.freeAudits.createdAt, since)))
  return rows[0]?.n ?? 0
}
```

- [ ] **Step 12: 타입·린트·전체 테스트 확인**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 전부 통과

- [ ] **Step 13: 커밋**

```bash
git add src/lib/db/schema.ts src/lib/audit drizzle
git commit -m "feat(audit): 진단 신청 스키마·인증 토큰·기본 질의·리포지토리

상태값을 자동 실행 전제(queued/succeeded/waitlisted)에서 수동 배송 전제
(requested/verified/running/sent/failed/rejected)로 교체했다.

email을 notNull로 바꿨다. 최초 설계는 결과를 보여준 뒤 이메일을 받아서
nullable이었고, 그 순서 때문에 이메일 인증이 비용을 전혀 방어하지 못했다.

인증 토큰은 BETTER_AUTH_SECRET을 용도 문자열로 한 번 파생해 서명한다.
같은 키를 로그인 세션과 진단 인증에 그대로 쓰면 한쪽 서명이 다른 쪽에서
유효해질 여지가 생긴다."
```

---

### Task 5: 신청 API · 이메일 인증 · 운영자 알림

**Files:**
- Create: `src/lib/audit/request-schema.ts`,
  `src/app/api/audit/request/route.ts`, `src/app/api/audit/verify/route.ts`
- Modify: `src/lib/email/templates.ts`, `src/lib/env.ts`, `.env.example`
- Test: `src/lib/audit/request-schema.test.ts`,
  `src/lib/email/audit-templates.test.ts`,
  `tests/integration/audit-request.test.ts`

**Interfaces:**
- Consumes: Task 4의 `createVerifyToken`/`readVerifyToken`/리포지토리/`generateAuditQueries`,
  `sendEmail`·`EmailContent` (1단계)
- Produces:
  - `auditRequestSchema` — zod. `parseAuditRequest(input): AuditRequestInput`
  - `POST /api/audit/request` → `{ ok: true }` | `{ ok: false, error }`
  - `GET /api/audit/verify?token=…` → `/audit/requested`로 리다이렉트
  - `auditVerificationEmail({ url, brandName })`
  - `auditRequestedNotice({ audit })` — 운영자 알림
  - `OPERATOR_EMAIL` (env)
  - Task 7의 CLI가 `listPendingAudits`로 이어받는다

**이 태스크의 유일한 보안 요구사항:** 인증 전에는 **어떤 외부 API도 호출하지
않는다.** 신청 접수는 DB 쓰기 1회 + 메일 1통이 전부다. 그래서 Turnstile도,
예산 킬스위치도 필요 없다 — 태울 돈이 없다.

- [ ] **Step 1: env에 운영자 주소 추가**

`src/lib/env.ts`의 스키마에 추가한다:

```ts
  /**
   * 진단 신청 알림을 받을 운영자 주소. 무료 진단은 운영자가 직접 실행하므로
   * 이 주소로 알림이 안 가면 **신청이 그대로 방치된다.** 배포 환경에서는
   * 필수다 (아래 superRefine).
   */
  OPERATOR_EMAIL: z.string().email().optional(),
```

같은 파일의 `superRefine` 안, `CRON_SECRET`을 필수로 올리는 블록 바로 옆에
추가한다:

```ts
    if (!value.OPERATOR_EMAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPERATOR_EMAIL'],
        message:
          '배포 환경에서는 OPERATOR_EMAIL이 필요합니다 (무료 진단 신청 알림이 가지 않으면 신청이 방치됩니다)',
      })
    }
```

`.env.example`에 추가한다:

```
# 무료 진단 신청 알림을 받을 주소 (운영자 본인)
OPERATOR_EMAIL=
```

- [ ] **Step 2: 입력 검증 실패 테스트**

`src/lib/audit/request-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_COMPETITORS, parseAuditRequest } from '@/lib/audit/request-schema'

const valid = {
  brandName: '무신사',
  category: '패션',
  email: 'a@example.com',
  competitors: ['29CM', 'W컨셉'],
}

describe('parseAuditRequest', () => {
  it('정상 입력을 통과시킨다', () => {
    expect(parseAuditRequest(valid)).toEqual(valid)
  })

  it('앞뒤 공백을 제거한다', () => {
    const r = parseAuditRequest({ ...valid, brandName: '  무신사  ', email: ' a@example.com ' })
    expect(r.brandName).toBe('무신사')
    expect(r.email).toBe('a@example.com')
  })

  it('이메일을 소문자로 정규화한다', () => {
    // 같은 사람이 대소문자만 바꿔 여러 번 신청하는 것을 세려면 정규화가 필요하다.
    expect(parseAuditRequest({ ...valid, email: 'A@Example.COM' }).email).toBe('a@example.com')
  })

  it('경쟁사를 생략할 수 있다', () => {
    const { competitors: _omit, ...withoutCompetitors } = valid
    expect(parseAuditRequest(withoutCompetitors).competitors).toEqual([])
  })

  it('경쟁사 중복과 빈 값을 걷어낸다', () => {
    const r = parseAuditRequest({ ...valid, competitors: ['29CM', '', '  ', '29CM', 'W컨셉'] })
    expect(r.competitors).toEqual(['29CM', 'W컨셉'])
  })

  it('경쟁사가 브랜드 자신과 같으면 걷어낸다', () => {
    // 자기 자신이 경쟁사로 들어가면 Share of Voice가 자기를 두 번 센다.
    const r = parseAuditRequest({ ...valid, competitors: ['무신사', '29CM'] })
    expect(r.competitors).toEqual(['29CM'])
  })

  it(`경쟁사는 ${MAX_COMPETITORS}개를 넘을 수 없다`, () => {
    expect(() =>
      parseAuditRequest({ ...valid, competitors: ['a', 'b', 'c', 'd'] }),
    ).toThrow()
    expect(MAX_COMPETITORS).toBe(3) // PLANS.free.maxCompetitors와 같아야 한다
  })

  it('잘못된 이메일을 거부한다', () => {
    for (const email of ['', 'a', 'a@', '@b.com', 'a b@c.com']) {
      expect(() => parseAuditRequest({ ...valid, email }), email).toThrow()
    }
  })

  it('빈 브랜드명·카테고리를 거부한다', () => {
    expect(() => parseAuditRequest({ ...valid, brandName: '   ' })).toThrow()
    expect(() => parseAuditRequest({ ...valid, category: '' })).toThrow()
  })

  it('지나치게 긴 입력을 거부한다', () => {
    // 길이 제한이 없으면 신청 테이블에 소설을 넣을 수 있다.
    expect(() => parseAuditRequest({ ...valid, brandName: 'ㄱ'.repeat(101) })).toThrow()
    expect(() => parseAuditRequest({ ...valid, category: 'ㄱ'.repeat(101) })).toThrow()
  })

  it('객체가 아닌 입력에 던진다', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(() => parseAuditRequest(bad)).toThrow()
    }
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/audit/request-schema.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 4: 입력 검증 구현**

`src/lib/audit/request-schema.ts`:

```ts
import { z } from 'zod'
import { PLANS } from '@/lib/plans'

/** 무료 플랜의 경쟁사 한도와 같아야 한다. 다르면 화면과 제품이 어긋난다. */
export const MAX_COMPETITORS = PLANS.free.maxCompetitors

const name = z.string().trim().min(1).max(100)

export const auditRequestSchema = z
  .object({
    brandName: name,
    category: name,
    email: z.string().trim().toLowerCase().email(),
    competitors: z.array(z.string()).optional().default([]),
  })
  .transform((v) => ({
    ...v,
    // 빈 값·중복·자기 자신을 걷어낸 뒤에 개수를 센다. 사용자가 실수로
    // 빈 칸을 남긴 것 때문에 거부당하면 안 된다.
    competitors: [
      ...new Set(
        v.competitors
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && c !== v.brandName.trim()),
      ),
    ],
  }))
  .refine((v) => v.competitors.length <= MAX_COMPETITORS, {
    message: `경쟁사는 최대 ${MAX_COMPETITORS}개까지 등록할 수 있습니다`,
    path: ['competitors'],
  })

export type AuditRequestInput = z.infer<typeof auditRequestSchema>

export function parseAuditRequest(input: unknown): AuditRequestInput {
  return auditRequestSchema.parse(input)
}
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm vitest run src/lib/audit/request-schema.test.ts
```

Expected: PASS (11 passed)

- [ ] **Step 6: 메일 템플릿 실패 테스트**

`src/lib/email/audit-templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { auditRequestedNotice, auditVerificationEmail } from '@/lib/email/templates'

describe('auditVerificationEmail', () => {
  it('인증 링크와 브랜드명을 담는다', () => {
    const mail = auditVerificationEmail({
      url: 'https://cited.co.kr/api/audit/verify?token=abc',
      brandName: '무신사',
    })
    expect(mail.subject).toContain('무신사')
    expect(mail.html).toContain('https://cited.co.kr/api/audit/verify?token=abc')
  })

  it('언제 결과를 받는지 말한다', () => {
    // 즉시 결과가 아니므로 기다림을 명시하지 않으면 이탈한다.
    const mail = auditVerificationEmail({ url: 'https://x', brandName: 'A' })
    expect(mail.html).toMatch(/영업일|1일|24시간/)
  })

  it('HTML을 이스케이프한다', () => {
    const mail = auditVerificationEmail({ url: 'https://x', brandName: '<script>x</script>' })
    expect(mail.html).not.toContain('<script>')
    expect(mail.subject).not.toContain('<script>')
  })
})

describe('auditRequestedNotice', () => {
  const audit = {
    id: 'aud_1',
    brandName: '무신사',
    category: '패션',
    competitors: ['29CM'],
    email: 'someone@example.com',
  }

  it('운영자가 바로 실행할 수 있게 명령을 담는다', () => {
    const mail = auditRequestedNotice({ audit })
    expect(mail.html).toContain('pnpm audit:run aud_1')
  })

  it('브랜드·카테고리·경쟁사를 담는다', () => {
    const mail = auditRequestedNotice({ audit })
    for (const s of ['무신사', '패션', '29CM']) expect(mail.html).toContain(s)
  })

  it('신청자 이메일을 마스킹한다', () => {
    // 운영자 메일함도 유출 경로다. 실행에 필요한 것은 id지 이메일이 아니다.
    const mail = auditRequestedNotice({ audit })
    expect(mail.html).not.toContain('someone@example.com')
  })

  it('경쟁사가 없으면 없다고 쓴다', () => {
    const mail = auditRequestedNotice({ audit: { ...audit, competitors: [] } })
    expect(mail.html).toContain('없음')
  })
})
```

- [ ] **Step 7: 실패 확인**

```bash
pnpm vitest run src/lib/email/audit-templates.test.ts
```

Expected: FAIL — `auditVerificationEmail`이 export되지 않음

- [ ] **Step 8: 메일 템플릿 구현**

`src/lib/email/templates.ts`에 **추가**한다 (기존 `layout`·`escapeHtml` 재사용):

```ts
import { maskEmail } from '@/lib/email/send'

export function auditVerificationEmail(params: {
  url: string
  brandName: string
}): EmailContent {
  const url = escapeHtml(params.url)
  const brand = escapeHtml(params.brandName)
  return {
    subject: `[Cited] ${params.brandName} 진단 신청을 확인해 주세요`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:20px">진단 신청이 접수됐습니다</h1>
      <p style="margin:0 0 16px">
        <strong>${brand}</strong>이(가) AI 답변에 얼마나 등장하는지 측정합니다.
        아래 버튼을 눌러 이메일을 확인해 주세요.
      </p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111;color:#fff;text-decoration:none">이메일 확인하기</a>
      </p>
      <p style="margin:0 0 8px;color:#555">
        확인이 끝나면 <strong>영업일 1일 이내</strong>에 진단 리포트를 이 주소로 보내드립니다.
        측정은 실제 AI 서비스에 직접 질문해 수행하므로 시간이 걸립니다.
      </p>
      <p style="margin:0;color:#888;font-size:13px">
        본인이 신청하지 않았다면 이 메일을 무시하셔도 됩니다. 확인하지 않으면 아무것도 실행되지 않습니다.
      </p>
    `),
  }
}

export function auditRequestedNotice(params: {
  audit: {
    id: string
    brandName: string
    category: string
    competitors: string[]
    email: string
  }
}): EmailContent {
  const { audit } = params
  const competitors = audit.competitors.length > 0 ? audit.competitors.join(', ') : '없음'
  return {
    subject: `[Cited 운영] 진단 대기 — ${audit.brandName}`,
    html: layout(`
      <h1 style="margin:0 0 16px;font-size:20px">진단 신청이 인증됐습니다</h1>
      <table style="border-collapse:collapse;margin:0 0 20px">
        <tr><td style="padding:4px 12px 4px 0;color:#666">브랜드</td><td style="padding:4px 0"><strong>${escapeHtml(audit.brandName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">카테고리</td><td style="padding:4px 0">${escapeHtml(audit.category)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">경쟁사</td><td style="padding:4px 0">${escapeHtml(competitors)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">신청자</td><td style="padding:4px 0">${escapeHtml(maskEmail(audit.email))}</td></tr>
      </table>
      <p style="margin:0 0 8px">실행 명령:</p>
      <pre style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:13px">pnpm audit:run ${escapeHtml(audit.id)}</pre>
      <p style="margin:0;color:#888;font-size:13px">영업일 1일 이내 발송을 약속했습니다.</p>
    `),
  }
}
```

- [ ] **Step 9: 통과 확인**

```bash
pnpm vitest run src/lib/email/audit-templates.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 10: 신청 API 구현**

`src/app/api/audit/request/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { countRecentByIpHash, createAuditRequest, hashIp } from '@/lib/audit/repository'
import { parseAuditRequest } from '@/lib/audit/request-schema'
import { createVerifyToken } from '@/lib/audit/token'
import { sendEmail } from '@/lib/email/send'
import { auditVerificationEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * 같은 IP의 24시간 신청 수 상한.
 *
 * ★ 이것은 **비용 방어가 아니다.** 인증 전에는 외부 API를 부르지 않으므로
 *   태울 돈이 없다. 신청 테이블이 스팸으로 차서 운영자 대기 목록이
 *   못 쓰게 되는 것만 막는다. 그래서 값이 넉넉하다 — 회사 NAT 뒤에서
 *   여러 명이 신청하는 정상 상황을 막으면 안 된다.
 */
const IP_DAILY_LIMIT = 10

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  // Vercel은 x-forwarded-for의 **첫 번째** 항목이 실제 클라이언트다.
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  let input: ReturnType<typeof parseAuditRequest>
  try {
    input = parseAuditRequest(body)
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? '입력값을 확인해 주세요')
        : '입력값을 확인해 주세요'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }

  const ipHash = hashIp(clientIp(request))
  if ((await countRecentByIpHash(ipHash, 24)) >= IP_DAILY_LIMIT) {
    return NextResponse.json(
      { ok: false, error: '오늘 신청 가능한 횟수를 초과했습니다. 내일 다시 시도해 주세요.' },
      { status: 429 },
    )
  }

  const audit = await createAuditRequest({ ...input, ipHash })

  const token = createVerifyToken(audit.id, audit.email)
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/audit/verify?token=${encodeURIComponent(token)}`
  const sent = await sendEmail({
    to: audit.email,
    content: auditVerificationEmail({ url, brandName: audit.brandName }),
  })

  // ★ 메일 발송 실패를 200으로 숨기지 않는다. 사용자는 오지 않는 메일을
  //   기다리게 되고, 우리는 신청이 방치된 이유를 모른다.
  //   신청 행은 이미 만들어졌으므로 운영자가 수동으로 이어받을 수 있다.
  if (!sent.ok) {
    logger.error('audit.verification_email_failed', { auditId: audit.id, reason: sent.reason })
    return NextResponse.json(
      { ok: false, error: '확인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 502 },
    )
  }

  logger.info('audit.requested', { auditId: audit.id })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 11: 인증 API 구현**

`src/app/api/audit/verify/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAudit, markVerified } from '@/lib/audit/repository'
import { readVerifyToken } from '@/lib/audit/token'
import { sendEmail } from '@/lib/email/send'
import { auditRequestedNotice } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

function redirect(path: string): Response {
  return NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_APP_URL))
}

export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token')
  const payload = token ? readVerifyToken(token) : null
  if (!payload) return redirect('/audit/requested?state=invalid')

  const verified = await markVerified(payload.auditId, payload.email)

  // ★ 이미 인증된 건을 눌러도 실패 화면을 보여주지 않는다. 메일 링크를 두 번
  //   누르는 것은 흔하고, 그게 오류처럼 보이면 사용자는 무언가 잘못됐다고 믿는다.
  if (!verified) {
    const existing = await getAudit(payload.auditId)
    if (existing?.emailVerified) return redirect('/audit/requested?state=already')
    return redirect('/audit/requested?state=invalid')
  }

  // 운영자 알림. 실패해도 인증 자체는 성공으로 둔다 — 사용자 책임이 아니다.
  // 다만 로그에 남겨야 한다. 이 메일이 유일한 실행 트리거다.
  if (env.OPERATOR_EMAIL) {
    const notice = await sendEmail({
      to: env.OPERATOR_EMAIL,
      content: auditRequestedNotice({ audit: verified }),
    })
    if (!notice.ok) {
      logger.error('audit.operator_notice_failed', {
        auditId: verified.id,
        reason: notice.reason,
      })
    }
  }

  logger.info('audit.verified', { auditId: verified.id })
  return redirect('/audit/requested?state=verified')
}
```

- [ ] **Step 12: 통합 테스트**

`tests/integration/audit-request.test.ts` — 실제 DB에 붙는다. 스모크와 달리
`pnpm test`에서 돌리되, DB가 없으면 건너뛴다.

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmailContent } from '@/lib/email/templates'

const sent: { to: string; content: EmailContent }[] = []
vi.mock('@/lib/email/send', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/send')>()
  return {
    ...actual,
    sendEmail: async (p: { to: string; content: EmailContent }) => {
      sent.push(p)
      return { ok: true as const, id: 'stub' }
    },
  }
})

const { POST } = await import('@/app/api/audit/request/route')
const { GET } = await import('@/app/api/audit/verify/route')
const { db, schema } = await import('@/lib/db')
const { sql } = await import('drizzle-orm')

const EMAIL = `audit-it-${Date.now()}@cited-smoke.invalid`
const cleanup = () =>
  db.delete(schema.freeAudits).where(sql`${schema.freeAudits.email} = ${EMAIL}`)

beforeAll(cleanup)
afterAll(cleanup)

function post(body: unknown, ip = '203.0.113.9'): Promise<Response> {
  return POST(
    new Request('https://cited.co.kr/api/audit/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  )
}

describe('진단 신청 → 인증 플로우', () => {
  it('신청하면 행이 생기고 확인 메일이 나간다', async () => {
    const res = await post({ brandName: '통합테스트', category: '패션', email: EMAIL })
    expect(res.status).toBe(200)

    const rows = await db
      .select()
      .from(schema.freeAudits)
      .where(sql`${schema.freeAudits.email} = ${EMAIL}`)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('requested')
    expect(rows[0]?.emailVerified).toBe(false)
    expect(sent.at(-1)?.to).toBe(EMAIL)
  })

  it('인증 링크를 누르면 verified가 되고 운영자 알림이 나간다', async () => {
    const link = /verify\?token=([^"&]+)/.exec(sent.at(-1)?.content.html ?? '')
    expect(link?.[1]).toBeTruthy()

    const before = sent.length
    const res = await GET(
      new Request(`https://cited.co.kr/api/audit/verify?token=${link?.[1] ?? ''}`),
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('state=verified')

    const rows = await db
      .select()
      .from(schema.freeAudits)
      .where(sql`${schema.freeAudits.email} = ${EMAIL}`)
    expect(rows[0]?.status).toBe('verified')
    expect(rows[0]?.verifiedAt).toBeInstanceOf(Date)
    expect(sent.length).toBeGreaterThan(before) // 운영자 알림
  })

  it('같은 링크를 다시 눌러도 오류 화면을 보여주지 않는다', async () => {
    const link = /verify\?token=([^"&]+)/.exec(
      sent.find((s) => s.to === EMAIL)?.content.html ?? '',
    )
    const res = await GET(
      new Request(`https://cited.co.kr/api/audit/verify?token=${link?.[1] ?? ''}`),
    )
    expect(res.headers.get('location')).toContain('state=already')
  })

  it('위조 토큰은 invalid로 보낸다', async () => {
    const res = await GET(new Request('https://cited.co.kr/api/audit/verify?token=forged.sig'))
    expect(res.headers.get('location')).toContain('state=invalid')
  })

  it('잘못된 입력은 400', async () => {
    expect((await post({ brandName: '', category: '패션', email: EMAIL })).status).toBe(400)
    expect((await post({ brandName: 'A', category: '패션', email: 'not-an-email' })).status).toBe(400)
  })
})
```

- [ ] **Step 13: 통과 확인**

```bash
pnpm vitest run tests/integration/audit-request.test.ts
```

Expected: PASS (5 passed)

- [ ] **Step 14: 전체 검증과 커밋**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/lib/audit src/lib/email src/lib/env.ts src/app/api/audit .env.example tests/integration
git commit -m "feat(audit): 진단 신청 접수와 이메일 인증

인증 전에는 어떤 외부 API도 호출하지 않는다. 신청은 DB 쓰기 1회 + 메일 1통이
전부라 태울 돈이 없고, 그래서 Turnstile도 예산 킬스위치도 필요 없다.

IP 상한(24시간 10회)은 비용 방어가 아니라 신청 테이블이 스팸으로 차서 운영자
대기 목록이 못 쓰게 되는 것만 막는다. 회사 NAT 뒤 여러 명이 신청하는 정상
상황을 막지 않도록 넉넉히 잡았다.

확인 메일 발송 실패를 200으로 숨기지 않는다. 숨기면 사용자는 오지 않는 메일을
기다리고 우리는 신청이 방치된 이유를 모른다.

운영자 알림에는 신청자 이메일을 마스킹해 넣는다. 실행에 필요한 것은 id다."
```

---

### Task 6: 진단 리포트 구성

**Files:**
- Create: `src/lib/audit/result.ts`
- Test: `src/lib/audit/result.test.ts`

**Interfaces:**
- Consumes: `BrandMetrics` (2단계), `Interval`·`formatInterval` (2단계),
  `DetectionResult` (2단계)
- Produces:
  - `interface AuditResult { brandName; category; competitors; totalAnswers; citedRate; shareOfVoice; ranking; evidence; byEngine; byQuery; measuredAt; engines; unresolved }`
  - `buildAuditResult(args): AuditResult` — 순수 함수
  - `AUDIT_RESULT_VERSION`
  - Task 7의 CLI와 Task 8의 화면이 소비한다

**최초 계획과 달라진 두 가지:**

1. **이메일 게이트가 없다.** 최초 계획은 결과를 C(증거) → B(순위) → A(전체
   지표)로 쪼개고 A 앞에 이메일 게이트를 뒀다. 이제 이메일은 신청 시점에 이미
   받았으므로 **전부 한 번에 보여준다.** `evidence`를 맨 앞에 두는 순서는
   유지한다 — 기다린 사람의 첫 질문은 여전히 "이거 진짜야?"이고, 숫자는 반박
   가능하지만 AI 답변 원문은 반박할 수 없다.
2. **경쟁사 순위가 실제로 들어간다.** 최초 계획은 경쟁사 판정이 없어 자기
   브랜드만 순위에 넣었다. 이제 신청 폼이 경쟁사를 최대 3개 받으므로
   Share of Voice를 진짜로 계산한다. **경쟁사를 추가해도 API 호출은 늘지
   않는다** — 같은 답변에서 탐지 대상만 늘어난다. 원가가 거의 그대로인데
   후킹은 가장 강한 항목이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/audit/result.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AUDIT_RESULT_VERSION, buildAuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

const metrics = {
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  firstMentionRate: wilsonInterval(0, 3),
  shareOfVoice: wilsonInterval(1, 4),
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [
    { queryId: 'q1', queryText: '러닝화 추천', interval: wilsonInterval(0, 1) },
    { queryId: 'q2', queryText: '운동화 브랜드', interval: wilsonInterval(1, 1) },
  ],
  competitorRates: { '29CM': wilsonInterval(2, 3), 'W컨셉': wilsonInterval(1, 3) },
}

const answers = [
  { id: 'a1', queryText: '러닝화 추천', engineId: 'gemini', text: '나이키와 아디다스를 추천합니다.' },
  { id: 'a2', queryText: '운동화 브랜드', engineId: 'gemini', text: '무신사에서 파는 제품이 좋습니다.' },
  { id: 'a3', queryText: '러닝화 추천', engineId: 'gemini', text: '아식스도 괜찮습니다.' },
]

const detections = [
  { answerId: 'a2', subject: '무신사', mentioned: true, position: 1, context: '추천 목록 첫 번째', sentiment: 'recommended' as const, unresolved: false },
  { answerId: 'a1', subject: '무신사', mentioned: false, position: null, context: null, sentiment: null, unresolved: false },
  { answerId: 'a3', subject: '무신사', mentioned: false, position: null, context: null, sentiment: null, unresolved: false },
  { answerId: 'a1', subject: '29CM', mentioned: true, position: 2, context: '함께 언급', sentiment: 'neutral' as const, unresolved: false },
  { answerId: 'a2', subject: '29CM', mentioned: true, position: 2, context: '함께 언급', sentiment: 'neutral' as const, unresolved: false },
]

const base = {
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM', 'W컨셉'],
  engines: ['gemini'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  metrics,
  answers,
  detections,
  unresolved: 0,
}

describe('buildAuditResult', () => {
  it('증거를 1~3건 담고 언급된 답변을 먼저 보여준다', () => {
    const r = buildAuditResult(base)
    expect(r.evidence.length).toBeGreaterThanOrEqual(1)
    expect(r.evidence.length).toBeLessThanOrEqual(3)
    expect(r.evidence[0]?.mentioned).toBe(true)
    expect(r.evidence[0]?.text).toContain('무신사')
  })

  it('언급이 하나도 없어도 증거를 보여준다', () => {
    // ★ 0% 결과가 가장 흔하고 가장 중요한 화면이다. 여기서 빈 화면을 주면
    //   "측정이 안 된 건가?"가 되어 제품을 의심한다. 안 나온 답변 자체가 증거다.
    const r = buildAuditResult({
      ...base,
      detections: detections.filter((d) => d.subject !== '무신사'),
      metrics: { ...metrics, citedRate: wilsonInterval(0, 3) },
    })
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.evidence.every((e) => !e.mentioned)).toBe(true)
  })

  it('증거 원문을 600자로 자른다', () => {
    const long = { ...answers[0]!, id: 'a9', text: 'ㄱ'.repeat(2000) }
    const r = buildAuditResult({ ...base, answers: [long, ...answers] })
    expect(r.evidence[0]!.text.length).toBeLessThanOrEqual(600)
  })

  it('순위에 경쟁사가 들어가고 언급 수 내림차순이다', () => {
    const r = buildAuditResult(base)
    expect(r.ranking.map((x) => x.name)).toEqual(['29CM', '무신사', 'W컨셉'])
    expect(r.ranking.find((x) => x.isSelf)?.name).toBe('무신사')
  })

  it('경쟁사가 없으면 순위에 자기 브랜드만 남는다', () => {
    const r = buildAuditResult({ ...base, competitors: [], metrics: { ...metrics, competitorRates: {} } })
    expect(r.ranking).toHaveLength(1)
    expect(r.ranking[0]?.isSelf).toBe(true)
  })

  it('경쟁사가 없으면 Share of Voice를 "측정 없음"으로 남긴다', () => {
    // ★ "우리만 등록했으니 점유율 100%"는 거짓말이다. 2단계가 n=0으로 돌려주고
    //   여기서도 그대로 전달해야 화면이 숨길 수 있다.
    const r = buildAuditResult({
      ...base,
      competitors: [],
      metrics: { ...metrics, shareOfVoice: wilsonInterval(0, 0), competitorRates: {} },
    })
    expect(r.shareOfVoice.n).toBe(0)
  })

  it('질의별 결과를 언급률이 낮은 순으로 담는다', () => {
    // "이 질문에서 안 나온다"가 위로 와야 행동으로 이어진다.
    const r = buildAuditResult(base)
    expect(r.byQuery[0]?.queryText).toBe('러닝화 추천')
  })

  it('측정 조건을 함께 담는다 (재현과 비교 가능성)', () => {
    const r = buildAuditResult(base)
    expect(r.engines).toEqual(['gemini'])
    expect(r.competitors).toEqual(['29CM', 'W컨셉'])
    expect(r.measuredAt).toBe('2026-07-30T02:00:00.000Z')
    expect(r.totalAnswers).toBe(3)
    expect(r.version).toBe(AUDIT_RESULT_VERSION)
  })

  it('미판정 건수를 숨기지 않는다', () => {
    const r = buildAuditResult({ ...base, unresolved: 2 })
    expect(r.unresolved).toBe(2)
  })

  it('입력을 변형하지 않는다', () => {
    const snapshot = JSON.stringify(base.answers)
    buildAuditResult(base)
    expect(JSON.stringify(base.answers)).toBe(snapshot)
  })

  it('답변이 하나도 없어도 던지지 않는다', () => {
    const r = buildAuditResult({
      ...base,
      answers: [],
      detections: [],
      metrics: { ...metrics, totalAnswers: 0, citedRate: wilsonInterval(0, 0) },
    })
    expect(r.evidence).toEqual([])
    expect(r.totalAnswers).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/audit/result.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/audit/result.ts`:

```ts
import type { Sentiment } from '@/lib/detection/types'
import type { BrandMetrics } from '@/lib/stats/metrics'
import type { Interval } from '@/lib/stats/wilson'

/**
 * 리포트 구조 버전.
 *
 * `free_audits.result`에 그대로 저장되므로, 구조를 바꾸면 예전에 보낸 리포트를
 * 새 화면이 못 읽는다. 필드를 지우거나 의미를 바꿀 때 올린다.
 */
export const AUDIT_RESULT_VERSION = 1

export interface EvidenceItem {
  query: string
  engineId: string
  /** 자른 답변 원문 */
  text: string
  mentioned: boolean
  /** 2차 판정의 한 줄 요약. 미언급이면 null */
  context: string | null
  sentiment: Sentiment | null
}

export interface RankingItem {
  name: string
  /** 이 브랜드가 언급된 답변 수 */
  mentions: number
  isSelf: boolean
}

export interface AuditResult {
  version: number
  brandName: string
  category: string
  /** 고객이 등록한 경쟁사. Share of Voice를 읽으려면 반드시 함께 봐야 한다 */
  competitors: string[]
  /** 이 측정에 쓴 엔진. 다른 엔진 구성끼리 비교하면 안 된다 */
  engines: string[]
  /** ISO 8601 */
  measuredAt: string
  totalAnswers: number
  citedRate: Interval
  shareOfVoice: Interval
  ranking: RankingItem[]
  evidence: EvidenceItem[]
  byEngine: Record<string, Interval>
  byQuery: { queryText: string; interval: Interval }[]
  /** 2차 판정이 실패해 미판정으로 남은 건수. 0이 아니면 화면에 표시한다 */
  unresolved: number
}

const EVIDENCE_MAX = 3
const EVIDENCE_TEXT_LIMIT = 600

export interface DetectionRow {
  answerId: string
  subject: string
  mentioned: boolean
  position: number | null
  context: string | null
  sentiment: Sentiment | null
  unresolved: boolean
}

export interface BuildAuditResultArgs {
  brandName: string
  category: string
  competitors: string[]
  engines: string[]
  measuredAt: string
  metrics: BrandMetrics
  answers: { id: string; queryText: string; engineId: string; text: string }[]
  detections: DetectionRow[]
  unresolved: number
}

/**
 * 무료 진단 리포트를 구성한다. 순수 함수 — 입력을 변형하지 않는다.
 *
 * 설계 ④: 기다린 사람의 첫 질문은 "이거 진짜야?"이므로 첫 임무는 충격이 아니라
 * 신뢰다. 숫자와 순위는 반박 가능하지만("그 숫자 어떻게 잰 건데?") AI 답변
 * 원문은 반박할 수 없고 본인이 직접 그 서비스에 물어 확인할 수 있다.
 * 그래서 `evidence`가 맨 앞이다.
 */
export function buildAuditResult(args: BuildAuditResultArgs): AuditResult {
  const selfDetections = args.detections.filter((d) => d.subject === args.brandName)
  const byAnswer = new Map(selfDetections.map((d) => [d.answerId, d]))

  // 언급된 답변을 먼저. 같은 그룹 안에서는 입력 순서를 유지한다.
  // ★ `sort`는 제자리 정렬이므로 반드시 복사본에 건다.
  const sorted = [...args.answers].sort((a, b) => {
    const am = byAnswer.get(a.id)?.mentioned ? 0 : 1
    const bm = byAnswer.get(b.id)?.mentioned ? 0 : 1
    return am - bm
  })

  const evidence: EvidenceItem[] = sorted.slice(0, EVIDENCE_MAX).map((a) => {
    const d = byAnswer.get(a.id)
    return {
      query: a.queryText,
      engineId: a.engineId,
      text: truncate(a.text, EVIDENCE_TEXT_LIMIT),
      mentioned: d?.mentioned ?? false,
      context: d?.mentioned ? (d.context ?? null) : null,
      sentiment: d?.mentioned ? (d.sentiment ?? null) : null,
    }
  })

  // 순위 — 언급 수 내림차순. 동점이면 이름순으로 고정한다(실행마다 순서가
  // 바뀌면 같은 리포트를 두 번 볼 때 다르게 보인다).
  const mentionCount = (subject: string): number =>
    args.detections.filter((d) => d.subject === subject && d.mentioned).length

  const ranking: RankingItem[] = [
    { name: args.brandName, mentions: mentionCount(args.brandName), isSelf: true },
    ...args.competitors.map((name) => ({ name, mentions: mentionCount(name), isSelf: false })),
  ].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'ko'))

  return {
    version: AUDIT_RESULT_VERSION,
    brandName: args.brandName,
    category: args.category,
    competitors: [...args.competitors],
    engines: [...args.engines],
    measuredAt: args.measuredAt,
    totalAnswers: args.metrics.totalAnswers,
    citedRate: args.metrics.citedRate,
    shareOfVoice: args.metrics.shareOfVoice,
    ranking,
    evidence,
    byEngine: args.metrics.byEngine,
    // 2단계 metrics가 이미 언급률 오름차순으로 준다. 여기서 다시 정렬하지 않는다.
    byQuery: args.metrics.byQuery.map((q) => ({ queryText: q.queryText, interval: q.interval })),
    unresolved: args.unresolved,
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/audit/result.test.ts
```

Expected: PASS (11 passed)

- [ ] **Step 5: 변이 테스트 3건**

구현을 실제로 망가뜨려 테스트가 잡는지 확인한다. 표로 보고한다.

| 변이 | 기대 |
| --- | --- |
| `sorted`에서 언급 우선 정렬 제거 (`return 0`) | 실패 |
| `ranking`에서 경쟁사 제외 (`...[]`) | 실패 |
| `truncate`의 상한을 무시하고 원문 반환 | 실패 |

셋 중 살아남는 변이가 있으면 **테스트를 추가하고 다시 돌린다.**

- [ ] **Step 6: 커밋**

```bash
git add src/lib/audit/result.ts src/lib/audit/result.test.ts
git commit -m "feat(audit): 진단 리포트 구성 (증거 우선 · 경쟁사 순위 포함)

이메일 게이트가 사라져 결과를 쪼개지 않는다. 다만 evidence를 맨 앞에 두는
순서는 유지한다 — 기다린 사람의 첫 질문은 '이거 진짜야?'이고, 숫자는 반박
가능하지만 AI 답변 원문은 본인이 직접 확인할 수 있다.

경쟁사 순위가 실제로 들어간다. 신청 폼이 경쟁사를 최대 3개 받고, 경쟁사를
추가해도 API 호출은 늘지 않는다(같은 답변에서 탐지 대상만 늘어난다).

경쟁사 미등록 시 shareOfVoice를 n=0으로 그대로 전달한다. '우리만 등록했으니
점유율 100%'는 거짓말이고, 화면이 숨기려면 n을 볼 수 있어야 한다."
```

---

### Task 7: 운영자 CLI와 리포트 메일

**Files:**
- Create: `src/lib/audit/execute.ts`, `scripts/audit-list.mts`,
  `scripts/audit-run.mts`
- Modify: `src/lib/email/templates.ts`, `package.json`
- Test: `src/lib/audit/execute.test.ts`, `src/lib/email/audit-report.test.ts`

**Interfaces:**
- Consumes: `runCollection`·`buildFanout`·`buildPlanSnapshot` (Task 1·2),
  `runDetection` (Task 3), `generateAuditQueries`·리포지토리 (Task 4),
  `buildAuditResult` (Task 6), `claudeJudge` (2단계 Task 8)
- Produces:
  - `executeAudit(audit, deps): Promise<AuditResult>` — 순수 오케스트레이션
  - `auditReportEmail({ result, url }): EmailContent`
  - `pnpm audit:list` · `pnpm audit:run <id>` · `pnpm audit:reject <id>`

**이 태스크가 무료 진단의 실행 경로 전부다.** 자동 트리거가 없으므로
여기서 실패하면 아무 일도 일어나지 않는다 — 조용한 실패가 아니라 **명시적으로
`failed` 상태와 사유를 남겨야** 운영자가 재실행할 수 있다.

- [ ] **Step 1: 실행 오케스트레이션 실패 테스트**

`src/lib/audit/execute.test.ts` — 실제 API를 부르지 않는다. 엔진과 판정기를
주입해 **순서와 조립이 맞는지**만 본다.

```ts
import { describe, expect, it, vi } from 'vitest'
import { executeAudit } from '@/lib/audit/execute'
import type { CollectedAnswer } from '@/lib/collection/run'

const audit = {
  id: 'aud_1',
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
}

function fakeAnswer(queryText: string, text: string): CollectedAnswer {
  return {
    queryId: queryText,
    queryText,
    engineId: 'gemini',
    sampleIndex: 0,
    text,
    citations: [],
    raw: {},
    usage: { calls: 1, searches: 2, tokensIn: 10, tokensOut: 900 },
    costMilliKrw: 42_400,
  }
}

const deps = {
  runOne: vi.fn(async (item: { queryText: string }) =>
    fakeAnswer(item.queryText, `${item.queryText}에는 무신사가 좋습니다.`),
  ),
  judge: vi.fn(async (batch: { id: string }[]) =>
    batch.map((r) => ({
      id: r.id,
      verdict: { isBrandReference: true, position: 1, sentiment: 'recommended' as const, context: '첫 번째로 언급' },
    })),
  ),
  now: () => new Date('2026-07-30T02:00:00.000Z'),
}

describe('executeAudit', () => {
  it('무료 플랜 설정대로 3질의 × 1샘플을 수집한다', async () => {
    // ★ 이 수가 곧 원가다. 설정이 아니라 우연으로 늘어나면 예산이 조용히 샌다.
    await executeAudit(audit, deps)
    expect(deps.runOne).toHaveBeenCalledTimes(3)
  })

  it('질의에 브랜드명을 넣지 않는다', async () => {
    deps.runOne.mockClear()
    await executeAudit(audit, deps)
    for (const [item] of deps.runOne.mock.calls) {
      expect(item.queryText).not.toContain('무신사')
    }
  })

  it('경쟁사를 판정 대상에 넣는다', async () => {
    const result = await executeAudit(audit, deps)
    expect(result.competitors).toEqual(['29CM'])
    expect(result.ranking.some((r) => r.name === '29CM')).toBe(true)
  })

  it('측정 시각과 엔진 구성을 리포트에 박제한다', async () => {
    const result = await executeAudit(audit, deps)
    expect(result.measuredAt).toBe('2026-07-30T02:00:00.000Z')
    expect(result.engines.length).toBeGreaterThan(0)
  })

  it('엔진이 하나 실패해도 나머지로 리포트를 만든다', async () => {
    let n = 0
    const flaky = {
      ...deps,
      runOne: vi.fn(async (item: { queryText: string }) => {
        if (++n === 1) throw new Error('엔진 실패')
        return fakeAnswer(item.queryText, '무신사가 좋습니다.')
      }),
    }
    const result = await executeAudit(audit, flaky)
    expect(result.totalAnswers).toBeGreaterThan(0)
  })

  it('전부 실패하면 던진다 (빈 리포트를 보내지 않는다)', async () => {
    // ★ 답변 0건으로 만든 리포트는 "언급 0%"처럼 보인다. 측정 실패를 측정
    //   결과로 배송하면 안 된다.
    const dead = { ...deps, runOne: vi.fn(async () => { throw new Error('전부 실패') }) }
    await expect(executeAudit(audit, dead)).rejects.toThrow(/수집/)
  })

  it('2차 판정이 실패해도 리포트를 만들고 미판정 수를 남긴다', async () => {
    const noJudge = { ...deps, judge: vi.fn(async () => { throw new Error('판정 실패') }) }
    const result = await executeAudit(audit, noJudge)
    expect(result.unresolved).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/audit/execute.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 실행 오케스트레이션 구현**

`src/lib/audit/execute.ts`:

```ts
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import { runCollection, type CollectedAnswer, type RunCollectionDeps } from '@/lib/collection/run'
import { runDetection } from '@/lib/detection/pipeline'
import { DETECTOR_VERSION } from '@/lib/detection'
import type { JudgeFn } from '@/lib/judge/types'
import { PLANS } from '@/lib/plans'
import { buildAuditResult, type AuditResult } from '@/lib/audit/result'
import { generateAuditQueries } from '@/lib/audit/queries'

export interface AuditSubject {
  id: string
  brandName: string
  category: string
  competitors: string[]
}

export interface ExecuteAuditDeps {
  runOne?: RunCollectionDeps['runOne']
  onProgress?: RunCollectionDeps['onProgress']
  judge: JudgeFn
  /** 테스트가 시각을 고정한다 */
  now?: () => Date
}

/**
 * 무료 진단 1건을 처음부터 끝까지 실행한다.
 *
 * ★ DB에 쓰지 않는다. 저장은 호출자(CLI) 책임이고, 이 함수는 순수하게
 *   "신청 → 리포트"만 한다. 그래야 실제 API 없이 테스트할 수 있다.
 *
 * ★ `collection_runs`/`answers`에도 쓰지 않는다. 무료 플랜은 이력이 없고
 *   (`historyMonths: 0`), 저장하려면 가짜 브랜드 행을 만들어야 한다.
 */
export async function executeAudit(
  subject: AuditSubject,
  deps: ExecuteAuditDeps,
): Promise<AuditResult> {
  const now = deps.now ?? (() => new Date())

  // 1. 질의 생성 — 브랜드명은 넣지 않는다 (queries.ts 주석 참고)
  const texts = generateAuditQueries(subject.category, subject.brandName)
  const queries = texts.map((text, i) => ({ id: `q${i + 1}`, text }))

  // 2. 무료 플랜 설정 그대로 팬아웃. 수동이라고 늘리지 않는다.
  const snapshot = buildPlanSnapshot({
    plan: 'free',
    queryPacks: 0,
    queryIds: queries.map((q) => q.id),
    detectorVersion: DETECTOR_VERSION,
  })
  const items = buildFanout(snapshot, queries)

  // 3. 수집
  const collected = await runCollection(items, {
    ...(deps.runOne ? { runOne: deps.runOne } : {}),
    ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
  })

  if (collected.answers.length === 0) {
    // 답변 0건으로 만든 리포트는 "언급 0%"처럼 보인다.
    // 측정 실패를 측정 결과로 배송하면 안 된다.
    throw new Error(
      `수집이 전부 실패했습니다 (${collected.outcomes.length}회 시도). 재실행하세요.`,
    )
  }

  // 4. 판정·집계. 2차가 실패해도 리포트는 만든다 — 이미 돈을 쓴 데이터다.
  const detection = await runDetection(
    {
      answers: collected.answers,
      self: { canonical: subject.brandName, aliases: [], ambiguous: false },
      competitors: subject.competitors.map((name) => ({
        canonical: name,
        aliases: [],
        ambiguous: false,
      })),
    },
    deps.judge,
  )

  return buildAuditResult({
    brandName: subject.brandName,
    category: subject.category,
    competitors: subject.competitors,
    engines: [...PLANS.free.engines],
    measuredAt: now().toISOString(),
    metrics: detection.metrics,
    answers: collected.answers.map(toResultAnswer),
    detections: [...detection.detections.values()].flat().map((d) => ({
      answerId: d.answerId,
      subject: d.subject,
      mentioned: d.mentioned,
      position: d.position,
      context: d.context,
      sentiment: d.sentiment,
      unresolved: d.unresolved,
    })),
    unresolved: detection.unresolved,
  })
}

/** 답변 식별자는 질의·엔진·샘플의 조합이다 (무료 진단은 DB id가 없다). */
export function answerId(a: CollectedAnswer): string {
  return `${a.queryId}:${a.engineId}:${a.sampleIndex}`
}

function toResultAnswer(a: CollectedAnswer) {
  return { id: answerId(a), queryText: a.queryText, engineId: a.engineId, text: a.text }
}
```

> `runDetection`이 돌려주는 `DetectionResult`에 `answerId`가 없다면
> `detections` Map의 키가 곧 `answerId`이므로 `[...map.entries()].flatMap(([id, rows]) =>
> rows.map((r) => ({ ...r, answerId: id })))`로 만든다. Task 3에서 어느 쪽으로
> 정했는지 확인하고 맞춘다.

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/audit/execute.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 5: 리포트 메일 실패 테스트**

`src/lib/email/audit-report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { auditReportEmail } from '@/lib/email/templates'
import { wilsonInterval } from '@/lib/stats/wilson'

const result = {
  version: 1,
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
  engines: ['gemini'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  shareOfVoice: wilsonInterval(1, 3),
  ranking: [
    { name: '29CM', mentions: 2, isSelf: false },
    { name: '무신사', mentions: 1, isSelf: true },
  ],
  evidence: [
    { query: '러닝화 추천', engineId: 'gemini', text: '무신사가 좋습니다.', mentioned: true, context: '첫 번째로 언급', sentiment: 'recommended' as const },
  ],
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [{ queryText: '러닝화 추천', interval: wilsonInterval(0, 1) }],
  unresolved: 0,
}

const url = 'https://cited.co.kr/audit/aud_1'

describe('auditReportEmail', () => {
  it('제목에 브랜드명과 언급률을 담는다', () => {
    const mail = auditReportEmail({ result, url })
    expect(mail.subject).toContain('무신사')
    expect(mail.subject).toMatch(/\d+%/)
  })

  it('신뢰구간을 숫자와 함께 보여준다', () => {
    // ★ 33%만 쓰면 거짓말이다. 3회 측정 1건이면 구간이 [2%, 87%]다.
    //   이 넓이를 숨기면 첫 유료 리포트에서 숫자가 달라졌을 때 답할 수 없다.
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toContain('33%')
    expect(mail.html).toMatch(/\d+%\s*~\s*\d+%/)
  })

  it('측정 횟수가 적다는 사실과 유료의 차이를 말한다', () => {
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toMatch(/1회|3회 측정|주 3회/)
  })

  it('전체 리포트 링크를 담는다', () => {
    expect(auditReportEmail({ result, url }).html).toContain(url)
  })

  it('증거 원문을 담는다', () => {
    expect(auditReportEmail({ result, url }).html).toContain('무신사가 좋습니다.')
  })

  it('경쟁사가 없으면 Share of Voice를 아예 쓰지 않는다', () => {
    // n=0은 "측정 없음"이다. 0%로 보이면 안 된다.
    const noCompetitors = {
      ...result,
      competitors: [],
      shareOfVoice: wilsonInterval(0, 0),
      ranking: [{ name: '무신사', mentions: 1, isSelf: true }],
    }
    const mail = auditReportEmail({ result: noCompetitors, url })
    expect(mail.html).not.toContain('Share of Voice')
    expect(mail.html).not.toContain('점유율')
  })

  it('미판정이 있으면 표시한다', () => {
    const mail = auditReportEmail({ result: { ...result, unresolved: 2 }, url })
    expect(mail.html).toMatch(/미판정|판정하지 못/)
  })

  it('HTML을 이스케이프한다', () => {
    const mail = auditReportEmail({
      result: { ...result, brandName: '<img src=x onerror=alert(1)>' },
      url,
    })
    expect(mail.html).not.toContain('<img src=x')
  })
})
```

- [ ] **Step 6: 실패 확인 후 리포트 메일 구현**

```bash
pnpm vitest run src/lib/email/audit-report.test.ts
```

Expected: FAIL — `auditReportEmail`이 export되지 않음

`src/lib/email/templates.ts`에 추가한다:

```ts
import type { AuditResult } from '@/lib/audit/result'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

export function auditReportEmail(params: { result: AuditResult; url: string }): EmailContent {
  const { result, url } = params
  const brand = escapeHtml(result.brandName)
  const rate = formatPercent(result.citedRate.point)

  const evidence = result.evidence
    .map(
      (e) => `
      <div style="margin:0 0 16px;padding:14px;border:1px solid #e5e5e5;border-radius:8px">
        <div style="margin:0 0 6px;font-size:13px;color:#666">
          질문: ${escapeHtml(e.query)} · ${escapeHtml(e.engineId)}
          ${e.mentioned ? '<span style="color:#0a7">· 언급됨</span>' : '<span style="color:#999">· 언급 없음</span>'}
        </div>
        <div style="white-space:pre-wrap;line-height:1.6">${escapeHtml(e.text)}</div>
      </div>`,
    )
    .join('')

  const ranking = result.ranking
    .map(
      (r) => `<tr>
        <td style="padding:6px 12px 6px 0">${r.isSelf ? `<strong>${escapeHtml(r.name)}</strong>` : escapeHtml(r.name)}</td>
        <td style="padding:6px 0">${r.mentions}회 / ${result.totalAnswers}개 답변</td>
      </tr>`,
    )
    .join('')

  // ★ 경쟁사가 없으면 Share of Voice를 통째로 뺀다. n=0은 "측정 없음"이고,
  //   0%로 보이면 거짓 정보가 된다.
  const sov =
    result.shareOfVoice.n > 0
      ? `<p style="margin:0 0 24px">
           <strong>Share of Voice ${formatPercent(result.shareOfVoice.point)}</strong>
           — 등록한 경쟁사(${escapeHtml(result.competitors.join(', '))}) 대비 언급 점유율입니다.
         </p>`
      : ''

  const unresolved =
    result.unresolved > 0
      ? `<p style="margin:0 0 16px;color:#a60">${result.unresolved}건은 판정하지 못해 결과에서 제외했습니다.</p>`
      : ''

  return {
    subject: `[Cited] ${result.brandName} AI 언급률 ${rate} — 진단 리포트`,
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px">${brand} 진단 리포트</h1>
      <p style="margin:0 0 24px;color:#666;font-size:14px">
        ${escapeHtml(result.category)} 카테고리 · ${escapeHtml(result.engines.join(', '))} ·
        ${escapeHtml(result.measuredAt.slice(0, 10))} 측정
      </p>

      <div style="margin:0 0 24px;padding:20px;background:#fafafa;border-radius:10px">
        <div style="font-size:34px;font-weight:700;line-height:1.1">${rate}</div>
        <div style="margin-top:6px;color:#555">
          답변 ${result.totalAnswers}개 중 ${result.citedRate.k}개에서 언급 ·
          신뢰구간 ${formatInterval(result.citedRate)}
        </div>
      </div>

      <p style="margin:0 0 24px;padding:14px;border-left:3px solid #ddd;color:#555;font-size:14px">
        무료 진단은 <strong>질의 3개를 1회</strong> 측정합니다. 그래서 신뢰구간이
        ${formatInterval(result.citedRate)}로 넓습니다 — 이 범위 안 어디든 될 수 있다는 뜻입니다.
        유료 플랜은 <strong>주 3회</strong> 측정해 이 구간을 좁히고, 주간 변화를 판정합니다.
        1회 측정으로는 변화를 알 수 없습니다.
      </p>

      ${sov}
      ${unresolved}

      <h2 style="margin:0 0 12px;font-size:17px">브랜드별 언급 횟수</h2>
      <table style="border-collapse:collapse;margin:0 0 28px">${ranking}</table>

      <h2 style="margin:0 0 12px;font-size:17px">실제 AI 답변</h2>
      <p style="margin:0 0 14px;color:#666;font-size:14px">
        같은 질문을 직접 물어보시면 비슷한 답을 확인하실 수 있습니다.
      </p>
      ${evidence}

      <p style="margin:24px 0 0">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111;color:#fff;text-decoration:none">전체 리포트 보기</a>
      </p>
    `),
  }
}
```

- [ ] **Step 7: 통과 확인**

```bash
pnpm vitest run src/lib/email/audit-report.test.ts
```

Expected: PASS (8 passed)

- [ ] **Step 8: CLI 두 개 작성**

`scripts/audit-list.mts`:

```ts
/**
 * 실행 대기 중인 진단 신청 목록.
 *
 *   pnpm audit:list
 */
import { listPendingAudits, listRecentAudits } from '@/lib/audit/repository'
import { maskEmail } from '@/lib/email/send'

const pending = await listPendingAudits()
const recent = await listRecentAudits(10)

if (pending.length === 0) {
  console.log('대기 중인 진단이 없습니다.')
} else {
  console.log(`대기 ${pending.length}건 (오래된 순)\n`)
  for (const a of pending) {
    const waited = Math.round((Date.now() - a.createdAt.getTime()) / 3_600_000)
    const flag = a.status === 'failed' ? ' [실패·재실행 필요]' : ''
    console.log(`  ${a.id}`)
    console.log(
      `    ${a.brandName} · ${a.category} · 경쟁사 ${a.competitors.length}개 · ` +
        `${maskEmail(a.email)} · ${waited}시간 경과${flag}`,
    )
    if (a.failureReason) console.log(`    사유: ${a.failureReason}`)
    console.log(`    실행: pnpm audit:run ${a.id}`)
  }
}

console.log('\n최근 10건:')
for (const a of recent) {
  console.log(`  ${a.status.padEnd(9)} ${a.brandName.padEnd(16)} ${a.createdAt.toISOString().slice(0, 16)}`)
}

// ★ 24시간을 넘긴 대기 건은 약속 위반이다. 눈에 띄게 경고한다.
const overdue = pending.filter((a) => Date.now() - a.createdAt.getTime() > 24 * 3_600_000)
if (overdue.length > 0) {
  console.warn(`\n⚠ 24시간을 넘긴 신청이 ${overdue.length}건 있습니다. '영업일 1일 이내'를 약속했습니다.`)
}
```

`scripts/audit-run.mts`:

```ts
/**
 * 진단 1건을 실행하고 리포트를 메일로 보낸다.
 *
 *   pnpm audit:run aud_xxx          실행 후 발송
 *   pnpm audit:run aud_xxx --dry    실행만 하고 발송하지 않는다 (결과 확인용)
 *
 * ★ --dry를 먼저 써라. 초기에는 리포트를 눈으로 보고 나서 보내야 한다.
 *   자동 공개로 넘어가는 기준이 "손으로 고칠 게 없어진 시점"이다.
 */
import { executeAudit } from '@/lib/audit/execute'
import { getAudit, markFailed, markRunning, markSent } from '@/lib/audit/repository'
import { claudeJudge } from '@/lib/judge/claude'
import { sendEmail } from '@/lib/email/send'
import { auditReportEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

const [auditId, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry')

if (!auditId) {
  console.error('사용법: pnpm audit:run <auditId> [--dry]')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (!audit.emailVerified) {
  // ★ 인증 전에는 절대 실행하지 않는다. 이 게이트가 유일한 방어선이다.
  console.error(`이메일이 인증되지 않았습니다 (status=${audit.status}). 실행하지 않습니다.`)
  process.exit(1)
}
if (audit.status === 'sent' && !dry) {
  console.error(`이미 발송된 진단입니다 (${audit.sentAt?.toISOString()}). 다시 보내려면 --dry로 확인 후 수동 처리하세요.`)
  process.exit(1)
}

console.log(`실행: ${audit.brandName} (${audit.category})`)
console.log(`경쟁사: ${audit.competitors.join(', ') || '없음'}`)

if (!dry) await markRunning(audit.id)

const started = Date.now()
let result
try {
  result = await executeAudit(
    {
      id: audit.id,
      brandName: audit.brandName,
      category: audit.category,
      competitors: audit.competitors,
    },
    {
      judge: claudeJudge,
      onProgress: (done, total) => process.stdout.write(`\r  수집 ${done}/${total}`),
    },
  )
  process.stdout.write('\n')
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`\n실패: ${reason}`)
  if (!dry) await markFailed(audit.id, reason)
  process.exit(1)
}

console.log(`\n소요 ${Math.round((Date.now() - started) / 1000)}초`)
console.log(`언급률 ${formatPercent(result.citedRate.point)} (${formatInterval(result.citedRate)})`)
console.log(`답변 ${result.totalAnswers}개 · 미판정 ${result.unresolved}건`)
console.log('\n순위:')
for (const r of result.ranking) {
  console.log(`  ${r.isSelf ? '▶' : ' '} ${r.name.padEnd(16)} ${r.mentions}회`)
}
console.log('\n증거:')
for (const e of result.evidence) {
  console.log(`  [${e.mentioned ? '언급' : '미언급'}] ${e.query}`)
  console.log(`    ${e.text.slice(0, 120)}…`)
}

if (dry) {
  console.log('\n--dry 모드입니다. 저장·발송하지 않았습니다.')
  process.exit(0)
}

const url = `${env.NEXT_PUBLIC_APP_URL}/audit/${audit.id}`
await markSent(audit.id, result)

const sent = await sendEmail({ to: audit.email, content: auditReportEmail({ result, url }) })
if (!sent.ok) {
  // 결과는 이미 저장됐다. 메일만 실패했으므로 링크를 직접 전달할 수 있다.
  console.error(`\n리포트는 저장했지만 메일 발송에 실패했습니다: ${sent.reason}`)
  console.error(`수동 전달용 링크: ${url}`)
  process.exit(1)
}

console.log(`\n발송 완료 → ${url}`)
```

`package.json`의 `scripts`에 추가한다:

```json
    "audit:list": "tsx --env-file=.env.local scripts/audit-list.mts",
    "audit:run": "tsx --env-file=.env.local scripts/audit-run.mts"
```

- [ ] **Step 9: 실제 1건 실행 (dry)**

DB에 인증된 신청이 있어야 한다. Task 5의 통합 테스트가 만든 건을 쓰거나,
로컬 개발 서버에서 직접 신청하고 인증 링크를 눌러 만든다.

```bash
pnpm audit:list
pnpm audit:run <id> --dry
```

Expected: 3회 수집, 언급률과 증거가 출력되고 **저장·발송하지 않는다.**

**이때 반드시 눈으로 확인할 것:**

- 질의 3개에 브랜드명이 들어가지 않았는가
- 증거 원문이 실제 한국어 답변인가 (영어로 답했다면 systemInstruction 문제)
- 언급 판정이 눈으로 봐도 맞는가 — **틀렸다면 2단계 판정 로직을 고쳐야 한다.
  이것이 수동 배송을 택한 이유다**
- 소요 시간을 기록한다. 자동화 시점을 결정할 숫자다

- [ ] **Step 10: 커밋**

```bash
git add src/lib/audit/execute.ts src/lib/audit/execute.test.ts src/lib/email scripts package.json
git commit -m "feat(audit): 운영자 CLI와 리포트 메일

무료 진단은 자동 트리거가 없다. audit:list로 대기 목록을 보고 audit:run으로
실행한다. --dry는 저장·발송 없이 결과만 보여준다 — 초기에는 반드시 이걸로
눈으로 확인하고 보낸다. 자동 공개로 넘어가는 기준은 '손으로 고칠 게 없어진
시점'이다.

executeAudit은 DB에 쓰지 않는다. 저장은 CLI 책임이고 이 함수는 신청→리포트만
한다. 그래야 실제 API 없이 테스트할 수 있다.

수집이 전부 실패하면 던진다. 답변 0건으로 만든 리포트는 '언급 0%'처럼 보이고,
측정 실패를 측정 결과로 배송하면 안 된다. 2차 판정 실패는 던지지 않고
unresolved로 세어 리포트에 표시한다 — 이미 돈을 쓴 수집 데이터다.

리포트 메일은 신뢰구간을 숫자와 함께 보여준다. 33%만 쓰면 거짓말이고,
3회 측정 1건의 구간은 [2%, 87%]다. 이 넓이가 곧 유료 전환의 근거다."
```

---

### Task 8: 랜딩 · 신청 폼 · 리포트 화면

**Files:**
- Create: `src/app/(marketing)/page.tsx`, `src/app/(marketing)/pricing/page.tsx`,
  `src/components/audit/request-form.tsx`,
  `src/components/audit/result-view.tsx`,
  `src/app/audit/requested/page.tsx`, `src/app/audit/[id]/page.tsx`
- Test: `src/components/audit/result-view.test.tsx`

**Interfaces:**
- Consumes: `POST /api/audit/request` (Task 5), `AuditResult` (Task 6),
  `KNOWN_CATEGORIES`·`MAX_COMPETITORS` (Task 4·5), `PLANS` (1단계)
- Produces: 전환 퍼널 전체. 4단계 온보딩이 `free_audits.result`를 재사용한다.

> **UI 작업 지침:** 이 태스크 착수 전에 `frontend-design` 스킬을 호출한다.
> 랜딩과 리포트는 **이 제품에서 전환이 일어나는 두 화면**이다. 템플릿처럼
> 보이면 "이거 진짜야?"라는 첫 질문에 답하지 못한다.

**최초 계획에서 사라진 것:** 진행률 화면(`progress.tsx`)과 Realtime 구독.
진단이 즉시 실행되지 않으므로 보여줄 진행률이 없다. `@trigger.dev/react-hooks`도
설치하지 않는다.

**대신 반드시 있어야 하는 것:** 신청 → 인증 → 대기 사이에서 사용자가 **지금
무슨 상태인지** 알 수 있어야 한다. 즉시 결과를 포기했으므로 이 안내가 부실하면
그대로 이탈한다.

- [ ] **Step 1: 신청 폼**

`src/components/audit/request-form.tsx` — 클라이언트 컴포넌트.

핵심 요구사항 (구현 시 반드시 지킬 것):

1. 필드는 **브랜드명 · 카테고리 · 경쟁사(선택, 최대 3) · 이메일** 넷.
   카테고리는 `KNOWN_CATEGORIES`를 datalist로 제안하되 자유 입력을 막지 않는다.
2. **경쟁사 입력란을 눈에 띄게 둔다.** 경쟁사를 넣으면 Share of Voice가 나오고
   그것이 가장 강한 후킹인데, 넣지 않으면 `n=0`이라 아예 표시되지 않는다.
   "경쟁사를 넣으면 점유율 비교를 함께 보내드립니다"라고 명시한다.
3. **네트워크 예외를 반드시 잡는다.** 1단계 인증 폼에서 겪은 것과 같은 문제다 —
   오프라인·DNS 실패에서 `fetch`는 `{ error }`를 돌려주지 않고 **던진다**:

```tsx
    let res: Response
    try {
      res = await fetch('/api/audit/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
    } catch {
      setError('요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
      setPending(false)
      return
    }

    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : '신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setError(message)
      setPending(false)
      return
    }
    router.push('/audit/requested?state=sent')
```

4. **제출 버튼 문구가 기대를 설정한다.** "무료로 진단받기"가 아니라
   **"무료 진단 신청하기"**다. 즉시 결과가 아니라는 것을 버튼에서부터 알린다.
5. 버튼 아래에 작게: **"확인 메일을 보내드립니다. 확인 후 영업일 1일 이내에
   리포트를 메일로 보내드립니다."**

- [ ] **Step 2: 안내 화면**

`src/app/audit/requested/page.tsx` — `?state=` 쿼리로 네 가지를 보여준다.
서버 컴포넌트로 충분하다.

| state | 화면 |
| --- | --- |
| `sent` | "메일함을 확인해 주세요" + 스팸함 안내 + 재신청 링크 |
| `verified` | "확인됐습니다. 영업일 1일 이내에 리포트를 보내드립니다" |
| `already` | "이미 확인된 신청입니다. 리포트를 준비 중입니다" |
| `invalid` | "링크가 만료되었거나 올바르지 않습니다" + 다시 신청 링크 |

`already`를 **오류로 보여주지 않는 것이 중요하다.** 메일 링크를 두 번 누르는
것은 흔하고, 그게 오류처럼 보이면 사용자는 무언가 잘못됐다고 믿는다.

- [ ] **Step 3: 리포트 화면 실패 테스트**

`src/components/audit/result-view.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResultView } from '@/components/audit/result-view'
import { wilsonInterval } from '@/lib/stats/wilson'

const base = {
  version: 1,
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
  engines: ['gemini'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  shareOfVoice: wilsonInterval(1, 3),
  ranking: [
    { name: '29CM', mentions: 2, isSelf: false },
    { name: '무신사', mentions: 1, isSelf: true },
  ],
  evidence: [
    { query: '러닝화 추천', engineId: 'gemini', text: '무신사가 좋습니다.', mentioned: true, context: '첫 번째로 언급', sentiment: 'recommended' as const },
  ],
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [{ queryText: '러닝화 추천', interval: wilsonInterval(0, 1) }],
  unresolved: 0,
}

describe('ResultView', () => {
  it('언급률과 신뢰구간을 함께 보여준다', () => {
    render(<ResultView result={base} />)
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText(/2%\s*~\s*87%/)).toBeInTheDocument()
  })

  it('측정 조건(엔진·경쟁사·시각)을 보여준다', () => {
    render(<ResultView result={base} />)
    expect(screen.getByText(/gemini/)).toBeInTheDocument()
    expect(screen.getByText(/29CM/)).toBeInTheDocument()
  })

  it('경쟁사가 없으면 Share of Voice 영역을 아예 그리지 않는다', () => {
    render(<ResultView result={{ ...base, competitors: [], shareOfVoice: wilsonInterval(0, 0) }} />)
    expect(screen.queryByText(/점유율|Share of Voice/)).not.toBeInTheDocument()
  })

  it('미판정이 있으면 표시한다', () => {
    render(<ResultView result={{ ...base, unresolved: 2 }} />)
    expect(screen.getByText(/판정하지 못/)).toBeInTheDocument()
  })

  it('언급이 0건이어도 증거를 보여준다', () => {
    render(
      <ResultView
        result={{
          ...base,
          citedRate: wilsonInterval(0, 3),
          evidence: [{ ...base.evidence[0]!, mentioned: false, context: null, sentiment: null }],
        }}
      />,
    )
    expect(screen.getByText(/무신사가 좋습니다/)).toBeInTheDocument()
  })
})
```

`@testing-library/react`·`@testing-library/jest-dom`·`jsdom`이 없으면 설치한다:

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

`vitest.config.ts`에 `.tsx` 테스트만 jsdom을 쓰도록 `environmentMatchGlobs`
(또는 파일 상단 `// @vitest-environment jsdom`)를 추가한다. 다른 테스트는
`node` 환경을 유지한다 — 전부 jsdom으로 바꾸면 DB 테스트가 느려진다.

- [ ] **Step 4: 리포트 화면 구현**

`src/components/audit/result-view.tsx` — **서버 컴포넌트로 만든다.**
상태가 없고, 메일 템플릿과 같은 데이터를 그린다.

지켜야 할 것:

1. **큰 숫자 옆에 반드시 구간을 함께 둔다.** `33%` 단독 노출 금지.
2. **`shareOfVoice.n === 0`이면 그 블록을 렌더링하지 않는다.** `0%`도,
   `측정 없음`도 아니라 **아예 없다.** 없는 것을 설명하려 들면 혼란만 준다.
3. **경쟁사 목록을 Share of Voice 옆에 항상 함께 표시한다.**
   2단계 `metrics.ts` 주석 그대로 — 분모를 모르면 이 숫자는 오해를 만든다.
4. `byQuery`는 **언급률이 낮은 순** 그대로 그린다. "이 질문에서 안 나온다"가
   위로 와야 행동으로 이어진다.
5. 하단에 유료 전환 블록: **"이 리포트는 1회 측정입니다"** → 구간 넓이 →
   "주 3회 측정하면 구간이 좁아지고 주간 변화를 판정할 수 있습니다" → 요금제 링크.

`src/app/audit/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getAudit } from '@/lib/audit/repository'
import { ResultView } from '@/components/audit/result-view'
import type { AuditResult } from '@/lib/audit/result'

export const dynamic = 'force-dynamic'

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const audit = await getAudit(id)

  // ★ 발송 전 리포트를 노출하지 않는다. 링크를 미리 알아내도 볼 것이 없어야 한다.
  if (!audit || audit.status !== 'sent' || !audit.result) notFound()

  return <ResultView result={audit.result as AuditResult} />
}
```

> **이 페이지는 인증하지 않는다.** `aud_` + 16바이트 난수 ID가 곧 비공개
> 링크다(Task 4). 로그인 벽을 세우면 리포트를 받은 사람이 못 본다.
> 대신 **`noindex`를 반드시 건다** — 검색엔진에 남으면 비공개가 아니다:
>
> ```tsx
> export const metadata = { robots: { index: false, follow: false } }
> ```

- [ ] **Step 5: 랜딩과 요금제**

`src/app/(marketing)/page.tsx` — 최초 계획의 카피를 그대로 쓰되 **CTA만
바꾼다.** 폼 자리에 `<RequestForm />`을 둔다.

랜딩에서 **반드시 정직하게 쓸 것:** 히어로 아래에 "AI에게 직접 물어보고
기록합니다. 무료 진단은 질의 3개를 1회 측정해 **영업일 1일 이내** 메일로
보내드립니다." — 즉시 결과를 기대하게 만들면 안 된다.

`src/app/(marketing)/pricing/page.tsx` — `PLANS`에서 값을 읽어 그린다.
숫자를 하드코딩하지 않는다. 무료/Starter/Business 열에 **질의 수 · 측정 횟수 ·
엔진 · 이력**을 나란히 놓아 무료의 한계가 눈에 보이게 한다.

- [ ] **Step 6: 통과 확인과 커밋**

```bash
pnpm vitest run src/components/audit/result-view.test.tsx
pnpm typecheck && pnpm lint && pnpm build
git add src/app src/components vitest.config.ts package.json
git commit -m "feat(marketing): 랜딩 · 진단 신청 폼 · 리포트 화면

진행률 화면과 Realtime 구독을 만들지 않는다. 즉시 실행이 아니므로 보여줄
진행률이 없다. 대신 신청→인증→대기 각 단계에서 지금 무슨 상태인지 알려주는
안내 화면을 둔다 — 즉시 결과를 포기했으므로 이 안내가 부실하면 그대로 이탈한다.

인증 링크를 두 번 눌러도 오류 화면을 보여주지 않는다(state=already).

리포트 페이지는 인증하지 않는다. 난수 ID가 곧 비공개 링크다. 대신 noindex를
걸어 검색엔진에 남지 않게 한다.

shareOfVoice.n이 0이면 그 블록을 아예 그리지 않는다. 0%도 '측정 없음'도 아니라
없는 것이다."
```

---

### Task 9: E2E · 개인정보처리방침 갱신 · 1차 배포

**Files:**
- Create: `tests/e2e/free-audit.spec.ts`,
  `docs/superpowers/notes/YYYY-MM-DD-first-deploy.md`
- Modify: `src/app/legal/privacy/page.tsx`

**Interfaces:**
- Consumes: 앞의 모든 태스크

- [ ] **Step 1: 개인정보처리방침 갱신 — 법정 고지사항이다**

Task 2에서 만든 수집 코어가 **이용자의 브랜드명·질의문을 Google·Anthropic에
처음으로 실제 전송하는 코드**다. 그 순간 이들은 새 수탁자가 된다.

`src/app/legal/privacy/page.tsx`의 두 표를 갱신한다:

- **§7 개인정보 처리 위탁** — Google LLC(Gemini API, AI 답변 생성),
  Anthropic PBC(Claude API, 언급 판정)를 추가한다. 위탁 업무 내용에
  **"이용자가 입력한 브랜드명·카테고리는 전송되지 않으며, 시스템이 생성한
  일반 소비자 질의문만 전송된다"**를 명시한다 (Task 4 `queries.ts`가 실제로
  그렇게 동작한다 — 사실과 다르게 쓰면 안 된다).
- **§8 국외 이전** — 개인정보보호법 제28조의8 제2항의 법정 고지사항이다.
  이전받는 자 · 국가 · 시점 · 방법 · 항목 · 보유기간을 채운다.
  국가는 **실제로 데이터가 있는 곳**을 쓴다(미국). §8 말미의 "측정 기능이
  도입되면… 이 항을 갱신"이라는 기존 문장이 가리키는 시점이 바로 지금이다.

> **판정용 답변 원문에 개인정보가 섞일 수 있다.** AI 답변은 우리가 만든 것이
> 아니고 무엇이 들어 있을지 모른다. 그것을 Anthropic에 판정용으로 보낸다.
> 이 사실을 §7에 적는다.

`pnpm test`에 방침 페이지 관련 테스트가 있으면 함께 갱신한다.

- [ ] **Step 2: E2E 테스트**

`tests/e2e/free-audit.spec.ts` — **실제 API를 부르지 않는다.** 진단 실행은
수동이므로 E2E가 검증할 것은 **신청 → 인증 안내까지**다.

```ts
import { expect, test } from '@playwright/test'

test('랜딩에서 진단을 신청하면 확인 안내로 이동한다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // 즉시 결과를 약속하지 않는다
  await expect(page.getByText(/영업일 1일|메일로 보내/)).toBeVisible()

  await page.getByLabel('브랜드명').fill('E2E테스트브랜드')
  await page.getByLabel('카테고리').fill('패션')
  await page.getByLabel('이메일').fill(`e2e-${Date.now()}@cited-smoke.invalid`)
  await page.getByRole('button', { name: /신청/ }).click()

  await expect(page).toHaveURL(/\/audit\/requested/)
  await expect(page.getByText(/메일함/)).toBeVisible()
})

test('잘못된 이메일은 제출되지 않는다', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('브랜드명').fill('E2E테스트브랜드')
  await page.getByLabel('카테고리').fill('패션')
  await page.getByLabel('이메일').fill('not-an-email')
  await page.getByRole('button', { name: /신청/ }).click()
  await expect(page).not.toHaveURL(/\/audit\/requested/)
})

test('만료·위조 인증 링크는 안내 화면으로 보낸다', async ({ page }) => {
  await page.goto('/api/audit/verify?token=forged.signature')
  await expect(page).toHaveURL(/state=invalid/)
  await expect(page.getByText(/만료|올바르지/)).toBeVisible()
})

test('발송되지 않은 리포트 링크는 404다', async ({ page }) => {
  const res = await page.goto('/audit/aud_does_not_exist')
  expect(res?.status()).toBe(404)
})

test('요금제 화면이 무료의 한계를 보여준다', async ({ page }) => {
  await page.goto('/pricing')
  await expect(page.getByText(/99,000/)).toBeVisible()
  await expect(page.getByText(/290,000/)).toBeVisible()
})
```

```bash
pnpm test:e2e
```

Expected: 5 passed

- [ ] **Step 3: Vercel 환경변수 추가**

프로덕션·프리뷰·개발 세 환경에 `OPERATOR_EMAIL`을 넣는다.
넣지 않으면 `env.ts`의 `superRefine`이 **빌드를 실패시킨다** (의도된 것이다 —
알림이 안 가면 신청이 방치된다).

```bash
vercel env add OPERATOR_EMAIL production
vercel env add OPERATOR_EMAIL preview
vercel env add OPERATOR_EMAIL development
```

- [ ] **Step 4: 배포와 실사용 확인**

```bash
git push
```

배포 후 **실제 프로덕션에서 본인 이메일로 1건 신청해 끝까지 돌려본다.**

```bash
# 1. https://cited.co.kr 에서 신청
# 2. 확인 메일 수신 → 링크 클릭 → state=verified 화면
# 3. 운영자 알림 메일 수신 확인
pnpm audit:list                 # 대기 1건이 보여야 한다
pnpm audit:run <id> --dry       # 결과를 눈으로 확인
pnpm audit:run <id>             # 발송
# 4. 리포트 메일 수신 → 링크 → /audit/<id> 화면
```

**확인할 것:**

- 확인 메일이 스팸함으로 가지 않는가 (1단계에서 SPF·DKIM·DMARC를 세웠다)
- 질의 3개에 브랜드명이 없는가
- 언급 판정이 눈으로 봐도 맞는가
- 리포트 화면의 신뢰구간이 메일과 같은가
- `/audit/<id>`가 `noindex`인가 (`curl -sI` 또는 페이지 소스)

- [ ] **Step 5: 배포 기록**

`docs/superpowers/notes/YYYY-MM-DD-first-deploy.md`에 남긴다:

- 배포 내용과 커밋 해시
- **진단 1건 실행에 걸린 시간** (운영자 시간 — 자동화 시점을 결정할 숫자다)
- 실제 원가 (CLI가 출력한 값 × 1건)
- 확인한 항목 체크리스트
- 다음에 볼 지표: 신청 수, 인증률, 리포트 발송까지 걸린 시간, 가입 전환

- [ ] **Step 6: 커밋**

```bash
git add tests/e2e src/app/legal docs/superpowers/notes
git commit -m "test(e2e): 진단 신청 플로우 · 방침 갱신 · 1차 배포 기록"
```

---

## 3단계 완료 조건 (= 1차 배포 게이트)

- [ ] `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build` 전부 통과
- [ ] `pnpm test:e2e` 5건 통과
- [ ] **수집·판정 코어가 `@trigger.dev/*`를 import하지 않는다** (4단계가 감쌀 수 있어야 한다)
- [ ] `pnpm audit:run <id> --dry`로 **실제 API에 1건 이상 돌려 결과를 눈으로 확인**했다
- [ ] 프로덕션에서 신청→인증→발송→열람을 **본인 계정으로 끝까지** 돌렸다
- [ ] 확인 메일과 리포트 메일이 스팸함으로 가지 않는다
- [ ] 개인정보처리방침 §7·§8에 Google LLC·Anthropic PBC가 반영됐다
- [ ] `OPERATOR_EMAIL`이 세 환경 모두에 있다
- [ ] `/audit/<id>`에 `noindex`가 걸려 있고, 발송 전 리포트는 404다
- [ ] 진단 1건 실행에 걸린 **운영자 시간**을 기록했다

## 다음 단계

**4단계(결제 + 온보딩)**로 간다. 이 단계에서 3단계가 넘긴 것을 이어받는다:

- **Trigger.dev 초기화와 무료 크레딧 소진 실측** (최초 3단계 Task 1)
- **`collect-brand`/`judge-run` 잡** — Task 2·3에서 만든 `runCollection`·
  `runDetection`을 **감싸기만** 한다. 로직을 잡 안으로 되돌리지 마라
- **`selectBrandsForToday`(요일 분산 선별)와 일일 스케줄러** — 3단계에서 뺐다
- 토스 빌링키·구독 생애주기·온보딩 마법사

**무료 진단 자동화는 4단계에도 넣지 않는다.** 판단 기준은 시간이 아니라
**"리포트를 N건 보내는 동안 손으로 고친 것이 없어진 시점"**이다. 그때
`executeAudit`을 잡으로 감싸고, 그 시점에 비로소 남용 방지(Turnstile·IP 상한·
예산 킬스위치)가 필요해진다.
