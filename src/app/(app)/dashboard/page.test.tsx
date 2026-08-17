// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OnboardingGate } from '@/lib/onboarding/gate'
import { resolveLimits } from '@/lib/plans'

/**
 * `/dashboard` 페이지의 **분기** 테스트 — 어떤 게이트 상태에 어떤 화면이 나오는가.
 *
 * ★ 핵심 못: **해지한 고객은 대시보드를 잃지 않는다.** 데이터 계층은 해지
 *   구독의 이력을 그대로 돌려주는데(`load.test.ts` "해지한 구독도 플랜의 이력
 *   창을 그대로 받는다"), 페이지가 `no-plan`만 보고 무료 진단 안내로 바꿔치면
 *   그 정책이 화면에서 무효가 된다 — 여기서 페이지 계층을 같은 정책에 못 박는다.
 */

const mocks = vi.hoisted(() => ({
  loadOnboardingGate: vi.fn(),
  loadDashboard: vi.fn(),
  redirect: vi.fn((to: string): never => {
    throw new Error(`redirect:${to}`)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/onboarding/gate', () => ({ loadOnboardingGate: mocks.loadOnboardingGate }))
vi.mock('@/lib/dashboard/load', () => ({ loadDashboard: mocks.loadDashboard }))

// 차트·피커는 이 테스트의 관심사가 아니다 — 페이지의 분기만 검증한다.
// 각 컴포넌트의 렌더링 규칙은 자기 테스트가 따로 덮는다.
vi.mock('@/components/dashboard/brand-picker', () => ({ BrandPicker: () => null }))
vi.mock('@/components/dashboard/headline-card', () => ({ HeadlineCard: () => null }))
vi.mock('@/components/dashboard/query-heatmap', () => ({ QueryHeatmap: () => null }))
vi.mock('@/components/dashboard/run-list', () => ({ RunListSection: () => null }))
vi.mock('@/components/dashboard/source-changes', () => ({ SourceChanges: () => null }))
vi.mock('@/components/dashboard/sov-trend', () => ({ SovTrend: () => null }))
vi.mock('@/components/dashboard/trend-chart', () => ({ TrendChart: () => null }))

const DashboardPage = (await import('./page')).default

function gateOf(overrides: Partial<OnboardingGate>): OnboardingGate {
  return {
    user: { id: 'u1', email: 'a@b.c', name: '김선영' },
    subscription: null,
    limits: null,
    brandCount: 0,
    pendingBrandId: null,
    frozenBrandCount: 0,
    state: 'no-plan',
    ...overrides,
  }
}

async function renderPage(): Promise<void> {
  render(await DashboardPage({ searchParams: Promise.resolve({}) }))
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

describe('DashboardPage — 해지 계정의 이력 (load.ts 정책의 페이지 짝)', () => {
  it('해지 구독이라도 동결 브랜드가 있으면 대시보드를 그린다 — 무료 진단 안내로 바꿔치지 않는다', async () => {
    mocks.loadOnboardingGate.mockResolvedValue(
      gateOf({ state: 'no-plan', brandCount: 1, frozenBrandCount: 1 }),
    )
    mocks.loadDashboard.mockResolvedValue({
      brands: [{ id: 'b1', name: '바디텍' }],
      selected: { id: 'b1', name: '바디텍' },
      points: [],
      runList: [],
    })

    await renderPage()

    // 이력 화면이 실제로 온다.
    expect(mocks.loadDashboard).toHaveBeenCalledWith('u1', undefined)
    expect(screen.getByRole('heading', { name: '바디텍' })).toBeInTheDocument()
    // 정직한 안내 — 새 측정은 안 돌지만 이력은 그대로다.
    expect(screen.getByText(/측정 이력은 그대로 볼 수 있습니다/)).toBeInTheDocument()
    // 무료 진단 안내가 아니다.
    expect(screen.queryByRole('link', { name: '무료 진단 받기' })).not.toBeInTheDocument()
  })

  it('플랜도 브랜드도 없는 계정은 지금처럼 무료 진단 안내를 본다', async () => {
    mocks.loadOnboardingGate.mockResolvedValue(gateOf({}))

    await renderPage()

    expect(screen.getByRole('link', { name: '무료 진단 받기' })).toBeInTheDocument()
    // 보여 줄 이력이 없으므로 로더까지 가지 않는다.
    expect(mocks.loadDashboard).not.toHaveBeenCalled()
  })

  it('활성 구독의 대시보드에는 해지 안내가 없다', async () => {
    mocks.loadOnboardingGate.mockResolvedValue(
      gateOf({
        state: 'complete',
        brandCount: 1,
        frozenBrandCount: 1,
        limits: resolveLimits('starter', 0),
      }),
    )
    mocks.loadDashboard.mockResolvedValue({
      brands: [{ id: 'b1', name: '바디텍' }],
      selected: { id: 'b1', name: '바디텍' },
      points: [],
      runList: [],
    })

    await renderPage()

    expect(screen.getByRole('heading', { name: '바디텍' })).toBeInTheDocument()
    expect(screen.queryByText(/측정이 멈춰 있습니다/)).not.toBeInTheDocument()
  })
})
