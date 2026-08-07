import { describe, expect, it } from 'vitest'
import type { RunPoint } from './data'
import { buildDashboardCsv, csvFilename } from './export-csv'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * 내보내기의 계약은 형식이 아니라 **정직성**이다(export-csv.ts 머리말):
 * 모르는 값은 빈 칸이지 0이 아니고, 비율은 구간과 원시 분자·분모를 데리고
 * 나간다. 이게 깨지면 화면이 지켜 온 규칙이 파일에서 무너진다.
 */

function point(opts: {
  sovN?: number
  hasSelfDomains?: boolean
  measuredAt?: string
}): RunPoint {
  const { sovN = 100, hasSelfDomains = true, measuredAt = '2026-08-03T00:00:00.000Z' } = opts
  const result = {
    version: AUDIT_RESULT_VERSION,
    brandName: '무신사',
    category: '패션',
    competitors: sovN > 0 ? ['29CM'] : [],
    engines: ['chatgpt'],
    aliases: [],
    measuredAt,
    totalAnswers: 60,
    citedRate: wilsonInterval(30, 60),
    shareOfVoice: wilsonInterval(sovN > 0 ? 40 : 0, sovN),
    ranking: [],
    evidence: [],
    byEngine: {},
    byQuery: [],
    sources: [],
    sourceSummary: { answersWithCitations: 40, totalAnswers: 60, distinctDomains: 20, selfAnswers: 6 },
    hasSelfDomains,
    unresolved: 0,
  } as AuditResult
  return {
    runId: 'r1',
    measuredAt,
    engines: ['chatgpt'],
    competitors: result.competitors,
    queryIds: ['q1'],
    detectorVersion: 1,
    skippedBefore: 0,
    result,
  }
}

describe('buildDashboardCsv', () => {
  it('머리행 + 회차 행 — 언급률은 k와 구간 하한·상한을 데리고 나간다', () => {
    const csv = buildDashboardCsv([point({})])
    const [header, row] = csv.split('\n')
    expect(header).toBe(
      'measured_at,total_answers,cited_k,cited_rate,cited_ci_lower,cited_ci_upper,sov_rate,sov_ci_lower,sov_ci_upper,distinct_domains,self_cited_answers',
    )
    const cells = row!.split(',')
    expect(cells[0]).toBe('2026-08-03T00:00:00.000Z')
    expect(cells[2]).toBe('30')
    expect(cells[3]).toBe('0.5')
    // 구간이 점추정을 감싼다 — 하한 < 점 < 상한.
    expect(Number(cells[4])).toBeLessThan(0.5)
    expect(Number(cells[5])).toBeGreaterThan(0.5)
  })

  it('모르는 값은 빈 칸이다 — 0이 아니다', () => {
    // 경쟁사 미등록(sov n=0)·도메인 미등록(hasSelfDomains=false)
    const csv = buildDashboardCsv([point({ sovN: 0, hasSelfDomains: false })])
    const cells = csv.split('\n')[1]!.split(',')
    expect(cells[6]).toBe('') // sov_rate
    expect(cells[7]).toBe('') // sov_ci_lower
    expect(cells[8]).toBe('') // sov_ci_upper
    expect(cells[10]).toBe('') // self_cited_answers
  })

  it('아는 값은 나간다 — 점유율 구간, 우리 사이트 인용 수', () => {
    const cells = buildDashboardCsv([point({})]).split('\n')[1]!.split(',')
    expect(cells[6]).toBe('0.4')
    expect(cells[10]).toBe('6')
  })

  it('BOM을 붙이지 않는다 — 인코딩은 다운로드 층의 일이다', () => {
    expect(buildDashboardCsv([point({})]).charCodeAt(0)).not.toBe(0xfeff)
  })
})

describe('csvFilename', () => {
  it('브랜드와 마지막 측정일로 이름을 짓는다', () => {
    expect(csvFilename('무신사', [point({})])).toBe('cited-무신사-2026-08-03.csv')
  })
})
