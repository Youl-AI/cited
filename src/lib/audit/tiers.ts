/**
 * 진단(1회성 상품) 티어. **구독 플랜(`plans.ts`의 PLANS)과 섞지 않는다** —
 * 진단은 크몽에서 파는 단건 상품이고, 플랜은 월 구독이다. 여기 숫자를
 * PLANS에 넣으면 요금제 화면과 한도 검증이 진단 티어를 구독으로 오해한다.
 *
 * 가격은 크몽 등록 화면에 있다(스펙 참고: 49,000 / 99,000 / 189,000).
 * 코드에는 넣지 않는다 — 결제가 크몽에서 일어나므로 코드가 참조할 곳이 없고,
 * 여기 적으면 크몽에서 가격을 바꿀 때마다 배포해야 한다.
 */
export const AUDIT_TIERS = {
  free: { queryCount: 3, samplesPerEngine: 1, label: '무료 진단' },
  standard: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단' },
  deluxe: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 개선 가이드' },
  premium: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 전후 비교' },
} as const

export type AuditTier = keyof typeof AUDIT_TIERS

export const AUDIT_TIER_IDS = Object.keys(AUDIT_TIERS) as AuditTier[]
export const PAID_TIERS = AUDIT_TIER_IDS.filter((t) => t !== 'free')

export function isPaidTier(tier: AuditTier): boolean {
  return tier !== 'free'
}
