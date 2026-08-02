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

  /**
   * ★ §4.2의 계약 값 두 개를 못박는다.
   *   - 램프: `P = round(6 + 74 × point)` — 6%(0%)에서 80%(100%)까지.
   *     `round(100 × point)` 같은 그럴듯한 변이는 0%를 배경 없음으로 만든다.
   *   - 글자색 반전: 정확히 P ≥ 50에서 `--primary-foreground`로 바뀐다.
   *     P=49(43/74)와 P=50(44/74)로 경계 양쪽을 잡는다 — 문턱을 95로 옮기는
   *     변이도 여기서 RED가 된다.
   */
  test('셀 채움은 P = round(6 + 74 × point) 램프이고 글자색은 정확히 P ≥ 50에서 반전된다 (§4.2)', () => {
    render(
      <QueryHeatmap
        points={[
          point('r1', [
            { queryText: 'q-zero', interval: wilsonInterval(0, 6) }, // point 0 → P=6
            { queryText: 'q-full', interval: wilsonInterval(6, 6) }, // point 1 → P=80
            { queryText: 'q-49', interval: wilsonInterval(43, 74) }, // P=49 — 반전 직전
            { queryText: 'q-50', interval: wilsonInterval(44, 74) }, // P=50 — 반전 시작
          ]),
        ]}
      />,
    )
    const styleOf = (text: string) => screen.getByText(text).getAttribute('style') ?? ''
    expect(styleOf('0/6')).toContain('color-mix(in oklab, var(--primary) 6%, transparent)')
    expect(styleOf('6/6')).toContain('color-mix(in oklab, var(--primary) 80%, transparent)')
    expect(styleOf('43/74')).toContain('color: var(--foreground)')
    expect(styleOf('44/74')).toContain('color: var(--primary-foreground)')
  })

  test('셀 title은 질의 · 회차 날짜 · 점추정 (구간)이다 (§4.2)', () => {
    render(<QueryHeatmap points={[point('r1', [{ queryText: 'q-a', interval: wilsonInterval(2, 6) }])]} />)
    // 픽스처의 measuredAt은 2026-08-03 — 날짜가 축과 같은 MM.DD로 들어간다.
    expect(screen.getByText('2/6')).toHaveAttribute('title', expect.stringContaining('q-a · 08.03 · '))
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
