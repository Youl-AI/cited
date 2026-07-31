import type { Subscription } from '@/lib/db/schema'
import { queriesStepPath } from './editor'

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

/** 대시보드 진입 판정. `redirect`면 그 주소로 튕기고, `render`면 화면을 그린다. */
export type DashboardEntry =
  | { kind: 'redirect'; to: string }
  | { kind: 'render'; pendingBrandId: string | null }

/**
 * `/dashboard`가 온보딩 때문에 튕겨야 하는지 판정한다 — 순수 함수.
 *
 * ★ **강제 리다이렉트는 "측정 중인 것이 하나도 없을 때"뿐이다.**
 *   원래는 미동결 브랜드가 하나라도 있으면 무조건 질의 단계로 보냈는데,
 *   그러면 Business 고객이 브랜드 1을 동결한 뒤 브랜드 2를 만드는 정상 동작만으로
 *   **이미 측정 중인 브랜드 1의 대시보드까지 잃는다.** 월 29만 원짜리 플랜에서
 *   "본 적 있는 화면이 사라졌다"는 해지 사유다.
 *
 *   막으려던 것은 그게 아니라 **"돈은 내는데 측정은 한 번도 안 되는"** 계정이었다
 *   (수집 cron은 `queriesFrozenAt IS NOT NULL`만 고른다). 그 상태는 동결된 브랜드가
 *   0개일 때만 성립하므로, 조건도 거기까지만 좁힌다. 나머지는 배너로 안내한다 —
 *   `pendingBrandId`를 같이 돌려주는 이유다.
 *
 * ★ `/onboarding`의 리다이렉트는 그대로 둔다. 거기서는 목적지가 대시보드라
 *   갇히는 문제가 생기지 않고, 오히려 "미동결 브랜드가 있으면 그것부터"가 맞다.
 */
export function resolveDashboardEntry(args: {
  state: OnboardingState
  pendingBrandId: string | null
  /** 질의를 확정한 활성 브랜드 수. 0이면 이 계정은 측정 가능한 것이 하나도 없다. */
  frozenBrandCount: number
}): DashboardEntry {
  if (args.state === 'needs-onboarding') return { kind: 'redirect', to: '/onboarding' }
  if (args.state === 'needs-queries' && args.pendingBrandId) {
    if (args.frozenBrandCount === 0) {
      return { kind: 'redirect', to: queriesStepPath(args.pendingBrandId) }
    }
    return { kind: 'render', pendingBrandId: args.pendingBrandId }
  }
  return { kind: 'render', pendingBrandId: null }
}
