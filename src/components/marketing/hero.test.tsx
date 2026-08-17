// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MEASURED, SPECIMEN } from './actuals'
import { Hero } from './hero'

// ★ 여기에는 Motion 스텁이 없다. 히어로의 등장 연출은 CSS(`.enter-rise`)라
//   JS가 전혀 붙지 않는다 — 첫 화면이 하이드레이션을 기다리지 않게 하려는
//   선택이고(LCP), 그 선택이 이 테스트가 가벼운 이유이기도 하다.
//   뷰포트 진입 리빌이 필요한 아래 섹션은 `Reveal`을 쓴다.
afterEach(cleanup)

/**
 * 히어로는 디자인이 자주 바뀌는 자리다. 그래서 **모양이 아니라 약속**을 잠근다:
 * 어떤 문장이 헤드라인인가, 화면의 숫자가 실측에서 나왔는가, 전환 경로가
 * 살아 있는가. 클래스명·배치는 단언하지 않는다(바뀌라고 있는 것들이다).
 */
describe('랜딩 히어로', () => {
  it('H1은 그대로다 — 이 문장이 이 제품의 주장이다', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      '고객이 AI에게 물었을 때, 우리 브랜드가 불리고 있나',
    )
  })

  it('실측 답변 원문을 그대로 싣는다 — 지어낸 예시가 들어오면 여기서 걸린다', () => {
    const { container } = render(<Hero />)
    const quote = container.querySelector('blockquote')
    expect(quote).not.toBeNull()
    // 원문에는 ChatGPT가 쓴 대시·가운뎃점이 그대로 있다. 마케팅 카피의
    // em-dash 금지는 **우리 문장**의 규칙이지 증거물을 고칠 권한이 아니다.
    // (표식에 붙는 순서 번호가 섞이므로 전체 일치가 아니라 구간으로 본다.)
    expect(quote?.textContent).toContain('좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.')
    expect(quote?.textContent).toContain('베이식·미니멀(30대에 무난): 유니클로, COS,')
    expect(SPECIMEN.text).toContain('W컨셉(디자이너)')
    expect(screen.getByText(SPECIMEN.query)).toBeTruthy()
  })

  it('등록한 브랜드에만 표식이 붙고, 자기 브랜드에만 순서가 붙는다', () => {
    const { container } = render(<Hero />)
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent)
    // W컨셉·쿠팡·유니클로는 답변에 있지만 등록되지 않았으므로 평문이다.
    expect(marks).toEqual(['무신사1', '29CM', '무탠다드1'])
  })

  it('언급률은 점추정과 신뢰구간을 함께 보여준다 — 점만 보여주지 않는다', () => {
    render(<Hero />)
    // wilsonInterval(5, 6) = 83% (44% ~ 97%)
    expect(screen.getByText('83%')).toBeTruthy()
    expect(screen.getByText('44% ~ 97%')).toBeTruthy()
    expect(screen.getByRole('img', { name: /신뢰구간/ })).toBeTruthy()
    expect(MEASURED.cited.n).toBe(6)
    expect(MEASURED.cited.k).toBe(5)
  })

  it('엔진별 결과도 구간과 함께 나온다', () => {
    render(<Hero />)
    for (const row of MEASURED.byEngine) {
      expect(screen.getByText(row.engine)).toBeTruthy()
    }
    expect(screen.getByText('44% ~ 100%')).toBeTruthy() // ChatGPT 3/3
    expect(screen.getByText('21% ~ 94%')).toBeTruthy() // Gemini 2/3
  })

  it('전환 경로가 살아 있다 — 주 CTA는 신청 폼, 보조는 요금제', () => {
    render(<Hero />)
    const primary = screen.getByRole('link', { name: '무료 진단 받기' })
    expect(primary.getAttribute('href')).toBe('/audit/new')
    const secondary = screen.getByRole('link', { name: '요금제 보기' })
    expect(secondary.getAttribute('href')).toBe('/pricing')
  })

  it('히어로 왼쪽 열 = 텍스트 스택 넷 + 계측 조건 스트립 (2026-08-18 계약)', () => {
    const { container } = render(<Hero />)
    // 아이브로 · H1 · 서브텍스트 · CTA 두 개 — 여기까지가 §4.7의 스택이고,
    // 계측 조건 스트립(엔진·주기·질의 공개)은 사용자 결정으로 추가된 유일한
    // 예외다(hero.tsx 머리말). 가격 티저·기능 목록·로고 벽은 여전히 금지 —
    // 링크 수를 못박아 두면 뭔가 더 끼어들 때 이 테스트가 먼저 깨진다.
    const claim = container.querySelector('section > div > div')
    expect(claim).not.toBeNull()
    const stack = within(claim as HTMLElement)
    expect(stack.getByText('한국어 GEO 모니터링')).toBeTruthy()
    // CTA 둘 + 스트립의 질의 공개 앵커 하나. 그 이상은 없다.
    const links = stack.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[2]?.getAttribute('href')).toBe('#queries')
    // 스트립 세 칸 — 라벨은 실측 조건이다.
    expect(stack.getByText('엔진')).toBeTruthy()
    expect(stack.getByText('ChatGPT · Gemini')).toBeTruthy()
    expect(stack.getByText('전문 공개 ↓')).toBeTruthy()
  })
})
