// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestForm } from '@/components/audit/request-form'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(cleanup)

/** 콤보박스를 열고(포커스) 제안 텍스트 목록을 돌려준다. 빈 입력 = 전체 목록. */
function openSuggestions() {
  render(<RequestForm />)
  const input = screen.getByRole('combobox', { name: '업종' })
  fireEvent.focus(input)
  return {
    input,
    options: () => screen.getAllByRole('option').map((o) => o.textContent),
  }
}

describe('RequestForm', () => {
  // ★ 웹 폼에는 지역 입력이 없다(region은 CLI 전용 — A안 결정). 지역형 업종을
  //   자동완성에 올리면 지역 없이는 질의를 만들 수 없는 신청을 부추기고,
  //   `audit:run`에서야 막혀 "영업일 1일" 약속이 깨진다. 랜딩 탭
  //   (`query-protocol.test.tsx`)과 같은 보증이다.
  it('업종 자동완성에 지역형 업종을 넣지 않는다', () => {
    const { options } = openSuggestions()
    const values = options()
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      expect(isRegionalCategory(String(value))).toBe(false)
    }
  })

  it('전국형 업종은 전부 자동완성에 있다 — 필터가 과하게 깎지 않는다', () => {
    const { options } = openSuggestions()
    const values = options()
    for (const category of KNOWN_CATEGORIES) {
      if (isRegionalCategory(category)) continue
      expect(values).toContain(category)
    }
  })

  // datalist를 커스텀 콤보박스로 바꾸며 새로 생긴 동작 계약 —
  // 아래 둘이 깨지면 "자유 입력 + 제안 선택" 계약이 깨진 것이다.
  it('제안을 클릭하면 입력값이 되고 패널이 닫힌다', () => {
    const { input } = openSuggestions()
    fireEvent.click(screen.getByRole('option', { name: '패션' }))
    expect(input).toHaveValue('패션')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('입력하면 제안이 걸러지고, 목록 밖 자유 입력도 값으로 남는다', () => {
    const { input, options } = openSuggestions()
    fireEvent.change(input, { target: { value: '패션' } })
    for (const value of options()) {
      expect(value).toContain('패션')
    }

    // 목록에 없는 업종 — 패널은 사라져도 입력값은 그대로 제출 대상이다.
    fireEvent.change(input, { target: { value: '수제 도자기' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('수제 도자기')
  })
})
