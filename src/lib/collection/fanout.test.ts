import { describe, expect, it } from 'vitest'
import { SERP_SAMPLE_GAP_MS, buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import { expectedCallsPerRun } from '@/lib/plans'

const queries = [
  { id: 'q1', text: '러닝화 추천' },
  { id: 'q2', text: '운동화 브랜드' },
]

describe('buildPlanSnapshot', () => {
  it('플랜 설정을 통째로 박제한다', () => {
    const s = buildPlanSnapshot({
      plan: 'starter',
      queryPacks: 0,
      queryIds: ['q1', 'q2'],
      competitors: ['나이키'],
      detectorVersion: 1,
    })
    expect(s.plan).toBe('starter')
    expect(s.engines).toEqual(['chatgpt', 'gemini', 'naver', 'google_aio'])
    expect(s.samples).toEqual({ llm: 3, serp: 2 })
    expect(s.queryIds).toEqual(['q1', 'q2'])
    expect(s.detectorVersion).toBe(1)
  })

  it('질의 팩을 반영한다', () => {
    const s = buildPlanSnapshot({
      plan: 'business',
      queryPacks: 2,
      queryIds: [],
      competitors: [],
      detectorVersion: 1,
    })
    expect(s.queryPacks).toBe(2)
  })

  it('경쟁사 집합을 박제한다 (Share of Voice 비교 가능성)', () => {
    // ★ SoV는 분모가 "등록된 경쟁사"에 의존하는 유일한 지표다. 이 집합을
    //   남기지 않으면 고객이 경쟁사를 추가한 것을 실제 점유율 하락으로 보고한다.
    const s = buildPlanSnapshot({
      plan: 'starter',
      queryPacks: 0,
      queryIds: ['q1'],
      competitors: ['나이키', '뉴발란스'],
      detectorVersion: 1,
    })
    expect(s.competitors).toEqual(['나이키', '뉴발란스'])
  })

  it('경쟁사 순서를 정렬해 담는다', () => {
    // 순서가 실행마다 달라지면 "경쟁사 집합이 같은 주"를 비교할 때 배열을
    // 그대로 비교할 수 없다. 5단계가 그 비교로 ▲▼ 표시를 가른다.
    const s = buildPlanSnapshot({
      plan: 'starter',
      queryPacks: 0,
      queryIds: [],
      competitors: ['뉴발란스', '나이키', '호카'],
      detectorVersion: 1,
    })
    expect(s.competitors).toEqual(['나이키', '뉴발란스', '호카'])
  })

  it('입력 배열을 복사한다 (호출자가 나중에 바꿔도 스냅샷은 그대로)', () => {
    // 박제가 목적인 함수가 참조를 공유하면 박제가 아니다.
    const queryIds = ['q1']
    const competitors = ['나이키']
    const s = buildPlanSnapshot({
      plan: 'starter',
      queryPacks: 0,
      queryIds,
      competitors,
      detectorVersion: 1,
    })
    queryIds.push('q2')
    competitors.push('호카')
    expect(s.queryIds).toEqual(['q1'])
    expect(s.competitors).toEqual(['나이키'])
  })
})

describe('buildFanout', () => {
  it('질의 × 엔진 × 샘플로 팬아웃한다', () => {
    const s = snapshot('starter', ['q1', 'q2'])
    const items = buildFanout(s, queries)
    // 질의당 (2 LLM × 3) + (2 SERP × 2) = 10회, 질의 2개 = 20회
    expect(items).toHaveLength(20)
  })

  it('플랜별 총 호출 수가 plans.ts의 계산과 일치한다', () => {
    // ★ 이 수가 곧 원가다. 두 곳에서 따로 계산하면 언젠가 갈리고, 그때
    //   요금제 페이지의 원가 설명과 실제 청구가 어긋난다.
    for (const [plan, count] of [
      ['starter', 10],
      ['business', 30],
    ] as const) {
      const qs = Array.from({ length: count }, (_, i) => ({ id: `q${i}`, text: `질의${i}` }))
      const s = snapshot(
        plan,
        qs.map((q) => q.id),
      )
      expect(buildFanout(s, qs), plan).toHaveLength(expectedCallsPerRun(plan, count))
    }
  })

  it('무료 진단은 3질의 × 2엔진 × 1샘플 = 6회', () => {
    const s = snapshot('free', ['q1', 'q2', 'q3'])
    const items = buildFanout(s, [
      { id: 'q1', text: 'a' },
      { id: 'q2', text: 'b' },
      { id: 'q3', text: 'c' },
    ])
    expect(items).toHaveLength(6)
    expect(items.every((i) => i.engineId === 'chatgpt' || i.engineId === 'gemini')).toBe(true)
  })

  it('SERP 2샘플을 시간대로 나눈다 (SerpApi 1시간 캐시 회피)', () => {
    const s = snapshot('starter', ['q1'])
    const items = buildFanout(s, [queries[0]!])

    const naverSamples = items.filter((i) => i.engineId === 'naver')
    expect(naverSamples).toHaveLength(2)
    expect(naverSamples[0]?.scheduledOffsetMs).toBe(0)
    // 두 번째 샘플은 캐시 TTL(1시간)을 넘겨 예약된다
    expect(naverSamples[1]?.scheduledOffsetMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
  })

  it('SERP 간격 상수가 캐시 TTL보다 크다', () => {
    // 상수를 줄이는 변경이 조용히 들어오면 2샘플이 같은 캐시를 두 번 읽어
    // 정보량이 1회분이 되는데, 지표는 2회 측정한 것처럼 좁아진다.
    expect(SERP_SAMPLE_GAP_MS).toBeGreaterThan(60 * 60 * 1000)
  })

  it('LLM 샘플은 지연 없이 동시에 나간다 (캐시가 없다)', () => {
    const s = snapshot('starter', ['q1'])
    const items = buildFanout(s, [queries[0]!])
    const llm = items.filter((i) => i.engineId === 'chatgpt')
    expect(llm.every((i) => i.scheduledOffsetMs === 0)).toBe(true)
  })

  it('스냅샷에 없는 질의는 팬아웃하지 않는다', () => {
    const s = snapshot('starter', ['q1'])
    const items = buildFanout(s, queries) // q2는 스냅샷에 없다
    expect(items.every((i) => i.queryId === 'q1')).toBe(true)
  })

  it('같은 질의가 두 번 들어와도 한 번만 팬아웃한다', () => {
    // ★ 조용히 두 배로 부르면 원가가 두 배가 되고, 그보다 나쁘게는
    //   answerId(`queryId:engineId:sampleIndex`)가 충돌해 저장이 덮어써진다.
    //   즉 돈은 두 번 쓰고 데이터는 한 번분만 남는다.
    const s = snapshot('free', ['q1'])
    const items = buildFanout(s, [
      { id: 'q1', text: '러닝화 추천' },
      { id: 'q1', text: '러닝화 추천' },
    ])
    expect(items).toHaveLength(2) // 2엔진 × 1샘플
  })

  it('팬아웃 항목이 서로 구별된다', () => {
    // (질의, 엔진, 샘플)이 answerId가 된다. 중복이 있으면 저장이 덮어써진다.
    const s = snapshot('starter', ['q1', 'q2'])
    const items = buildFanout(s, queries)
    const keys = items.map((i) => `${i.queryId}:${i.engineId}:${i.sampleIndex}`)
    expect(new Set(keys).size).toBe(items.length)
  })

  it('질의문을 항목에 함께 담는다 (엔진이 id로는 아무것도 못 한다)', () => {
    const s = snapshot('free', ['q1'])
    const items = buildFanout(s, [{ id: 'q1', text: '러닝화 추천' }])
    expect(items.every((i) => i.queryText === '러닝화 추천')).toBe(true)
  })

  it('질의가 없으면 빈 배열', () => {
    expect(buildFanout(snapshot('starter', []), [])).toEqual([])
  })

  it('입력을 변형하지 않는다', () => {
    const s = snapshot('starter', ['q1', 'q2'])
    const before = JSON.stringify({ s, queries })
    buildFanout(s, queries)
    expect(JSON.stringify({ s, queries })).toBe(before)
  })
})

function snapshot(plan: 'free' | 'starter' | 'business', queryIds: string[]) {
  return buildPlanSnapshot({ plan, queryPacks: 0, queryIds, competitors: [], detectorVersion: 1 })
}
