import { describe, expect, it } from 'vitest'
import type { RunPoint } from './data'
import { buildKpis } from './kpi'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * KPI 타일의 계약은 값이 아니라 **정직성 규칙**이다(`kpi.ts` 머리말):
 * 겹치는 구간은 색을 얻지 못하고, 개수는 방향을 판정하지 않으며, 모르는 값은
 * 0%로 그리지 않는다. 이 셋이 깨지면 화면이 없는 주장을 하기 시작한다.
 */

interface Opts {
  sovK?: number
  sovN?: number
  domains?: number
  selfAnswers?: number
  hasSelfDomains?: boolean
  engines?: string[]
  queryIds?: string[]
  detectorVersion?: number
  competitors?: string[]
}

function point(id: string, opts: Opts = {}): RunPoint {
  const {
    sovK = 40,
    sovN = 100,
    domains = 20,
    selfAnswers = 6,
    hasSelfDomains = true,
    engines = ['chatgpt'],
    queryIds = ['q1'],
    detectorVersion = 1,
    competitors = ['29CM'],
  } = opts
  const total = 60
  return {
    runId: id,
    measuredAt: `2026-08-0${id}T00:00:00.000Z`,
    engines,
    competitors,
    queryIds,
    detectorVersion,
    skippedBefore: 0,
    result: {
      version: 1,
      brandName: '무신사',
      category: '패션',
      competitors,
      engines,
      aliases: [],
      measuredAt: `2026-08-0${id}T00:00:00.000Z`,
      totalAnswers: total,
      citedRate: wilsonInterval(30, total),
      shareOfVoice: wilsonInterval(sovK, sovN),
      ranking: [],
      evidence: [],
      byEngine: {},
      byQuery: [],
      sources: [],
      sourceSummary: {
        answersWithCitations: 40,
        totalAnswers: total,
        distinctDomains: domains,
        selfAnswers,
      },
      hasSelfDomains,
      unresolved: 0,
    },
  }
}

const find = (points: RunPoint[], id: string) => {
  const kpi = buildKpis(points).find((k) => k.id === id)
  if (!kpi) throw new Error(`${id} 타일이 없다`)
  return kpi
}

describe('buildKpis — 타일 구성', () => {
  it('점이 없으면 타일도 없다', () => {
    expect(buildKpis([])).toEqual([])
  })

  it('회차가 하나면 델타가 없다 — 비교 대상이 없으므로', () => {
    for (const kpi of buildKpis([point('1')])) {
      expect(kpi.delta, kpi.id).toBeNull()
    }
  })
})

describe('델타의 정직성 — 겹치는 구간은 변화가 아니다', () => {
  // 40/100 → 44/100. 구간이 넉넉히 겹치므로 '오차 범위'여야 한다.
  it('신뢰구간이 겹치면 unchanged다 (숫자는 남기고 판정만 무채색)', () => {
    const kpi = find([point('1', { sovK: 40 }), point('2', { sovK: 44 })], 'sov')
    expect(kpi.delta?.verdict).toBe('unchanged')
    expect(kpi.delta?.amount).toBe(4)
  })

  // 10/100 → 70/100. 구간이 떨어지므로 실제 상승이다.
  it('신뢰구간이 떨어지면 up/down으로 판정한다', () => {
    const up = find([point('1', { sovK: 10 }), point('2', { sovK: 70 })], 'sov')
    expect(up.delta?.verdict).toBe('up')
    const down = find([point('1', { sovK: 70 }), point('2', { sovK: 10 })], 'sov')
    expect(down.delta?.verdict).toBe('down')
  })

  it('델타 크기는 화면 표시(정수 %)와 같은 기준으로 반올림한다', () => {
    // 표시는 40% → 44%인데 델타가 3.5%p로 나오면 사용자가 산수를 의심한다.
    const kpi = find([point('1', { sovK: 40 }), point('2', { sovK: 44 })], 'sov')
    expect(kpi.delta?.amount).toBe(44 - 40)
  })

  // 조건이 다른 회차는 비교 자체를 하지 않는다 — buildHeadline과 같은 가드.
  it.each([
    ['엔진 구성', { engines: ['chatgpt', 'gemini'] }],
    ['질의 집합', { queryIds: ['q1', 'q2'] }],
    ['판정기 버전', { detectorVersion: 2 }],
  ])('%s이 다르면 incomparable이다', (_label, changed) => {
    const kpi = find([point('1'), point('2', { ...changed, sovK: 70 })], 'sov')
    expect(kpi.delta?.verdict).toBe('incomparable')
  })
})

describe('개수 값 — 방향을 판정하지 않는다', () => {
  it('도메인 수 델타는 verdict가 null이고 kind가 none이다', () => {
    const kpi = find([point('1', { domains: 18 }), point('2', { domains: 21 })], 'domains')
    // 초록으로 칠하는 순간 "출처가 늘어난 것은 좋은 일"이라는 없는 주장이 생긴다.
    expect(kpi.delta).toEqual({ amount: 3, verdict: null, kind: 'none' })
    expect(kpi.interval).toBeNull()
  })
})

describe('모르는 값은 0%로 그리지 않는다', () => {
  it('사이트 도메인을 모르면 우리 사이트 인용은 값 대신 사유를 낸다', () => {
    // selfAnswers === 0은 "인용 안 됨"과 "도메인을 몰라 못 셈"이 겹친다.
    const kpi = find([point('1', { hasSelfDomains: false, selfAnswers: 0 })], 'self-cited')
    expect(kpi.value).toBe('—')
    expect(kpi.interval).toBeNull()
    expect(kpi.unavailable).toBeTruthy()
  })

  it('경쟁사가 없으면 점유율은 값 대신 사유를 낸다', () => {
    const kpi = find([point('1', { sovK: 0, sovN: 0 })], 'sov')
    expect(kpi.value).toBe('—')
    expect(kpi.unavailable).toBeTruthy()
    expect(kpi.delta).toBeNull()
  })

  it('도메인을 알면 인용률을 낸다 — 분자·분모를 문구에 그대로 적는다', () => {
    const kpi = find([point('1', { selfAnswers: 15 })], 'self-cited')
    expect(kpi.value).toBe('25%') // 15/60
    expect(kpi.note).toContain('15')
    expect(kpi.note).toContain('60')
  })
})
