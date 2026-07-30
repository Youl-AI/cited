import type { Completeness } from '@/lib/db/schema'
import type { EngineId } from '@/lib/plans'

export interface Outcome {
  engineId: EngineId
  ok: boolean
}

type EngineTally = { attempted: number; succeeded: number }

/**
 * 부분 실패를 허용하되 조용히 넘어가지 않는다.
 *
 * 주간 수집 전체를 버리면 그 주 데이터가 영영 사라진다 — AI 답변은 소급
 * 수집이 불가능하다. 남은 엔진으로 계산해 그냥 보여주면 숫자가 떨어진 이유가
 * 실제 하락인지 엔진 누락인지 알 수 없다. 그래서 저장하되 기록한다.
 *
 * ★ 시도하지 않은 엔진은 **키 자체를 만들지 않는다.** `{ attempted: 0 }`으로
 *   채우면 "돌렸는데 다 실패"와 "아예 안 돌렸다"가 같은 모양이 된다.
 *   앞은 장애고 뒤는 플랜 설정이다(무료 플랜은 naver를 안 돌린다).
 */
export function summarizeCompleteness(outcomes: readonly Outcome[]): Completeness {
  const out: Completeness = {}
  for (const o of outcomes) {
    const cur = out[o.engineId] ?? { attempted: 0, succeeded: 0 }
    out[o.engineId] = {
      attempted: cur.attempted + 1,
      succeeded: cur.succeeded + (o.ok ? 1 : 0),
    }
  }
  return out
}

/**
 * 전체 성공률.
 *
 * ★ 엔진별 비율의 평균이 **아니다.** 평균하면 시도 수가 적은 엔진이 과대
 *   대표된다 — naver 1회 실패가 chatgpt 100회 성공과 같은 무게를 갖는다.
 */
export function completenessRatio(c: Completeness): number {
  let attempted = 0
  let succeeded = 0
  for (const v of Object.values(c)) {
    if (!v) continue
    attempted += v.attempted
    succeeded += v.succeeded
  }
  if (attempted === 0) return 1
  return succeeded / attempted
}

/** 90% 미만이면 대시보드에 배지를 붙이고 차트를 점선으로 그린다. */
export function isDegraded(c: Completeness): boolean {
  return completenessRatio(c) < 0.9
}

/** `Completeness`를 순회한다. 키가 없는 엔진은 나오지 않는다. */
function entries(c: Completeness): [EngineId, EngineTally][] {
  return Object.entries(c).filter((e): e is [EngineId, EngineTally] => e[1] !== undefined)
}

/**
 * 이 수집에서 실제로 데이터를 얻은 엔진 목록.
 * 변화 판정(▲▼)은 엔진 구성이 같은 주끼리만 한다.
 */
export function comparableEngines(c: Completeness): EngineId[] {
  return entries(c)
    .filter(([, v]) => v.succeeded > 0)
    .map(([id]) => id)
    .sort()
}

/**
 * 통째로 실패한 엔진 목록 — 대시보드 배지 문구에 쓴다.
 *
 * ★ `attempted > 0`을 함께 본다. 시도하지 않은 엔진(무료 플랜의 naver)을
 *   "실패"로 표시하면 장애가 없는데 장애 배지가 붙는다.
 *   부분 실패(8/10)도 여기 넣지 않는다 — 배지에 "네이버 장애"라고 쓸 수
 *   있는 것은 그 엔진에서 **한 건도** 얻지 못했을 때뿐이다.
 */
export function failedEngines(c: Completeness): EngineId[] {
  return entries(c)
    .filter(([, v]) => v.attempted > 0 && v.succeeded === 0)
    .map(([id]) => id)
    .sort()
}
