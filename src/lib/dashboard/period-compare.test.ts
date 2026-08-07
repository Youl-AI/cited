import { describe, expect, it } from 'vitest'
import type { RunPoint } from './data'
import { buildPeriodComparison } from './period-compare'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * 묶음 비교의 계약(period-compare.ts 머리말): 풀링은 조건이 같을 때만,
 * 판정은 개별 회차와 같은 judgeChange로, 엔진 값이 빠진 회차가 있으면
 * 통째로 접는다.
 */

function point(
  id: number,
  k: number,
  overrides: Partial<Omit<RunPoint, 'result'>> = {},
  byEngine: Record<string, { k: number; n: number }> = {},
): RunPoint {
  const measuredAt = `2026-07-${String(id).padStart(2, '0')}T00:00:00.000Z`
  const result = {
    version: AUDIT_RESULT_VERSION,
    brandName: 'b',
    category: 'c',
    competitors: [],
    engines: ['chatgpt'],
    aliases: [],
    measuredAt,
    totalAnswers: 60,
    citedRate: wilsonInterval(k, 60),
    shareOfVoice: wilsonInterval(0, 0),
    ranking: [],
    evidence: [],
    byEngine: Object.fromEntries(
      Object.entries(byEngine).map(([e, v]) => [e, wilsonInterval(v.k, v.n)]),
    ),
    byQuery: [],
    sources: [],
    sourceSummary: { answersWithCitations: 0, totalAnswers: 60, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false,
    unresolved: 0,
  } as AuditResult
  return {
    runId: `r${id}`,
    measuredAt,
    engines: ['chatgpt'],
    competitors: [],
    queryIds: ['q1'],
    detectorVersion: 1,
    skippedBefore: 0,
    result,
    ...overrides,
  }
}

describe('buildPeriodComparison', () => {
  it('묶음의 k·n을 합쳐 하나의 구간으로 만든다', () => {
    // 4회: 이전 [10, 12] 최근 [40, 44] (각 n=60)
    const cmp = buildPeriodComparison([point(1, 10), point(2, 12), point(3, 40), point(4, 44)])
    expect(cmp).not.toBeNull()
    expect(cmp!.window).toBe(2)
    expect(cmp!.prev.interval.k).toBe(22)
    expect(cmp!.prev.interval.n).toBe(120)
    expect(cmp!.curr.interval.k).toBe(84)
    expect(cmp!.curr.interval.n).toBe(120)
    // 22/120 → 84/120: 구간이 떨어진다 — 유의미한 상승.
    expect(cmp!.verdict).toBe('up')
    expect(cmp!.deltaPoints).toBe(70 - 18)
  })

  it('묶음 크기는 최대 4, 회차의 절반이다', () => {
    const ten = Array.from({ length: 10 }, (_, i) => point(i + 1, 30))
    expect(buildPeriodComparison(ten)!.window).toBe(4)
    const six = Array.from({ length: 6 }, (_, i) => point(i + 1, 30))
    expect(buildPeriodComparison(six)!.window).toBe(3)
  })

  it('회차가 4개 미만이면 null — 1회짜리 묶음은 헤드라인 델타와 같은 그림이다', () => {
    expect(buildPeriodComparison([point(1, 30), point(2, 30), point(3, 30)])).toBeNull()
  })

  it('묶음 안에 조건이 다른 회차가 있으면 incomparable — 합계 자체가 불법이다', () => {
    const cmp = buildPeriodComparison([
      point(1, 10),
      point(2, 12, { queryIds: ['q1', 'q2'] }),
      point(3, 40),
      point(4, 44),
    ])
    expect(cmp!.verdict).toBe('incomparable')
  })

  it('엔진 필터: 그 엔진의 k/n만 묶는다', () => {
    const eng = (k: number) => ({ chatgpt: { k, n: 30 } })
    const cmp = buildPeriodComparison(
      [point(1, 10, {}, eng(2)), point(2, 12, {}, eng(4)), point(3, 40, {}, eng(25)), point(4, 44, {}, eng(27))],
      { engine: 'chatgpt' },
    )
    expect(cmp!.prev.interval.k).toBe(6)
    expect(cmp!.prev.interval.n).toBe(60)
    expect(cmp!.curr.interval.k).toBe(52)
    expect(cmp!.verdict).toBe('up')
  })

  it('엔진 값이 없는 회차가 끼면 null — 0으로 채우지도, 말없이 빼지도 않는다', () => {
    const eng = (k: number) => ({ chatgpt: { k, n: 30 } })
    const cmp = buildPeriodComparison(
      [point(1, 10, {}, eng(2)), point(2, 12), point(3, 40, {}, eng(25)), point(4, 44, {}, eng(27))],
      { engine: 'chatgpt' },
    )
    expect(cmp).toBeNull()
  })

  it('묶음의 날짜 범위를 싣는다 — 화면이 어느 회차를 합쳤는지 말해야 한다', () => {
    const cmp = buildPeriodComparison([point(1, 10), point(2, 12), point(3, 40), point(4, 44)])
    expect(cmp!.prev.from).toContain('2026-07-01')
    expect(cmp!.prev.to).toContain('2026-07-02')
    expect(cmp!.curr.from).toContain('2026-07-03')
    expect(cmp!.curr.to).toContain('2026-07-04')
  })
})
