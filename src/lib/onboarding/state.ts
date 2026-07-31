import type { Subscription } from '@/lib/db/schema'

/**
 * 온보딩 게이트 판정 — 순수 모듈.
 *
 * 스펙 ②: **활성 구독(plan:grant)이 있고 브랜드가 없는 계정만** 온보딩으로
 * 보낸다. 플랜 없는 가입 계정은 지금처럼 빈 대시보드 + 무료 진단 안내를 본다 —
 * 질의 에디터의 AI 생성은 돈이 드는 기능이라(회당 ~3원 + 남용 리스크)
 * 유료 게이트가 필수다.
 */
export type OnboardingState = 'no-plan' | 'needs-onboarding' | 'complete'

/** past_due도 활성이다 — 유예 기간 중 수집은 계속한다 (schema.ts SUBSCRIPTION_STATUSES 주석) */
export function isActiveSubscription(
  subscription: Pick<Subscription, 'status'> | null,
): boolean {
  return subscription?.status === 'active' || subscription?.status === 'past_due'
}

export function resolveOnboardingState(args: {
  subscription: Pick<Subscription, 'status'> | null
  brandCount: number
}): OnboardingState {
  if (!isActiveSubscription(args.subscription)) return 'no-plan'
  return args.brandCount === 0 ? 'needs-onboarding' : 'complete'
}
