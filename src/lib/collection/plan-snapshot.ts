import type { PlanSnapshot } from '@/lib/db/schema'
import { PLANS, type PlanId } from '@/lib/plans'

export interface SnapshotArgs {
  plan: PlanId
  queryPacks: number
  queryIds: string[]
  /** 이 수집 시점에 등록된 경쟁사. Share of Voice의 분모를 결정한다 */
  competitors: string[]
  detectorVersion: number
}

/**
 * 수집 당시의 플랜 설정을 통째로 박제한다.
 *
 * 이것이 없으면 "지난달 대비 상승"이 실제 상승인지 조건 변경인지 구분할 수
 * 없고 시계열 전체가 무의미해진다.
 *
 * ★ 모든 배열을 **복사**한다. 박제가 목적인 함수가 호출자와 참조를 공유하면
 *   박제가 아니다 — 호출자가 나중에 경쟁사를 추가하면 이미 저장된 스냅샷의
 *   의미가 소급해서 바뀐다.
 */
export function buildPlanSnapshot(args: SnapshotArgs): PlanSnapshot {
  const config = PLANS[args.plan]
  return {
    plan: args.plan,
    queryPacks: args.queryPacks,
    engines: [...config.engines],
    samples: { ...config.samples },
    queryIds: [...args.queryIds],
    // ★ 정렬해서 담는다. 5단계가 "경쟁사 집합이 같은 주"끼리만 SoV에 ▲▼를
    //   붙이는데, 그 비교를 배열 동등성으로 한다. 순서가 실행마다 달라지면
    //   설정이 그대로인데도 매번 "비교 불가"가 된다.
    competitors: [...args.competitors].sort((a, b) => a.localeCompare(b, 'ko')),
    detectorVersion: args.detectorVersion,
  }
}
