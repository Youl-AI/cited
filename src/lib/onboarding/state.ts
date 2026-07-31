import type { Subscription } from '@/lib/db/schema'

/**
 * 온보딩 게이트 판정 — 순수 모듈.
 *
 * 스펙 ②: **활성 구독(plan:grant)이 있고 브랜드가 없는 계정만** 온보딩으로
 * 보낸다. 플랜 없는 가입 계정은 지금처럼 빈 대시보드 + 무료 진단 안내를 본다 —
 * 질의 에디터의 AI 생성은 돈이 드는 기능이라(회당 ~3원 + 남용 리스크)
 * 유료 게이트가 필수다.
 */
export type OnboardingState = 'no-plan' | 'needs-onboarding' | 'needs-queries' | 'complete'

/** past_due도 활성이다 — 유예 기간 중 수집은 계속한다 (schema.ts SUBSCRIPTION_STATUSES 주석) */
export function isActiveSubscription(
  subscription: Pick<Subscription, 'status'> | null,
): boolean {
  return subscription?.status === 'active' || subscription?.status === 'past_due'
}

export function resolveOnboardingState(args: {
  subscription: Pick<Subscription, 'status'> | null
  brandCount: number
  /**
   * 질의를 아직 동결하지 않은(`queriesFrozenAt IS NULL`) 활성 브랜드의 id.
   * 없으면 null.
   *
   * ★ 이 필드가 없으면 "브랜드는 만들었는데 질의는 확정 안 한" 계정이
   *   `complete`로 판정된다. 그러면 `/onboarding`은 브랜드 한도 때문에
   *   `/dashboard`로 튕기고, 대시보드에는 이어서 할 링크가 없다 — 탭을 닫은
   *   고객이 **돈은 내고 측정은 영원히 안 되는** 상태에 갇힌다(수집 cron은
   *   `queriesFrozenAt IS NOT NULL`만 고른다). 실제로 계획에 뚫려 있던 구멍이다.
   *
   * ★ 선택 필드로 두지 않는다. 기본값 null을 주면 호출자가 빼먹었을 때 그
   *   구멍이 조용히 되살아난다 — `RunStartArgs.queriesOnOtherBrands`와 같은 이유다.
   */
  unfrozenBrandId: string | null
}): OnboardingState {
  if (!isActiveSubscription(args.subscription)) return 'no-plan'
  if (args.brandCount === 0) return 'needs-onboarding'
  return args.unfrozenBrandId ? 'needs-queries' : 'complete'
}
