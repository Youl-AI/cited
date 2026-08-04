// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MEASURED, MENTION_COUNTS, SOURCES } from './actuals'
import { DeliverablesBento } from './deliverables-bento'

afterEach(cleanup)

/**
 * 벤토는 **모양이 아니라 약속**을 잠근다: 셀 수가 콘텐츠 수와 같은가, 셀 안의
 * 숫자가 실측에서 계산됐는가, 네 항목의 문구가 남아 있는가. 클래스명·span 값은
 * 단언하지 않는다(디자인이 바꾸라고 있는 것들이다).
 */
describe('리포트에 들어가는 것 — gapless 벤토', () => {
  it('셀은 정확히 넷이다 (tasteskill §4.7: 셀 수 = 콘텐츠 수)', () => {
    const { container } = render(<DeliverablesBento />)
    const grid = container.firstElementChild
    expect(grid).not.toBeNull()
    // 빈 타일을 채워 넣으면 다섯이 된다. 여기서 걸린다.
    expect(grid?.children).toHaveLength(4)
  })

  it('네 항목의 제목이 전부 남아 있다', () => {
    render(<DeliverablesBento />)
    for (const title of [
      '언급률과 신뢰구간',
      '답변 원문',
      'AI가 읽는 출처',
      '경쟁사 대비 점유율',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
  })

  it('언급률 셀은 점추정과 구간을 함께 보여준다', () => {
    render(<DeliverablesBento />)
    // wilsonInterval(5, 6) = 83% (44% ~ 97%)
    expect(screen.getByText('83%')).toBeTruthy()
    expect(screen.getByText('44% ~ 97%')).toBeTruthy()
    expect(screen.getByRole('img', { name: /신뢰구간/ })).toBeTruthy()
    expect(MEASURED.cited.k).toBe(5)
    expect(MEASURED.cited.n).toBe(6)
  })

  it('답변 원문 셀은 실측 원문을 그대로 싣고 표식 규칙도 같다', () => {
    const { container } = render(<DeliverablesBento />)
    const quote = container.querySelector('blockquote')
    expect(quote?.textContent).toContain('좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.')
    // 등록되지 않은 브랜드(W컨셉·쿠팡·유니클로)는 평문으로 남는다.
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent)
    expect(marks).toEqual(['무신사1', '29CM', '무탠다드1'])
  })

  it('인용 출처는 실측 집계이고 비율에 구간이 붙는다', () => {
    render(<DeliverablesBento />)
    expect(SOURCES.domains).toBe(20)
    expect(screen.getByText('tistory.com')).toBeTruthy()
    expect(screen.getByText('youtube.com')).toBeTruthy()
    // wilsonInterval(3, 6) = 50% (19% ~ 81%) · (2, 6) = 33% (10% ~ 70%)
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('19% ~ 81%')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
    expect(screen.getByText('10% ~ 70%')).toBeTruthy()
    // 분모가 언급률과 같은 측정이어야 같은 화면에 나란히 둘 수 있다.
    for (const row of SOURCES.top) expect(row.share.n).toBe(MEASURED.cited.n)
  })

  it('점유율 셀은 비율이 아니라 실측 언급 횟수를 적는다', () => {
    render(<DeliverablesBento />)
    // 분모를 지어내 "56%" 같은 숫자를 만들지 않는다 — 등록되지 않은 브랜드가
    // 빠진 분모는 점유율을 실제보다 높게 만든다.
    expect(MENTION_COUNTS.map((r) => r.count)).toEqual([5, 2, 2])
    // 자기 브랜드는 답변 원문의 표식과 이 원장 **두 곳**에 나온다. 같은 밑줄
    // 문법을 쓰므로 읽는 사람이 둘을 같은 것으로 잇는다.
    expect(screen.getAllByText('무신사')).toHaveLength(2)
    // 지그재그는 이 답변에는 없고 나머지 답변에 있다. 원장의 분모가 답변
    // 하나가 아니라 여섯이라는 사실이 여기서 드러난다.
    expect(screen.getByText('지그재그')).toBeTruthy()
  })
})
