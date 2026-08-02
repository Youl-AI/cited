// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (Task 9 `trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { RunPoint } from '@/lib/dashboard/data'
import { wilsonInterval } from '@/lib/stats/wilson'
import { SovTrend } from './sov-trend'

afterEach(cleanup)

// ★ RunPoint는 `queryIds`·`detectorVersion`·`skippedBefore`까지 **필수**다
//   (Task 8 Interfaces). `skippedBefore`가 곧 이 파일이 검증할 신호다.
function point(runId: string, k: number, n: number, over: Partial<RunPoint> = {}): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: ['29CM'],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(k, n),
    ranking: [], evidence: [], byEngine: {}, byQuery: [], sources: [],
    sourceSummary: { totalAnswers: 6, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId, measuredAt: result.measuredAt, engines: ['chatgpt'], competitors: ['29CM'],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0, result, ...over,
  }
}

describe('SovTrend', () => {
  test('조건이 같고 회차가 연속하면 선을 잇는다 — 멀쩡한 선을 괜히 끊지 않는다', () => {
    const { container } = render(<SovTrend points={[point('r1', 8, 20), point('r2', 12, 20)]} />)
    expect(container.querySelectorAll('[data-testid="sov-point"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(1)
  })

  test('경쟁사 집합이 바뀐 구간은 선을 끊고 이유를 쓴다', () => {
    const { container } = render(
      <SovTrend
        points={[point('r1', 8, 20), point('r2', 12, 20, { competitors: ['29CM', '지그재그'] })]}
      />,
    )
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(0)
    expect(screen.getByText(/비교하지 않습니다/)).toBeInTheDocument()
  })

  /**
   * ★ 경쟁사 집합이 바뀐 구간의 고정 문구는 디자인 언어 §4.3이 자구까지
   *   정한다 — 분모의 정의가 바뀌었다는 사실을 항상 같은 문장으로 말한다.
   */
  test('경쟁사 집합 변경의 캡션은 §4.3 고정 문구 그대로다', () => {
    render(
      <SovTrend
        points={[point('r1', 8, 20), point('r2', 12, 20, { competitors: ['29CM', '지그재그'] })]}
      />,
    )
    expect(
      screen.getByText(
        /경쟁사 설정이 바뀐 구간은 이전과 비교하지 않습니다 — 분모가 달라지면 점유율은 설정 변경만으로도 움직입니다\./,
      ),
    ).toBeInTheDocument()
  })

  test('분모(등록 경쟁사 목록)가 차트 옆에 항상 보인다', () => {
    render(<SovTrend points={[point('r1', 8, 20), point('r2', 12, 20)]} />)
    expect(screen.getByText(/29CM/)).toBeInTheDocument()
  })

  /**
   * ★ 경쟁사를 등록하기 전 회차는 SoV가 정의되지 않아(n=0) 계열에서 통째로
   *   빠진다. 조건은 그대로라 `comparableWithPrev`는 true다 — 이 구간을 끊는
   *   근거는 `runsSkippedBefore`뿐이다. 없으면 서수 축이 두 점을 옆칸에 붙여
   *   그리고, 고객은 그 사이에도 재고 있었던 것으로 읽는다.
   */
  test('점유율을 잴 수 없던 회차가 있으면 그 구간도 잇지 않는다', () => {
    const { container } = render(
      <SovTrend points={[point('r1', 8, 20), point('r2', 0, 0), point('r3', 12, 20)]} />,
    )
    expect(container.querySelectorAll('[data-testid="sov-point"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(0)
    expect(screen.getByText(/잴 수 없던 회차/)).toBeInTheDocument()
  })
})
