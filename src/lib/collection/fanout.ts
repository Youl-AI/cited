import type { PlanSnapshot } from '@/lib/db/schema'
import { ENGINE_TIER, type EngineId } from '@/lib/plans'

export interface QueryInput {
  id: string
  text: string
}

export interface FanoutItem {
  queryId: string
  queryText: string
  engineId: EngineId
  sampleIndex: number
  /** 이 실행을 몇 ms 뒤로 미룰 것인가 */
  scheduledOffsetMs: number
}

/**
 * SerpApi는 결과를 1시간 캐시하고 캐시 조회는 무료다.
 * 두 샘플을 연속 호출하면 같은 캐시가 두 번 나와 정보량이 1회분이 된다.
 * → SERP 샘플은 시간대를 나눠 호출한다. AI 브리핑도 시점에 따라 바뀌므로
 *   이렇게 해야 진짜 2샘플이 된다.
 *
 * ★ 이 값을 1시간 아래로 줄이면 지표가 조용히 거짓이 된다 — 같은 캐시를 두 번
 *   읽고도 신뢰구간은 2회 측정한 것처럼 좁아진다. `fanout.test.ts`가 상한을
 *   지킨다.
 */
export const SERP_SAMPLE_GAP_MS = 4 * 60 * 60 * 1000 // 4시간 (오전·오후)

/**
 * 질의 × 엔진 × 샘플로 팬아웃한다. 각 항목이 독립 실행 단위가 된다.
 *
 * 순수 함수 — 입력을 변형하지 않는다.
 */
export function buildFanout(
  snapshot: PlanSnapshot,
  queries: readonly QueryInput[],
): FanoutItem[] {
  const allowed = new Set(snapshot.queryIds)
  // ★ 같은 질의 id를 두 번 팬아웃하면 원가가 두 배가 되고, 그보다 나쁘게는
  //   answerId(`queryId:engineId:sampleIndex`)가 충돌해 저장이 덮어써진다.
  //   돈은 두 번 쓰고 데이터는 한 번분만 남는다 — 알아채기 어려운 손실이다.
  const seen = new Set<string>()
  const items: FanoutItem[] = []

  for (const query of queries) {
    if (!allowed.has(query.id)) continue
    if (seen.has(query.id)) continue
    seen.add(query.id)

    for (const engineId of snapshot.engines) {
      const tier = ENGINE_TIER[engineId]
      const sampleCount = tier === 'llm' ? snapshot.samples.llm : snapshot.samples.serp

      for (let s = 0; s < sampleCount; s++) {
        items.push({
          queryId: query.id,
          queryText: query.text,
          engineId,
          sampleIndex: s,
          // LLM은 캐시가 없으므로 지연이 필요 없다.
          scheduledOffsetMs: tier === 'serp' ? s * SERP_SAMPLE_GAP_MS : 0,
        })
      }
    }
  }

  return items
}
