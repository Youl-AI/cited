import { and, count, eq } from 'drizzle-orm'
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
  const state = resolveOnboardingState({ subscription, brandCount })
  return {
    user: { id: user.id, email: user.email, name: user.name },
    subscription,
    limits:
      state !== 'no-plan' && subscription
        ? resolveLimits(subscription.plan, subscription.queryPacks)
        : null,
    brandCount,
    state,
  }
}
