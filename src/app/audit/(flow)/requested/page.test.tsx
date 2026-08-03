// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AuditRequestedPage from './page'

afterEach(cleanup)

/** 서버 컴포넌트라 직접 await해서 엘리먼트를 얻는다. */
async function renderState(state?: string) {
  const ui = await AuditRequestedPage({
    searchParams: Promise.resolve(state === undefined ? {} : { state }),
  })
  return render(ui)
}

/**
 * 신청 직후 화면. 즉시 결과를 포기한 제품이라 **이 화면이 이탈을 막는 유일한
 * 장치다.** 네 상태가 전부 살아 있어야 하고, 그중 둘은 "정상"이라는 사실을
 * 말해야 한다.
 */
describe('진단 신청 안내 화면', () => {
  it('기본은 메일 확인 대기다 — 알 수 없는 state도 여기로 떨어진다', async () => {
    await renderState('알수없음')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('메일함을 확인해 주세요')
  })

  it('확인 완료는 성공 상태다', async () => {
    await renderState('verified')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('확인됐습니다')
    // 성공 화면에는 되돌릴 행동이 없다. 버튼을 두면 무언가 더 해야 한다고 읽힌다.
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('링크를 두 번 눌러도 오류가 아니다', async () => {
    await renderState('already')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('이미 확인된 신청입니다')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('만료·오류 상태에서만 실패라고 말하고, 되돌아갈 길을 준다', async () => {
    await renderState('invalid')
    expect(screen.getByText('확인 실패')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '다시 신청하기' })
    expect(link.getAttribute('href')).toBe('/audit/new')
  })

  it('계정이 없다는 사실을 모든 상태에서 말한다', async () => {
    for (const state of [undefined, 'verified', 'already', 'invalid']) {
      const view = await renderState(state)
      expect(view.container.textContent).toContain('가입이나 로그인은 필요 없습니다')
      cleanup()
    }
  })

  it('em-dash를 쓰지 않는다', async () => {
    for (const state of [undefined, 'verified', 'already', 'invalid']) {
      const view = await renderState(state)
      expect(view.container.textContent ?? '').not.toMatch(/[—–]/)
      cleanup()
    }
  })
})
