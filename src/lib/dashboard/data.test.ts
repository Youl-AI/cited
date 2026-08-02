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
  toRunPoints,
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
    queryIds: ['q1', 'q2'],
    detectorVersion: 1,
    skippedBefore: 0,
    result: makeResult(),
    ...over,
  }
}

const SNAPSHOT: PlanSnapshot = {
  plan: 'starter',
  queryPacks: 0,
  engines: ['chatgpt'],
  samples: { llm: 3, serp: 0 },
  queryIds: ['q1', 'q2'],
  detectorVersion: 4,
  competitors: ['29CM'],
}

/** `collection_runs` 한 행 흉내 — `toRunPoints`의 입력. */
function makeRun(id: string, result: unknown, day = 3) {
  return {
    id,
    startedAt: new Date(`2026-08-0${day}T18:30:00.000Z`),
    planSnapshot: SNAPSHOT,
    result,
  }
}

describe('parseRunResult · toRunPoint', () => {
  test('스냅샷이 아니면 null — 실패 회차·구버전을 화면이 삼키지 않는다', () => {
    expect(parseRunResult(null)).toBeNull()
    expect(parseRunResult({ 이상한: '값' })).toBeNull()
    expect(parseRunResult(makeResult())).not.toBeNull()
  })

  /**
   * ★ 파서의 관대함은 **이 모듈이 실제로 파고드는 필드**에서 멈춰야 한다.
   *   `engineIdsIn`은 `Object.keys(result.byEngine)`를, `buildSovTrend`는
   *   `result.shareOfVoice.n`을 가드 없이 읽는다. 여기서 안 거르면 통과한
   *   스냅샷이 화면에서 터진다 — 주석은 "관대하다"고 하는데 실제로는 죽는다.
   */
  test('byEngine·shareOfVoice가 없으면 null — 파서가 뒤에서 읽는 필드를 검사한다', () => {
    const without = (key: keyof AuditResult): Record<string, unknown> => {
      const value: Record<string, unknown> = { ...makeResult() }
      delete value[key]
      return value
    }
    expect(parseRunResult(without('byEngine'))).toBeNull()
    expect(parseRunResult(without('shareOfVoice'))).toBeNull()
    // 배열이면 Object.keys가 '0'·'1'을 엔진 id로 내놓는다 — 그것도 거른다.
    expect(parseRunResult({ ...makeResult(), byEngine: [] })).toBeNull()
  })

  test('toRunPoint — 스냅샷 없는 회차는 null', () => {
    const snapshot: PlanSnapshot = SNAPSHOT
    const point = toRunPoint({
      id: 'r1',
      startedAt: new Date('2026-08-03T18:30:00Z'),
      planSnapshot: snapshot,
      result: makeResult(),
    })
    expect(point?.runId).toBe('r1')
    // ★ 비교 가능성 판정에 쓰이는 스냅샷 필드는 전부 실어 와야 한다. 하나라도
    //   빠지면 그 조건 변경이 순수 모듈에서 관측 불가능해진다.
    expect(point).toMatchObject({
      engines: ['chatgpt'],
      competitors: ['29CM'],
      queryIds: ['q1', 'q2'],
      detectorVersion: 4,
    })
    expect(
      toRunPoint({ id: 'r2', startedAt: new Date(), planSnapshot: snapshot, result: null }),
    ).toBeNull()
    // 회차 하나만 보면 앞에 무엇이 버려졌는지 알 수 없다 — 언제나 0.
    expect(point?.skippedBefore).toBe(0)
  })

  /**
   * ★ `runs.map(toRunPoint).filter(...)`는 버려진 회차의 **자리**를 잃는다.
   *   6/01 측정 → 6/08 스냅샷 저장 실패 → 6/15 측정이면, 남는 두 점은 조건이
   *   같으니 비교 가능한 게 맞다. 그런데 그 사이에는 **잰 값이 없는 한 주**가
   *   있다. 서수 축은 그 주를 통째로 감춰 6/01과 6/15를 옆칸에 나란히 앉힌다.
   *   여기서 세어 두지 않으면 화면이 그 사실을 알 방법이 없다.
   */
  test('toRunPoints — 버려진 회차 수를 자리에 남긴다', () => {
    const points = toRunPoints([
      makeRun('a', makeResult(), 1),
      makeRun('nosnap', null, 2), // succeeded인데 result IS NULL
      makeRun('c', makeResult(), 3),
      makeRun('d', makeResult(), 4),
    ])
    expect(points.map((p) => p.runId)).toEqual(['a', 'c', 'd'])
    expect(points.map((p) => p.skippedBefore)).toEqual([0, 1, 0])
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

/**
 * 추이 선의 **끊김**. `SovPoint`만 comparableWithPrev를 들고 있고 `TrendPoint`는
 * 없으면, 화면이 조건이 바뀐 두 점을 끊김 없는 선으로 잇는다 — 각 점은 참인데
 * 그 사이 선분이 거짓인, 가장 알아채기 어려운 종류의 거짓말이다.
 *
 * 도달 경로는 셋 다 실재한다. Starter→Business 업그레이드는 `PLANS[plan].engines`를
 * 바꾸고(SerpApi가 켜지는 날), 동결 후 질의 수정은 운영자 CLI로 **지원되는**
 * 경로이며(스펙 ②), 판정기 버전은 개선할 때마다 오른다.
 */
describe('buildTrend — comparableWithPrev', () => {
  test('첫 점은 true, 조건이 같으면 계속 true — 멀쩡한 선을 괜히 끊지 않는다', () => {
    expect(
      buildTrend([makePoint('a'), makePoint('ab')], 'all').map((p) => p.comparableWithPrev),
    ).toEqual([true, true])
  })

  test('엔진 구성이 바뀌면 그 구간이 끊긴다', () => {
    const upgraded = makePoint('ab', { engines: ['chatgpt', 'gemini', 'naver', 'google_aio'] })
    expect(
      buildTrend([makePoint('a'), upgraded], 'all').map((p) => p.comparableWithPrev),
    ).toEqual([true, false])
  })

  test('질의 집합이 바뀌면 그 구간이 끊긴다 — citedRate의 분모가 바뀐 것이다', () => {
    const edited = makePoint('ab', { queryIds: ['q1', 'q3'] })
    expect(
      buildTrend([makePoint('a'), edited], 'all').map((p) => p.comparableWithPrev),
    ).toEqual([true, false])
  })

  test('판정기 버전이 오르면 그 구간이 끊긴다 — 무엇을 언급으로 세는지가 바뀐 것이다', () => {
    const bumped = makePoint('ab', { detectorVersion: 2 })
    expect(
      buildTrend([makePoint('a'), bumped], 'all').map((p) => p.comparableWithPrev),
    ).toEqual([true, false])
  })

  test('질의 순서만 다른 것은 변경이 아니다 — 집합으로 비교한다', () => {
    const reordered = makePoint('ab', { queryIds: ['q2', 'q1'] })
    expect(buildTrend([makePoint('a'), reordered], 'all')[1]?.comparableWithPrev).toBe(true)
  })

  /**
   * ★ 비교 대상은 "직전 회차"가 아니라 **직전에 실제로 찍힌 점**이다. 가운데
   *   회차가 n=0으로 빠졌다고 조건 변경이 사라지지는 않는다.
   */
  test('빠진 회차 너머로도 조건 변경을 본다', () => {
    const skipped = makePoint('ab', {
      queryIds: ['q1', 'q3'],
      result: makeResult({ citedRate: wilsonInterval(0, 0) }),
    })
    const after = makePoint('abc', { queryIds: ['q1', 'q3'] })
    const trend = buildTrend([makePoint('a'), skipped, after], 'all')
    expect(trend.map((p) => p.runId)).toEqual(['a', 'abc'])
    expect(trend[1]?.comparableWithPrev).toBe(false)
  })

  /**
   * ★ **의도된 과잉 발화를 못 박는다.** `sameConditions`는 엔진 집합이 바뀌면
   *   개별 엔진 계열까지 끊는다 — chatgpt의 분모(30)는 그대로인데도. 그 선택의
   *   근거는 `sameConditions` 주석에 한 문단으로 적혀 있지만, 지금까지 그것을
   *   지키는 것은 산문뿐이었다. `engineId !== 'all'`이면 엔진 검사를 건너뛰도록
   *   "최적화"해도 나머지 테스트는 전부 초록이다.
   *
   *   완화하고 싶으면 `sameConditions`에 옵션을 받아라 — 본문에 특수 케이스를
   *   넣으면 어느 화면이 무엇을 포기했는지가 코드에서 사라진다.
   */
  test('엔진이 추가되면 개별 엔진 계열도 끊긴다 — 보수적 판정은 의도한 것이다', () => {
    // gemini만 추가됐고 chatgpt의 숫자(8/30)는 두 회차가 완전히 같다.
    const before = makePoint('a', {
      engines: ['chatgpt'],
      result: makeResult({ byEngine: { chatgpt: wilsonInterval(8, 30) } }),
    })
    const after = makePoint('ab', { engines: ['chatgpt', 'gemini'] })
    const trend = buildTrend([before, after], 'chatgpt')
    expect(trend.map((p) => p.interval.k)).toEqual([8, 8])
    expect(trend.map((p) => p.comparableWithPrev)).toEqual([true, false])
  })
})

/**
 * 추이 선의 **간격**. `comparableWithPrev`는 조건이 같은지만 본다 — 두 점 사이에
 * 측정이 통째로 빠진 주가 있어도 true다. 그 자체는 옳지만, 서수 축(점을 등간격
 * 으로 찍는 축)은 2주 떨어진 두 점을 붙어 있는 두 점으로 그린다. "매주 재고
 * 있다"는 인상이 거짓이 되는 자리이고, 화면이 알 방법은 이 값뿐이다.
 *
 * 원인은 둘 다 실재한다 — 스냅샷 저장만 실패한 `succeeded` 회차(`points`에
 * 아예 못 들어온다)와, 답변이 하나도 없어 n=0인 회차(계열에서 빠진다).
 */
describe('buildTrend — runsSkippedBefore', () => {
  test('연속한 회차 사이는 0 — 멀쩡한 간격을 벌리지 않는다', () => {
    expect(
      buildTrend([makePoint('a'), makePoint('ab')], 'all').map((p) => p.runsSkippedBefore),
    ).toEqual([0, 0])
  })

  test('스냅샷이 없어 빠진 회차가 간격으로 남는다 (NULL 스냅샷)', () => {
    // A → [스냅샷 저장 실패] → C. 조건은 셋 다 같아 comparable은 true다.
    const points = toRunPoints([
      makeRun('a', makeResult(), 1),
      makeRun('nosnap', null, 2),
      makeRun('c', makeResult(), 3),
    ])
    const trend = buildTrend(points, 'all')
    expect(trend.map((p) => p.runId)).toEqual(['a', 'c'])
    // 조건은 같다 — 여기서 선을 끊을 근거는 comparableWithPrev에 없다.
    expect(trend.map((p) => p.comparableWithPrev)).toEqual([true, true])
    // 그러나 그 사이에는 잰 값이 없는 회차가 하나 있다.
    expect(trend.map((p) => p.runsSkippedBefore)).toEqual([0, 1])
  })

  test('n=0으로 빠진 회차도 같은 간격으로 남는다', () => {
    const empty = makePoint('ab', { result: makeResult({ citedRate: wilsonInterval(0, 0) }) })
    const trend = buildTrend([makePoint('a'), empty, makePoint('abc')], 'all')
    expect(trend.map((p) => p.runId)).toEqual(['a', 'abc'])
    expect(trend.map((p) => p.comparableWithPrev)).toEqual([true, true])
    expect(trend.map((p) => p.runsSkippedBefore)).toEqual([0, 1])
  })

  test('두 원인이 겹치면 합쳐서 센다', () => {
    const points = toRunPoints([
      makeRun('a', makeResult(), 1),
      makeRun('nosnap', null, 2),
      makeRun('zero', makeResult({ citedRate: wilsonInterval(0, 0) }), 3),
      makeRun('d', makeResult(), 4),
    ])
    expect(buildTrend(points, 'all').map((p) => p.runsSkippedBefore)).toEqual([0, 2])
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

  test('질의 집합이 바뀌면 SoV도 끊긴다 — 경쟁사만 보는 게 아니다', () => {
    const edited = makePoint('ab', { queryIds: ['q1', 'q3'] })
    expect(buildSovTrend([makePoint('a'), edited])[1]?.comparableWithPrev).toBe(false)
  })

  test('판정기 버전이 오르면 SoV도 끊긴다', () => {
    const bumped = makePoint('ab', { detectorVersion: 2 })
    expect(buildSovTrend([makePoint('a'), bumped])[1]?.comparableWithPrev).toBe(false)
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
    // 조건이 같으니 화면이 "7 → 12" 화살표를 그려도 된다.
    expect(rows.every((r) => r.comparableWithPrev)).toBe(true)
  })

  /**
   * ★ 출처 표는 언급률 추이와 **같은 함정** 위에 앉아 있다. 화면은 이 행으로
   *   "2 → 5" 같은 증감을 그리는데, 그 사이에 운영자가 질의를 셋 더 넣었다면
   *   인용 수가 는 것은 브랜드가 한 일이 아니라 설정 변경이다. 추이는 선을
   *   끊는데 표만 화살표를 그리면, 같은 거짓말이 표 모양으로 나갈 뿐이다.
   *
   *   `prevAnswers`를 null로 뭉개지 않는 이유도 여기 있다 — "직전에 없던
   *   도메인(새로 등장)"과 "비교할 수 없는 회차"는 다른 사실이다.
   */
  test('조건이 바뀌면 comparableWithPrev=false — 설정 변경을 인용 증가로 그리지 않는다', () => {
    const prevRow = (answers: number) => ({
      domain: 'a.com',
      answers,
      pages: [],
      owner: 'third-party' as const,
      share: wilsonInterval(answers, 60),
    })
    const prev = makePoint('a', { result: makeResult({ sources: [prevRow(2)] }) })
    const currResult = makeResult({ sources: [prevRow(5)] })

    // 질의 집합이 바뀐 경우
    const editedQueries = makePoint('ab', { queryIds: ['q1', 'q3'], result: currResult })
    const q = buildSourceChanges([prev, editedQueries])
    expect(q[0]).toMatchObject({ domain: 'a.com', answers: 5, prevAnswers: 2 })
    expect(q[0]?.comparableWithPrev).toBe(false)

    // 판정기 버전이 오른 경우
    const bumped = makePoint('ab', { detectorVersion: 2, result: currResult })
    expect(buildSourceChanges([prev, bumped])[0]?.comparableWithPrev).toBe(false)

    // 엔진 구성이 바뀐 경우
    const moreEngines = makePoint('ab', { engines: ['chatgpt'], result: currResult })
    expect(buildSourceChanges([prev, moreEngines])[0]?.comparableWithPrev).toBe(false)

    // 조건이 같으면 그대로 true (항상 false를 돌려주는 구현을 막는다)
    const same = makePoint('ab', { result: currResult })
    expect(buildSourceChanges([prev, same])[0]?.comparableWithPrev).toBe(true)
  })

  test('직전 회차가 아예 없으면 comparableWithPrev=false — 비교 자체가 없다', () => {
    const rows = buildSourceChanges([makePoint('a')])
    expect(rows.every((r) => r.prevAnswers === null)).toBe(true)
    expect(rows.every((r) => r.comparableWithPrev)).toBe(false)
  })

  /**
   * ★ `aggregateSources`는 `'third-party'`를 **순수한 fallthrough**로 넣는다.
   *   `selfDomains`가 비어 있으면 고객 본인 사이트까지 전부 'third-party'가 된다.
   *   `hasSelfDomains`가 존재하는 이유가 정확히 이것이고("인용되지 않았다" vs
   *   "도메인을 몰라서 못 셌다"), 그 주석은 화면이 둘을 반드시 가르라고 한다.
   *   이 신호가 행에 실려 오지 않으면 표가 고객 자기 사이트를 "제3자"라고 단정한다.
   */
  test('자사 도메인을 모르는 회차의 행은 selfDomainsKnown=false로 표시된다', () => {
    const known = buildSourceChanges([makePoint('a')])
    expect(known.every((r) => r.selfDomainsKnown)).toBe(true)

    const unknown = makePoint('a', {
      result: makeResult({
        hasSelfDomains: false,
        sources: [
          {
            domain: 'musinsa.com',
            answers: 3,
            pages: [],
            // 자사 도메인을 모르니 본인 사이트도 'third-party'로 떨어진다.
            owner: 'third-party',
            share: wilsonInterval(3, 60),
          },
        ],
      }),
    })
    const rows = buildSourceChanges([unknown])
    expect(rows[0]).toMatchObject({
      domain: 'musinsa.com',
      owner: 'third-party',
      selfDomainsKnown: false,
    })
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

  /**
   * ★ `judgeChange`는 엔진 구성만 본다 — 질의 집합과 판정기 버전은 모른다.
   *   헤드라인이 그 둘을 먼저 걸러내지 않으면, 운영자가 동결 질의를 한 줄 고친
   *   다음 주에 고객 화면이 "통계적으로 유의미한 상승입니다"라고 말한다.
   *   브랜드는 아무것도 하지 않았는데.
   */
  test('질의 집합이 다르면 incomparable — 분모가 바뀐 것을 상승이라 하지 않는다', () => {
    const low = makePoint('a', { result: makeResult({ citedRate: wilsonInterval(2, 60) }) })
    const high = makePoint('ab', {
      queryIds: ['q1', 'q3'],
      result: makeResult({ citedRate: wilsonInterval(50, 60) }),
    })
    // 질의 집합이 같았다면 'up'이 나오는 조합이다.
    expect(buildHeadline([low, { ...high, queryIds: low.queryIds }]).verdict).toBe('up')
    expect(buildHeadline([low, high]).verdict).toBe('incomparable')
  })

  test('판정기 버전이 다르면 incomparable — 판정기 개선이 실적이 되지 않는다', () => {
    const low = makePoint('a', { result: makeResult({ citedRate: wilsonInterval(2, 60) }) })
    const high = makePoint('ab', {
      detectorVersion: 2,
      result: makeResult({ citedRate: wilsonInterval(50, 60) }),
    })
    expect(buildHeadline([low, { ...high, detectorVersion: 1 }]).verdict).toBe('up')
    expect(buildHeadline([low, high]).verdict).toBe('incomparable')
  })
})
