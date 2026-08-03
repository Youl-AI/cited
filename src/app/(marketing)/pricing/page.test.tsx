// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLANS, QUERY_PACK_PRICE_KRW, QUERY_PACK_SIZE, engineLabels } from '@/lib/plans'
import PricingPage from './page'

// jsdom에는 IntersectionObserver가 없고, `Reveal`이 쓰는 Motion의
// `whileInView`는 폴백 없이 바로 `new IntersectionObserver(...)`를 부른다.
// 스텁이 없으면 렌더 자체가 던진다(`reveal.test.tsx`와 같은 이유).
class InertIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)

afterEach(cleanup)

/**
 * 요금제 화면이 지켜야 하는 약속.
 *
 * ★ 모양이 아니라 약속을 잠근다. 클래스명·열 순서·틴트는 디자인이 바꿀 수
 *   있는 것이고, 아래 항목들은 바꾸면 **제품이 거짓말을 시작하는** 것들이다.
 *
 * ★ 좁은 화면 블록과 넓은 화면 표가 같은 데이터를 두 번 그린다. 그래서 값
 *   단언은 `getAllBy…`로 받고 개수를 세지 않는다 — 조판이 갈려도 계약은 같다.
 */
describe('요금제', () => {
  it('제목은 이 페이지의 주장이다', () => {
    render(<PricingPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: '측정 횟수가 곧 신뢰구간의 넓이입니다' }),
    ).toBeInTheDocument()
  })

  it('숫자는 전부 PLANS에서 온다 — 화면에 손으로 적은 값이 없다', () => {
    const { container } = render(<PricingPage />)
    const text = container.textContent ?? ''

    for (const id of ['free', 'starter', 'business'] as const) {
      const plan = PLANS[id]
      // 요금: 0원은 "0원", 유료는 천 단위 구분자까지 화면 표기 그대로.
      expect(text).toContain(plan.priceKrw.toLocaleString('ko-KR'))
      expect(text).toContain(String(plan.maxQueries))
      expect(text).toContain(String(plan.maxCompetitors))
      for (const label of engineLabels(plan.engines)) {
        expect(text).toContain(label)
      }
    }
    expect(text).toContain(String(QUERY_PACK_SIZE))
    expect(text).toContain(QUERY_PACK_PRICE_KRW.toLocaleString('ko-KR'))
  })

  it('무료의 한계가 표에 그대로 보인다 — 매력적으로 그리지 않는다', () => {
    const { container } = render(<PricingPage />)
    const text = container.textContent ?? ''
    // 무료는 단발 1회다. "주 n회"로 쓰면 거짓이 된다.
    expect(text).toContain('(단발)')
    // historyMonths 0 = 이력 없음. 대시가 아니라 '없음'이라고 쓴다.
    expect(PLANS.free.historyMonths).toBe(0)
    expect(text).toContain('없음')
    expect(PLANS.business.historyMonths).toBeNull()
    expect(text).toContain('무제한')
  })

  it('결제가 열리지 않았다는 사실을 그대로 말한다', () => {
    render(<PricingPage />)
    expect(
      screen.getAllByText(/유료 플랜과 결제는 아직 열리지 않았습니다/).length,
    ).toBeGreaterThan(0)
  })

  it('행동은 하나다 — 지금 할 수 있는 일이 하나뿐이기 때문이다', () => {
    render(<PricingPage />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent('무료 진단 받기')
    // 머리글·랜딩 마감과 같은 라벨이고, 요금제에는 `#request` 앵커가 없으므로
    // 목적지는 신청 페이지다.
    expect(links[0]?.getAttribute('href')).toBe('/audit/new')
  })

  it('권장 티어는 Starter 하나이고, 표시는 높이가 아니라 표식이다', () => {
    const { container } = render(<PricingPage />)
    // 좁은 화면 블록 + 넓은 화면 열 머리 = 둘. 셋이면 열마다 붙인 것이다.
    expect(screen.getAllByText('권장')).toHaveLength(2)
    // 권장 표시는 Starter와 같은 상자 안에 있어야 한다.
    for (const mark of screen.getAllByText('권장')) {
      const box = mark.parentElement
      expect(box?.textContent).toContain('Starter')
    }
    // 높이를 키우는 유틸리티로 권장을 표시하지 않는다.
    expect(container.innerHTML).not.toMatch(/scale-1|py-1[2-9]\b.*Starter/)
  })

  it('표는 세 무리로 묶여 있다 — 행마다 선을 긋지 않는다', () => {
    render(<PricingPage />)
    const table = screen.getByRole('table')
    // 무리 머리는 rowgroup 범위의 헤더다.
    const groups = within(table)
      .getAllByRole('rowheader')
      .filter((th) => th.getAttribute('scope') === 'rowgroup')
      .map((th) => th.textContent)
    expect(groups).toEqual(['측정', '범위', '기록'])
  })

  it('em-dash를 쓰지 않는다', () => {
    const { container } = render(<PricingPage />)
    expect(container.textContent ?? '').not.toMatch(/[—–]/)
  })
})
