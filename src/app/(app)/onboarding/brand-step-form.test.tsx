// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'
import { BrandStepForm } from './brand-step-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// 서버 액션은 `@/lib/db`를 끌고 온다. 이 테스트가 검증하는 것은 렌더링 규칙뿐이라
// 액션을 대체한다 — 액션의 게이트·한도 검증은 순수 모듈 테스트가 덮는다.
vi.mock('./actions', () => ({
  createBrandAction: vi.fn(async () => ({ ok: true, value: { brandId: 'brd_x' } })),
}))

afterEach(cleanup)

describe('BrandStepForm', () => {
  // ★ 이 폼의 존재 이유. 무료 진단 폼(`request-form.tsx`)은 지역형 업종을
  //   아예 거부하지만, 유료 셀프서비스 온보딩은 지역 없이는 성립하지 않는다.
  it('지역형 업종을 고르면 지역 칸이 나타난다', () => {
    render(<BrandStepForm maxCompetitors={3} prefill={null} />)
    expect(screen.queryByLabelText('지역')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('업종'), { target: { value: '필라테스' } })
    expect(screen.getByLabelText('지역')).toBeInTheDocument()
  })

  it('전국형 업종에서는 지역 칸을 감춘다 — 붙이면 질의가 변질된다', () => {
    render(<BrandStepForm maxCompetitors={3} prefill={null} />)
    fireEvent.change(screen.getByLabelText('업종'), { target: { value: '패션' } })
    expect(screen.queryByLabelText('지역')).not.toBeInTheDocument()
  })

  it('자동완성에서 지역형 업종을 빼지 않는다 — 무료 폼과 반대다', () => {
    render(<BrandStepForm maxCompetitors={3} prefill={null} />)
    // 커스텀 콤보박스는 포커스해야 제안 패널이 열린다(빈 입력 = 전체 목록).
    fireEvent.focus(screen.getByRole('combobox', { name: '업종' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    for (const category of KNOWN_CATEGORIES) {
      expect(options).toContain(category)
    }
    expect(options.some((v) => isRegionalCategory(String(v)))).toBe(true)
  })

  // ★ 한도만큼 빈 칸을 미리 깔면 Business(10개)에서 빈 입력이 열 줄 늘어선다.
  it('경쟁사 칸은 한 줄로 시작하고 버튼으로 늘린다', () => {
    render(<BrandStepForm maxCompetitors={3} prefill={null} />)
    expect(screen.getByLabelText('경쟁사 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('경쟁사 2')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /경쟁사 추가/ }))
    expect(screen.getByLabelText('경쟁사 2')).toBeInTheDocument()
  })

  it('한도를 넘겨 프리필하지 않는다 — 넘치는 경쟁사는 잘라 담는다', () => {
    render(
      <BrandStepForm
        maxCompetitors={2}
        prefill={{
          name: '무신사',
          category: '패션',
          region: '',
          competitors: ['29CM', '지그재그', '에이블리'],
          siteUrl: 'musinsa.com',
        }}
      />,
    )
    expect(screen.getByLabelText('브랜드명')).toHaveValue('무신사')
    expect(screen.getByLabelText('경쟁사 2')).toHaveValue('지그재그')
    expect(screen.queryByLabelText('경쟁사 3')).not.toBeInTheDocument()
  })
})
