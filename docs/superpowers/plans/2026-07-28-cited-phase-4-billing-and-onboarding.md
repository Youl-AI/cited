# Cited 4단계 — 결제와 온보딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 토스페이먼츠 빌링키 정기결제, 구독 생애주기, 온보딩 마법사를 만들고
**2차 배포**한다. 이 단계가 끝나면 고객이 새벽에 결제해도 그 순간 첫 수집이
돌고 5~15분 뒤 완성된 대시보드를 본다.

**Architecture:** 카드 정보는 우리 서버를 거치지 않는다 — 토스 SDK가 브라우저에서
`authKey`를 받고, 우리는 그것으로 빌링키만 발급받아 저장한다. 청구는 매일 도는
Trigger.dev 잡이 `currentPeriodEnd`가 지난 구독을 찾아 실행한다. `orderId`가
멱등키라 같은 기간을 두 번 청구하지 않는다.

**Tech Stack:** 토스페이먼츠 결제위젯 SDK · REST 빌링 API · Trigger.dev · Drizzle

## Global Constraints

로드맵 공통 제약 + 이 단계 전용:

- **카드번호·유효기간·CVC를 우리 서버에 절대 보내지 않는다.** 빌링키만 저장
- **금액은 원(KRW) 정수.** 부동소수점 금액 연산 금지
- **모든 청구는 `orderId` 멱등키를 가진다.** 재시도가 이중 청구가 되면 안 된다
- **결제 실패는 즉시 중단이 아니다.** 유예 기간을 거친다. 과거 데이터는 유지
- **한도 검증은 서버에서 한다.** 클라이언트 검증은 UX일 뿐
- **SerpApi는 이 단계 배포 전에 가입한다.** 고객이 0명이어도
- 각 태스크의 마지막 Step은 커밋

## 착수 전 확인 (블로킹)

이 단계를 시작하기 전에 아래를 **실제로** 끝낸다. 코드로 해결할 수 없다.

- [ ] 사업자 등록 완료 → `src/lib/business-info.ts` 값 채우기 (파일 상단 `TODO(phase-4)`
      마커 참고)
- [ ] `src/lib/business-info.test.ts`의 `describe.skip('BUSINESS_INFO', ...)`을
      `describe('BUSINESS_INFO', ...)`로 되돌리고 `pnpm test src/lib/business-info.test.ts`
      통과 확인 (같은 파일에 `TODO(phase-4)` 마커 있음)
- [ ] 통신판매업 신고 완료
- [ ] 토스페이먼츠 계약 → **수수료율 확인** (설계 문서가 3%로 가정한 항목)
- [ ] SerpApi Starter 가입 + **Automatic Early Renewal 켜기**

확인 결과를 `docs/superpowers/notes/2026-07-28-preflight.md`에 갱신한다.

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/lib/billing/toss.ts` | 토스 REST 클라이언트 (빌링키 발급·승인) |
| `src/lib/billing/order.ts` | orderId 생성·파싱 (멱등키) |
| `src/lib/billing/period.ts` | 결제 주기 계산 (순수) |
| `src/lib/billing/repository.ts` | 구독·결제 DB 접근 |
| `src/lib/billing/lifecycle.ts` | 상태 전이 판정 (순수) |
| `src/lib/quota.ts` | 플랜 한도 검증 (순수) |
| `src/trigger/billing-cycle.ts` | 매일 도는 청구 잡 |
| `src/app/api/billing/register/route.ts` | 빌링키 등록 |
| `src/app/api/billing/change-plan/route.ts` | 플랜·질의팩 변경 |
| `src/app/api/billing/cancel/route.ts` | 해지 |
| `src/app/(app)/onboarding/**` | 온보딩 마법사 (결제 완료 고객은 결제 단계 생략) |
| `src/app/api/brands/collect/route.ts` | 브랜드 추가 시 즉시 수집 트리거 |
| `src/lib/onboarding/generate.ts` | 별칭·질의·경쟁사 자동 생성 |
| `src/app/(app)/billing/page.tsx` | 결제 관리 |
| `tests/e2e/checkout.spec.ts` | 결제 E2E |

---

### Task 1: 결제 주기와 상태 전이 (순수 함수)

**Files:**
- Create: `src/lib/billing/period.ts`, `src/lib/billing/order.ts`,
  `src/lib/billing/lifecycle.ts`
- Test: 각각의 `.test.ts`

**Interfaces:**
- Consumes: `PlanId`, `monthlyPriceKrw` (1단계)
- Produces:
  - `nextPeriodEnd(from: Date): Date` — 한 달 뒤, 말일 보정
  - `buildOrderId(subscriptionId, periodStart): string` — 멱등키
  - `parseOrderId(orderId): { subscriptionId; period } | null`
  - `decideStatus(current, event): SubscriptionStatus` — 상태 전이
  - `dueForBilling(sub, now): boolean`
  - `GRACE_PERIOD_DAYS = 7`

결제 로직을 API 핸들러 안에 두면 테스트가 불가능하다. 판정은 전부 순수 함수로 뺀다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/billing/period.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextPeriodEnd, periodKey, proratedRefundKrw } from '@/lib/billing/period'

describe('nextPeriodEnd', () => {
  it('한 달 뒤를 돌려준다', () => {
    const end = nextPeriodEnd(new Date('2026-03-15T00:00:00Z'))
    expect(end.toISOString().slice(0, 10)).toBe('2026-04-15')
  })

  it('31일 가입자는 30일 달에서 말일로 보정된다', () => {
    const end = nextPeriodEnd(new Date('2026-03-31T00:00:00Z'))
    expect(end.toISOString().slice(0, 10)).toBe('2026-04-30')
  })

  it('1월 31일 → 2월 28일 (평년)', () => {
    const end = nextPeriodEnd(new Date('2026-01-31T00:00:00Z'))
    expect(end.toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('12월 → 다음 해 1월로 넘어간다', () => {
    const end = nextPeriodEnd(new Date('2026-12-15T00:00:00Z'))
    expect(end.toISOString().slice(0, 10)).toBe('2027-01-15')
  })

  it('시각(시분초)은 유지된다', () => {
    const end = nextPeriodEnd(new Date('2026-03-15T04:30:00Z'))
    expect(end.toISOString()).toContain('T04:30:00')
  })
})

describe('periodKey', () => {
  it('YYYY-MM-DD 형식이다', () => {
    expect(periodKey(new Date('2026-03-15T04:30:00Z'))).toBe('2026-03-15')
  })
})

describe('proratedRefundKrw', () => {
  it('전액 사용 전이면 전액 환불', () => {
    const start = new Date('2026-03-01T00:00:00Z')
    const end = new Date('2026-03-31T00:00:00Z')
    expect(proratedRefundKrw(99_000, start, end, start)).toBe(99_000)
  })

  it('절반 사용했으면 절반 환불 (원 단위 내림)', () => {
    const start = new Date('2026-03-01T00:00:00Z')
    const end = new Date('2026-03-31T00:00:00Z')
    const mid = new Date('2026-03-16T00:00:00Z')
    expect(proratedRefundKrw(99_000, start, end, mid)).toBe(49_500)
  })

  it('기간이 끝났으면 0원', () => {
    const start = new Date('2026-03-01T00:00:00Z')
    const end = new Date('2026-03-31T00:00:00Z')
    expect(proratedRefundKrw(99_000, start, end, end)).toBe(0)
  })

  it('정수를 돌려준다', () => {
    const start = new Date('2026-03-01T00:00:00Z')
    const end = new Date('2026-03-31T00:00:00Z')
    const odd = new Date('2026-03-08T13:00:00Z')
    expect(Number.isInteger(proratedRefundKrw(99_000, start, end, odd))).toBe(true)
  })
})
```

`src/lib/billing/order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildOrderId, parseOrderId } from '@/lib/billing/order'

describe('buildOrderId — 멱등키', () => {
  it('같은 구독·같은 기간이면 같은 orderId', () => {
    const d = new Date('2026-03-15T00:00:00Z')
    expect(buildOrderId('sub_1', d)).toBe(buildOrderId('sub_1', d))
  })

  it('기간이 다르면 다른 orderId', () => {
    expect(buildOrderId('sub_1', new Date('2026-03-15T00:00:00Z'))).not.toBe(
      buildOrderId('sub_1', new Date('2026-04-15T00:00:00Z')),
    )
  })

  it('구독이 다르면 다른 orderId', () => {
    const d = new Date('2026-03-15T00:00:00Z')
    expect(buildOrderId('sub_1', d)).not.toBe(buildOrderId('sub_2', d))
  })

  it('토스 orderId 제약(6~64자, 영숫자/-/_)을 만족한다', () => {
    const id = buildOrderId('550e8400-e29b-41d4-a716-446655440000', new Date())
    expect(id.length).toBeGreaterThanOrEqual(6)
    expect(id.length).toBeLessThanOrEqual(64)
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('parseOrderId', () => {
  it('구독 ID와 기간을 되돌린다', () => {
    const parsed = parseOrderId(buildOrderId('sub_1', new Date('2026-03-15T00:00:00Z')))
    expect(parsed?.subscriptionId).toBe('sub_1')
    expect(parsed?.period).toBe('2026-03-15')
  })

  it('형식이 아니면 null', () => {
    expect(parseOrderId('garbage')).toBeNull()
  })
})
```

`src/lib/billing/lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GRACE_PERIOD_DAYS, decideStatus, dueForBilling } from '@/lib/billing/lifecycle'

const now = new Date('2026-03-20T00:00:00Z')

describe('decideStatus — 결제 실패 대응 (설계 ⑤)', () => {
  it('결제 성공 → active', () => {
    expect(decideStatus('past_due', { type: 'payment_succeeded' }, now).status).toBe('active')
  })

  it('첫 결제 실패 → past_due (즉시 중단하지 않는다)', () => {
    const r = decideStatus('active', { type: 'payment_failed' }, now)
    expect(r.status).toBe('past_due')
    expect(r.graceUntil).toBeInstanceOf(Date)
  })

  it('유예 기간은 7일이다', () => {
    const r = decideStatus('active', { type: 'payment_failed' }, now)
    const days = (r.graceUntil!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    expect(Math.round(days)).toBe(GRACE_PERIOD_DAYS)
  })

  it('past_due에서 다시 실패해도 유예 기한은 연장되지 않는다', () => {
    const first = decideStatus('active', { type: 'payment_failed' }, now)
    const later = new Date('2026-03-23T00:00:00Z')
    const second = decideStatus('past_due', { type: 'payment_failed' }, later, first.graceUntil)
    expect(second.graceUntil?.getTime()).toBe(first.graceUntil?.getTime())
  })

  it('유예 만료 후 실패 → suspended (수집 중단, 데이터는 유지)', () => {
    const expired = new Date('2026-03-10T00:00:00Z')
    const r = decideStatus('past_due', { type: 'payment_failed' }, now, expired)
    expect(r.status).toBe('suspended')
  })

  it('해지 요청 → canceled', () => {
    expect(decideStatus('active', { type: 'canceled' }, now).status).toBe('canceled')
  })

  it('suspended에서 결제 성공 → active (재구독 시 시계열이 이어진다)', () => {
    expect(decideStatus('suspended', { type: 'payment_succeeded' }, now).status).toBe('active')
  })
})

describe('dueForBilling', () => {
  it('기간 종료일이 지났으면 청구한다', () => {
    expect(
      dueForBilling(
        { status: 'active', currentPeriodEnd: new Date('2026-03-19T00:00:00Z'), billingKey: 'bk' },
        now,
      ),
    ).toBe(true)
  })

  it('아직 안 지났으면 청구하지 않는다', () => {
    expect(
      dueForBilling(
        { status: 'active', currentPeriodEnd: new Date('2026-03-25T00:00:00Z'), billingKey: 'bk' },
        now,
      ),
    ).toBe(false)
  })

  it('빌링키가 없으면 청구하지 않는다', () => {
    expect(
      dueForBilling(
        { status: 'active', currentPeriodEnd: new Date('2026-03-19T00:00:00Z'), billingKey: null },
        now,
      ),
    ).toBe(false)
  })

  it('해지된 구독은 청구하지 않는다', () => {
    expect(
      dueForBilling(
        { status: 'canceled', currentPeriodEnd: new Date('2026-03-19T00:00:00Z'), billingKey: 'bk' },
        now,
      ),
    ).toBe(false)
  })

  it('past_due는 재시도한다', () => {
    expect(
      dueForBilling(
        { status: 'past_due', currentPeriodEnd: new Date('2026-03-19T00:00:00Z'), billingKey: 'bk' },
        now,
      ),
    ).toBe(true)
  })

  it('suspended도 재시도한다 (고객이 카드를 바꿨을 수 있다)', () => {
    expect(
      dueForBilling(
        { status: 'suspended', currentPeriodEnd: new Date('2026-03-19T00:00:00Z'), billingKey: 'bk' },
        now,
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/billing/
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/billing/period.ts`:

```ts
/** 다음 결제일. 말일 가입자를 짧은 달에서 보정한다. */
export function nextPeriodEnd(from: Date): Date {
  const y = from.getUTCFullYear()
  const m = from.getUTCMonth()
  const d = from.getUTCDate()

  // 다음 달의 말일
  const lastDayOfNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate()
  const day = Math.min(d, lastDayOfNextMonth)

  return new Date(
    Date.UTC(y, m + 1, day, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()),
  )
}

export function periodKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * 이용 일수를 차감한 환불액(원 정수).
 * 약관 제5조: "서비스 이용이 개시된 경우 이용 일수에 해당하는 금액을 차감한 후 환불"
 */
export function proratedRefundKrw(
  amountKrw: number,
  periodStart: Date,
  periodEnd: Date,
  at: Date,
): number {
  const total = periodEnd.getTime() - periodStart.getTime()
  if (total <= 0) return 0
  const remaining = periodEnd.getTime() - at.getTime()
  if (remaining <= 0) return 0
  if (remaining >= total) return amountKrw
  return Math.floor((amountKrw * remaining) / total)
}
```

`src/lib/billing/order.ts`:

```ts
import { periodKey } from './period'

const PREFIX = 'cited'

/**
 * 청구 멱등키.
 *
 * 같은 구독의 같은 기간에 대해 항상 같은 값이므로, 잡이 재시도되어도
 * `payments.order_id` 유니크 인덱스가 이중 청구를 막는다.
 *
 * 토스 orderId 제약: 6~64자, 영문/숫자/-/_
 */
export function buildOrderId(subscriptionId: string, periodStart: Date): string {
  // UUID의 하이픈을 유지하면 64자를 넘길 수 있어 앞 8자만 쓴다.
  const short = subscriptionId.replace(/-/g, '').slice(0, 12)
  return `${PREFIX}_${short}_${periodKey(periodStart).replace(/-/g, '')}`
}

export function parseOrderId(
  orderId: string,
): { subscriptionId: string; period: string } | null {
  const m = /^cited_([A-Za-z0-9]{1,12})_(\d{4})(\d{2})(\d{2})$/.exec(orderId)
  if (!m) return null
  return {
    subscriptionId: m[1]!,
    period: `${m[2]}-${m[3]}-${m[4]}`,
  }
}
```

`src/lib/billing/lifecycle.ts`:

```ts
import type { SubscriptionStatus } from '@/lib/db/schema'

/**
 * 결제 실패 후 유예 기간.
 *
 * 설계 ⑤: "유예 기간 후 수집 중단. 과거 데이터는 유지해 재구독 시 시계열이
 * 이어진다." 즉시 끊으면 카드 갱신 중인 고객을 잃는다.
 */
export const GRACE_PERIOD_DAYS = 7

export type BillingEvent =
  | { type: 'payment_succeeded' }
  | { type: 'payment_failed' }
  | { type: 'canceled' }

export interface StatusDecision {
  status: SubscriptionStatus
  graceUntil: Date | null
}

export function decideStatus(
  current: SubscriptionStatus,
  event: BillingEvent,
  now: Date,
  existingGraceUntil?: Date | null,
): StatusDecision {
  switch (event.type) {
    case 'payment_succeeded':
      return { status: 'active', graceUntil: null }

    case 'canceled':
      return { status: 'canceled', graceUntil: null }

    case 'payment_failed': {
      // 이미 유예 중이면 기한을 연장하지 않는다. 연장하면 무한정 미납이 가능해진다.
      if (existingGraceUntil) {
        if (now.getTime() >= existingGraceUntil.getTime()) {
          return { status: 'suspended', graceUntil: existingGraceUntil }
        }
        return { status: 'past_due', graceUntil: existingGraceUntil }
      }
      const graceUntil = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)
      return { status: 'past_due', graceUntil }
    }
  }
}

export interface BillableSubscription {
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  billingKey: string | null
}

export function dueForBilling(sub: BillableSubscription, now: Date): boolean {
  if (sub.status === 'canceled') return false
  if (!sub.billingKey) return false
  if (!sub.currentPeriodEnd) return false
  return sub.currentPeriodEnd.getTime() <= now.getTime()
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/billing/
```

Expected: PASS (24 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/billing
git commit -m "feat(billing): 결제 주기 · 멱등 orderId · 상태 전이 (순수 함수)"
```

---

### Task 2: 플랜 한도 검증

**Files:**
- Create: `src/lib/quota.ts`
- Test: `src/lib/quota.test.ts`

**Interfaces:**
- Consumes: `resolveLimits`, `PLANS` (1단계)
- Produces:
  - `checkBrandQuota(args): QuotaVerdict`
  - `checkQueryQuota(args): QuotaVerdict`
  - `checkCompetitorQuota(args): QuotaVerdict`
  - `allocateQueryQuota(plan, packs, brandCount): number[]` — Business 브랜드별 배분
  - `validateQuotaAllocation(allocations, plan, packs): QuotaVerdict`
  - 온보딩·설정·수집 잡이 전부 이것으로 검증한다

설계 문서: Business에서 브랜드 3개에 각각 30질의를 주면 원가가 3배가 된다.
그래서 **질의 30개를 브랜드들이 나눠 쓴다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/quota.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  allocateQueryQuota,
  checkBrandQuota,
  checkCompetitorQuota,
  checkQueryQuota,
  validateQuotaAllocation,
} from '@/lib/quota'

describe('checkBrandQuota', () => {
  it('Starter는 브랜드 1개까지', () => {
    expect(checkBrandQuota({ plan: 'starter', queryPacks: 0, currentCount: 0 }).allowed).toBe(true)
    expect(checkBrandQuota({ plan: 'starter', queryPacks: 0, currentCount: 1 }).allowed).toBe(false)
  })

  it('Business는 브랜드 3개까지', () => {
    expect(checkBrandQuota({ plan: 'business', queryPacks: 0, currentCount: 2 }).allowed).toBe(true)
    expect(checkBrandQuota({ plan: 'business', queryPacks: 0, currentCount: 3 }).allowed).toBe(false)
  })

  it('질의 팩은 브랜드 한도를 늘리지 않는다', () => {
    expect(checkBrandQuota({ plan: 'starter', queryPacks: 5, currentCount: 1 }).allowed).toBe(false)
  })

  it('거부 시 안내 문구가 있다', () => {
    const v = checkBrandQuota({ plan: 'starter', queryPacks: 0, currentCount: 1 })
    expect(v.message).toContain('브랜드')
  })
})

describe('checkQueryQuota', () => {
  it('Starter는 10개까지', () => {
    expect(checkQueryQuota({ plan: 'starter', queryPacks: 0, requested: 10 }).allowed).toBe(true)
    expect(checkQueryQuota({ plan: 'starter', queryPacks: 0, requested: 11 }).allowed).toBe(false)
  })

  it('질의 팩 1개를 사면 10개가 늘어난다', () => {
    expect(checkQueryQuota({ plan: 'starter', queryPacks: 1, requested: 20 }).allowed).toBe(true)
  })

  it('Business 기본 30개', () => {
    expect(checkQueryQuota({ plan: 'business', queryPacks: 0, requested: 30 }).allowed).toBe(true)
    expect(checkQueryQuota({ plan: 'business', queryPacks: 0, requested: 31 }).allowed).toBe(false)
  })
})

describe('checkCompetitorQuota', () => {
  it('Starter 3개 · Business 10개', () => {
    expect(checkCompetitorQuota({ plan: 'starter', requested: 3 }).allowed).toBe(true)
    expect(checkCompetitorQuota({ plan: 'starter', requested: 4 }).allowed).toBe(false)
    expect(checkCompetitorQuota({ plan: 'business', requested: 10 }).allowed).toBe(true)
  })
})

describe('allocateQueryQuota — Business 브랜드별 배분', () => {
  it('브랜드 3개에 30질의를 균등 배분한다 (각 10개)', () => {
    expect(allocateQueryQuota('business', 0, 3)).toEqual([10, 10, 10])
  })

  it('나누어떨어지지 않으면 앞쪽 브랜드가 하나 더 받는다', () => {
    // 30을 4개로 → 8,8,7,7
    expect(allocateQueryQuota('business', 0, 4)).toEqual([8, 8, 7, 7])
  })

  it('총합이 항상 한도와 같다 (원가가 늘어나지 않는다)', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const alloc = allocateQueryQuota('business', 1, n)
      expect(alloc.reduce((a, b) => a + b, 0)).toBe(40)
    }
  })

  it('브랜드가 0개면 빈 배열', () => {
    expect(allocateQueryQuota('business', 0, 0)).toEqual([])
  })
})

describe('validateQuotaAllocation', () => {
  it('합이 한도 이내면 허용', () => {
    expect(validateQuotaAllocation([15, 10, 5], 'business', 0).allowed).toBe(true)
  })

  it('합이 한도를 넘으면 거부 — 여기가 원가 방어선이다', () => {
    const v = validateQuotaAllocation([30, 30, 30], 'business', 0)
    expect(v.allowed).toBe(false)
    expect(v.message).toContain('30')
  })

  it('음수 배분을 거부한다', () => {
    expect(validateQuotaAllocation([-5, 35], 'business', 0).allowed).toBe(false)
  })

  it('질의 팩을 반영한다', () => {
    expect(validateQuotaAllocation([20, 20], 'business', 1).allowed).toBe(true)
    expect(validateQuotaAllocation([20, 21], 'business', 1).allowed).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/quota.test.ts
```

Expected: FAIL

`src/lib/quota.ts`:

```ts
import { PLANS, resolveLimits, type PlanId } from '@/lib/plans'

export interface QuotaVerdict {
  allowed: boolean
  limit: number
  message: string | null
}

function ok(limit: number): QuotaVerdict {
  return { allowed: true, limit, message: null }
}

function deny(limit: number, message: string): QuotaVerdict {
  return { allowed: false, limit, message }
}

export function checkBrandQuota(args: {
  plan: PlanId
  queryPacks: number
  currentCount: number
}): QuotaVerdict {
  const limit = PLANS[args.plan].maxBrands
  if (args.currentCount < limit) return ok(limit)
  return deny(
    limit,
    args.plan === 'business'
      ? `브랜드는 최대 ${limit}개까지 등록할 수 있습니다.`
      : `현재 플랜은 브랜드 ${limit}개까지 지원합니다. Business로 업그레이드하면 3개까지 등록할 수 있습니다.`,
  )
}

export function checkQueryQuota(args: {
  plan: PlanId
  queryPacks: number
  requested: number
}): QuotaVerdict {
  const limit = resolveLimits(args.plan, args.queryPacks).maxQueries
  if (args.requested <= limit) return ok(limit)
  return deny(
    limit,
    `추적 질문은 최대 ${limit}개입니다. 질의 팩을 추가하면 10개씩 늘릴 수 있습니다.`,
  )
}

export function checkCompetitorQuota(args: {
  plan: PlanId
  requested: number
}): QuotaVerdict {
  const limit = PLANS[args.plan].maxCompetitors
  if (args.requested <= limit) return ok(limit)
  return deny(limit, `경쟁사는 최대 ${limit}개까지 등록할 수 있습니다.`)
}

/**
 * Business에서 브랜드들이 총 질의 한도를 나눠 쓴다.
 *
 * 브랜드 3개에 각각 30질의를 주면 원가가 3배가 된다. 총 측정량이 같아야
 * 원가가 그대로이고 고객에게도 정직하다. 더 필요하면 질의 팩으로 늘린다.
 */
export function allocateQueryQuota(
  plan: PlanId,
  queryPacks: number,
  brandCount: number,
): number[] {
  if (brandCount <= 0) return []
  const total = resolveLimits(plan, queryPacks).maxQueries
  const base = Math.floor(total / brandCount)
  const remainder = total % brandCount
  return Array.from({ length: brandCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

/** 고객이 직접 배분을 조정할 때 합계를 검증한다. 이것이 원가 방어선이다. */
export function validateQuotaAllocation(
  allocations: readonly number[],
  plan: PlanId,
  queryPacks: number,
): QuotaVerdict {
  const limit = resolveLimits(plan, queryPacks).maxQueries
  if (allocations.some((a) => !Number.isInteger(a) || a < 0)) {
    return deny(limit, '배분값은 0 이상의 정수여야 합니다.')
  }
  const sum = allocations.reduce((a, b) => a + b, 0)
  if (sum > limit) {
    return deny(limit, `브랜드별 질문 수의 합(${sum})이 한도(${limit})를 넘습니다.`)
  }
  return ok(limit)
}
```

- [ ] **Step 3: 통과 확인과 커밋**

```bash
pnpm vitest run src/lib/quota.test.ts
git add src/lib/quota.ts src/lib/quota.test.ts
git commit -m "feat(billing): 플랜 한도 검증과 Business 질의 쿼터 배분"
```

Expected: PASS (17 passed)

---

### Task 3: 토스페이먼츠 클라이언트

**Files:**
- Create: `src/lib/billing/toss.ts`, `src/lib/billing/repository.ts`
- Test: `src/lib/billing/toss.test.ts`
- Modify: `.env.example`, `src/lib/env.ts`

**Interfaces:**
- Consumes: `env`
- Produces:
  - `issueBillingKey(args): Promise<{ billingKey; card }>`
  - `chargeBilling(args): Promise<TossPayment>`
  - `class TossError extends Error` — `code`, `retryable`
  - `isRetryableTossError(code): boolean`
  - `saveSubscription`, `recordPayment` 등 DB 접근

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/billing/toss.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TossError, isRetryableTossError, parseTossPayment, tossAuthHeader } from '@/lib/billing/toss'

describe('tossAuthHeader', () => {
  it('시크릿 키를 Basic 인증으로 인코딩한다 (콜론 필수)', () => {
    const header = tossAuthHeader('test_sk_abc')
    expect(header).toMatch(/^Basic /)
    const decoded = Buffer.from(header.slice(6), 'base64').toString()
    expect(decoded).toBe('test_sk_abc:')
  })
})

describe('isRetryableTossError', () => {
  it('일시적 오류는 재시도한다', () => {
    expect(isRetryableTossError('PROVIDER_ERROR')).toBe(true)
    expect(isRetryableTossError('FAILED_INTERNAL_SYSTEM_PROCESSING')).toBe(true)
  })

  it('카드 문제는 재시도하지 않는다 (고객이 조치해야 한다)', () => {
    expect(isRetryableTossError('REJECT_CARD_COMPANY')).toBe(false)
    expect(isRetryableTossError('EXCEED_MAX_CARD_INSTALLMENT_PLAN')).toBe(false)
    expect(isRetryableTossError('INVALID_CARD_EXPIRATION')).toBe(false)
    expect(isRetryableTossError('NOT_ENOUGH_BALANCE')).toBe(false)
  })

  it('모르는 코드는 재시도하지 않는다 (이중 청구 위험을 피한다)', () => {
    expect(isRetryableTossError('SOMETHING_NEW')).toBe(false)
  })
})

describe('parseTossPayment', () => {
  const raw = {
    paymentKey: 'pk_1',
    orderId: 'cited_abc_20260315',
    status: 'DONE',
    totalAmount: 99000,
    approvedAt: '2026-03-15T09:00:00+09:00',
    card: { number: '43301234****123*', cardType: '신용', issuerCode: '61' },
  }

  it('필요한 필드를 뽑아낸다', () => {
    const p = parseTossPayment(raw)
    expect(p.paymentKey).toBe('pk_1')
    expect(p.orderId).toBe('cited_abc_20260315')
    expect(p.amountKrw).toBe(99000)
    expect(p.approvedAt).toBeInstanceOf(Date)
  })

  it('DONE이 아니면 성공이 아니다', () => {
    expect(parseTossPayment(raw).succeeded).toBe(true)
    expect(parseTossPayment({ ...raw, status: 'ABORTED' }).succeeded).toBe(false)
  })

  it('마스킹된 카드번호만 담는다', () => {
    const p = parseTossPayment(raw)
    expect(p.cardNumberMasked).toContain('*')
  })

  it('예상치 못한 형태면 던진다 (조용히 통과시키면 안 된다)', () => {
    expect(() => parseTossPayment(null)).toThrowError()
    expect(() => parseTossPayment({ status: 'DONE' })).toThrowError()
  })
})

describe('TossError', () => {
  it('코드와 재시도 여부를 담는다', () => {
    const e = new TossError('카드사 거절', 'REJECT_CARD_COMPANY', 400)
    expect(e.code).toBe('REJECT_CARD_COMPANY')
    expect(e.retryable).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/billing/toss.test.ts
```

Expected: FAIL

`src/lib/billing/toss.ts`:

```ts
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const BASE_URL = 'https://api.tosspayments.com/v1'

export class TossError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'TossError'
    this.code = code
    this.status = status
    this.retryable = isRetryableTossError(code)
  }
}

/**
 * 재시도해도 되는 오류만 명시적으로 나열한다.
 *
 * 모르는 코드는 재시도하지 않는다 — 승인이 실제로 됐는데 응답만 실패한
 * 경우에 재시도하면 이중 청구가 된다. orderId 멱등키가 1차 방어선이지만
 * 여기서도 보수적으로 간다.
 */
const RETRYABLE_CODES = new Set([
  'PROVIDER_ERROR',
  'FAILED_INTERNAL_SYSTEM_PROCESSING',
  'FAILED_PROCESSING_TRANSACTION',
  'COMMON_ERROR',
])

export function isRetryableTossError(code: string): boolean {
  return RETRYABLE_CODES.has(code)
}

export function tossAuthHeader(secretKey: string): string {
  // 토스 규격: secretKey 뒤에 콜론을 붙이고 base64
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`
}

async function tossFetch(path: string, body: unknown): Promise<unknown> {
  if (!env.TOSS_SECRET_KEY) throw new TossError('TOSS_SECRET_KEY 없음', 'CONFIG', 500)

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: tossAuthHeader(env.TOSS_SECRET_KEY),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const code =
      (data as { code?: string } | null)?.code ?? `HTTP_${response.status}`
    const message =
      (data as { message?: string } | null)?.message ?? `토스 API 오류 (${response.status})`
    // 카드 정보가 로그에 남지 않도록 코드와 메시지만 남긴다.
    logger.warn('toss.error', { path, code, status: response.status })
    throw new TossError(message, code, response.status)
  }

  return data
}

export interface BillingKeyResult {
  billingKey: string
  cardNumberMasked: string
  cardCompany: string
  raw: unknown
}

/**
 * 빌링키 발급.
 *
 * 카드 정보는 브라우저에서 토스 SDK가 직접 받는다. 우리 서버는 그 결과인
 * authKey만 받아 빌링키로 교환한다. 카드번호는 우리 서버를 거치지 않는다.
 */
export async function issueBillingKey(args: {
  customerKey: string
  authKey: string
}): Promise<BillingKeyResult> {
  const data = await tossFetch('/billing/authorizations/issue', {
    customerKey: args.customerKey,
    authKey: args.authKey,
  })

  const rec = data as {
    billingKey?: string
    card?: { number?: string; issuerCode?: string; cardType?: string }
  }
  if (!rec.billingKey) throw new TossError('빌링키가 응답에 없습니다', 'NO_BILLING_KEY', 502)

  return {
    billingKey: rec.billingKey,
    cardNumberMasked: rec.card?.number ?? '',
    cardCompany: rec.card?.issuerCode ?? '',
    raw: data,
  }
}

export interface TossPayment {
  paymentKey: string
  orderId: string
  amountKrw: number
  succeeded: boolean
  approvedAt: Date | null
  cardNumberMasked: string
  raw: unknown
}

export function parseTossPayment(raw: unknown): TossPayment {
  if (typeof raw !== 'object' || raw === null) {
    throw new TossError('결제 응답이 객체가 아닙니다', 'PARSE', 502)
  }
  const rec = raw as Record<string, unknown>
  if (typeof rec.paymentKey !== 'string' || typeof rec.orderId !== 'string') {
    throw new TossError('결제 응답에 필수 필드가 없습니다', 'PARSE', 502)
  }
  const card = rec.card as { number?: string } | undefined
  return {
    paymentKey: rec.paymentKey,
    orderId: rec.orderId,
    amountKrw: typeof rec.totalAmount === 'number' ? rec.totalAmount : 0,
    succeeded: rec.status === 'DONE',
    approvedAt: typeof rec.approvedAt === 'string' ? new Date(rec.approvedAt) : null,
    cardNumberMasked: card?.number ?? '',
    raw,
  }
}

/** 자동결제 승인. orderId가 멱등키다. */
export async function chargeBilling(args: {
  billingKey: string
  customerKey: string
  amountKrw: number
  orderId: string
  orderName: string
  customerEmail?: string
}): Promise<TossPayment> {
  const data = await tossFetch(`/billing/${args.billingKey}`, {
    customerKey: args.customerKey,
    amount: args.amountKrw,
    orderId: args.orderId,
    orderName: args.orderName,
    ...(args.customerEmail ? { customerEmail: args.customerEmail } : {}),
  })
  return parseTossPayment(data)
}
```

`.env.example`과 `src/lib/env.ts`에 `TOSS_SECRET_KEY`,
`NEXT_PUBLIC_TOSS_CLIENT_KEY`가 이미 있는지 확인한다 (1단계에서 선택 항목으로
넣어두었다).

- [ ] **Step 3: 리포지토리**

`src/lib/billing/repository.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { and, eq, lte, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { payments, subscriptions, user, type SubscriptionStatus } from '@/lib/db/schema'
import type { PlanId } from '@/lib/plans'

export async function getSubscriptionByUser(userId: string) {
  return db.query.subscriptions.findFirst({ where: eq(subscriptions.userId, userId) })
}

export async function ensureSubscription(userId: string): Promise<string> {
  const existing = await getSubscriptionByUser(userId)
  if (existing) return existing.id
  const id = randomUUID()
  await db.insert(subscriptions).values({
    id,
    userId,
    plan: 'starter',
    status: 'canceled', // 결제 전까지는 비활성
    queryPacks: 0,
    customerKey: randomUUID(),
  })
  return id
}

export async function setBillingKey(args: {
  subscriptionId: string
  billingKey: string
}): Promise<void> {
  await db
    .update(subscriptions)
    .set({ billingKey: args.billingKey, updatedAt: new Date() })
    .where(eq(subscriptions.id, args.subscriptionId))
}

export async function applyBillingResult(args: {
  subscriptionId: string
  status: SubscriptionStatus
  graceUntil: Date | null
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
}): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: args.status,
      graceUntil: args.graceUntil,
      ...(args.currentPeriodStart ? { currentPeriodStart: args.currentPeriodStart } : {}),
      ...(args.currentPeriodEnd ? { currentPeriodEnd: args.currentPeriodEnd } : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, args.subscriptionId))
}

export async function changePlan(args: {
  subscriptionId: string
  plan: PlanId
  queryPacks: number
}): Promise<void> {
  await db
    .update(subscriptions)
    .set({ plan: args.plan, queryPacks: args.queryPacks, updatedAt: new Date() })
    .where(eq(subscriptions.id, args.subscriptionId))
}

/**
 * 결제 기록. orderId 유니크 인덱스가 이중 청구를 막는다.
 * 이미 있으면 false를 돌려준다 — 호출자는 청구를 건너뛴다.
 */
export async function recordPaymentIfNew(args: {
  subscriptionId: string
  orderId: string
  amountKrw: number
  status: 'paid' | 'failed' | 'canceled'
  raw: unknown
  failureCode?: string
  failureMessage?: string
  paidAt?: Date | null
}): Promise<boolean> {
  const result = await db
    .insert(payments)
    .values({
      id: randomUUID(),
      subscriptionId: args.subscriptionId,
      orderId: args.orderId,
      amountKrw: args.amountKrw,
      status: args.status,
      raw: args.raw,
      failureCode: args.failureCode ?? null,
      failureMessage: args.failureMessage ?? null,
      paidAt: args.paidAt ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: payments.id })
  return result.length > 0
}

export async function hasPayment(orderId: string): Promise<boolean> {
  const row = await db.query.payments.findFirst({ where: eq(payments.orderId, orderId) })
  return Boolean(row)
}

/** 오늘 청구할 구독 목록 */
export async function listDueSubscriptions(now: Date) {
  return db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      plan: subscriptions.plan,
      queryPacks: subscriptions.queryPacks,
      status: subscriptions.status,
      billingKey: subscriptions.billingKey,
      customerKey: subscriptions.customerKey,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      graceUntil: subscriptions.graceUntil,
      email: user.email,
    })
    .from(subscriptions)
    .innerJoin(user, eq(user.id, subscriptions.userId))
    .where(
      and(
        ne(subscriptions.status, 'canceled'),
        lte(subscriptions.currentPeriodEnd, now),
      ),
    )
}

export async function listPayments(subscriptionId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.subscriptionId, subscriptionId))
}
```

- [ ] **Step 4: 통과 확인과 커밋**

```bash
pnpm vitest run src/lib/billing/toss.test.ts
pnpm typecheck
git add src/lib/billing
git commit -m "feat(billing): 토스 REST 클라이언트 · 오류 분류 · 구독/결제 리포지토리"
```

Expected: PASS (10 passed)

---

### Task 4: 빌링키 등록과 첫 결제

**Files:**
- Create: `src/app/api/billing/register/route.ts`,
  `src/components/billing/card-register.tsx`,
  `src/app/(app)/billing/success/page.tsx`, `src/app/(app)/billing/fail/page.tsx`
- Test: 수동 검증 (토스 테스트 키)

**Interfaces:**
- Consumes: Task 1~3
- Produces:
  - `POST /api/billing/register` — authKey → 빌링키 → 첫 결제 → 첫 수집 트리거
  - `<CardRegister />` — 토스 SDK를 띄우는 클라이언트 컴포넌트

**설계 문서의 핵심 결정을 여기서 구현한다:** 결제 성공 즉시 `collectBrand`를
트리거한다. 스케줄만 두면 화요일에 결제한 고객은 다음 월요일까지 아무것도
못 본다 — 무료 진단에서 20초 만에 결과를 보여준 뒤 돈을 받고 6일을 기다리게
하는 셈이라 환불 사유가 된다.

- [ ] **Step 1: 토스 SDK 설치**

```bash
pnpm add @tosspayments/tosspayments-sdk
```

- [ ] **Step 2: 카드 등록 컴포넌트**

`src/components/billing/card-register.tsx`:

```tsx
'use client'

import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * 카드 정보는 이 컴포넌트에서 토스 SDK가 직접 받는다.
 * 우리 서버는 카드번호를 절대 보지 않는다.
 */
export function CardRegister({
  customerKey,
  customerEmail,
  customerName,
  returnPath,
}: {
  customerKey: string
  customerEmail: string
  customerName: string
  returnPath: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setPending(true)
    setError(null)
    try {
      const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
      const payment = toss.payment({ customerKey })

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}${returnPath}`,
        failUrl: `${window.location.origin}/billing/fail`,
        customerEmail,
        customerName,
      })
    } catch (e) {
      setPending(false)
      setError(e instanceof Error ? e.message : '카드 등록 창을 열지 못했습니다.')
    }
  }

  return (
    <div>
      <Button onClick={onClick} disabled={pending} size="lg" className="w-full">
        {pending ? '결제창을 여는 중…' : '카드 등록하고 시작하기'}
      </Button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">
        카드 정보는 토스페이먼츠가 처리하며 Cited 서버에 저장되지 않습니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: 빌링키 등록 API**

`src/app/api/billing/register/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildOrderId } from '@/lib/billing/order'
import { nextPeriodEnd } from '@/lib/billing/period'
import {
  applyBillingResult,
  ensureSubscription,
  getSubscriptionByUser,
  hasPayment,
  recordPaymentIfNew,
  setBillingKey,
} from '@/lib/billing/repository'
import { chargeBilling, issueBillingKey, TossError } from '@/lib/billing/toss'
import { db } from '@/lib/db'
import { brands, subscriptions } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { monthlyPriceKrw, PLANS, type PlanId } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { collectBrand } from '@/trigger/collect-brand'

const schema = z.object({
  authKey: z.string().min(1),
  plan: z.enum(['starter', 'business']),
  queryPacks: z.number().int().min(0).max(20).default(0),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 올바르지 않습니다.' }, { status: 400 })
  }

  const subscriptionId = await ensureSubscription(session.user.id)
  const sub = await getSubscriptionByUser(session.user.id)
  if (!sub?.customerKey) {
    return NextResponse.json({ error: '구독 정보를 만들지 못했습니다.' }, { status: 500 })
  }

  // 1. authKey → 빌링키
  let billingKey: string
  try {
    const issued = await issueBillingKey({
      customerKey: sub.customerKey,
      authKey: parsed.data.authKey,
    })
    billingKey = issued.billingKey
    await setBillingKey({ subscriptionId, billingKey })
  } catch (error) {
    const code = error instanceof TossError ? error.code : 'UNKNOWN'
    logger.warn('billing.issue_failed', { code })
    return NextResponse.json(
      { error: '카드 등록에 실패했습니다. 다른 카드로 시도해 주세요.' },
      { status: 400 },
    )
  }

  // 2. 플랜 반영 후 첫 결제
  const plan: PlanId = parsed.data.plan
  const queryPacks = parsed.data.queryPacks
  await db
    .update(subscriptions)
    .set({ plan, queryPacks, updatedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId))

  const now = new Date()
  const orderId = buildOrderId(subscriptionId, now)
  const amountKrw = monthlyPriceKrw(plan, queryPacks)

  // 멱등: 이미 이 orderId로 청구했으면 다시 하지 않는다.
  if (await hasPayment(orderId)) {
    return NextResponse.json({ ok: true, alreadyCharged: true })
  }

  try {
    const payment = await chargeBilling({
      billingKey,
      customerKey: sub.customerKey,
      amountKrw,
      orderId,
      orderName: `Cited ${plan === 'business' ? 'Business' : 'Starter'} 월 구독`,
      customerEmail: session.user.email,
    })

    if (!payment.succeeded) throw new TossError('승인 실패', 'NOT_DONE', 400)

    await recordPaymentIfNew({
      subscriptionId,
      orderId,
      amountKrw,
      status: 'paid',
      raw: payment.raw,
      paidAt: payment.approvedAt,
    })

    await applyBillingResult({
      subscriptionId,
      status: 'active',
      graceUntil: null,
      currentPeriodStart: now,
      currentPeriodEnd: nextPeriodEnd(now),
    })
  } catch (error) {
    const code = error instanceof TossError ? error.code : 'UNKNOWN'
    const message = error instanceof Error ? error.message : String(error)
    await recordPaymentIfNew({
      subscriptionId,
      orderId,
      amountKrw,
      status: 'failed',
      raw: null,
      failureCode: code,
      failureMessage: message,
    })
    logger.warn('billing.first_charge_failed', { code })
    return NextResponse.json(
      { error: '결제에 실패했습니다. 카드사에 문의하시거나 다른 카드로 시도해 주세요.' },
      { status: 402 },
    )
  }

  // 3. 결제 성공 → 즉시 첫 수집 트리거
  //    스케줄만 두면 화요일 결제 고객은 다음 월요일까지 빈 화면을 본다.
  //    무료 진단에서 20초 만에 결과를 보여준 뒤 6일을 기다리게 하면 환불 사유가 된다.
  const userBrands = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.userId, session.user.id))

  const handles = await Promise.all(
    userBrands.map((b) => collectBrand.trigger({ brandId: b.id, trigger: 'signup' })),
  )

  logger.info('billing.activated', {
    subscriptionId,
    plan,
    queryPacks,
    brands: userBrands.length,
  })

  return NextResponse.json({
    ok: true,
    runIds: handles.map((h) => h.id),
    publicAccessTokens: handles.map((h) => h.publicAccessToken),
  })
}
```

- [ ] **Step 4: 성공/실패 반환 페이지**

`src/app/(app)/billing/success/page.tsx` — 토스가 `authKey`와 `customerKey`를
쿼리로 돌려준다. 이 페이지가 등록 API를 호출한다.

```tsx
import { redirect } from 'next/navigation'
import { BillingComplete } from '@/components/billing/billing-complete'
import { requireUser } from '@/lib/session'

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ authKey?: string; customerKey?: string; plan?: string; packs?: string }>
}) {
  await requireUser()
  const sp = await searchParams
  if (!sp.authKey) redirect('/billing/fail')

  return (
    <BillingComplete
      authKey={sp.authKey}
      plan={sp.plan === 'business' ? 'business' : 'starter'}
      queryPacks={Number(sp.packs ?? 0) || 0}
    />
  )
}
```

`src/components/billing/billing-complete.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function BillingComplete({
  authKey,
  plan,
  queryPacks,
}: {
  authKey: string
  plan: 'starter' | 'business'
  queryPacks: number
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    // React StrictMode의 이중 실행을 막는다. 결제는 두 번 시도하면 안 된다.
    if (fired.current) return
    fired.current = true

    void (async () => {
      const res = await fetch('/api/billing/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authKey, plan, queryPacks }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        runIds?: string[]
        publicAccessTokens?: string[]
      }
      if (!res.ok) {
        setError(data.error ?? '결제 처리에 실패했습니다.')
        return
      }
      const run = data.runIds?.[0]
      const token = data.publicAccessTokens?.[0]
      router.replace(
        run && token
          ? `/onboarding/first-run?run=${run}&token=${token}`
          : '/dashboard',
      )
    })()
  }, [authKey, plan, queryPacks, router])

  if (error) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">결제에 실패했습니다</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <a href="/billing" className="mt-6 inline-block underline">
          다시 시도하기
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold">결제를 처리하는 중입니다</h1>
      <p className="mt-2 text-muted-foreground">잠시만 기다려 주세요…</p>
    </div>
  )
}
```

`src/app/(app)/billing/fail/page.tsx` — 정적 안내 페이지.

- [ ] **Step 5: 테스트 키로 실제 결제 검증**

토스 개발자센터에서 **테스트 키**를 받아 `.env.local`에 넣는다
(`test_ck_...` / `test_sk_...`).

```bash
pnpm dev
```

1. 로그인 후 `/billing`에서 카드 등록 → 토스 테스트 카드로 결제
2. `/billing/success`가 `/onboarding/first-run`으로 리다이렉트되는가
3. `pnpm db:studio`에서 확인:
   - `subscriptions.billingKey`가 채워짐
   - `subscriptions.status = 'active'`
   - `subscriptions.currentPeriodEnd`가 한 달 뒤
   - `payments`에 `status='paid'` 1행, `orderId`가 `cited_...` 형식
4. Trigger.dev 대시보드에서 `collect-brand`가 `trigger: 'signup'`으로 실행됨

**이중 청구 검증:** 브라우저를 새로고침해 `/billing/success?authKey=...`를
다시 열어본다. `payments`에 행이 하나만 있어야 한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(billing): 빌링키 등록 · 첫 결제 · 결제 즉시 첫 수집 트리거

카드 정보는 토스 SDK가 브라우저에서 처리하고 우리 서버는 빌링키만 저장한다."
```

---

### Task 5: 정기결제 잡

**Files:**
- Create: `src/trigger/billing-cycle.ts`
- Modify: `src/lib/email/templates.ts` (결제 실패·정지 메일 추가)
- Test: `src/lib/email/templates.test.ts` (추가)

**Interfaces:**
- Consumes: Task 1~3
- Produces: `billingCycle` — 매일 도는 청구 잡

> **스케줄이 3개가 된다** (`daily-scheduler`, `audit-waitlist`, `billing-cycle`).
> 3단계에서 "스케줄은 전체 1개"라고 한 것은 **브랜드마다 만들지 않는다**는
> 뜻이다. 청구는 성격이 다른 별개 스케줄이므로 추가가 맞다. Trigger.dev 무료
> 티어 한도 10개 대비 여유가 충분하다. 새 스케줄을 추가할 때마다 "기존 잡으로
> 흡수할 수 있는가"를 먼저 묻는다.

- [ ] **Step 1: 결제 관련 메일 템플릿 테스트 추가**

`src/lib/email/templates.test.ts`에 추가:

```ts
import { paymentFailedEmail, subscriptionSuspendedEmail } from '@/lib/email/templates'

describe('paymentFailedEmail', () => {
  it('유예 기한을 명시한다', () => {
    const mail = paymentFailedEmail({
      graceUntil: new Date('2026-03-27T00:00:00Z'),
      billingUrl: 'https://cited.test/billing',
    })
    expect(mail.subject).toContain('결제')
    expect(mail.html).toContain('3월 27일')
    expect(mail.html).toContain('https://cited.test/billing')
  })

  it('데이터가 유지된다는 사실을 알린다 (해지를 막는 핵심 문구)', () => {
    const mail = paymentFailedEmail({
      graceUntil: new Date('2026-03-27T00:00:00Z'),
      billingUrl: 'https://x.test',
    })
    expect(mail.html).toContain('데이터')
  })
})

describe('subscriptionSuspendedEmail', () => {
  it('수집 중단과 데이터 유지를 함께 알린다', () => {
    const mail = subscriptionSuspendedEmail({ billingUrl: 'https://x.test' })
    expect(mail.html).toContain('중단')
    expect(mail.html).toContain('유지')
  })
})
```

- [ ] **Step 2: 실패 확인 후 템플릿 구현**

```bash
pnpm vitest run src/lib/email/templates.test.ts
```

Expected: FAIL

`src/lib/email/templates.ts`에 추가:

```ts
function formatKoreanDate(date: Date): string {
  const seoul = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${seoul.getUTCMonth() + 1}월 ${seoul.getUTCDate()}일`
}

export function paymentFailedEmail(params: {
  graceUntil: Date
  billingUrl: string
}): EmailContent {
  const url = escapeHtml(params.billingUrl)
  return {
    subject: '[Cited] 결제가 처리되지 않았습니다',
    html: layout(
      `<p>등록하신 카드로 이번 달 결제가 처리되지 않았습니다.</p>
<p><strong>${formatKoreanDate(params.graceUntil)}까지</strong> 결제수단을 업데이트해 주세요.
그때까지는 측정이 정상적으로 계속됩니다.</p>
<p>기한이 지나면 새로운 측정이 중단되지만, <strong>지금까지 쌓인 데이터는 그대로 유지</strong>되어
결제를 다시 진행하시면 시계열이 끊기지 않고 이어집니다.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">결제수단 업데이트</a></p>`,
    ),
  }
}

export function subscriptionSuspendedEmail(params: { billingUrl: string }): EmailContent {
  const url = escapeHtml(params.billingUrl)
  return {
    subject: '[Cited] 측정이 일시 중단되었습니다',
    html: layout(
      `<p>결제가 완료되지 않아 새로운 측정이 <strong>중단</strong>되었습니다.</p>
<p>지금까지 수집된 데이터는 <strong>모두 유지</strong>되고 있습니다. 결제를 다시 진행하시면
다음 측정부터 시계열이 이어집니다.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">결제 재개하기</a></p>`,
    ),
  }
}
```

```bash
pnpm vitest run src/lib/email/templates.test.ts
```

Expected: PASS

- [ ] **Step 3: 정기결제 잡**

`src/trigger/billing-cycle.ts`:

```ts
import { logger, schedules } from '@trigger.dev/sdk'
import { decideStatus, dueForBilling } from '@/lib/billing/lifecycle'
import { buildOrderId } from '@/lib/billing/order'
import { nextPeriodEnd } from '@/lib/billing/period'
import {
  applyBillingResult,
  hasPayment,
  listDueSubscriptions,
  recordPaymentIfNew,
} from '@/lib/billing/repository'
import { chargeBilling, TossError } from '@/lib/billing/toss'
import { sendEmail } from '@/lib/email/send'
import { paymentFailedEmail, subscriptionSuspendedEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { monthlyPriceKrw } from '@/lib/plans'

/**
 * 정기결제.
 *
 * 매일 돌면서 `currentPeriodEnd`가 지난 구독을 찾아 청구한다.
 * orderId가 멱등키라 잡이 재시도되어도 이중 청구되지 않는다.
 */
export const billingCycle = schedules.task({
  id: 'billing-cycle',
  // 매일 KST 오전 10시. 결제 실패 시 고객이 그날 안에 조치할 수 있는 시간.
  cron: { pattern: '0 1 * * *', timezone: 'Asia/Seoul' },
  maxDuration: 900,
  run: async (payload) => {
    const now = payload.timestamp
    const due = await listDueSubscriptions(now)

    logger.info('billing-cycle.start', { candidates: due.length })

    let charged = 0
    let failed = 0
    let skipped = 0

    for (const sub of due) {
      if (
        !dueForBilling(
          {
            status: sub.status,
            currentPeriodEnd: sub.currentPeriodEnd,
            billingKey: sub.billingKey,
          },
          now,
        )
      ) {
        skipped++
        continue
      }

      const periodStart = sub.currentPeriodEnd ?? now
      const orderId = buildOrderId(sub.id, periodStart)

      // 멱등: 이미 청구한 기간이면 건너뛴다.
      if (await hasPayment(orderId)) {
        skipped++
        continue
      }

      const amountKrw = monthlyPriceKrw(sub.plan, sub.queryPacks)

      try {
        const payment = await chargeBilling({
          billingKey: sub.billingKey!,
          customerKey: sub.customerKey!,
          amountKrw,
          orderId,
          orderName: `Cited ${sub.plan === 'business' ? 'Business' : 'Starter'} 월 구독`,
          customerEmail: sub.email,
        })
        if (!payment.succeeded) throw new TossError('승인 실패', 'NOT_DONE', 400)

        await recordPaymentIfNew({
          subscriptionId: sub.id,
          orderId,
          amountKrw,
          status: 'paid',
          raw: payment.raw,
          paidAt: payment.approvedAt,
        })

        const decision = decideStatus(sub.status, { type: 'payment_succeeded' }, now)
        await applyBillingResult({
          subscriptionId: sub.id,
          status: decision.status,
          graceUntil: decision.graceUntil,
          currentPeriodStart: periodStart,
          currentPeriodEnd: nextPeriodEnd(periodStart),
        })
        charged++
      } catch (error) {
        const code = error instanceof TossError ? error.code : 'UNKNOWN'
        const message = error instanceof Error ? error.message : String(error)

        await recordPaymentIfNew({
          subscriptionId: sub.id,
          orderId,
          amountKrw,
          status: 'failed',
          raw: null,
          failureCode: code,
          failureMessage: message,
        })

        const decision = decideStatus(
          sub.status,
          { type: 'payment_failed' },
          now,
          sub.graceUntil,
        )
        await applyBillingResult({
          subscriptionId: sub.id,
          status: decision.status,
          graceUntil: decision.graceUntil,
        })

        const billingUrl = `${env.NEXT_PUBLIC_APP_URL}/billing`
        if (decision.status === 'suspended' && sub.status !== 'suspended') {
          await sendEmail({ to: sub.email, content: subscriptionSuspendedEmail({ billingUrl }) })
        } else if (decision.status === 'past_due' && sub.status !== 'past_due') {
          await sendEmail({
            to: sub.email,
            content: paymentFailedEmail({ graceUntil: decision.graceUntil!, billingUrl }),
          })
        }

        logger.warn('billing-cycle.charge_failed', {
          subscriptionId: sub.id,
          code,
          newStatus: decision.status,
        })
        failed++
      }
    }

    logger.info('billing-cycle.done', { charged, failed, skipped })
    return { charged, failed, skipped }
  },
})
```

- [ ] **Step 4: 정기결제 수동 검증**

Task 4에서 만든 구독의 `currentPeriodEnd`를 과거로 바꿔 청구가 도는지 본다.

```bash
cat > /tmp/expire.sql <<'SQL'
update subscriptions
set current_period_end = now() - interval '1 day'
where status = 'active';
SQL
psql "$DATABASE_URL_UNPOOLED" -f /tmp/expire.sql
```

Trigger.dev 대시보드에서 `billing-cycle`을 수동 실행한다.

Expected:
- `payments`에 새 행 1개 (`status='paid'`, 새 `orderId`)
- `subscriptions.currentPeriodEnd`가 한 달 뒤로 갱신

**멱등 검증:** 같은 잡을 한 번 더 실행한다. `payments` 행이 늘지 않아야 한다.

**실패 경로 검증:** 토스 테스트 환경에서 실패를 유도하기 어려우면,
`billingKey`를 잘못된 값으로 바꾼 뒤 실행한다.

Expected: `payments`에 `status='failed'` 행, `subscriptions.status='past_due'`,
`graceUntil`이 7일 뒤, 실패 메일 발송

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(billing): 정기결제 잡 · 유예 기간 · 결제 실패 메일

orderId 멱등키로 이중 청구를 막고, 실패해도 즉시 끊지 않는다."
```

---

### Task 6: 온보딩 생성기

**Files:**
- Create: `src/lib/onboarding/generate.ts`, `src/lib/onboarding/prompt.ts`
- Test: `src/lib/onboarding/generate.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `generateAuditQueries` (3단계)
- Produces:
  - `generateAliases(brandName, category): Promise<{ aliases: string[]; ambiguous: boolean }>`
  - `generateQueries(brandName, category, count): Promise<string[]>`
  - `suggestCompetitors(auditResult, brandName): string[]` — 순수 함수
  - 온보딩 마법사가 소비한다

설계 ④: "추적할 질의를 입력하세요"라고 하면 그 자리에서 나간다. 질문을
생각해내는 건 고객의 일이 아니다. **전부 "생성 후 확인" 구조다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/onboarding/generate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  generateAliases,
  generateQueries,
  parseAliasResponse,
  suggestCompetitors,
} from '@/lib/onboarding/generate'

describe('parseAliasResponse', () => {
  it('별칭 배열과 ambiguous 플래그를 뽑아낸다', () => {
    const r = parseAliasResponse(
      JSON.stringify({
        aliases: ['MUSINSA', 'Musinsa', '무신사스탠다드', '무탠다드'],
        ambiguous: false,
        reason: '고유 브랜드명',
      }),
    )
    expect(r.aliases).toContain('무탠다드')
    expect(r.ambiguous).toBe(false)
  })

  it('일반어와 겹치면 ambiguous=true', () => {
    const r = parseAliasResponse(JSON.stringify({ aliases: ['소나기'], ambiguous: true, reason: '' }))
    expect(r.ambiguous).toBe(true)
  })

  it('중복과 빈 문자열을 제거한다', () => {
    const r = parseAliasResponse(
      JSON.stringify({ aliases: ['A', 'A', '', '  ', 'B'], ambiguous: false, reason: '' }),
    )
    expect(r.aliases).toEqual(['A', 'B'])
  })

  it('별칭이 20개를 넘으면 자른다 (1차 매칭 비용)', () => {
    const many = Array.from({ length: 40 }, (_, i) => `alias${i}`)
    expect(parseAliasResponse(JSON.stringify({ aliases: many, ambiguous: false })).aliases)
      .toHaveLength(20)
  })

  it('JSON이 깨져도 던지지 않고 빈 결과를 돌려준다', () => {
    const r = parseAliasResponse('not json')
    expect(r.aliases).toEqual([])
    // 판정을 확신할 수 없으면 보수적으로 2차를 강제한다.
    expect(r.ambiguous).toBe(true)
  })
})

describe('generateAliases — 실패해도 온보딩이 멈추지 않는다', () => {
  it('LLM이 실패하면 브랜드명만 담은 결과를 돌려준다', async () => {
    const failing = vi.fn(async () => {
      throw new Error('API down')
    })
    const r = await generateAliases('무신사', '패션', failing)
    expect(r.aliases).toEqual([])
    expect(r.ambiguous).toBe(true)
  })
})

describe('generateQueries', () => {
  it('LLM이 실패하면 카테고리 기본 질의로 대체한다', async () => {
    const failing = vi.fn(async () => {
      throw new Error('API down')
    })
    const qs = await generateQueries('무신사', '패션', 10, failing)
    expect(qs.length).toBeGreaterThan(0)
  })

  it('브랜드명이 든 질의를 걸러낸다 (넣으면 반드시 언급된다)', async () => {
    const withBrand = vi.fn(async () =>
      JSON.stringify({ queries: ['무신사 어때?', '온라인 패션몰 추천', '가성비 티셔츠'] }),
    )
    const qs = await generateQueries('무신사', '패션', 10, withBrand)
    expect(qs.every((q) => !q.includes('무신사'))).toBe(true)
    expect(qs).toContain('온라인 패션몰 추천')
  })

  it('요청 개수를 넘지 않는다', async () => {
    const many = vi.fn(async () =>
      JSON.stringify({ queries: Array.from({ length: 50 }, (_, i) => `질의 ${i}`) }),
    )
    expect(await generateQueries('X', '패션', 10, many)).toHaveLength(10)
  })

  it('중복 질의를 제거한다', async () => {
    const dup = vi.fn(async () => JSON.stringify({ queries: ['A', 'A', 'B'] }))
    expect(await generateQueries('X', '패션', 10, dup)).toEqual(['A', 'B'])
  })
})

describe('suggestCompetitors', () => {
  it('진단 결과의 답변에서 자주 나온 브랜드를 뽑는다', () => {
    const result = {
      evidence: [
        { text: '나이키와 아디다스를 추천합니다.', query: '', engineId: '', mentioned: false },
        { text: '나이키 페가수스가 좋습니다.', query: '', engineId: '', mentioned: false },
      ],
    }
    const c = suggestCompetitors(result, '아식스')
    expect(c).toContain('나이키')
  })

  it('우리 브랜드를 경쟁사로 추천하지 않는다', () => {
    const result = {
      evidence: [{ text: '아식스가 좋습니다.', query: '', engineId: '', mentioned: true }],
    }
    expect(suggestCompetitors(result, '아식스')).not.toContain('아식스')
  })

  it('진단 결과가 없으면 빈 배열', () => {
    expect(suggestCompetitors(null, '아식스')).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
pnpm vitest run src/lib/onboarding/
```

Expected: FAIL

`src/lib/onboarding/generate.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { generateAuditQueries } from '@/lib/audit/queries'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const MODEL = 'claude-haiku-4-5'
const MAX_ALIASES = 20

/** LLM 호출을 주입 가능하게 한다 — 테스트에서 실제 API를 부르지 않기 위해. */
export type CompleteFn = (system: string, user: string, schema: unknown) => Promise<string>

let client: Anthropic | null = null

const defaultComplete: CompleteFn = async (system, user, schema) => {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 없음')
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    output_config: { format: { type: 'json_schema', schema: schema as never } },
    messages: [{ role: 'user', content: user }],
  })
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('응답에 텍스트가 없습니다')
  return block.text
}

// ─── 별칭 ───────────────────────────────────────────────────

const ALIAS_SCHEMA = {
  type: 'object',
  properties: {
    aliases: { type: 'array', items: { type: 'string' } },
    ambiguous: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['aliases', 'ambiguous', 'reason'],
  additionalProperties: false,
} as const

const ALIAS_SYSTEM = `너는 한국 브랜드의 표기 변형을 찾아내는 분석기다.

주어진 브랜드에 대해 사람들이 실제로 쓰는 다른 표기를 모두 나열한다:
- 한글/영문 표기 (무신사 ↔ MUSINSA)
- 띄어쓰기 변형 (무신사 스탠다드 ↔ 무신사스탠다드)
- 커뮤니티 축약어 (무신사스탠다드 → 무탠다드)
- 흔한 오탈자

ambiguous는 브랜드명이 일반명사·지명·다른 회사명과 겹칠 때 true로 둔다.
"소나기", "달차", "미미" 같은 이름이 여기 해당한다. 확신이 없으면 true로 둔다.`

export interface AliasResult {
  aliases: string[]
  ambiguous: boolean
}

export function parseAliasResponse(text: string): AliasResult {
  try {
    const parsed: unknown = JSON.parse(text)
    const rec = parsed as { aliases?: unknown; ambiguous?: unknown }
    const aliases = Array.isArray(rec.aliases)
      ? [
          ...new Set(
            rec.aliases
              .filter((a): a is string => typeof a === 'string')
              .map((a) => a.trim())
              .filter((a) => a.length > 0),
          ),
        ].slice(0, MAX_ALIASES)
      : []
    return { aliases, ambiguous: rec.ambiguous === true }
  } catch {
    // 파싱 실패 시 보수적으로 — 2차 판정을 무조건 거치게 한다.
    return { aliases: [], ambiguous: true }
  }
}

export async function generateAliases(
  brandName: string,
  category: string,
  complete: CompleteFn = defaultComplete,
): Promise<AliasResult> {
  try {
    const text = await complete(
      ALIAS_SYSTEM,
      `브랜드명: ${brandName}\n업종: ${category}`,
      ALIAS_SCHEMA,
    )
    return parseAliasResponse(text)
  } catch (error) {
    logger.warn('onboarding.alias_generation_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    // 온보딩을 멈추지 않는다. 고객이 직접 추가할 수 있다.
    return { aliases: [], ambiguous: true }
  }
}

// ─── 질의 ───────────────────────────────────────────────────

const QUERY_SCHEMA = {
  type: 'object',
  properties: { queries: { type: 'array', items: { type: 'string' } } },
  required: ['queries'],
  additionalProperties: false,
} as const

const QUERY_SYSTEM = `너는 소비자가 AI에게 실제로 묻는 질문을 만드는 분석기다.

주어진 업종에서 소비자가 브랜드를 고를 때 AI에게 던질 법한 한국어 질문을 만든다.

반드시 지킬 것:
- **특정 브랜드명을 절대 넣지 마라.** 넣으면 AI가 반드시 그 브랜드를 언급해 측정이 무의미해진다.
- 소비자가 실제로 쓰는 말투로 쓴다 ("30대 남자 러닝화 추천해줘")
- 구매 의도가 있는 질문 위주로 (정보 탐색보다 브랜드 비교·추천)
- 서로 다른 각도를 다룬다 (가격, 용도, 특성, 비교)`

export async function generateQueries(
  brandName: string,
  category: string,
  count: number,
  complete: CompleteFn = defaultComplete,
): Promise<string[]> {
  let candidates: string[] = []
  try {
    const text = await complete(
      QUERY_SYSTEM,
      `업종: ${category}\n필요한 질문 수: ${count}개`,
      QUERY_SCHEMA,
    )
    const parsed = JSON.parse(text) as { queries?: unknown }
    candidates = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q): q is string => typeof q === 'string')
      : []
  } catch (error) {
    logger.warn('onboarding.query_generation_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // 브랜드명이 든 질의를 걸러낸다.
  const filtered = candidates
    .map((q) => q.trim())
    .filter((q) => q.length > 0 && !q.includes(brandName))

  const unique = [...new Set(filtered)].slice(0, count)

  // LLM이 실패했거나 결과가 부족하면 카테고리 기본 질의로 채운다.
  if (unique.length === 0) return generateAuditQueries(category, brandName)
  return unique
}

// ─── 경쟁사 ─────────────────────────────────────────────────

/** 진단 결과 답변에서 자주 언급된 브랜드를 뽑는다. 순수 함수. */
export function suggestCompetitors(
  auditResult: { evidence: { text: string }[] } | null,
  brandName: string,
): string[] {
  if (!auditResult) return []

  const counts = new Map<string, number>()
  for (const e of auditResult.evidence) {
    // 한글 2~10자 또는 영문 2~20자 토큰을 브랜드 후보로 본다.
    const tokens = e.text.match(/[가-힣]{2,10}|[A-Za-z][A-Za-z0-9]{1,19}/g) ?? []
    for (const t of tokens) {
      if (t === brandName) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name)
}
```

> **경쟁사 추천 정확도에 대한 주의:** 위 토큰 방식은 일반 명사도 함께 잡는다.
> 고객이 확인·편집하는 구조이므로 1차 배포에는 충분하지만, 개선하려면
> `generateAliases`처럼 LLM에 답변 텍스트를 주고 브랜드만 추출하게 한다.
> 온보딩 이탈률을 측정한 뒤 판단한다.

- [ ] **Step 3: 통과 확인과 커밋**

```bash
pnpm vitest run src/lib/onboarding/
git add src/lib/onboarding
git commit -m "feat(onboarding): 별칭·질의·경쟁사 자동 생성 (실패해도 온보딩이 멈추지 않는다)"
```

Expected: PASS (12 passed)

---

### Task 7: 온보딩 마법사

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`,
  `src/app/(app)/onboarding/actions.ts`,
  `src/components/onboarding/wizard.tsx`,
  `src/components/onboarding/step-*.tsx`,
  `src/app/(app)/onboarding/first-run/page.tsx`

**Interfaces:**
- Consumes: Task 2(한도), Task 6(생성기), Task 4(결제)
- Produces: 6단계 마법사. 완료 시 브랜드·질의·경쟁사가 DB에 저장되고 결제로 넘어간다

설계 ④의 온보딩 순서를 그대로 구현한다. **전부 "생성 후 확인" 구조다.**
고객은 빈칸을 채우는 게 아니라 이미 채워진 걸 고친다.

- [ ] **Step 1: 서버 액션**

`src/app/(app)/onboarding/actions.ts`:

```ts
'use server'

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAudit } from '@/lib/audit/repository'
import type { AuditResult } from '@/lib/audit/result'
import { getSubscriptionByUser } from '@/lib/billing/repository'
import { db } from '@/lib/db'
import { brands, queries } from '@/lib/db/schema'
import {
  generateAliases,
  generateQueries,
  suggestCompetitors,
} from '@/lib/onboarding/generate'
import { resolveLimits, type PlanId } from '@/lib/plans'
import {
  checkBrandQuota,
  checkCompetitorQuota,
  validateQuotaAllocation,
} from '@/lib/quota'
import { requireUser } from '@/lib/session'

export interface GeneratedDraft {
  aliases: string[]
  ambiguous: boolean
  queries: string[]
  competitors: string[]
}

/**
 * 2~4단계를 한 번에 생성한다.
 * 무료 진단을 이미 돌렸다면 그 결과를 재사용한다 (설계 ④).
 */
export async function generateDraft(args: {
  brandName: string
  category: string
  auditId?: string
  plan: PlanId
  queryPacks: number
}): Promise<GeneratedDraft> {
  await requireUser()

  const limits = resolveLimits(args.plan, args.queryPacks)

  const audit = args.auditId ? await getAudit(args.auditId) : null
  const auditResult = (audit?.result as AuditResult | null) ?? null

  const [alias, generated] = await Promise.all([
    generateAliases(args.brandName, args.category),
    generateQueries(args.brandName, args.category, limits.maxQueries),
  ])

  // 무료 진단에서 이미 쓴 질의를 앞에 둔다 — 고객이 본 결과와 이어진다.
  const auditQueries = auditResult?.byQuery.map((q) => q.queryText) ?? []
  const merged = [...new Set([...auditQueries, ...generated])].slice(0, limits.maxQueries)

  return {
    aliases: alias.aliases,
    ambiguous: alias.ambiguous,
    queries: merged,
    competitors: suggestCompetitors(auditResult, args.brandName).slice(0, limits.maxCompetitors),
  }
}

const saveSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  aliases: z.array(z.string().trim().min(1)).max(20),
  ambiguous: z.boolean(),
  queries: z.array(z.string().trim().min(1)).min(1),
  competitors: z.array(z.string().trim().min(1)),
})

export interface SaveResult {
  ok: boolean
  brandId?: string
  error?: string
}

export async function saveBrand(input: z.infer<typeof saveSchema>): Promise<SaveResult> {
  const user = await requireUser()
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: '입력이 올바르지 않습니다.' }

  const sub = await getSubscriptionByUser(user.id)
  const plan: PlanId = sub?.plan ?? 'starter'
  const queryPacks = sub?.queryPacks ?? 0

  // 한도 검증은 반드시 서버에서. 클라이언트 검증은 UX일 뿐이다.
  const existing = await db.select({ id: brands.id }).from(brands).where(eq(brands.userId, user.id))
  const brandCheck = checkBrandQuota({ plan, queryPacks, currentCount: existing.length })
  if (!brandCheck.allowed) return { ok: false, error: brandCheck.message! }

  const compCheck = checkCompetitorQuota({ plan, requested: parsed.data.competitors.length })
  if (!compCheck.allowed) return { ok: false, error: compCheck.message! }

  // 기존 브랜드들의 쿼터 합 + 이번 브랜드가 한도를 넘지 않아야 한다.
  const existingQuotas = await db
    .select({ q: brands.queryQuota })
    .from(brands)
    .where(eq(brands.userId, user.id))
  const allocCheck = validateQuotaAllocation(
    [...existingQuotas.map((r) => r.q), parsed.data.queries.length],
    plan,
    queryPacks,
  )
  if (!allocCheck.allowed) return { ok: false, error: allocCheck.message! }

  const brandId = randomUUID()
  await db.insert(brands).values({
    id: brandId,
    userId: user.id,
    name: parsed.data.brandName,
    category: parsed.data.category,
    aliases: parsed.data.aliases,
    ambiguous: parsed.data.ambiguous,
    competitors: parsed.data.competitors.map((name) => ({ name, aliases: [] })),
    queryQuota: parsed.data.queries.length,
    // 가입 요일 기준 — 수집 부하가 요일별로 자연히 분산된다.
    collectionWeekday: new Date().getUTCDay(),
  })

  await db.insert(queries).values(
    parsed.data.queries.map((text) => ({
      id: randomUUID(),
      brandId,
      text,
      source: 'generated' as const,
    })),
  )

  return { ok: true, brandId }
}
```

- [ ] **Step 2: 마법사 컴포넌트**

`src/components/onboarding/wizard.tsx` — 6단계. 각 단계는 이미 채워진 값을
보여주고 고객이 고치게 한다.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { generateDraft, saveBrand, type GeneratedDraft } from '@/app/(app)/onboarding/actions'
import { CardRegister } from '@/components/billing/card-register'

type Step = 'brand' | 'aliases' | 'queries' | 'competitors' | 'payment'

const STEP_LABEL: Record<Step, string> = {
  brand: '브랜드',
  aliases: '별칭 확인',
  queries: '추적 질문',
  competitors: '경쟁사',
  payment: '결제',
}

export function OnboardingWizard({
  customerKey,
  userEmail,
  userName,
  plan,
  queryPacks,
  auditId,
}: {
  customerKey: string
  userEmail: string
  userName: string
  plan: 'starter' | 'business'
  queryPacks: number
  auditId?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('brand')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [brandName, setBrandName] = useState('')
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState<GeneratedDraft | null>(null)
  const [enabledQueries, setEnabledQueries] = useState<Set<string>>(new Set())
  const [enabledCompetitors, setEnabledCompetitors] = useState<Set<string>>(new Set())

  async function onGenerate() {
    setPending(true)
    setError(null)
    try {
      const d = await generateDraft({ brandName, category, auditId, plan, queryPacks })
      setDraft(d)
      setEnabledQueries(new Set(d.queries))
      setEnabledCompetitors(new Set(d.competitors))
      setStep('aliases')
    } catch {
      setError('자동 생성에 실패했습니다. 직접 입력하실 수 있습니다.')
      setDraft({ aliases: [], ambiguous: true, queries: [], competitors: [] })
      setStep('aliases')
    } finally {
      setPending(false)
    }
  }

  async function onSave() {
    if (!draft) return
    setPending(true)
    setError(null)
    const result = await saveBrand({
      brandName,
      category,
      aliases: draft.aliases,
      ambiguous: draft.ambiguous,
      queries: [...enabledQueries],
      competitors: [...enabledCompetitors],
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error ?? '저장에 실패했습니다.')
      return
    }
    setStep('payment')
  }

  return (
    <div className="mx-auto max-w-xl space-y-8 py-10">
      <ol className="flex gap-2 text-xs">
        {(Object.keys(STEP_LABEL) as Step[]).map((s) => (
          <li
            key={s}
            className={
              s === step
                ? 'rounded-full bg-foreground px-3 py-1 font-medium text-background'
                : 'rounded-full bg-muted px-3 py-1 text-muted-foreground'
            }
          >
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {step === 'brand' && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">추적할 브랜드를 알려주세요</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              나머지는 저희가 만들어 드립니다. 확인하고 고치기만 하면 됩니다.
            </p>
          </div>
          <Input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="브랜드명"
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="업종 (예: 패션, 스포츠)"
          />
          <Button onClick={onGenerate} disabled={pending || !brandName || !category} className="w-full">
            {pending ? '만드는 중…' : '다음'}
          </Button>
        </Card>
      )}

      {step === 'aliases' && draft && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">
              {brandName}, {draft.aliases.join(', ') || '(별칭 없음)'} 맞나요?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              사람들이 이 브랜드를 부르는 다른 이름입니다. 빠진 게 있으면 추가해 주세요.
            </p>
          </div>
          <AliasEditor
            aliases={draft.aliases}
            onChange={(aliases) => setDraft({ ...draft, aliases })}
          />
          {draft.ambiguous ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              이 이름은 일반 단어와 겹칠 수 있어, 언급 여부를 더 꼼꼼히 확인합니다.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('brand')} className="flex-1">
              이전
            </Button>
            <Button onClick={() => setStep('queries')} className="flex-1">
              다음
            </Button>
          </div>
        </Card>
      )}

      {step === 'queries' && draft && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">이 질문들을 매주 물어볼게요</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              필요 없는 건 체크를 해제하세요. 선택 {enabledQueries.size}개
            </p>
          </div>
          <ul className="space-y-2">
            {draft.queries.map((q) => (
              <li key={q} className="flex items-start gap-3">
                <Checkbox
                  id={`q-${q}`}
                  checked={enabledQueries.has(q)}
                  onCheckedChange={(v) => {
                    const next = new Set(enabledQueries)
                    if (v) next.add(q)
                    else next.delete(q)
                    setEnabledQueries(next)
                  }}
                />
                <label htmlFor={`q-${q}`} className="text-sm leading-6">
                  {q}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('aliases')} className="flex-1">
              이전
            </Button>
            <Button
              onClick={() => setStep('competitors')}
              disabled={enabledQueries.size === 0}
              className="flex-1"
            >
              다음
            </Button>
          </div>
        </Card>
      )}

      {step === 'competitors' && draft && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">비교할 경쟁사를 골라주세요</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              AI 답변에 자주 등장한 이름들입니다. 실제 경쟁사가 아니면 해제하세요.
            </p>
          </div>
          <ul className="space-y-2">
            {draft.competitors.map((c) => (
              <li key={c} className="flex items-center gap-3">
                <Checkbox
                  id={`c-${c}`}
                  checked={enabledCompetitors.has(c)}
                  onCheckedChange={(v) => {
                    const next = new Set(enabledCompetitors)
                    if (v) next.add(c)
                    else next.delete(c)
                    setEnabledCompetitors(next)
                  }}
                />
                <label htmlFor={`c-${c}`} className="text-sm">
                  {c}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('queries')} className="flex-1">
              이전
            </Button>
            <Button onClick={onSave} disabled={pending} className="flex-1">
              {pending ? '저장 중…' : '다음'}
            </Button>
          </div>
        </Card>
      )}

      {step === 'payment' && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-semibold">결제하면 바로 첫 측정이 시작됩니다</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              5~15분 뒤 완성된 대시보드를 보실 수 있습니다. 다음 주를 기다리지 않습니다.
            </p>
          </div>
          <CardRegister
            customerKey={customerKey}
            customerEmail={userEmail}
            customerName={userName}
            returnPath={`/billing/success?plan=${plan}&packs=${queryPacks}`}
          />
        </Card>
      )}
    </div>
  )
}

function AliasEditor({
  aliases,
  onChange,
}: {
  aliases: string[]
  onChange: (next: string[]) => void
}) {
  const [input, setInput] = useState('')
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {aliases.map((a) => (
          <li key={a} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
            {a}
            <button
              type="button"
              onClick={() => onChange(aliases.filter((x) => x !== a))}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`${a} 삭제`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="별칭 추가"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const v = input.trim()
            if (v && !aliases.includes(v)) onChange([...aliases, v])
            setInput('')
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 첫 수집 진행 화면**

`src/app/(app)/onboarding/first-run/page.tsx` — 무료 진단의 Realtime 컴포넌트를
재사용한다. 새로 만들 것이 거의 없다는 것이 설계 문서의 지적이다.

```tsx
import { redirect } from 'next/navigation'
import { FirstRunProgress } from '@/components/onboarding/first-run-progress'
import { requireUser } from '@/lib/session'

export default async function FirstRunPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; token?: string }>
}) {
  await requireUser()
  const sp = await searchParams
  if (!sp.run || !sp.token) redirect('/dashboard')
  return <FirstRunProgress runId={sp.run} accessToken={sp.token} />
}
```

`src/components/onboarding/first-run-progress.tsx`:

```tsx
'use client'

import { useRealtimeRun } from '@trigger.dev/react-hooks'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function FirstRunProgress({
  runId,
  accessToken,
}: {
  runId: string
  accessToken: string
}) {
  const router = useRouter()
  const { run } = useRealtimeRun(runId, { accessToken })
  const progress = run?.metadata?.progress as
    | { total: number; done: number }
    | undefined

  useEffect(() => {
    if (run?.status === 'COMPLETED') router.replace('/dashboard?first=1')
  }, [run?.status, router])

  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0

  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">첫 측정을 진행하고 있습니다</h1>
      <p className="mt-2 text-muted-foreground">
        {progress ? `${progress.done} / ${progress.total}` : '준비 중…'}
      </p>
      <div className="mt-8 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        5~15분 정도 걸립니다. 이 창을 닫으셔도 측정은 계속되며,
        완료되면 메일로 알려드립니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: 온보딩 페이지**

`src/app/(app)/onboarding/page.tsx`:

```tsx
import { OnboardingWizard } from '@/components/onboarding/wizard'
import { ensureSubscription, getSubscriptionByUser } from '@/lib/billing/repository'
import { requireUser } from '@/lib/session'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; packs?: string; audit?: string }>
}) {
  const user = await requireUser()
  const sp = await searchParams

  await ensureSubscription(user.id)
  const sub = await getSubscriptionByUser(user.id)

  return (
    <OnboardingWizard
      customerKey={sub!.customerKey!}
      userEmail={user.email}
      userName={user.name}
      plan={sp.plan === 'business' ? 'business' : 'starter'}
      queryPacks={Number(sp.packs ?? 0) || 0}
      auditId={sp.audit}
    />
  )
}
```

- [ ] **Step 5: Business 브랜드 추가 플로우**

설계 ④: "Business는 브랜드를 3개까지 등록하므로 온보딩이 브랜드 단위로
반복되고, 질의 한도를 브랜드별로 배분하는 화면이 하나 더 붙는다."

**마법사를 다시 쓰지 않는다.** 이미 결제한 고객이 브랜드를 추가할 때는
결제 단계를 건너뛰고 저장 후 바로 첫 수집을 트리거한다.

`src/app/(app)/onboarding/page.tsx`를 수정해 이미 활성 구독이 있으면
`skipPayment`를 넘긴다:

```tsx
  const hasActiveSubscription = sub?.status === 'active' || sub?.status === 'past_due'

  return (
    <OnboardingWizard
      customerKey={sub!.customerKey!}
      userEmail={user.email}
      userName={user.name}
      plan={sp.plan === 'business' ? 'business' : 'starter'}
      queryPacks={Number(sp.packs ?? 0) || 0}
      auditId={sp.audit}
      skipPayment={hasActiveSubscription}
    />
  )
```

`OnboardingWizard`의 `onSave` 마지막을 수정한다:

```tsx
    if (skipPayment && result.brandId) {
      // 이미 결제한 고객 — 바로 첫 수집을 돌린다.
      const res = await fetch('/api/brands/collect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: result.brandId }),
      })
      const data = (await res.json()) as { runId?: string; publicAccessToken?: string }
      router.push(
        data.runId && data.publicAccessToken
          ? `/onboarding/first-run?run=${data.runId}&token=${data.publicAccessToken}`
          : '/dashboard',
      )
      return
    }
    setStep('payment')
```

`src/app/api/brands/collect/route.ts` — 소유권과 플랜을 확인하고
`collectBrand`를 트리거한다. `saveBrand`가 이미 브랜드 한도와 질의 쿼터 합을
검증했으므로 여기서는 소유권과 구독 상태만 본다.

```ts
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSubscriptionByUser } from '@/lib/billing/repository'
import { db } from '@/lib/db'
import { brands } from '@/lib/db/schema'
import { getSession } from '@/lib/session'
import { collectBrand } from '@/trigger/collect-brand'

const schema = z.object({ brandId: z.string().min(1) })

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '입력이 올바르지 않습니다.' }, { status: 400 })

  const brand = await db.query.brands.findFirst({
    where: and(eq(brands.id, parsed.data.brandId), eq(brands.userId, session.user.id)),
  })
  if (!brand) return NextResponse.json({ error: '브랜드를 찾을 수 없습니다.' }, { status: 404 })

  const sub = await getSubscriptionByUser(session.user.id)
  if (sub?.status !== 'active' && sub?.status !== 'past_due') {
    return NextResponse.json({ error: '활성 구독이 필요합니다.' }, { status: 402 })
  }

  const handle = await collectBrand.trigger({ brandId: brand.id, trigger: 'signup' })
  return NextResponse.json({ runId: handle.id, publicAccessToken: handle.publicAccessToken })
}
```

> **질의 한도 배분 화면**은 5단계 설정(`QuotaAllocator`)에 있다. 브랜드를
> 추가할 때 `saveBrand`가 기존 브랜드들의 쿼터 합을 이미 검증하므로,
> 한도를 넘으면 저장 단계에서 막힌다. 고객은 설정에서 배분을 조정한 뒤
> 다시 시도한다.

- [ ] **Step 6: 전체 온보딩 수동 검증**

```bash
pnpm dev
```

1. 가입 → `/onboarding?plan=starter`
2. 브랜드명·업종 입력 → **자동 생성이 실제로 도는지** (별칭·질의가 채워지는가)
3. 질의 체크박스로 끄고 켜기
4. 경쟁사 선택
5. 저장 → 결제 화면 → 테스트 카드로 결제
6. `/onboarding/first-run`으로 이동하고 진행률이 올라가는가
7. 완료 후 `/dashboard?first=1`로 이동하는가

Expected: 7단계 모두 통과. 자동 생성이 실패해도 4번까지 진행되어야 한다
(Task 6의 폴백이 작동하는지 확인 — `ANTHROPIC_API_KEY`를 임시로 비워 테스트).

- [ ] **Step 7: 한도 초과 검증**

1. Starter 계정으로 브랜드를 하나 더 만들어본다
   → "현재 플랜은 브랜드 1개까지 지원합니다" 에러가 **서버에서** 나온다.
   클라이언트를 우회해 서버 액션을 직접 호출해도 막혀야 한다.
2. Business 계정으로 브랜드 2개를 각각 20질의로 만들어본다
   → 두 번째에서 "합(40)이 한도(30)를 넘습니다" 에러가 나온다.
   **이것이 원가 방어선이다** — 막히지 않으면 브랜드 수만큼 원가가 곱해진다.
3. Business 계정으로 브랜드 4개째를 만들어본다 → 거부된다

Expected: 3개 모두 서버에서 거부

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(onboarding): 생성 후 확인 구조의 6단계 마법사 · 첫 수집 진행 화면

고객은 빈칸을 채우는 게 아니라 이미 채워진 걸 고친다."
```

---

### Task 8: 결제 관리 화면과 플랜 변경

**Files:**
- Create: `src/app/(app)/billing/page.tsx`,
  `src/app/api/billing/change-plan/route.ts`,
  `src/app/api/billing/cancel/route.ts`,
  `src/components/billing/plan-switcher.tsx`

**Interfaces:**
- Consumes: Task 1~3, Task 2(한도)
- Produces:
  - `POST /api/billing/change-plan` — 플랜·질의팩 변경 (다음 주기부터 적용)
  - `POST /api/billing/cancel` — 해지 (기간 만료까지 유지)

**설계 문서: 질의 팩은 종량제가 아니라 정액 애드온이다.** 사용량 집계·정산·변동
청구를 만들지 않는다. 구독 금액만 바꿔 청구하므로 빌링키 구조를 그대로 쓴다.

- [ ] **Step 1: 플랜 변경 API**

`src/app/api/billing/change-plan/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq, sum } from 'drizzle-orm'
import { z } from 'zod'
import { changePlan, getSubscriptionByUser } from '@/lib/billing/repository'
import { db } from '@/lib/db'
import { brands } from '@/lib/db/schema'
import { logger } from '@/lib/logger'
import { PLANS } from '@/lib/plans'
import { validateQuotaAllocation } from '@/lib/quota'
import { getSession } from '@/lib/session'

const schema = z.object({
  plan: z.enum(['starter', 'business']),
  queryPacks: z.number().int().min(0).max(20),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: '입력이 올바르지 않습니다.' }, { status: 400 })

  const sub = await getSubscriptionByUser(session.user.id)
  if (!sub) return NextResponse.json({ error: '구독이 없습니다.' }, { status: 404 })

  const userBrands = await db
    .select({ id: brands.id, quota: brands.queryQuota })
    .from(brands)
    .where(eq(brands.userId, session.user.id))

  // 다운그레이드 시 기존 설정이 새 한도를 넘지 않는지 확인한다.
  if (userBrands.length > PLANS[parsed.data.plan].maxBrands) {
    return NextResponse.json(
      {
        error: `현재 브랜드 ${userBrands.length}개가 등록되어 있어 이 플랜으로 변경할 수 없습니다. 브랜드를 먼저 정리해 주세요.`,
      },
      { status: 409 },
    )
  }

  const alloc = validateQuotaAllocation(
    userBrands.map((b) => b.quota),
    parsed.data.plan,
    parsed.data.queryPacks,
  )
  if (!alloc.allowed) {
    return NextResponse.json({ error: alloc.message }, { status: 409 })
  }

  await changePlan({
    subscriptionId: sub.id,
    plan: parsed.data.plan,
    queryPacks: parsed.data.queryPacks,
  })

  logger.info('billing.plan_changed', {
    subscriptionId: sub.id,
    from: sub.plan,
    to: parsed.data.plan,
    queryPacks: parsed.data.queryPacks,
  })

  // 정액 애드온이므로 즉시 정산하지 않는다. 다음 청구일에 새 금액이 적용된다.
  return NextResponse.json({ ok: true, effectiveFrom: sub.currentPeriodEnd })
}
```

`src/app/api/billing/cancel/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscriptions } from '@/lib/db/schema'
import { getSubscriptionByUser } from '@/lib/billing/repository'
import { logger } from '@/lib/logger'
import { getSession } from '@/lib/session'

export async function POST() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const sub = await getSubscriptionByUser(session.user.id)
  if (!sub) return NextResponse.json({ error: '구독이 없습니다.' }, { status: 404 })

  // 약관 제4조: 해지 시 이미 결제된 기간의 잔여일까지 서비스가 유지된다.
  // 그래서 status는 바꾸지 않고 canceledAt만 찍는다. billing-cycle이
  // currentPeriodEnd 도달 시 canceled로 바꾼다.
  await db
    .update(subscriptions)
    .set({ canceledAt: new Date(), billingKey: null, updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id))

  logger.info('billing.canceled', { subscriptionId: sub.id })

  return NextResponse.json({ ok: true, serviceUntil: sub.currentPeriodEnd })
}
```

> **`billingKey`를 null로 만드는 것이 해지 처리의 핵심이다.** `dueForBilling`이
> 빌링키 없는 구독을 청구하지 않으므로, 다음 청구일에 자동으로 청구가 멈춘다.
> 별도 상태 전이 코드가 필요 없다.

- [ ] **Step 2: 결제 관리 화면**

`src/app/(app)/billing/page.tsx`:

```tsx
import { CardRegister } from '@/components/billing/card-register'
import { PlanSwitcher } from '@/components/billing/plan-switcher'
import { Card } from '@/components/ui/card'
import {
  ensureSubscription,
  getSubscriptionByUser,
  listPayments,
} from '@/lib/billing/repository'
import { monthlyPriceKrw, PLANS } from '@/lib/plans'
import { requireUser } from '@/lib/session'

export const metadata = { title: '결제' }

function formatDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
  }).format(d)
}

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  active: { text: '이용 중', tone: 'bg-emerald-50 text-emerald-700' },
  past_due: { text: '결제 실패 — 유예 기간', tone: 'bg-amber-50 text-amber-800' },
  suspended: { text: '측정 중단됨', tone: 'bg-red-50 text-red-700' },
  canceled: { text: '해지됨', tone: 'bg-muted text-muted-foreground' },
}

export default async function BillingPage() {
  const user = await requireUser()
  await ensureSubscription(user.id)
  const sub = (await getSubscriptionByUser(user.id))!
  const history = await listPayments(sub.id)

  const status = STATUS_LABEL[sub.status] ?? STATUS_LABEL.canceled!
  const amount = monthlyPriceKrw(sub.plan, sub.queryPacks)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">결제</h1>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">
                {sub.plan === 'business' ? 'Business' : 'Starter'}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                {status.text}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              월 {amount.toLocaleString('ko-KR')}원
              {sub.queryPacks > 0 ? ` (질의 팩 ${sub.queryPacks}개 포함)` : ''}
            </p>
          </div>
          <dl className="text-right text-sm">
            <dt className="text-muted-foreground">다음 결제일</dt>
            <dd className="font-medium">{formatDate(sub.currentPeriodEnd)}</dd>
          </dl>
        </div>

        {sub.status === 'past_due' && sub.graceUntil ? (
          <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
            결제가 처리되지 않았습니다. {formatDate(sub.graceUntil)}까지 결제수단을
            업데이트해 주세요. 그때까지 측정은 계속되며, 지금까지의 데이터는 그대로
            유지됩니다.
          </p>
        ) : null}

        {sub.canceledAt ? (
          <p className="mt-4 rounded-md bg-muted px-4 py-3 text-sm">
            해지가 예약되었습니다. {formatDate(sub.currentPeriodEnd)}까지 이용하실 수 있습니다.
          </p>
        ) : null}

        <div className="mt-6">
          <CardRegister
            customerKey={sub.customerKey!}
            customerEmail={user.email}
            customerName={user.name}
            returnPath={`/billing/success?plan=${sub.plan}&packs=${sub.queryPacks}`}
          />
        </div>
      </Card>

      <PlanSwitcher
        currentPlan={sub.plan}
        currentPacks={sub.queryPacks}
        canceled={Boolean(sub.canceledAt)}
      />

      <Card className="p-6">
        <h2 className="font-semibold">결제 내역</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">아직 결제 내역이 없습니다.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">일자</th>
                <th className="pb-2 font-medium">금액</th>
                <th className="pb-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2">{formatDate(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-2 tabular-nums">{p.amountKrw.toLocaleString('ko-KR')}원</td>
                  <td className="py-2">
                    {p.status === 'paid' ? '완료' : p.status === 'failed' ? '실패' : '취소'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
```

`src/components/billing/plan-switcher.tsx` — 플랜과 질의 팩을 고르고
`/api/billing/change-plan`을 호출한다. 해지 버튼은 확인 다이얼로그를 거친다.
`PLANS`와 `QUERY_PACK_PRICE_KRW`로 금액을 계산해 보여준다.

- [ ] **Step 3: 수동 검증**

1. `/billing`에서 현재 플랜·다음 결제일·결제 내역이 보이는가
2. Starter → Business 변경 → `subscriptions.plan`이 바뀌는가
3. 질의 팩 +1 → 금액이 380,000원으로 표시되는가
4. 해지 → `canceledAt`이 찍히고 `billingKey`가 null이 되는가
5. 해지 후 `billing-cycle` 실행 → 청구가 일어나지 않는가

Expected: 5개 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat(billing): 결제 관리 화면 · 플랜/질의팩 변경 · 해지

질의 팩은 정액 애드온이므로 구독 금액만 바꾼다. 종량제 정산을 만들지 않는다."
```

---

### Task 9: 결제 E2E와 2차 배포

**Files:**
- Create: `tests/e2e/checkout.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/superpowers/notes/2026-07-28-launch-2.md`

**Interfaces:**
- Consumes: 이 단계 전부
- Produces: **2차 배포 완료** — 매출이 시작된다

- [ ] **Step 1: E2E 작성**

`tests/e2e/checkout.spec.ts` — 실제 결제창은 외부 도메인이라 자동화가 어렵다.
**결제 이전까지의 온보딩 흐름과, 결제 이후의 상태 전이를 API로 검증한다.**

```ts
import { expect, test } from '@playwright/test'

const password = 'e2e-password-1234'

test.describe('가입 → 온보딩 → 결제 진입', () => {
  test('온보딩 마법사가 자동 생성 후 결제 단계까지 간다', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`

    // 가입 (E2E 환경에서는 이메일 인증을 우회하도록 설정하거나,
    // 사전에 만들어둔 테스트 계정을 쓴다)
    await page.goto('/sign-up')
    await page.getByPlaceholder('이름').fill('E2E')
    await page.getByPlaceholder('이메일').fill(email)
    await page.getByPlaceholder(/비밀번호/).fill(password)
    await page.getByRole('button', { name: '가입하기' }).click()
    await expect(page).toHaveURL(/verify-email/)
  })

  test('로그인 상태에서 온보딩이 브랜드 → 별칭 → 질문 → 경쟁사 → 결제 순으로 진행된다', async ({
    page,
  }) => {
    // 사전에 준비된 인증 완료 계정으로 로그인
    test.skip(!process.env.E2E_USER_EMAIL, 'E2E_USER_EMAIL이 없으면 건너뜁니다')

    await page.goto('/sign-in')
    await page.getByPlaceholder('이메일').fill(process.env.E2E_USER_EMAIL!)
    await page.getByPlaceholder(/비밀번호/).fill(process.env.E2E_USER_PASSWORD!)
    await page.getByRole('button').click()
    await expect(page).toHaveURL(/dashboard/)

    await page.goto('/onboarding?plan=starter')
    await page.getByPlaceholder('브랜드명').fill(`E2E브랜드${Date.now()}`)
    await page.getByPlaceholder(/업종/).fill('패션')
    await page.getByRole('button', { name: '다음' }).click()

    // 별칭 단계 — 자동 생성이 끝나야 도달한다
    await expect(page.getByText(/맞나요\?/)).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '다음' }).click()

    // 질문 단계
    await expect(page.getByText('이 질문들을 매주 물어볼게요')).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()

    // 경쟁사 단계
    await expect(page.getByText('비교할 경쟁사를 골라주세요')).toBeVisible()
    await page.getByRole('button', { name: '다음' }).click()

    // 결제 단계
    await expect(page.getByText(/결제하면 바로 첫 측정이 시작됩니다/)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: /카드 등록/ })).toBeVisible()
  })

  test('플랜 한도가 서버에서 강제된다', async ({ request }) => {
    test.skip(!process.env.E2E_SESSION_COOKIE, 'E2E_SESSION_COOKIE가 없으면 건너뜁니다')

    // Starter 계정으로 Business 전용 한도를 요청 → 거부되어야 한다
    const res = await request.post('/api/billing/change-plan', {
      headers: { cookie: process.env.E2E_SESSION_COOKIE! },
      data: { plan: 'starter', queryPacks: 0 },
    })
    expect([200, 409]).toContain(res.status())
  })
})
```

- [ ] **Step 2: 로컬 E2E 실행**

```bash
pnpm test:e2e
```

Expected: 통과 또는 skip. 실패하면 선택자를 실제 화면과 대조한다.

- [ ] **Step 3: 프로덕션 키 전환**

토스 개발자센터에서 **라이브 키**를 받아 Vercel 환경변수에 등록한다
(`live_ck_...` / `live_sk_...`). 테스트 키가 프로덕션에 남아 있으면 결제가
실제로 되지 않는다.

Vercel에 추가할 환경변수: `TOSS_SECRET_KEY`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`,
`SERPAPI_API_KEY`.

- [ ] **Step 4: SerpApi 최종 확인**

**설계 문서: "유료 플랜을 여는 시점에 미리 가입한다. 고객이 0명이어도."**
고객이 새벽에 결제하면 그 순간 첫 수집이 돌아야 하는데, SerpApi가 없으면
네이버와 Google AIO가 통째로 실패해 첫인상이 "엔진 2개 수집 실패" 배지가 된다.

```bash
KEY=$(vercel env pull --environment=production /tmp/prod.env && grep SERPAPI /tmp/prod.env | cut -d= -f2)
curl -s "https://serpapi.com/account?api_key=$KEY" | tee /dev/stderr | grep -q 'plan_searches_left'
```

Expected: 잔여 건수가 보인다. SerpApi 대시보드에서
**Automatic Early Renewal이 켜져 있는지** 눈으로 확인한다.

- [ ] **Step 5: 배포**

```bash
pnpm dlx trigger.dev@latest deploy
pnpm dlx vercel@latest --prod
```

- [ ] **Step 6: 프로덕션 실결제 검증 (본인 카드)**

**실제 카드로 한 번 결제하고 환불한다.** 테스트 키에서 동작한 것이 라이브 키에서
동작한다는 보장은 없다.

1. 프로덕션에서 새 계정으로 가입 → 온보딩 → 실제 결제 (Starter 99,000원)
2. `/onboarding/first-run`에서 진행률이 올라가는가
3. 5~15분 뒤 완료되고 `/dashboard`로 이동하는가
4. Trigger.dev에서 `collect-brand`가 네이버·Google AIO를 포함해 4엔진으로 돌았는가
5. `completeness`에 4개 엔진이 모두 있고 성공률이 90% 이상인가
6. 토스 대시보드에서 결제가 보이는가
7. **환불 처리** (토스 대시보드에서 직접)

Expected: 7단계 모두 통과. 4~5번이 실패하면 SerpApi 키를 다시 확인한다.

- [ ] **Step 7: 2차 배포 기록**

`docs/superpowers/notes/2026-07-28-launch-2.md`:

```markdown
# 2차 배포 (유료 플랜) — 2026-__-__

## 배포 내용
- 토스 빌링키 정기결제 · 온보딩 마법사 · 결제 즉시 첫 수집
- SerpApi Starter 가입 완료, Automatic Early Renewal 켬

## 실결제 검증
- [ ] Starter 99,000원 실결제 성공 (환불 완료)
- [ ] 결제 즉시 첫 수집 트리거됨, 소요 __분
- [ ] 4개 엔진 모두 수집 성공, completeness __%
- [ ] 이중 청구 없음 (새로고침 테스트)
- [ ] 정기결제 잡 멱등성 확인

## 확정된 비용
| 항목 | 금액 |
| --- | --- |
| Vercel Pro | 28,000원 |
| 도메인 | 1,700원 |
| 통신판매업 등록면허세 | 3,400원 |
| SerpApi Starter | 35,000원 |
| Trigger.dev | __원 |
| **고정비 합계** | **__원** |

**토스페이먼츠 수수료율: __%** (설계 문서 가정: 3%)

## 손익분기 재계산
- 고객 1명당 원가: Starter __원 / Business __원
- 무료 진단 월 900건 시 변동비: __원
- **손익분기: Starter __명**

(설계 문서 추정: Starter 2명. 실측과 비교해 차이가 크면 요금제 재검토)

## 다음에 볼 지표
- 온보딩 이탈 지점 (어느 단계에서 나가는가)
- 결제 실패율
- 첫 수집 소요 시간 분포
```

- [ ] **Step 8: 커밋과 태그**

```bash
git add -A
git commit -m "feat: 결제 E2E와 2차 배포

2차 배포 완료: 고객이 결제하면 즉시 첫 수집이 돌고 대시보드가 채워진다."
git tag phase-4-complete
```

---

## 4단계 완료 조건 (= 2차 배포 게이트)

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] `src/lib/business-info.test.ts`의 `describe.skip`이 풀렸고 통과한다
- [ ] 프로덕션에서 **실제 카드로 결제가 성공**했다 (검증 후 환불)
- [ ] 결제 성공 즉시 첫 수집이 트리거되고 5~15분 안에 완료된다
- [ ] 4개 엔진(네이버 포함)이 모두 수집에 성공한다
- [ ] 같은 `orderId`로 두 번 청구되지 않는다 (새로고침 검증)
- [ ] 결제 실패 시 `past_due` → 유예 7일 → `suspended` 전이가 동작한다
- [ ] 해지 시 `billingKey`가 null이 되어 다음 청구가 멈춘다
- [ ] 브랜드·질의·경쟁사 한도가 **서버에서** 강제된다
- [ ] Business에서 브랜드 3개의 질의 쿼터 합이 한도를 넘으면 저장이 거부된다
      (원가가 브랜드 수만큼 곱해지지 않는다)
- [ ] 이미 결제한 고객이 브랜드를 추가하면 결제 단계를 건너뛰고 바로 수집이 돈다
- [ ] SerpApi Automatic Early Renewal이 켜져 있다
- [ ] `docs/superpowers/notes/2026-07-28-launch-2.md`에 실제 수수료율과 손익분기가 기록됨

## 다음 단계

[5단계 — 대시보드와 리포트](2026-07-28-cited-phase-5-dashboard-and-reports.md)
