import { summarizeCompleteness, type Outcome } from '@/lib/collection/completeness'
import type { FanoutItem } from '@/lib/collection/fanout'
import { ENGINE_QUEUE_CONCURRENCY, RETRY, backoffMs } from '@/lib/collection/queues'
import { getEngine } from '@/lib/engines'
import { estimateCostMilliKrw } from '@/lib/engines/pricing'
import { EngineError, isRetryable, type Citation } from '@/lib/engines/types'
import type { Completeness } from '@/lib/db/schema'
import type { EngineId } from '@/lib/plans'

/**
 * 수집 실행 코어.
 *
 * ★ 잡 프레임워크를 모른다. 3단계에서는 운영자 CLI가 이 함수를 직접 부르고,
 *   4단계에서 Trigger.dev 잡이 **감싸기만** 한다. 로직을 잡 안으로 되돌리면
 *   테스트가 불가능해진다.
 *
 * ★ 저장하지 않는다. DB 접근은 `repository.ts`와 호출자의 몫이다.
 *   무료 진단은 아예 저장하지 않는다(`historyMonths: 0`).
 */

export interface CollectedAnswer {
  queryId: string
  queryText: string
  engineId: EngineId
  sampleIndex: number
  text: string
  /**
   * ★ 2단계 `Citation`을 그대로 쓴다 — `domain`이 있어야 한다. Gemini의 인용
   *   URI는 리다이렉트 프록시라 URL에서 호스트명을 뽑으면 출처가 전부
   *   `vertexaisearch.cloud.google.com` 하나로 뭉개진다.
   */
  citations: Citation[]
  /** 원본 응답. 절대 버리지 않는다 — 판정 로직 개선 후 재판정에 쓴다. */
  raw: unknown
  usage: {
    calls: number
    searches?: number
    tokensIn?: number
    tokensOut?: number
    tokensThinking?: number
  }
  /**
   * ★ 밀리원 정수다. 호출당 3.2원을 원 단위로 반올림하면 매번 0.2원이 사라지고,
   *   그 누락이 그대로 원가 집계의 오차가 된다.
   */
  costMilliKrw: number
}

export interface CollectOneOutcome {
  engineId: EngineId
  ok: boolean
  answer: CollectedAnswer | null
  error: string | null
  /** 실제로 몇 번 불렀는가. 재시도가 원가에 미치는 영향을 관측한다 */
  attempts: number
}

export interface CollectionResult {
  /** 성공한 답변만. **입력 순서**를 유지한다 */
  answers: CollectedAnswer[]
  /** 성공·실패 전부. 입력과 **같은 길이·같은 순서** */
  outcomes: CollectOneOutcome[]
  completeness: Completeness
  costMilliKrw: number
  durationMs: number
}

export interface RunCollectionDeps {
  /** 기본값은 레지스트리의 실제 엔진. 테스트가 가짜를 주입한다 */
  runOne?: (item: FanoutItem) => Promise<CollectedAnswer>
  /** 기본값은 setTimeout. 테스트가 즉시 반환하게 바꾼다 */
  sleep?: (ms: number) => Promise<void>
  /** 백오프 지터. 기본값은 Math.random — 테스트가 고정한다 */
  random?: () => number
  /** 진행률 통지. CLI가 콘솔에, 4단계 잡이 metadata.set에 연결한다 */
  onProgress?: (done: number, total: number) => void
  /** 엔진별 동시 실행 수. 주지 않은 엔진은 ENGINE_QUEUE_CONCURRENCY를 쓴다 */
  concurrency?: Partial<Record<EngineId, number>>
  /** 취소 신호 (잡 타임아웃·Ctrl-C) */
  signal?: AbortSignal
}

/**
 * 답변 식별자. 저장 키이자 판정 결과를 되붙이는 키다.
 *
 * ★ `buildFanout`이 같은 queryId를 두 번 팬아웃하지 않는 이유가 이것이다 —
 *   중복이 있으면 이 키가 충돌해 저장이 덮어써진다.
 */
export function answerKey(a: {
  queryId: string
  engineId: EngineId
  sampleIndex: number
}): string {
  return `${a.queryId}:${a.engineId}:${a.sampleIndex}`
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** 레지스트리에서 엔진을 꺼내 실제로 부른다. 원가는 여기서 계산한다. */
async function defaultRunOne(item: FanoutItem, signal?: AbortSignal): Promise<CollectedAnswer> {
  const engine = await getEngine(item.engineId)
  if (!engine.isConfigured()) {
    // ★ 재시도 불가로 던진다(400류). 키가 없는 것은 기다려도 해결되지 않는데,
    //   재시도하면 3배 시간을 쓰고 백오프까지 태운다.
    throw new EngineError(`${item.engineId} 엔진의 API 키가 설정되지 않았습니다`, {
      engineId: item.engineId,
      status: 400,
    })
  }
  const answer = await engine.run(item.queryText, {
    sampleIndex: item.sampleIndex,
    ...(signal ? { signal } : {}),
  })
  return {
    queryId: item.queryId,
    queryText: item.queryText,
    engineId: item.engineId,
    sampleIndex: item.sampleIndex,
    text: answer.text,
    citations: answer.citations,
    raw: answer.raw,
    usage: answer.usage,
    costMilliKrw: estimateCostMilliKrw(item.engineId, answer.usage),
  }
}

export async function runCollection(
  items: readonly FanoutItem[],
  deps: RunCollectionDeps = {},
): Promise<CollectionResult> {
  const started = Date.now()
  const sleep = deps.sleep ?? defaultSleep
  const random = deps.random ?? Math.random
  const runOne = deps.runOne ?? ((item: FanoutItem) => defaultRunOne(item, deps.signal))

  // ★ 결과를 **입력 순서**로 유지한다. 슬롯을 미리 잡고 제자리에 쓴다.
  //   완료 순서대로 밀어 넣으면 호출자가 zip으로 매핑할 때 조용히 어긋난다.
  const outcomes: (CollectOneOutcome | undefined)[] = items.map(() => undefined)
  let done = 0

  const attempt = async (index: number): Promise<void> => {
    const item = items[index]!
    let attempts = 0
    let lastError: unknown = null

    while (attempts < RETRY.maxAttempts) {
      attempts++
      try {
        const answer = await runOne(item)
        outcomes[index] = { engineId: item.engineId, ok: true, answer, error: null, attempts }
        return
      } catch (error) {
        lastError = error
        if (!isRetryable(error)) break
        // 마지막 시도가 실패했으면 쉬지 않는다 — 쉰 뒤에 아무것도 하지 않는다.
        if (attempts >= RETRY.maxAttempts) break

        const hint = error instanceof EngineError ? error.backoffHint : 'normal'
        await sleep(backoffMs(attempts, hint, random()))
      }
    }

    outcomes[index] = {
      engineId: item.engineId,
      ok: false,
      answer: null,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      attempts,
    }
  }

  const finish = async (index: number): Promise<void> => {
    await attempt(index)
    done++
    // ★ 실패도 진행분에 센다. 진행률이 실패에서 멈추면 운영자가 "멈춤"과
    //   "느림"을 구분할 수 없다.
    deps.onProgress?.(done, items.length)
  }

  // 예약 시각별로 묶는다. 오프셋은 **시작 시점 기준**이므로 그룹 사이에는
  // 차이만큼만 쉰다 — 오프셋을 그대로 두 번 쉬면 총 대기가 합계가 된다.
  const offsets = [...new Set(items.map((i) => i.scheduledOffsetMs))].sort((a, b) => a - b)
  let elapsedOffset = 0

  for (const offset of offsets) {
    const wait = offset - elapsedOffset
    if (wait > 0) await sleep(wait)
    elapsedOffset = offset

    const indexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.scheduledOffsetMs === offset)

    // 엔진별로 나눠 각자의 상한 안에서 돈다. 엔진끼리는 서로 막지 않는다 —
    // 전역 상한으로 묶으면 느린 엔진 하나가 전체를 끌어내린다.
    const byEngine = new Map<EngineId, number[]>()
    for (const { item, index } of indexes) {
      const bucket = byEngine.get(item.engineId)
      if (bucket) bucket.push(index)
      else byEngine.set(item.engineId, [index])
    }

    await Promise.all(
      [...byEngine].map(([engineId, queue]) =>
        drain(queue, limitFor(engineId, deps.concurrency), finish),
      ),
    )
  }

  const settled = outcomes.filter((o): o is CollectOneOutcome => o !== undefined)
  const answers = settled
    .map((o) => o.answer)
    .filter((a): a is CollectedAnswer => a !== null)

  // ★ attempted는 **항목 수**다. 재시도를 시도로 세면 성공률이 재시도 횟수에
  //   따라 달라지고 "90% 미만이면 배지"의 기준이 무의미해진다.
  const tallies: Outcome[] = settled.map((o) => ({ engineId: o.engineId, ok: o.ok }))

  return {
    answers,
    outcomes: settled,
    completeness: summarizeCompleteness(tallies),
    costMilliKrw: answers.reduce((sum, a) => sum + a.costMilliKrw, 0),
    durationMs: Date.now() - started,
  }
}

function limitFor(
  engineId: EngineId,
  overrides: RunCollectionDeps['concurrency'],
): number {
  const value = overrides?.[engineId] ?? ENGINE_QUEUE_CONCURRENCY[engineId]
  // 0이나 음수가 들어오면 아무것도 실행되지 않는다 — 조용히 0건 수집이 된다.
  return Math.max(1, value)
}

/** 상한만큼의 워커가 큐를 나눠 소진한다. */
async function drain(
  queue: readonly number[],
  limit: number,
  run: (index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const next = queue[cursor++]!
      await run(next)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker))
}
