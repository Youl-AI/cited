import { describe, expect, test } from 'vitest'
import { resolveOnboardingState } from './state'

describe('resolveOnboardingState', () => {
  test('구독 없음 → no-plan (빈 대시보드 + 무료 진단 안내 유지)', () => {
    expect(resolveOnboardingState({ subscription: null, brandCount: 0 })).toBe('no-plan')
  })

  test('canceled/suspended → no-plan', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'canceled' }, brandCount: 0 }),
    ).toBe('no-plan')
    expect(
      resolveOnboardingState({ subscription: { status: 'suspended' }, brandCount: 0 }),
    ).toBe('no-plan')
  })

  test('active + 브랜드 0개 → needs-onboarding', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'active' }, brandCount: 0 }),
    ).toBe('needs-onboarding')
  })

  test('past_due도 활성으로 본다 — 유예 중 수집은 계속(schema 주석)', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'past_due' }, brandCount: 1 }),
    ).toBe('complete')
  })
})
