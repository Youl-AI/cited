/**
 * 진단(1회성 상품) 티어. **구독 플랜(`plans.ts`의 PLANS)과 섞지 않는다** —
 * 진단은 크몽에서 파는 단건 상품이고, 플랜은 월 구독이다. 여기 숫자를
 * PLANS에 넣으면 요금제 화면과 한도 검증이 진단 티어를 구독으로 오해한다.
 *
 * 가격은 크몽 등록 화면에 있다(스펙 참고: 49,000 / 99,000 / 189,000).
 * 코드에는 넣지 않는다 — 결제가 크몽에서 일어나므로 코드가 참조할 곳이 없고,
 * 여기 적으면 크몽에서 가격을 바꿀 때마다 배포해야 한다.
 */
import type { EngineId } from '@/lib/plans'

export const AUDIT_TIERS = {
  free: { queryCount: 3, samplesPerEngine: 1, label: '무료 진단' },
  standard: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단' },
  deluxe: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 개선 가이드' },
  premium: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 전후 비교' },
} as const

/**
 * 진단(무료·유료 공통)이 실제로 부르는 엔진.
 *
 * ★ `PLANS.free.engines`를 상속하지 않고 여기 못박는다 — 크몽 상품 설명이
 *   "ChatGPT · Gemini" 두 엔진을 **이름으로** 약속하므로, 구독 플랜 쪽에서
 *   엔진을 추가하면 이미 팔린 상품의 내용과 원가(+엔진당 50%)가 조용히 바뀐다.
 *   무료 진단도 같은 집합을 쓴다 — 무료 샘플과 유료의 연속성이 상품의 일부다.
 */
export const AUDIT_ENGINES: readonly EngineId[] = ['chatgpt', 'gemini']

export type AuditTier = keyof typeof AUDIT_TIERS

export const AUDIT_TIER_IDS = Object.keys(AUDIT_TIERS) as readonly AuditTier[]
export const PAID_TIERS: readonly AuditTier[] = AUDIT_TIER_IDS.filter((t) => t !== 'free')

export function isPaidTier(tier: AuditTier): boolean {
  return tier !== 'free'
}
