// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequestForm } from '@/components/audit/request-form'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(cleanup)

describe('RequestForm', () => {
  // ★ 웹 폼에는 지역 입력이 없다(region은 CLI 전용 — A안 결정). 지역형 업종을
  //   자동완성에 올리면 지역 없이는 질의를 만들 수 없는 신청을 부추기고,
  //   `audit:run`에서야 막혀 "영업일 1일" 약속이 깨진다. 랜딩 탭
  //   (`query-protocol.test.tsx`)과 같은 보증이다.
  it('업종 자동완성에 지역형 업종을 넣지 않는다', () => {
    const { container } = render(<RequestForm />)
    const options = [...container.querySelectorAll('datalist option')].map(
      (o) => (o as HTMLOptionElement).value,
    )
    expect(options.length).toBeGreaterThan(0)
    for (const value of options) {
      expect(isRegionalCategory(value)).toBe(false)
    }
  })

  it('전국형 업종은 전부 자동완성에 있다 — 필터가 과하게 깎지 않는다', () => {
    const { container } = render(<RequestForm />)
    const options = [...container.querySelectorAll('datalist option')].map(
      (o) => (o as HTMLOptionElement).value,
    )
    for (const category of KNOWN_CATEGORIES) {
      if (isRegionalCategory(category)) continue
      expect(options).toContain(category)
    }
  })
})
