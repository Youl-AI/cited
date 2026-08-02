import { getTableColumns, type Table } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * `loadDashboard` · `loadRunDetail` 테스트.
 *
 * ★ **가짜는 `@/lib/db`가 아니라 `@neondatabase/serverless`다.**
 *   `.where()`가 인자를 무시하고 행을 돌려주는 가짜 db를 쓰면, WHERE 절이
 *   **관찰되지 않는다.** 실측으로: `eq(brands.userId, userId)`를 지우고,
 *   `loadRunDetail`의 소유 검사를 지우고, 이력 창 `gte`를 통째로 지워도
 *   23개 테스트가 전부 초록이었다. 교차 테넌시 유출 경계가 아무것에도
 *   걸려 있지 않았다는 뜻이다.
 *
 *   그래서 `onboarding/freeze.test.ts`·`generation.test.ts`와 같은 방식을 쓴다 —
 *   드리즐을 진짜로 돌리고 **뱉어낸 SQL 문자열**을 못 박는다. `vitest.config.ts`가
 *   형식이 유효한 더미 `DATABASE_URL`을 주고, neon HTTP 드라이버는 첫 쿼리 때
 *   비로소 네트워크를 타므로 그 자리를 가로채면 접속은 일어나지 않는다.
 *
 * ★ 그리고 여기서 지키는 행동 계약이 하나 더 있다. **`status: 'succeeded'`인데
 *   `result IS NULL`인 회차가 실제로 존재한다.** 측정 자체는 성공했고 스냅샷
 *   저장(`saveRunResult`)만 실패한 경우로, 3단계 cron은 그 회차를 다시 실패로
 *   닫지 않는다 — 닫으면 이미 측정을 마친 브랜드에 유료 파이프라인이 통째로 한
 *   번 더 돌기 때문이다. 남는 신호는 `cron.measure.snapshot_save_failed` 로그
 *   한 줄뿐이다.
 *
 *     - 추이·히트맵·SoV·출처에서 **빠진다** (points에 없다)
 *     - 회차 목록에는 **남되** `hasResult: false`로 남는다 (감추지 않는다)
 *
 *   이 회차가 0%짜리 점으로 그려지면 돈 낸 고객이 하지도 않은 측정을 본다 —
 *   이 제품이 저지를 수 있는 최악의 실패다.
 */

const capture = vi.hoisted(() => {
  const queries: { sql: string; params: unknown[] }[] = []
  /** 쿼리 순서대로 돌려줄 행 목록. 드리즐은 필드가 있으면 배열 모드로 읽는다. */
  const responses: unknown[][][] = []
  return {
    queries,
    responses,
    reset() {
      queries.length = 0
      responses.length = 0
    },
    client(sql: string, params: unknown[]) {
      queries.push({ sql, params })
      const out = responses.shift() ?? []
      return Promise.resolve({ rows: out, rowCount: out.length, fields: [], command: '' })
    },
  }
})

vi.mock('@neondatabase/serverless', () => ({ neon: () => capture.client }))

const { schema } = await import('@/lib/db')
const { loadDashboard, loadRunDetail } = await import('./load')

/** 공백을 뭉개고 소문자로 — 드리즐의 줄바꿈 차이에 테스트가 흔들리지 않게 */
function flat(sql: string): string {
  return sql.replaceAll(/\s+/g, ' ').toLowerCase()
}

/** `where` 이후만. 셀렉트 목록에 우연히 들어 있는 컬럼명과 헷갈리지 않게 한다. */
function whereOf(sql: string): string {
  return flat(sql).split(' where ')[1] ?? ''
}

/** `order by` 이후만 — 정렬 방향은 이 절 안에서만 물어야 한다. */
function orderByOf(sql: string): string {
  return flat(sql).split(' order by ')[1] ?? ''
}

/**
 * 드리즐이 `select()`로 뽑는 컬럼 **순서 그대로** 위치 배열 행을 만든다.
 * (배열 모드 응답이라 순서가 곧 계약이다 — 손으로 나열하면 스키마가 바뀔 때
 * 조용히 어긋난다.)
 */
function row(table: Table, values: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(table)).map((k) => values[k] ?? null)
}

const NOW = new Date('2026-08-01T00:00:00.000Z')

function brandRow(over: Record<string, unknown> = {}): unknown[] {
  return row(schema.brands, {
    id: 'b1',
    userId: 'u1',
    name: '무신사',
    category: '패션',
    aliases: [],
    ambiguous: false,
    competitors: [],
    queryQuota: 10,
    selfDomains: [],
    queryGenerations: 0,
    collectionWeekday: 1,
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  })
}

function subscriptionRow(over: Record<string, unknown> = {}): unknown[] {
  return row(schema.subscriptions, {
    id: 's1',
    userId: 'u1',
    plan: 'starter',
    status: 'active',
    queryPacks: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  })
}

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
  queryIds: ['q1'],
  detectorVersion: 1,
  competitors: ['29CM'],
}

function runRow(over: Record<string, unknown> = {}): unknown[] {
  return row(schema.collectionRuns, {
    id: 'run-x',
    brandId: 'b1',
    planSnapshot,
    completeness: {},
    metrics: null,
    result: null,
    status: 'succeeded',
    trigger: 'schedule',
    startedAt: '2026-07-03T18:30:00.000Z',
    finishedAt: '2026-07-03T18:40:00.000Z',
    ...over,
  })
}

/** 브랜드 1행 → 구독 1행 → 회차들. `loadDashboard`가 쏘는 순서 그대로. */
function stubDashboard(runs: unknown[][], subscription = subscriptionRow()) {
  capture.responses.push([brandRow()])
  capture.responses.push([subscription])
  capture.responses.push(runs)
}

beforeEach(() => {
  capture.reset()
  vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadDashboard — 테넌시 경계 (SQL로 못 박는다)', () => {
  test('브랜드 조회의 WHERE에 user_id가 있다 — 이게 없으면 남의 브랜드가 목록에 뜬다', async () => {
    stubDashboard([])
    await loadDashboard('u1', undefined)

    const where = whereOf(capture.queries[0]!.sql)
    expect(flat(capture.queries[0]!.sql)).toContain('from "brands"')
    // ★ 이 조건이 사라지면 대시보드가 전체 고객의 브랜드를 보여준다.
    expect(where).toContain('"user_id" =')
    expect(capture.queries[0]!.params).toContain('u1')
  })

  test('브랜드 조회의 WHERE에 is_active가 있다 — 비활성 브랜드는 목록에 없다', async () => {
    stubDashboard([])
    await loadDashboard('u1', undefined)
    expect(whereOf(capture.queries[0]!.sql)).toContain('"is_active" =')
    expect(capture.queries[0]!.params).toContain(true)
  })

  test('회차 조회는 선택된 브랜드로 스코프된다', async () => {
    stubDashboard([])
    await loadDashboard('u1', undefined)
    const runSql = capture.queries[2]!.sql
    expect(flat(runSql)).toContain('from "collection_runs"')
    expect(whereOf(runSql)).toContain('"brand_id" =')
    expect(capture.queries[2]!.params).toContain('b1')
  })

  test('loadRunDetail은 브랜드 소유자까지 WHERE로 검사한다 — 회차 id만으로는 남의 회차가 열린다', async () => {
    capture.responses.push([])
    await expect(loadRunDetail('u1', 'run-x')).resolves.toBeNull()

    const { sql, params } = capture.queries[0]!
    expect(flat(sql)).toContain('inner join "brands"')
    expect(whereOf(sql)).toContain('"collection_runs"."id" =')
    // ★ 이 조건이 사라지면 회차 id를 아는 누구나 남의 측정 결과를 통째로 본다.
    expect(whereOf(sql)).toContain('"brands"."user_id" =')
    expect(params).toContain('u1')
    expect(params).toContain('run-x')
  })
})

describe('loadDashboard — 이력 창과 정렬', () => {
  test('starter는 3개월 창이 WHERE로 나간다 (30일 근사)', async () => {
    stubDashboard([])
    await loadDashboard('u1', undefined)

    const { sql, params } = capture.queries[2]!
    // ★ 이 조건이 사라지면 3개월 플랜 고객이 전체 이력을 본다 — 플랜 차이가
    //   화면에서 사라진다.
    expect(whereOf(sql)).toContain('"started_at" >=')
    const cutoff = new Date(NOW.getTime() - 3 * 30 * 24 * 60 * 60 * 1000)
    expect(params.map(String)).toContain(cutoff.toISOString())
  })

  test('business(historyMonths=null)는 창을 걸지 않는다 — 무제한', async () => {
    stubDashboard([], subscriptionRow({ plan: 'business' }))
    await loadDashboard('u1', undefined)
    expect(whereOf(capture.queries[2]!.sql)).not.toContain('"started_at" >=')
  })

  /**
   * ★ 살아 있는 정책의 못 — **해지한 고객도 이력을 그대로 본다.**
   *   `revokePlan`은 구독 행을 지우지 않고 status만 'canceled'로 바꾸고,
   *   여기 구독 조회에는 status 필터가 없다. 의도된 동작이다: 고객이 돈 내고
   *   받은 정직한 측정을 소급해서 감추지 않는다. 누가 "해지자는 못 보게" 하려고
   *   status 필터를 넣으면 이 테스트가 막는다.
   */
  test('해지한 구독도 플랜의 이력 창을 그대로 받는다', async () => {
    stubDashboard(
      [runRow({ id: 'r-ok', result: makeResult() })],
      subscriptionRow({ status: 'canceled', canceledAt: '2026-07-20T00:00:00.000Z' }),
    )
    const data = await loadDashboard('u1', undefined)

    // 구독 조회 자체가 status를 보지 않는다.
    expect(whereOf(capture.queries[1]!.sql)).not.toContain('"status"')
    // 이력 창은 active와 똑같이 starter의 3개월이다 (0도, 무제한도 아니다).
    const cutoff = new Date(NOW.getTime() - 3 * 30 * 24 * 60 * 60 * 1000)
    expect(capture.queries[2]!.params.map(String)).toContain(cutoff.toISOString())
    // 그리고 회차가 실제로 화면까지 온다.
    expect(data.points.map((p) => p.runId)).toEqual(['r-ok'])
  })

  /**
   * ★ 이력 창은 **플랜에서만** 나온다. 구독 행이 없는 경로는 도달 불가능하지만
   *   (`onDelete: 'restrict'` + `createBrandAction`의 'no-plan' 게이트),
   *   기본값을 두면 그 분기가 언젠가 도달됐을 때 아무 소리 없이 정책을 하나
   *   만들어 낸다 — 무료 사용자에게 무제한 이력을 주거나, 돈 낸 고객의 회차를
   *   통째로 감추거나. 대답 없음을 기본값으로 덮지 않는다.
   */
  test('브랜드는 있는데 구독 행이 없으면 던진다 — 조용한 기본 이력 창은 없다', async () => {
    capture.responses.push([brandRow()])
    capture.responses.push([]) // 구독 없음
    await expect(loadDashboard('u1', undefined)).rejects.toThrow(/구독 행이 없습니다/)
    // 회차 쿼리까지 가지 않는다 — 어떤 창을 걸어야 할지 알 수 없으므로.
    expect(capture.queries).toHaveLength(2)
  })

  /**
   * ★ `buildHeadline`·`buildSourceChanges`·`buildTrend`는 "마지막 두 개"를 집어
   *   최신·직전으로 쓴다. 정렬이 뒤집히면 화면이 **가장 오래된 회차를 최신이라고**
   *   말하고, 상승과 하락이 통째로 뒤바뀐다. 타입은 아무것도 못 잡는다.
   */
  test('회차는 오래된 → 최신 순으로 정렬해서 가져온다', async () => {
    stubDashboard([])
    await loadDashboard('u1', undefined)
    const runSql = flat(capture.queries[2]!.sql)
    expect(runSql).toContain('order by "collection_runs"."started_at"')
    // ★ **`order by` 절만** 본다. 평탄화한 SQL 전체에 'desc'가 없다고 주장하면,
    //   `collection_runs`에 `description` 컬럼이 하나 생기는 날 정렬과 아무
    //   상관없는 이유로 "정렬이 뒤집혔다"며 깨진다.
    expect(orderByOf(runSql)).not.toContain('desc')
  })
})

describe('loadDashboard — 스냅샷 없는 회차', () => {
  test('succeeded인데 result가 없으면 추이에서 빠지고 목록엔 hasResult:false로 남는다', async () => {
    stubDashboard([
      runRow({ id: 'r-ok', result: makeResult() }),
      runRow({
        id: 'r-nosnap',
        status: 'succeeded',
        result: null,
        startedAt: '2026-07-10T18:30:00.000Z',
      }),
    ])

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

  /**
   * ★ 빠진 회차의 **자리**까지 화면에 온다. 로더가 회차를 한 건씩 변환해
   *   `filter`로 걸러 버리면, 6/03과 6/17 사이에
   *   측정이 없던 회차가 하나 있었다는 사실이 데이터에서 통째로 사라진다 —
   *   서수 축 차트는 두 점을 옆칸에 나란히 앉히고, 고객은 매주 잰 것으로 읽는다.
   */
  test('스냅샷 없는 회차의 자리가 points에 간격으로 남는다', async () => {
    stubDashboard([
      runRow({ id: 'r1', result: makeResult(), startedAt: '2026-07-03T18:30:00.000Z' }),
      runRow({ id: 'r-nosnap', result: null, startedAt: '2026-07-10T18:30:00.000Z' }),
      runRow({ id: 'r3', result: makeResult(), startedAt: '2026-07-17T18:30:00.000Z' }),
    ])
    const data = await loadDashboard('u1', undefined)
    expect(data.points.map((p) => p.runId)).toEqual(['r1', 'r3'])
    expect(data.points.map((p) => p.skippedBefore)).toEqual([0, 1])
  })

  test('실패 회차도 목록에 남는다 — 감추면 "왜 이번 주 숫자가 없지"의 답이 사라진다', async () => {
    stubDashboard([runRow({ id: 'r-fail', status: 'failed', result: null })])
    const data = await loadDashboard('u1', undefined)
    expect(data.points).toHaveLength(0)
    expect(data.runList).toEqual([
      {
        runId: 'r-fail',
        startedAt: '2026-07-03T18:30:00.000Z',
        status: 'failed',
        hasResult: false,
      },
    ])
  })

  test('브랜드가 없으면 빈 데이터 — 회차 조회도 쏘지 않는다', async () => {
    capture.responses.push([])
    await expect(loadDashboard('u1', undefined)).resolves.toEqual({
      brands: [],
      selected: null,
      points: [],
      runList: [],
    })
    expect(capture.queries).toHaveLength(1)
  })

  test('스냅샷은 planSnapshot의 비교 가능성 필드를 그대로 싣는다', async () => {
    stubDashboard([runRow({ id: 'r-ok', result: makeResult() })])
    const data = await loadDashboard('u1', undefined)
    expect(data.points[0]).toMatchObject({
      engines: ['chatgpt', 'gemini'],
      competitors: ['29CM'],
      queryIds: ['q1'],
      detectorVersion: 1,
    })
  })
})

describe('loadRunDetail', () => {
  test('스냅샷이 없는 회차 상세는 null — 없는 측정을 그리지 않는다', async () => {
    capture.responses.push([[...runRow({ id: 'r-nosnap', result: null }), ...brandRow()]])
    await expect(loadRunDetail('u1', 'r-nosnap')).resolves.toBeNull()
  })

  test('스냅샷이 있으면 브랜드명·시각과 함께 돌려준다', async () => {
    capture.responses.push([
      [...runRow({ id: 'r-ok', result: makeResult() }), ...brandRow({ name: '무신사' })],
    ])
    const detail = await loadRunDetail('u1', 'r-ok')
    expect(detail?.brandName).toBe('무신사')
    expect(detail?.startedAt).toBe('2026-07-03T18:30:00.000Z')
    expect(detail?.result.citedRate.k).toBe(20)
  })

  test('회차가 없으면 null', async () => {
    capture.responses.push([])
    await expect(loadRunDetail('u1', 'nope')).resolves.toBeNull()
  })
})
