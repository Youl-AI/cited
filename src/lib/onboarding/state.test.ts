import { describe, expect, test } from 'vitest'
import { resolveOnboardingState } from './state'

describe('resolveOnboardingState', () => {
  test('구독 없음 → no-plan (빈 대시보드 + 무료 진단 안내 유지)', () => {
    expect(
      resolveOnboardingState({ subscription: null, brandCount: 0, unfrozenBrandId: null }),
    ).toBe('no-plan')
  })

  test('canceled/suspended → no-plan', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'canceled' },
        brandCount: 0,
        unfrozenBrandId: null,
      }),
    ).toBe('no-plan')
    expect(
      resolveOnboardingState({
        subscription: { status: 'suspended' },
        brandCount: 0,
        unfrozenBrandId: null,
      }),
    ).toBe('no-plan')
  })

  test('active + 브랜드 0개 → needs-onboarding', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'active' },
        brandCount: 0,
        unfrozenBrandId: null,
      }),
    ).toBe('needs-onboarding')
  })

  test('past_due도 활성으로 본다 — 유예 중 수집은 계속(schema 주석)', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'past_due' },
        brandCount: 1,
        unfrozenBrandId: null,
      }),
    ).toBe('complete')
  })

  test('브랜드는 있는데 질의 미동결 → needs-queries (온보딩 재개)', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'active' },
        brandCount: 1,
        unfrozenBrandId: 'brd_1',
      }),
    ).toBe('needs-queries')
  })

  test('플랜이 죽으면 미동결 브랜드가 있어도 no-plan이 이긴다 — 유료 게이트가 먼저다', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'canceled' },
        brandCount: 1,
        unfrozenBrandId: 'brd_1',
      }),
    ).toBe('no-plan')
  })

  test('Business: 브랜드 2개 중 하나가 미동결이면 그 브랜드로 이어서 간다', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'active' },
        brandCount: 2,
        unfrozenBrandId: 'brd_2',
      }),
    ).toBe('needs-queries')
  })

  test('전부 동결됐으면 complete — 대시보드가 목적지다', () => {
    expect(
      resolveOnboardingState({
        subscription: { status: 'active' },
        brandCount: 3,
        unfrozenBrandId: null,
      }),
    ).toBe('complete')
  })
})
