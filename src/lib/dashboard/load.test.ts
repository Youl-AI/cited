import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * `loadDashboard` · `loadRunDetail`의 **회차 → 화면 데이터 매핑** 테스트.
 *
 * ★ 여기서 지키는 것은 하나다. **`status: 'succeeded'`인데 `result IS NULL`인
 *   회차가 실제로 존재한다.** 측정 자체는 성공했고 스냅샷 저장(`saveRunResult`)만
 *   실패한 경우로, 3단계 cron은 그 회차를 다시 실패로 닫지 않는다 — 닫으면 이미
 *   측정을 마친 브랜드에 유료 파이프라인이 통째로 한 번 더 돌기 때문이다.
 *   운영자 메일도 없고 `cron.measure.snapshot_save_failed` 로그 한 줄만 남는다.
 *
 *   그래서 화면 쪽 계약은 **status가 아니라 스냅샷 유무**여야 한다.
 *     - 추이·히트맵·SoV·출처에서 **빠진다** (points에 없다)
 *     - 회차 목록에는 **남되** `hasResult: false`로 남는다 (감추지 않는다)
 *   이 회차가 0%짜리 점으로 그려지면 돈 낸 고객이 하지도 않은 측정을 본다 —
 *   이 제품이 저지를 수 있는 최악의 실패다.
 *
 * DB는 가짜다. 네트워크도 실제 쿼리도 없다 (`measure-run.test.ts`와 같은 방식).
 */

const mocks = vi.hoisted(() => ({
  brandRows: [] as unknown[],
  runRows: [] as unknown[],
  subscription: null as unknown,
  detailRows: [] as unknown[],
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    schema: actual.schema,
    db: {
      query: {
        subscriptions: { findFirst: async () => mocks.subscription },
      },
      select: () => ({
        from: (table: unknown) => ({
          // loadDashboard 쪽 체인
          where: () => ({
            orderBy: async () => (table === actual.schema.brands ? mocks.brandRows : mocks.runRows),
          }),
          // loadRunDetail 쪽 체인 (select({...}) + innerJoin)
          innerJoin: () => ({
            where: () => ({ limit: async () => mocks.detailRows }),
          }),
        }),
      }),
    },
  }
})

const { loadDashboard, loadRunDetail } = await import('./load')

function makeResult(): AuditResult {
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
    byQuery: [{ queryText: 'q-a', interval: wilsonInterval(2, 6) }],
    sources: [],
    sourceSummary: { totalAnswers: 60, answersWithCitations: 40, distinctDomains: 9, selfAnswers: 3 },
    hasSelfDomains: true,
    unresolved: 0,
  }
}

const planSnapshot = {
  plan: 'starter',
  queryPacks: 0,
  engines: ['chatgpt', 'gemini'],
  samples: { llm: 3, serp: 2 },
  queryIds: [],
  detectorVersion: 1,
  competitors: ['29CM'],
}

function makeRun(over: Record<string, unknown>) {
  return {
    id: 'run-x',
    brandId: 'b1',
    planSnapshot,
    completeness: {},
    metrics: null,
    result: null,
    status: 'succeeded',
    trigger: 'schedule',
    startedAt: new Date('2026-08-03T18:30:00Z'),
    finishedAt: new Date('2026-08-03T18:40:00Z'),
    ...over,
  }
}

beforeEach(() => {
  mocks.brandRows = [{ id: 'b1', name: '무신사', userId: 'u1', isActive: true }]
  mocks.runRows = []
  mocks.detailRows = []
  mocks.subscription = { userId: 'u1', plan: 'starter', queryPacks: 0, status: 'active' }
})

describe('loadDashboard — 스냅샷 없는 회차', () => {
  test('succeeded인데 result가 없으면 추이에서 빠지고 목록엔 hasResult:false로 남는다', async () => {
    mocks.runRows = [
      makeRun({ id: 'r-ok', result: makeResult() }),
      makeRun({
        id: 'r-nosnap',
        status: 'succeeded',
        result: null,
        startedAt: new Date('2026-08-10T18:30:00Z'),
      }),
    ]

    const data = await loadDashboard('u1', undefined)

    // 추이·히트맵·SoV·출처의 입력에서 통째로 빠진다
    expect(data.points.map((p) => p.runId)).toEqual(['r-ok'])
    // 그러나 목록에서 감추지는 않는다 — 최신 → 오래된 순
    expect(data.runList.map((r) => r.runId)).toEqual(['r-nosnap', 'r-ok'])
    const nosnap = data.runList.find((r) => r.runId === 'r-nosnap')
    expect(nosnap?.status).toBe('succeeded')
    expect(nosnap?.hasResult).toBe(false)
    expect(data.runList.find((r) => r.runId === 'r-ok')?.hasResult).toBe(true)
  })

  test('실패 회차도 목록에 남는다 — 감추면 "왜 이번 주 숫자가 없지"의 답이 사라진다', async () => {
    mocks.runRows = [makeRun({ id: 'r-fail', status: 'failed', result: null })]
    const data = await loadDashboard('u1', undefined)
    expect(data.points).toHaveLength(0)
    expect(data.runList).toEqual([
      {
        runId: 'r-fail',
        startedAt: '2026-08-03T18:30:00.000Z',
        status: 'failed',
        hasResult: false,
      },
    ])
  })

  test('브랜드가 없으면 빈 데이터', async () => {
    mocks.brandRows = []
    await expect(loadDashboard('u1', undefined)).resolves.toEqual({
      brands: [],
      selected: null,
      points: [],
      runList: [],
    })
  })
})

describe('loadRunDetail', () => {
  test('스냅샷이 없는 회차 상세는 null — 없는 측정을 그리지 않는다', async () => {
    mocks.detailRows = [
      { run: makeRun({ id: 'r-nosnap', result: null }), brand: { name: '무신사' } },
    ]
    await expect(loadRunDetail('u1', 'r-nosnap')).resolves.toBeNull()
  })

  test('스냅샷이 있으면 브랜드명·시각과 함께 돌려준다', async () => {
    mocks.detailRows = [
      { run: makeRun({ id: 'r-ok', result: makeResult() }), brand: { name: '무신사' } },
    ]
    const detail = await loadRunDetail('u1', 'r-ok')
    expect(detail?.brandName).toBe('무신사')
    expect(detail?.startedAt).toBe('2026-08-03T18:30:00.000Z')
    expect(detail?.result.citedRate.k).toBe(20)
  })

  test('회차가 없으면 null', async () => {
    mocks.detailRows = []
    await expect(loadRunDetail('u1', 'nope')).resolves.toBeNull()
  })
})
