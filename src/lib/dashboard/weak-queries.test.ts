import { describe, expect, it } from 'vitest'
import type { RunPoint } from './data'
import { weakestQueries } from './weak-queries'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

function point(byQuery: { queryText: string; k: number; n: number }[]): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION,
    brandName: 'b',
    category: 'c',
    competitors: [],
    engines: ['chatgpt'],
    aliases: [],
    measuredAt: '2026-08-03T00:00:00.000Z',
    totalAnswers: 60,
    citedRate: wilsonInterval(30, 60),
    shareOfVoice: wilsonInterval(0, 0),
    ranking: [],
    evidence: [],
    byEngine: {},
    byQuery: byQuery.map((q) => ({ queryText: q.queryText, interval: wilsonInterval(q.k, q.n) })),
    sources: [],
    sourceSummary: { answersWithCitations: 0, totalAnswers: 60, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false,
    unresolved: 0,
  } as AuditResult
  return {
    runId: 'r1',
    measuredAt: result.measuredAt,
    engines: ['chatgpt'],
    competitors: [],
    queryIds: [],
    detectorVersion: 1,
    skippedBefore: 0,
    result,
  }
}

describe('weakestQueries — 약한 질문 선정 규칙', () => {
  it('점추정 오름차순으로 셋을 뽑는다', () => {
    const weak = weakestQueries([
      point([
        { queryText: 'A', k: 5, n: 6 },
        { queryText: 'B', k: 0, n: 6 },
        { queryText: 'C', k: 2, n: 6 },
        { queryText: 'D', k: 4, n: 6 },
      ]),
    ])
    expect(weak.map((w) => w.queryText)).toEqual(['B', 'C', 'D'])
  })

  it('n=0 질의는 후보가 아니다 — 측정 없음은 0%가 아니다', () => {
    const weak = weakestQueries([
      point([
        { queryText: '안 물음', k: 0, n: 0 },
        { queryText: '물음', k: 1, n: 6 },
      ]),
    ])
    expect(weak.map((w) => w.queryText)).toEqual(['물음'])
  })

  it('동률이면 표본 큰 쪽 먼저 — 더 확실한 약점이다', () => {
    const weak = weakestQueries(
      [
        point([
          { queryText: '작은 표본', k: 0, n: 2 },
          { queryText: '큰 표본', k: 0, n: 6 },
        ]),
      ],
      2,
    )
    expect(weak.map((w) => w.queryText)).toEqual(['큰 표본', '작은 표본'])
  })

  it('회차가 없으면 빈 목록이다', () => {
    expect(weakestQueries([])).toEqual([])
  })

  it('최신 회차만 본다 — 옛 회차의 약점은 이미 지나간 화면이다', () => {
    const weak = weakestQueries([
      point([{ queryText: '옛 질문', k: 0, n: 6 }]),
      point([{ queryText: '지금 질문', k: 1, n: 6 }]),
    ])
    expect(weak.map((w) => w.queryText)).toEqual(['지금 질문'])
  })
})
