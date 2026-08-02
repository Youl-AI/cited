import { describe, expect, test } from 'vitest'
import { resolveDashboardEntry, resolveOnboardingState } from './state'

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

describe('resolveDashboardEntry', () => {
  test('브랜드 0개 → 온보딩으로', () => {
    expect(
      resolveDashboardEntry({
        state: 'needs-onboarding',
        pendingBrandId: null,
        frozenBrandCount: 0,
      }),
    ).toEqual({ kind: 'redirect', to: '/onboarding' })
  })

  test('동결된 브랜드가 하나도 없으면 질의 단계로 강제 이동 — 측정이 영영 안 되는 계정', () => {
    expect(
      resolveDashboardEntry({
        state: 'needs-queries',
        pendingBrandId: 'brd_1',
        frozenBrandCount: 0,
      }),
    ).toEqual({ kind: 'redirect', to: '/onboarding/queries?brand=brd_1' })
  })

  test('동결 브랜드가 있으면 미동결이 남아 있어도 리다이렉트하지 않는다 (C-1)', () => {
    // Business 고객이 브랜드 1을 동결하고 브랜드 2를 만든 정상 상태다.
    // 여기서 튕기면 이미 측정 중인 브랜드 1의 대시보드까지 잠긴다.
    expect(
      resolveDashboardEntry({
        state: 'needs-queries',
        pendingBrandId: 'brd_2',
        frozenBrandCount: 1,
      }),
    ).toEqual({ kind: 'render', pendingBrandId: 'brd_2' })
  })

  test('complete면 배너도 없다', () => {
    expect(
      resolveDashboardEntry({ state: 'complete', pendingBrandId: null, frozenBrandCount: 2 }),
    ).toEqual({ kind: 'render', pendingBrandId: null })
  })

  test('no-plan은 대시보드가 목적지다 — 온보딩으로 보내지 않는다(유료 게이트)', () => {
    expect(
      resolveDashboardEntry({ state: 'no-plan', pendingBrandId: null, frozenBrandCount: 0 }),
    ).toEqual({ kind: 'render', pendingBrandId: null })
  })
})
