// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { RunPoint } from '@/lib/dashboard/data'
import { wilsonInterval } from '@/lib/stats/wilson'
import { QueryHeatmap } from './query-heatmap'

// `globals: true`가 아니므로 RTL이 자동 정리를 걸지 못한다. 명시적으로 건다.
afterEach(cleanup)

function point(runId: string, byQuery: AuditResult['byQuery']): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [], byEngine: {}, byQuery, sources: [],
    sourceSummary: { totalAnswers: 6, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId,
    measuredAt: result.measuredAt,
    engines: ['chatgpt'],
    competitors: [],
    queryIds: ['q1'],
    detectorVersion: 1,
    skippedBefore: 0,
    result,
  }
}

describe('QueryHeatmap', () => {
  test('셀에 k/n을 표기한다 — 분모가 곧 오차의 크기', () => {
    render(<QueryHeatmap points={[point('r1', [{ queryText: 'q-a', interval: wilsonInterval(2, 6) }])]} />)
    expect(screen.getByText('2/6')).toBeInTheDocument()
  })

  test('측정 없는 셀은 — 로 표기한다 (0%가 아니다)', () => {
    const p1 = point('r1', [{ queryText: 'q-old', interval: wilsonInterval(1, 6) }])
    const p2 = point('r2', [
      { queryText: 'q-old', interval: wilsonInterval(1, 6) },
      { queryText: 'q-new', interval: wilsonInterval(0, 6) },
    ])
    render(<QueryHeatmap points={[p1, p2]} />)
    expect(screen.getByLabelText('측정 없음')).toBeInTheDocument()
  })

  test('행 순서는 최신 회차의 byQuery 순서 그대로다 — 화면에서 재정렬하지 않는다', () => {
    // 주어진 순서가 가나다순도, 언급률 오름차순도 아니게 만든다 — 어떤 재정렬이든 RED가 된다.
    const p = point('r1', [
      { queryText: 'ㅎ-질문', interval: wilsonInterval(5, 6) },
      { queryText: 'ㄱ-질문', interval: wilsonInterval(0, 6) },
    ])
    render(<QueryHeatmap points={[p]} />)
    const rows = screen.getAllByRole('rowheader').map((el) => el.textContent)
    expect(rows).toEqual(['ㅎ-질문', 'ㄱ-질문'])
  })
})
