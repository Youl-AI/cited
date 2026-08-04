// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketingHeader } from './marketing-header'

afterEach(cleanup)

/**
 * 마케팅 머리글은 `SiteHeader`(앱)와 **갈라진 파일**이다. 갈라 두면 문구와
 * 목적지가 조용히 어긋날 수 있으므로, 그 둘을 여기서 잠근다.
 *
 * ★ 라벨은 사용자가 읽는 것이고 e2e(`tests/e2e/free-audit.spec.ts`)가 이름으로
 *   찾는다. 바꾸려면 계획서의 "보존" 목록을 먼저 고쳐야 한다.
 */
describe('마케팅 머리글', () => {
  it('워드마크는 항상 랜딩으로 돌아간다', () => {
    render(<MarketingHeader />)
    expect(screen.getByRole('link', { name: 'Cited' }).getAttribute('href')).toBe('/')
  })

  it('로그인과 회원가입은 한 링크다 — 머리글에서 어느 쪽인지 판단하게 만들지 않는다', () => {
    render(<MarketingHeader />)
    expect(screen.getByRole('link', { name: '로그인 · 회원가입' }).getAttribute('href')).toBe(
      '/sign-in',
    )
  })

  it('가장 강한 버튼은 무료 진단이다 — 회원가입이 아니다', () => {
    render(<MarketingHeader />)
    const cta = screen.getByRole('link', { name: '무료 진단 받기' })
    expect(cta.getAttribute('href')).toBe('/audit/new')
  })

  it('데스크톱에서 한 줄이다 — 항목이 둘뿐이라 햄버거를 만들지 않는다', () => {
    render(<MarketingHeader />)
    // 링크 셋(워드마크 + 둘)이 전부다. 여기에 항목이 늘면 한 줄 규칙
    // (tasteskill §4.7)을 다시 계산해야 한다.
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  /**
   * 신청 흐름(`audit/(flow)`)에서는 이 CTA가 **자기 목적지 위에** 서게 된다.
   * `/audit/new`에서는 눌러도 아무 일이 없고 바로 아래 제출 버튼과 의도가
   * 겹치며, `/audit/requested`에서는 이미 신청한 사람에게 중복 신청을 권한다.
   */
  it('CTA를 끌 수 있다 — 그 목적지 위에서는 세우지 않는다', () => {
    render(<MarketingHeader cta={false} />)
    expect(screen.queryByRole('link', { name: '무료 진단 받기' })).toBeNull()
    // 워드마크와 로그인은 남는다. 껍데기가 통째로 사라지면 빠져나갈 길이 없다.
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Cited' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '로그인 · 회원가입' })).toBeTruthy()
  })

  it('기본값은 켜짐이다 — 랜딩·요금제가 아무것도 넘기지 않는다', () => {
    render(<MarketingHeader />)
    expect(screen.getByRole('link', { name: '무료 진단 받기' })).toBeTruthy()
  })
})
