import { describe, expect, it, vi } from 'vitest'
import type { FanoutItem } from '@/lib/collection/fanout'
import { RETRY, backoffMs } from '@/lib/collection/queues'
import { answerKey, runCollection } from '@/lib/collection/run'
import type { CollectedAnswer, RunCollectionDeps } from '@/lib/collection/run'
import { EngineError } from '@/lib/engines/types'
import type { EngineId } from '@/lib/plans'

function item(
  queryId: string,
  engineId: EngineId,
  sampleIndex = 0,
  scheduledOffsetMs = 0,
): FanoutItem {
  return { queryId, queryText: `질의 ${queryId}`, engineId, sampleIndex, scheduledOffsetMs }
}

function answer(i: FanoutItem, costMilliKrw = 40_000): CollectedAnswer {
  return {
    queryId: i.queryId,
    queryText: i.queryText,
    engineId: i.engineId,
    sampleIndex: i.sampleIndex,
    text: `${i.queryText} 답변`,
    citations: [],
    raw: {},
    usage: { calls: 1 },
    costMilliKrw,
  }
}

/** 테스트는 절대 실제로 기다리지 않는다. 대기 시간만 기록한다. */
function harness(overrides: Partial<RunCollectionDeps> = {}) {
  const slept: number[] = []
  const deps: RunCollectionDeps = {
    runOne: async (i) => answer(i),
    sleep: async (ms) => {
      slept.push(ms)
    },
    // 지터를 고정해 백오프가 결정적으로 되게 한다.
    random: () => 0,
    ...overrides,
  }
  return { deps, slept }
}

describe('runCollection — 기본 동작', () => {
  it('모든 항목을 실행하고 입력 순서를 유지한다', async () => {
    // ★ 순서가 어긋나면 호출자가 zip으로 매핑할 때 조용히 뒤바뀐다.
    //   2단계 detectMentions에서 겪은 것과 같은 문제다.
    const items = [
      item('q1', 'chatgpt'),
      item('q1', 'gemini'),
      item('q2', 'chatgpt'),
      item('q2', 'gemini'),
    ]
    const { deps } = harness()
    const r = await runCollection(items, deps)

    expect(r.answers).toHaveLength(4)
    expect(r.answers.map(answerKey)).toEqual([
      'q1:chatgpt:0',
      'q1:gemini:0',
      'q2:chatgpt:0',
      'q2:gemini:0',
    ])
    expect(r.outcomes.map((o) => o.engineId)).toEqual(['chatgpt', 'gemini', 'chatgpt', 'gemini'])
  })

  it('원가를 합산한다', async () => {
    const { deps } = harness({ runOne: async (i) => answer(i, 42_400) })
    const r = await runCollection([item('q1', 'chatgpt'), item('q1', 'gemini')], deps)
    expect(r.costMilliKrw).toBe(84_800)
  })

  it('completeness를 집계한다', async () => {
    const { deps } = harness({
      runOne: async (i) => {
        if (i.engineId === 'gemini') throw new EngineError('죽음', { engineId: 'gemini', status: 400 })
        return answer(i)
      },
    })
    const r = await runCollection([item('q1', 'chatgpt'), item('q1', 'gemini')], deps)
    expect(r.completeness.chatgpt).toEqual({ attempted: 1, succeeded: 1 })
    expect(r.completeness.gemini).toEqual({ attempted: 1, succeeded: 0 })
  })

  it('실패한 항목은 outcomes에 남고 answers에서 빠진다', async () => {
    // ★ 실패를 answers에 null로 끼워 넣으면 호출자가 그것을 "빈 답변"으로
    //   판정에 넘긴다. 그러면 언급 0%가 실패 때문인지 실제인지 알 수 없다.
    const { deps } = harness({
      runOne: async (i) => {
        if (i.queryId === 'q2') throw new EngineError('죽음', { engineId: i.engineId, status: 400 })
        return answer(i)
      },
    })
    const r = await runCollection([item('q1', 'chatgpt'), item('q2', 'chatgpt')], deps)

    expect(r.answers).toHaveLength(1)
    expect(r.answers[0]?.queryId).toBe('q1')
    expect(r.outcomes).toHaveLength(2)
    expect(r.outcomes[1]).toMatchObject({ ok: false, answer: null })
    expect(r.outcomes[1]?.error).toMatch(/죽음/)
  })

  it('전부 실패해도 던지지 않는다 (판단은 호출자 몫이다)', async () => {
    // 답변 0건으로 리포트를 만들지 말라는 판단은 executeAudit이 한다.
    // 여기서 던지면 completeness와 원가를 잃어 원인을 알 수 없다.
    const { deps } = harness({
      runOne: async () => {
        throw new EngineError('전멸', { engineId: 'chatgpt', status: 400 })
      },
    })
    const r = await runCollection([item('q1', 'chatgpt')], deps)
    expect(r.answers).toEqual([])
    expect(r.outcomes).toHaveLength(1)
  })

  it('항목이 없으면 아무것도 호출하지 않는다', async () => {
    const runOne = vi.fn()
    const { deps } = harness({ runOne })
    const r = await runCollection([], deps)
    expect(runOne).not.toHaveBeenCalled()
    expect(r).toMatchObject({ answers: [], outcomes: [], completeness: {}, costMilliKrw: 0 })
  })

  it('소요 시간을 기록한다', async () => {
    const { deps } = harness()
    const r = await runCollection([item('q1', 'chatgpt')], deps)
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('입력을 변형하지 않는다', async () => {
    const items = [item('q1', 'chatgpt'), item('q1', 'gemini')]
    const before = JSON.stringify(items)
    const { deps } = harness()
    await runCollection(items, deps)
    expect(JSON.stringify(items)).toBe(before)
  })
})

describe('runCollection — 재시도', () => {
  it('재시도 가능한 오류를 최대 시도 횟수까지 다시 부른다', async () => {
    let calls = 0
    const { deps, slept } = harness({
      runOne: async () => {
        calls++
        throw new EngineError('502', { engineId: 'chatgpt', status: 502 })
      },
    })
    const r = await runCollection([item('q1', 'chatgpt')], deps)

    expect(calls).toBe(RETRY.maxAttempts)
    // 시도 사이에만 쉰다 — 마지막 실패 뒤에는 쉬지 않는다.
    expect(slept).toHaveLength(RETRY.maxAttempts - 1)
    expect(r.outcomes[0]?.ok).toBe(false)
  })

  it('재시도로 성공하면 성공으로 기록한다', async () => {
    let calls = 0
    const { deps } = harness({
      runOne: async (i) => {
        if (++calls === 1) throw new EngineError('일시적', { engineId: i.engineId, status: 503 })
        return answer(i)
      },
    })
    const r = await runCollection([item('q1', 'chatgpt')], deps)

    expect(calls).toBe(2)
    expect(r.answers).toHaveLength(1)
    expect(r.completeness.chatgpt).toEqual({ attempted: 1, succeeded: 1 })
  })

  it('completeness의 attempted는 항목 수다 (재시도 횟수가 아니다)', async () => {
    // ★ 재시도를 시도로 세면 성공률이 재시도 횟수에 따라 달라진다.
    //   "90% 미만이면 배지"의 기준이 무의미해진다.
    let calls = 0
    const { deps } = harness({
      runOne: async (i) => {
        if (++calls < 3) throw new EngineError('일시적', { engineId: i.engineId, status: 503 })
        return answer(i)
      },
    })
    const r = await runCollection([item('q1', 'chatgpt')], deps)
    expect(calls).toBe(3)
    expect(r.completeness.chatgpt).toEqual({ attempted: 1, succeeded: 1 })
  })

  it('400류는 즉시 포기한다 (재시도해도 같은 결과다)', async () => {
    let calls = 0
    const { deps, slept } = harness({
      runOne: async () => {
        calls++
        throw new EngineError('잘못된 요청', { engineId: 'chatgpt', status: 400 })
      },
    })
    await runCollection([item('q1', 'chatgpt')], deps)

    expect(calls).toBe(1)
    expect(slept).toEqual([])
  })

  it('취소는 재시도하지 않는다', async () => {
    // ★ 취소를 재시도하면 취소의 의미가 사라진다 — 타임아웃으로 끊은 호출이
    //   백오프를 타고 되살아난다.
    let calls = 0
    const { deps } = harness({
      runOne: async () => {
        calls++
        const e = new Error('중단됨')
        e.name = 'AbortError'
        throw e
      },
    })
    await runCollection([item('q1', 'chatgpt')], deps)
    expect(calls).toBe(1)
  })

  it('429는 일반 오류보다 길게 쉰다', async () => {
    // rate limit은 3초 뒤에 다시 던져도 또 429다. 짧게 재시도하면 시도 횟수만
    // 태우고 결국 잃는다.
    const { deps: normalDeps, slept: normalSlept } = harness({
      runOne: async () => {
        throw new EngineError('502', { engineId: 'chatgpt', status: 502 })
      },
    })
    await runCollection([item('q1', 'chatgpt')], normalDeps)

    const { deps: rateDeps, slept: rateSlept } = harness({
      runOne: async () => {
        throw new EngineError('429', { engineId: 'chatgpt', status: 429 })
      },
    })
    await runCollection([item('q1', 'chatgpt')], rateDeps)

    expect(rateSlept[0]).toBeGreaterThan(normalSlept[0]!)
  })

  it('정체를 모르는 오류도 재시도한다', async () => {
    // 수집 데이터를 잃는 것이 헛된 재시도보다 비싸다.
    let calls = 0
    const { deps } = harness({
      runOne: async () => {
        calls++
        throw new Error('그냥 에러')
      },
    })
    await runCollection([item('q1', 'chatgpt')], deps)
    expect(calls).toBe(RETRY.maxAttempts)
  })
})

describe('runCollection — 동시성', () => {
  it('엔진별 동시 실행 상한을 넘지 않는다', async () => {
    let inFlight = 0
    let peak = 0
    const { deps } = harness({
      concurrency: { chatgpt: 2 },
      runOne: async (i) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        return answer(i)
      },
    })
    const items = Array.from({ length: 6 }, (_, n) => item(`q${n}`, 'chatgpt'))
    const r = await runCollection(items, deps)

    expect(r.answers).toHaveLength(6)
    expect(peak).toBe(2)
  })

  it('엔진끼리는 서로 막지 않는다', async () => {
    // ★ 전역 상한으로 묶으면 느린 엔진 하나가 전체를 끌어내린다.
    //   Gemini 33원 호출이 ChatGPT의 긴 응답을 기다릴 이유가 없다.
    const inFlight: Record<string, number> = { chatgpt: 0, gemini: 0 }
    let bothAtOnce = false
    const { deps } = harness({
      concurrency: { chatgpt: 1, gemini: 1 },
      runOne: async (i) => {
        inFlight[i.engineId] = (inFlight[i.engineId] ?? 0) + 1
        if ((inFlight.chatgpt ?? 0) > 0 && (inFlight.gemini ?? 0) > 0) bothAtOnce = true
        await new Promise((r) => setTimeout(r, 5))
        inFlight[i.engineId] = (inFlight[i.engineId] ?? 0) - 1
        return answer(i)
      },
    })
    await runCollection([item('q1', 'chatgpt'), item('q1', 'gemini')], deps)
    expect(bothAtOnce).toBe(true)
  })

  it('상한을 주지 않은 엔진도 실행된다 (기본값을 쓴다)', async () => {
    const { deps } = harness({ concurrency: { chatgpt: 1 } })
    const r = await runCollection([item('q1', 'chatgpt'), item('q1', 'naver')], deps)
    expect(r.answers).toHaveLength(2)
  })

  it('상한이 0이나 음수여도 최소 1로 돈다', async () => {
    // ★ 0을 그대로 쓰면 워커가 하나도 만들어지지 않아 **조용히 0건 수집**이
    //   된다. 던지지도 않고 결과가 비어 나오므로, 호출자는 그것을
    //   "언급 0%"나 "엔진 전멸"로 착각한다.
    for (const limit of [0, -1]) {
      const { deps } = harness({ concurrency: { chatgpt: limit } })
      const r = await runCollection([item('q1', 'chatgpt'), item('q2', 'chatgpt')], deps)
      expect(r.answers, `상한 ${limit}`).toHaveLength(2)
    }
  })
})

describe('runCollection — 예약 실행', () => {
  it('지연 항목을 즉시 항목 뒤에 실행하고 그만큼 쉰다', async () => {
    const order: string[] = []
    const { deps, slept } = harness({
      runOne: async (i) => {
        order.push(`${i.engineId}:${i.sampleIndex}`)
        return answer(i)
      },
    })
    const gap = 4 * 60 * 60 * 1000
    const items = [
      item('q1', 'naver', 0, 0),
      item('q1', 'naver', 1, gap),
      item('q1', 'chatgpt', 0, 0),
    ]
    await runCollection(items, deps)

    expect(order.at(-1)).toBe('naver:1')
    expect(slept).toEqual([gap])
  })

  it('여러 예약 시각이 있으면 차이만큼만 쉰다', async () => {
    // ★ 누적 오프셋을 그대로 두 번 쉬면 총 대기가 9시간이 된다.
    //   각 항목의 오프셋은 **시작 시점 기준**이다.
    const { deps, slept } = harness()
    await runCollection(
      [item('q1', 'naver', 0, 0), item('q1', 'naver', 1, 3_600_000), item('q1', 'naver', 2, 5_400_000)],
      deps,
    )
    expect(slept).toEqual([3_600_000, 1_800_000])
  })

  it('지연이 없으면 한 번도 쉬지 않는다', async () => {
    const { deps, slept } = harness()
    await runCollection([item('q1', 'chatgpt'), item('q1', 'gemini')], deps)
    expect(slept).toEqual([])
  })

  it('지연 항목도 입력 순서 자리에 결과가 들어간다', async () => {
    const { deps } = harness()
    const gap = 4 * 60 * 60 * 1000
    const items = [item('q1', 'naver', 1, gap), item('q1', 'chatgpt', 0, 0)]
    const r = await runCollection(items, deps)
    // 실행은 chatgpt가 먼저지만 결과 배열은 입력 순서다.
    expect(r.outcomes.map((o) => o.engineId)).toEqual(['naver', 'chatgpt'])
  })
})

describe('runCollection — 진행률', () => {
  it('완료마다 진행분과 총계를 알린다', async () => {
    const seen: [number, number][] = []
    const { deps } = harness({ onProgress: (done, total) => seen.push([done, total]) })
    await runCollection([item('q1', 'chatgpt'), item('q2', 'chatgpt'), item('q3', 'chatgpt')], deps)

    expect(seen).toHaveLength(3)
    expect(seen.every(([, total]) => total === 3)).toBe(true)
    expect(seen.map(([done]) => done).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('실패한 항목도 진행분에 센다', async () => {
    // 진행률이 실패에서 멈추면 운영자가 멈춤과 지연을 구분할 수 없다.
    const seen: number[] = []
    const { deps } = harness({
      onProgress: (done) => seen.push(done),
      runOne: async () => {
        throw new EngineError('죽음', { engineId: 'chatgpt', status: 400 })
      },
    })
    await runCollection([item('q1', 'chatgpt'), item('q2', 'chatgpt')], deps)
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('backoffMs', () => {
  it('시도가 늘면 대기가 늘어난다', () => {
    expect(backoffMs(2, 'normal', 0)).toBeGreaterThan(backoffMs(1, 'normal', 0))
  })

  it('상한을 넘지 않는다', () => {
    expect(backoffMs(20, 'normal', 1)).toBeLessThanOrEqual(RETRY.maxTimeoutMs)
  })

  it('429는 같은 시도에서 더 오래 쉰다', () => {
    expect(backoffMs(1, 'long', 0)).toBeGreaterThan(backoffMs(1, 'normal', 0))
  })

  it('지터가 대기를 흔든다', () => {
    expect(backoffMs(1, 'normal', 1)).toBeGreaterThan(backoffMs(1, 'normal', 0))
  })

  it('지터가 있어도 0보다 크다', () => {
    // 0이 되면 재시도가 백오프 없이 즉시 되돌아와 rate limit을 다시 때린다.
    expect(backoffMs(1, 'normal', 0)).toBeGreaterThan(0)
  })
})
