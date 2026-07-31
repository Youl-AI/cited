import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import { resolveLimits, type PlanLimits } from '@/lib/plans'
import { requireUser } from '@/lib/session'
import { findSubscriptionByUserId } from '@/lib/subscriptions/repository'
import { resolveOnboardingState, type OnboardingState } from './state'

export interface OnboardingGate {
  user: { id: string; email: string; name: string }
  subscription: Subscription | null
  /** 활성 구독이 없으면 null */
  limits: PlanLimits | null
  brandCount: number
  /**
   * 질의를 아직 확정하지 않은 활성 브랜드 중 **가장 오래된** 것의 id. 없으면 null.
   * `/onboarding`·`/dashboard`가 이 값으로 질의 단계에 이어 붙인다
   * (state.ts `unfrozenBrandId` 주석 — 온보딩 중단 계정이 갇히는 것을 막는다).
   */
  pendingBrandId: string | null
  /**
   * 질의를 **확정한** 활성 브랜드 수. 0이면 이 계정에는 측정 가능한 것이 없다
   * (수집 cron은 `queriesFrozenAt IS NOT NULL`만 고른다).
   * `/dashboard`가 강제 리다이렉트 여부를 이 값으로 가른다
   * (state.ts `resolveDashboardEntry` 주석).
   */
  frozenBrandCount: number
  state: OnboardingState
}

/**
 * (app) 그룹 페이지·액션의 공통 진입점. 내부에서 `requireUser()`를 부르므로
 * 이 함수를 쓰는 페이지는 "모든 page.tsx가 자체 requireUser" 규칙을 만족한다
 * (`(app)/layout.tsx` 주석).
 *
 * ★ 구독 조회는 `subscriptions/repository.ts`를 그대로 쓴다. 같은 질의를 여기
 *   또 쓰면 `plan:grant`/`plan:revoke` CLI와 화면이 서로 다른 조건으로 같은
 *   행을 읽게 되고, 그 어긋남은 조용하다.
 */
export async function loadOnboardingGate(): Promise<OnboardingGate> {
  const user = await requireUser()
  const subscription = await findSubscriptionByUserId(user.id)
  // ★ 비활성 브랜드는 세지 않는다. 한도·게이트 모두 "지금 측정 중인 브랜드"
  //   기준이어야 한다 — 해지한 브랜드가 한도를 계속 먹으면 고객은 새 브랜드를
  //   등록할 방법이 없다.
  const [brandCountRow] = await db
    .select({ value: count() })
    .from(schema.brands)
    .where(and(eq(schema.brands.userId, user.id), eq(schema.brands.isActive, true)))
  const brandCount = brandCountRow?.value ?? 0
  // ★ 질의 미동결 브랜드를 같이 찾는다. 브랜드 등록만 하고 탭을 닫은 계정은
  //   "온보딩 완료"가 아니다 — cron이 `queriesFrozenAt IS NOT NULL`만 고르므로
  //   그대로 두면 요금은 나가고 측정은 영원히 안 된다 (state.ts 주석).
  //   가장 오래된 것을 고른다: 먼저 시작한 브랜드부터 끝내는 것이 자연스럽고,
  //   `createdAt` 정렬이라 매 요청 같은 브랜드로 간다(리다이렉트가 흔들리지 않는다).
  const [pendingBrand] = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, user.id),
        eq(schema.brands.isActive, true),
        isNull(schema.brands.queriesFrozenAt),
      ),
    )
    .orderBy(asc(schema.brands.createdAt))
    .limit(1)
  const pendingBrandId = pendingBrand?.id ?? null
  // ★ 동결된 브랜드 수도 같이 센다. 대시보드는 "미동결이 있는가"가 아니라
  //   **"측정 중인 것이 하나도 없는가"**로 튕겨야 한다 — 브랜드 1을 동결한 뒤
  //   브랜드 2를 만든 Business 고객이 브랜드 1의 대시보드까지 잃으면 안 된다
  //   (state.ts `resolveDashboardEntry` 주석). 조건이 정반대라 `brandCount`에서
  //   빼는 식으로 유도하지 않고 따로 센다.
  const [frozenCountRow] = await db
    .select({ value: count() })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, user.id),
        eq(schema.brands.isActive, true),
        isNotNull(schema.brands.queriesFrozenAt),
      ),
    )
  const frozenBrandCount = frozenCountRow?.value ?? 0
  const state = resolveOnboardingState({ subscription, brandCount, unfrozenBrandId: pendingBrandId })
  return {
    user: { id: user.id, email: user.email, name: user.name },
    subscription,
    limits:
      state !== 'no-plan' && subscription
        ? resolveLimits(subscription.plan, subscription.queryPacks)
        : null,
    brandCount,
    pendingBrandId,
    frozenBrandCount,
    state,
  }
}
