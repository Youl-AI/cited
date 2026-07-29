import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'
import type { Stage2Verdict } from './types'

export interface Stage2Options {
  /** 한 번의 LLM 호출에 묶을 판정 수 */
  batchSize?: number
  /** 배치 실패를 알리는 콜백 (로깅은 호출자 책임 — 여기는 순수해야 한다) */
  onBatchError?: (error: unknown, ids: string[]) => void
}

const DEFAULT_BATCH_SIZE = 20

/**
 * 1차 통과분을 배치로 묶어 2차 판정한다.
 *
 * 판정 실패는 데이터 손실이 아니다. 미판정으로 남기면 원본(answers.raw)이
 * 있으므로 나중에 재판정할 수 있다. 설계 ②에서 수집과 판정을 분리한 배당금이다.
 *
 * 순수 함수다 — judge를 주입받으므로 외부 I/O가 없다.
 */
export async function runStage2(
  items: readonly JudgeRequest[],
  judge: JudgeFn,
  opts: Stage2Options = {},
): Promise<Map<string, Stage2Verdict>> {
  const out = new Map<string, Stage2Verdict>()
  if (items.length === 0) return out

  const size = opts.batchSize ?? DEFAULT_BATCH_SIZE
  // ★ known을 **전체 입력**으로 잡는다. 배치 단위로 좁히면, 판정기가
  //   다른 배치의 id를 돌려줄 때 그 판정이 조용히 버려진다. 여기서 막으려는
  //   것은 "판정기가 지어낸 유령 id"뿐이지 "배치 경계를 넘은 id"가 아니다.
  const known = new Set(items.map((i) => i.id))

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    try {
      const responses = await judge(batch)
      for (const r of responses) {
        // judge가 만들어낸 유령 id를 무시한다.
        if (!known.has(r.id)) continue
        out.set(r.id, r.verdict)
      }
    } catch (error) {
      // 이 배치만 미판정으로 남기고 계속 간다.
      opts.onBatchError?.(
        error,
        batch.map((b) => b.id),
      )
    }
  }

  return out
}
