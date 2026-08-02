// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (Task 9 `trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { RunPoint } from '@/lib/dashboard/data'
import type { SourceOwner } from '@/lib/stats/sources'
import { wilsonInterval } from '@/lib/stats/wilson'
import { SourceChanges } from './source-changes'

afterEach(cleanup)

// ★ RunPoint는 `queryIds`·`detectorVersion`·`skippedBefore`까지 **필수**다
//   (Task 8 Interfaces). 빠뜨리면 TS2322. 그리고 `queryIds`·`detectorVersion`을
//   두 회차가 **같게** 두어야 "2 → 5"가 실제로 그려진다 — 다르면 비교 불가라
//   화살표가 나오지 않는 것이 옳은 동작이다.
function point(runId: string, sources: AuditResult['sources'], over: Partial<RunPoint> = {}): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [], byEngine: {}, byQuery: [], sources,
    sourceSummary: { totalAnswers: 6, answersWithCitations: 3, distinctDomains: sources.length, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId, measuredAt: result.measuredAt, engines: ['chatgpt'], competitors: [],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0, result, ...over,
  }
}
// ★ `SourceOwner`는 `'self' | 'competitor' | 'third-party'`다 — null이 아니다.
//   `aggregateSources`는 소유를 모르는 도메인에 'third-party'를 넣는다.
const src = (domain: string, answers: number, owner: SourceOwner = 'third-party') =>
  ({ domain, answers, pages: [], owner, share: wilsonInterval(answers, 6) })

describe('SourceChanges', () => {
  test('직전 회차 대비 인용 수 변화를 mono로 표기한다', () => {
    render(<SourceChanges points={[point('r1', [src('a.com', 2)]), point('r2', [src('a.com', 5)])]} />)
    expect(screen.getByText('2 → 5')).toBeInTheDocument()
  })
  test('직전 회차에 없던 도메인은 새로 등장으로 표기', () => {
    render(<SourceChanges points={[point('r1', []), point('r2', [src('new.com', 3)])]} />)
    expect(screen.getByText(/새로 등장/)).toBeInTheDocument()
  })

  /**
   * ★ 추이 차트가 선을 끊는 자리에서 이 표는 화살표를 그리면 안 된다.
   *   운영자가 동결 질의를 셋 더 넣으면 인용 수는 당연히 는다 — "2 → 5"는
   *   브랜드가 한 일이 아니라 설정 변경이고, 그걸 증가로 그리면 같은 거짓말이
   *   표 모양으로 나갈 뿐이다. 도메인이 사라진 것은 아니므로 "새로 등장"도
   *   틀린 말이다 — 화살표만 뺀다.
   */
  test('조건이 바뀐 회차끼리는 화살표를 그리지 않고 이유를 쓴다', () => {
    render(
      <SourceChanges
        points={[
          point('r1', [src('a.com', 2)]),
          point('r2', [src('a.com', 5)], { queryIds: ['q1', 'q9'] }),
        ]}
      />,
    )
    expect(screen.queryByText('2 → 5')).toBeNull()
    expect(screen.queryByText(/새로 등장/)).toBeNull()
    expect(screen.getByText('5개')).toBeInTheDocument()
    expect(screen.getByText(/증감을 표시하지 않습니다/)).toBeInTheDocument()
  })

  /**
   * ★ `selfDomainsKnown === false`인 회차의 'third-party'는 "남의 사이트"가
   *   아니라 "자사 도메인을 몰라 못 갈랐다"이다. 그 회차에는 소유 배지를 달지
   *   않고, "우리 사이트 인용 없음" 같은 단정 대신 도메인을 안 받았다는 사실을
   *   쓴다 — `SelfCitationLine`과 같은 규칙이다.
   */
  test('자사 도메인을 모르면 "인용 없음"을 단정하지 않고 못 가렸다고 쓴다', () => {
    render(<SourceChanges points={[point('r1', [src('a.com', 2, 'third-party')])]} />)
    expect(screen.queryByText(/인용되지 않|인용 없음/)).toBeNull()
    expect(screen.queryByText('우리')).toBeNull()
    expect(screen.getByText(/자사 도메인을 알려주시면/)).toBeInTheDocument()
  })

  test('자사 도메인을 알면 소유 배지를 단다', () => {
    const p = point('r1', [src('us.com', 2, 'self'), src('rival.com', 1, 'competitor')])
    p.result.hasSelfDomains = true
    render(<SourceChanges points={[p]} />)
    expect(screen.getByText('우리')).toBeInTheDocument()
    expect(screen.getByText('경쟁사')).toBeInTheDocument()
    expect(screen.queryByText(/자사 도메인을 알려주시면/)).toBeNull()
  })
})
