import { estimateJudgeCostMilliKrw } from '@/lib/engines/pricing'

/**
 * 진단 1건의 원가 계량기.
 *
 * ## 왜 필요한가
 *
 * 2026-07-30까지 `audit:run`이 찍던 "원가"는 **수집(엔진 답변 생성)뿐**이었다.
 * 판정(Claude Haiku)과 별칭 생성(같은 모델)은 토큰을 `onUsage`로 이미 내보내고
 * 있었는데 아무도 받지 않았다 — `JUDGE_PRICING`은 정의만 되어 있고 호출부가
 * 없었다. 그래서 실제보다 **낮은** 원가가 남았다.
 *
 * 이 방향의 오차가 위험한 이유: 낮게 나온 원가로 유료 플랜 가격을 정하면
 * 마진을 실제보다 넉넉하게 믿게 된다. 이 저장소에서 반복해서 나온 "숫자가
 * 우리에게 유리한 쪽으로 틀리는" 부류다.
 *
 * ## 밀리원으로 누적한다
 *
 * 판정은 배치로 여러 번 도는데 배치 하나가 1원을 안 넘는 일이 흔하다.
 * 원 단위로 반올림해서 더하면 전부 0이 되어 **판정 원가가 통째로 사라진다.**
 * `estimateJudgeCostMilliKrw`를 쓰는 이유가 그것이다.
 *
 * 순수 모듈이다 — I/O 없음.
 */

export interface AuditCostBreakdown {
  /** 엔진 답변 생성 (ChatGPT·Gemini). 검색 요금이 이 값의 대부분이다 */
  collectionMilliKrw: number
  /** 언급 판정 (Claude Haiku 4.5) */
  judgeMilliKrw: number
  /** 별칭 생성 (같은 모델) */
  aliasMilliKrw: number
  totalMilliKrw: number
  /** 판정 배치 수. 0이면 판정이 아예 안 돌았다는 뜻이다 */
  judgeCalls: number
  aliasCalls: number
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
}

export interface AuditCostMeter {
  /** `runCollection`이 돌려준 밀리원. 여러 번 불러도 누적한다 */
  collection: (milliKrw: number) => void
  /** `createClaudeJudge({ onUsage })`에 그대로 넘긴다 */
  judge: (usage: TokenUsage) => void
  /** `createAliasGenerator({ onUsage })`에 그대로 넘긴다 */
  alias: (usage: TokenUsage) => void
  /** 지금까지의 스냅샷. 이후 누적이 이 객체를 바꾸지 않는다 */
  breakdown: () => AuditCostBreakdown
  /** 운영자용 한 줄. `수집 238.3원 · 판정 11.2원 · 별칭 0.4원 · 합계 249.9원` */
  format: () => string
}

/** 소수 첫째 자리까지. 밀리원을 그대로 보여주면 자릿수가 읽히지 않는다 */
function krw(milliKrw: number): string {
  return `${(milliKrw / 1000).toFixed(1)}원`
}

export function createCostMeter(): AuditCostMeter {
  let collectionMilliKrw = 0
  let judgeMilliKrw = 0
  let aliasMilliKrw = 0
  let judgeCalls = 0
  let aliasCalls = 0

  // ★ 음수를 조용히 받으면 원가가 실제보다 낮게 남는다. 이 계량기가 막으려는
  //   것이 바로 그 방향의 오차이므로 여기서 던진다.
  //   (토큰 음수는 `estimateJudgeCostMilliKrw`가 자체적으로 던진다.)
  function breakdown(): AuditCostBreakdown {
    return {
      collectionMilliKrw,
      judgeMilliKrw,
      aliasMilliKrw,
      totalMilliKrw: collectionMilliKrw + judgeMilliKrw + aliasMilliKrw,
      judgeCalls,
      aliasCalls,
    }
  }

  return {
    collection(milliKrw) {
      if (!Number.isFinite(milliKrw) || milliKrw < 0) {
        throw new Error(`수집 원가가 음수이거나 유한하지 않습니다 (${milliKrw})`)
      }
      collectionMilliKrw += milliKrw
    },
    judge(usage) {
      judgeMilliKrw += estimateJudgeCostMilliKrw(usage.tokensIn, usage.tokensOut)
      judgeCalls += 1
    },
    alias(usage) {
      aliasMilliKrw += estimateJudgeCostMilliKrw(usage.tokensIn, usage.tokensOut)
      aliasCalls += 1
    },
    breakdown,
    format() {
      const b = breakdown()
      return (
        `수집 ${krw(b.collectionMilliKrw)} · 판정 ${krw(b.judgeMilliKrw)} · ` +
        `별칭 ${krw(b.aliasMilliKrw)} · 합계 ${krw(b.totalMilliKrw)}`
      )
    },
  }
}
