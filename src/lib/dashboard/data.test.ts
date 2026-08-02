import { describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { PlanSnapshot } from '@/lib/db/schema'
import { wilsonInterval } from '@/lib/stats/wilson'
import {
  buildHeadline,
  buildHeatmap,
  buildSourceChanges,
  buildSovTrend,
  buildTrend,
  engineIdsIn,
  parseRunResult,
  toRunPoint,
  type RunPoint,
} from './data'

function makeResult(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: AUDIT_RESULT_VERSION,
    brandName: '무신사',
    category: '패션',
    competitors: ['29CM'],
    engines: ['chatgpt', 'gemini'],
    aliases: ['MUSINSA'],
    measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 60,
    citedRate: wilsonInterval(20, 60),
    shareOfVoice: wilsonInterval(20, 35),
    ranking: [],
    evidence: [],
    byEngine: { chatgpt: wilsonInterval(8, 30), gemini: wilsonInterval(12, 30) },
    byQuery: [
      { queryText: 'q-a', interval: wilsonInterval(0, 6) },
      { queryText: 'q-b', interval: wilsonInterval(5, 6) },
    ],
    sources: [
      {
        domain: 'blog.naver.com',
        answers: 12,
        pages: [],
        owner: 'third-party',
        share: wilsonInterval(12, 60),
      },
      { domain: 'musinsa.com', answers: 3, pages: [], owner: 'self', share: wilsonInterval(3, 60) },
    ],
    sourceSummary: { totalAnswers: 60, answersWithCitations: 40, distinctDomains: 9, selfAnswers: 3 },
    hasSelfDomains: true,
    unresolved: 0,
    ...over,
  }
}

function makePoint(runId: string, over: Partial<RunPoint> = {}): RunPoint {
  return {
    runId,
    measuredAt: `2026-08-0${runId.length}T18:30:00.000Z`,
    engines: ['chatgpt', 'gemini'],
    competitors: ['29CM'],
    result: makeResult(),
    ...over,
  }
}

describe('parseRunResult · toRunPoint', () => {
  test('스냅샷이 아니면 null — 실패 회차·구버전을 화면이 삼키지 않는다', () => {
    expect(parseRunResult(null)).toBeNull()
    expect(parseRunResult({ 이상한: '값' })).toBeNull()
    expect(parseRunResult(makeResult())).not.toBeNull()
  })

  test('toRunPoint — 스냅샷 없는 회차는 null', () => {
    const snapshot: PlanSnapshot = {
      plan: 'starter',
      queryPacks: 0,
      engines: ['chatgpt'],
      samples: { llm: 3, serp: 0 },
      queryIds: [],
      detectorVersion: 1,
      competitors: ['29CM'],
    }
    expect(
      toRunPoint({
        id: 'r1',
        startedAt: new Date('2026-08-03T18:30:00Z'),
        planSnapshot: snapshot,
        result: makeResult(),
      })?.runId,
    ).toBe('r1')
    expect(
      toRunPoint({ id: 'r2', startedAt: new Date(), planSnapshot: snapshot, result: null }),
    ).toBeNull()
  })
})

describe('buildTrend · engineIdsIn', () => {
  test('all은 citedRate, 엔진 id는 byEngine에서', () => {
    const points = [makePoint('a'), makePoint('ab')]
    expect(buildTrend(points, 'all')).toHaveLength(2)
    expect(buildTrend(points, 'chatgpt')[0]?.interval.k).toBe(8)
  })
  test('엔진이 없는 회차는 그 계열에서 빠진다 — 없는 값을 지어내지 않는다', () => {
    const noGemini = makePoint('a', {
      result: makeResult({ byEngine: { chatgpt: wilsonInterval(8, 30) } }),
    })
    expect(buildTrend([noGemini, makePoint('ab')], 'gemini')).toHaveLength(1)
    expect(engineIdsIn([noGemini])).toEqual(['chatgpt'])
  })

  /**
   * ★ 추이 점은 Wilson 구간을 **그대로** 들고 가야 한다. 어느 빌더든 점추정만
   *   남기거나 ±로 대칭화하면 화면이 "20% ± 5%"를 쓰게 되고, 그 순간 제품이
   *   파는 정직함(비대칭 구간, "N% ~ M%")이 사라진다.
   */
  test('구간은 비대칭 그대로 전달된다 — ±로 뭉개지 않는다', () => {
    const point = buildTrend([makePoint('a')], 'all')[0]
    expect(point?.interval).toEqual(wilsonInterval(20, 60))
    const iv = point!.interval
    expect(iv.point - iv.lower).not.toBeCloseTo(iv.upper - iv.point, 6)
  })

  test('n=0 회차는 추이에서 빠진다 — 측정 없음을 0%로 그리지 않는다', () => {
    const empty = makePoint('a', { result: makeResult({ citedRate: wilsonInterval(0, 0) }) })
    expect(buildTrend([empty, makePoint('ab')], 'all').map((p) => p.runId)).toEqual(['ab'])
  })
})

describe('buildHeatmap', () => {
  test('질의 × 회차 매트릭스 — 최신 회차의 질의 순서 기준', () => {
    const heat = buildHeatmap([makePoint('a'), makePoint('ab')])
    expect(heat.runs).toHaveLength(2)
    expect(heat.rows.map((r) => r.queryText)).toEqual(['q-a', 'q-b'])
    expect(heat.rows[0]?.cells[0]?.k).toBe(0)
  })
  test('그 회차에 없던 질의는 null 셀 — "측정 없음"', () => {
    const old = makePoint('a', {
      result: makeResult({ byQuery: [{ queryText: 'q-b', interval: wilsonInterval(1, 6) }] }),
    })
    const heat = buildHeatmap([old, makePoint('ab')])
    expect(heat.rows.find((r) => r.queryText === 'q-a')?.cells[0]).toBeNull()
  })
  test('maxRuns 초과분은 오래된 쪽을 버린다', () => {
    const points = ['a', 'ab', 'abc'].map((id) => makePoint(id))
    expect(buildHeatmap(points, 2).runs.map((r) => r.runId)).toEqual(['ab', 'abc'])
  })

  /** 0/6 셀도 상한이 살아 있어야 한다 — "6번 중 0번"은 "확실히 0%"가 아니다. */
  test('셀도 비대칭 구간을 그대로 들고 간다', () => {
    const cell = buildHeatmap([makePoint('a')]).rows[0]?.cells[0]
    expect(cell).toEqual(wilsonInterval(0, 6))
    expect(cell?.upper).toBeGreaterThan(0)
  })
})

describe('buildSovTrend', () => {
  test('n=0 회차는 빠진다 — 측정 없음을 0%로 그리지 않는다', () => {
    const noSov = makePoint('a', { result: makeResult({ shareOfVoice: wilsonInterval(0, 0) }) })
    expect(buildSovTrend([noSov, makePoint('ab')])).toHaveLength(1)
  })
  test('경쟁사 집합이 직전과 다르면 comparableWithPrev=false', () => {
    const changed = makePoint('ab', { competitors: ['29CM', '지그재그'] })
    const sov = buildSovTrend([makePoint('a'), changed])
    expect(sov[1]?.comparableWithPrev).toBe(false)
  })

  /**
   * ★ 위 테스트의 짝. false만 확인하면 항상 false를 돌려주는 구현도 통과한다.
   *   집합이 같은 구간은 반드시 이어져야 한다.
   */
  test('경쟁사 집합이 같으면 comparableWithPrev=true', () => {
    const sov = buildSovTrend([makePoint('a'), makePoint('ab')])
    expect(sov.map((p) => p.comparableWithPrev)).toEqual([true, true])
  })
})

describe('buildSourceChanges · buildHeadline', () => {
  test('최신 출처 상위 + 직전 회차 답변 수', () => {
    const prev = makePoint('a', {
      result: makeResult({
        sources: [
          {
            domain: 'blog.naver.com',
            answers: 7,
            pages: [],
            owner: 'third-party',
            share: wilsonInterval(7, 60),
          },
        ],
      }),
    })
    const rows = buildSourceChanges([prev, makePoint('ab')])
    expect(rows[0]).toMatchObject({ domain: 'blog.naver.com', answers: 12, prevAnswers: 7 })
    expect(rows[1]).toMatchObject({ domain: 'musinsa.com', prevAnswers: null })
  })
  test('헤드라인 — 회차 1개면 incomparable, 겹치면 unchanged', () => {
    expect(buildHeadline([makePoint('a')]).verdict).toBe('incomparable')
    expect(buildHeadline([makePoint('a'), makePoint('ab')]).verdict).toBe('unchanged')
  })
  test('엔진 구성이 다른 회차끼리는 incomparable — judgeChange 규칙', () => {
    const oneEngine = makePoint('a', { engines: ['chatgpt'] })
    expect(buildHeadline([oneEngine, makePoint('ab')]).verdict).toBe('incomparable')
  })

  /**
   * ★ unchanged만 확인하면 "판정을 아예 안 하는" 구현도 통과한다. 구간이
   *   확실히 떨어져 있을 때는 up이 나와야 판정이 살아 있는 것이다.
   */
  test('구간이 겹치지 않으면 up — 판정이 실제로 돌아간다', () => {
    const low = makePoint('a', { result: makeResult({ citedRate: wilsonInterval(2, 60) }) })
    const high = makePoint('ab', { result: makeResult({ citedRate: wilsonInterval(50, 60) }) })
    expect(buildHeadline([low, high]).verdict).toBe('up')
    expect(buildHeadline([high, low]).verdict).toBe('down')
  })
})
