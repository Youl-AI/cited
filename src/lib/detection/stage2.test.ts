import { describe, expect, it, vi } from 'vitest'
import { runStage2 } from '@/lib/detection/stage2'
import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'

const fakeJudge: JudgeFn = async (batch) =>
  batch.map((req) => ({
    id: req.id,
    verdict: {
      isBrandReference: req.answerText.includes(req.brand.canonical),
      position: 1,
      sentiment: 'recommended' as const,
      context: '추천 목록 첫 번째로 언급됨',
    },
  }))

function req(id: string, answerText: string, canonical = '무신사'): JudgeRequest {
  return {
    id,
    answerText,
    brand: { canonical, aliases: [], ambiguous: false },
    matchedAlias: canonical,
  }
}

describe('runStage2', () => {
  it('판정 결과를 id로 매핑해 돌려준다', async () => {
    const result = await runStage2([req('a1', '무신사가 좋습니다')], fakeJudge)
    expect(result.get('a1')?.isBrandReference).toBe(true)
    expect(result.get('a1')?.position).toBe(1)
  })

  it('배치로 묶어 호출한다 (원가 절감)', async () => {
    const spy = vi.fn(fakeJudge)
    const items = Array.from({ length: 25 }, (_, i) => req(`a${i}`, '무신사'))
    await runStage2(items, spy, { batchSize: 10 })
    expect(spy).toHaveBeenCalledTimes(3) // 10 + 10 + 5
  })

  it('배치 크기를 넘기지 않는다', async () => {
    const spy = vi.fn(fakeJudge)
    const items = Array.from({ length: 25 }, (_, i) => req(`a${i}`, '무신사'))
    await runStage2(items, spy, { batchSize: 10 })
    for (const call of spy.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(10)
    }
    // 마지막 배치는 나머지 5건이다 — 잘려나가지 않았는지 확인한다.
    expect(spy.mock.calls.at(-1)?.[0].length).toBe(5)
  })

  it('배치 크기를 안 주면 20건씩 묶는다', async () => {
    const spy = vi.fn(fakeJudge)
    const items = Array.from({ length: 21 }, (_, i) => req(`a${i}`, '무신사'))
    await runStage2(items, spy)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0]?.[0].length).toBe(20)
  })

  it('빈 입력이면 judge를 호출하지 않는다', async () => {
    const spy = vi.fn(fakeJudge)
    const result = await runStage2([], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('judge가 던지면 그 배치만 미판정으로 남기고 나머지는 살린다', async () => {
    let call = 0
    const flaky: JudgeFn = async (batch) => {
      call++
      if (call === 1) throw new Error('rate limited')
      return fakeJudge(batch)
    }
    const items = Array.from({ length: 4 }, (_, i) => req(`a${i}`, '무신사'))
    const result = await runStage2(items, flaky, { batchSize: 2 })

    // 첫 배치(a0, a1)는 미판정, 둘째 배치(a2, a3)는 판정됨
    expect(result.has('a0')).toBe(false)
    expect(result.has('a1')).toBe(false)
    expect(result.get('a2')?.isBrandReference).toBe(true)
    expect(result.get('a3')?.isBrandReference).toBe(true)
  })

  it('배치가 실패하면 onBatchError로 원인과 id를 알려준다', async () => {
    const boom = new Error('rate limited')
    const onBatchError = vi.fn()
    const failing: JudgeFn = async () => {
      throw boom
    }
    await runStage2([req('a0', 'x'), req('a1', 'y')], failing, {
      batchSize: 2,
      onBatchError,
    })
    expect(onBatchError).toHaveBeenCalledTimes(1)
    expect(onBatchError).toHaveBeenCalledWith(boom, ['a0', 'a1'])
  })

  it('judge가 일부 id를 빠뜨리면 그 id는 미판정으로 남는다', async () => {
    const partial: JudgeFn = async (batch) =>
      batch.slice(0, 1).map((r) => ({
        id: r.id,
        verdict: {
          isBrandReference: true,
          position: 1,
          sentiment: 'neutral' as const,
          context: '',
        },
      }))
    const result = await runStage2([req('a1', 'x'), req('a2', 'y')], partial)
    expect(result.has('a1')).toBe(true)
    expect(result.has('a2')).toBe(false)
  })

  it('알 수 없는 id를 돌려주면 무시한다', async () => {
    const rogue: JudgeFn = async () => [
      {
        id: 'does-not-exist',
        verdict: {
          isBrandReference: true,
          position: 1,
          sentiment: 'neutral' as const,
          context: '',
        },
      },
    ]
    const result = await runStage2([req('a1', 'x')], rogue)
    expect(result.size).toBe(0)
  })

  it('다른 배치의 id를 돌려줘도 받아들인다 (유령 id만 걸러낸다)', async () => {
    // known 집합을 배치 단위가 아니라 전체 입력으로 잡아야 통과한다.
    // 배치 단위로 좁히면 이 경우가 조용히 유실된다.
    const crossBatch: JudgeFn = async (batch) =>
      batch.map((r) => ({
        // 첫 배치가 둘째 배치의 id를 돌려주는 상황
        id: r.id === 'a0' ? 'a2' : r.id,
        verdict: {
          isBrandReference: true,
          position: 1,
          sentiment: 'neutral' as const,
          context: '',
        },
      }))
    const items = Array.from({ length: 4 }, (_, i) => req(`a${i}`, 'x'))
    const result = await runStage2(items, crossBatch, { batchSize: 2 })
    expect(result.has('a2')).toBe(true)
  })

  it('같은 id를 두 번 돌려주면 마지막 판정이 남는다', async () => {
    const dup: JudgeFn = async (batch) => [
      {
        id: batch[0]!.id,
        verdict: {
          isBrandReference: false,
          position: null,
          sentiment: 'neutral' as const,
          context: '첫 번째',
        },
      },
      {
        id: batch[0]!.id,
        verdict: {
          isBrandReference: true,
          position: 2,
          sentiment: 'recommended' as const,
          context: '두 번째',
        },
      },
    ]
    const result = await runStage2([req('a1', 'x')], dup)
    expect(result.get('a1')?.context).toBe('두 번째')
  })
})
