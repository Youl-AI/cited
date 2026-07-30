import { describe, expect, it } from 'vitest'
import { createCostMeter } from '@/lib/audit/cost'
import { estimateJudgeCostMilliKrw } from '@/lib/engines/pricing'

describe('createCostMeter', () => {
  it('아무것도 안 쓰면 전부 0이다', () => {
    const meter = createCostMeter()
    expect(meter.breakdown()).toEqual({
      collectionMilliKrw: 0,
      judgeMilliKrw: 0,
      aliasMilliKrw: 0,
      totalMilliKrw: 0,
      judgeCalls: 0,
      aliasCalls: 0,
    })
  })

  it('세 항목을 더해 합계를 만든다', () => {
    const meter = createCostMeter()
    meter.collection(238_300)
    meter.judge({ tokensIn: 10_000, tokensOut: 2_000 })
    meter.alias({ tokensIn: 1_000, tokensOut: 300 })

    const b = meter.breakdown()
    expect(b.collectionMilliKrw).toBe(238_300)
    expect(b.judgeMilliKrw).toBe(estimateJudgeCostMilliKrw(10_000, 2_000))
    expect(b.aliasMilliKrw).toBe(estimateJudgeCostMilliKrw(1_000, 300))
    expect(b.totalMilliKrw).toBe(b.collectionMilliKrw + b.judgeMilliKrw + b.aliasMilliKrw)
  })

  // ★ 이것이 이 모듈이 존재하는 이유다. 판정은 배치로 여러 번 도는데 배치
  //   하나가 1원을 안 넘는 일이 흔하다. 원 단위로 반올림해서 더하면 전부
  //   0이 되어 **판정 원가가 통째로 사라진다.**
  it('1원 미만 호출을 여러 번 해도 사라지지 않는다', () => {
    const meter = createCostMeter()
    const tiny = { tokensIn: 100, tokensOut: 20 }
    for (let i = 0; i < 20; i += 1) meter.judge(tiny)

    const b = meter.breakdown()
    expect(b.judgeCalls).toBe(20)
    expect(b.judgeMilliKrw).toBe(estimateJudgeCostMilliKrw(100, 20) * 20)
    expect(b.judgeMilliKrw).toBeGreaterThan(0)
  })

  it('수집 원가를 여러 번 받아도 누적한다', () => {
    const meter = createCostMeter()
    meter.collection(1_000)
    meter.collection(2_500)
    expect(meter.breakdown().collectionMilliKrw).toBe(3_500)
  })

  it('호출 수를 항목별로 센다', () => {
    const meter = createCostMeter()
    meter.judge({ tokensIn: 1, tokensOut: 1 })
    meter.judge({ tokensIn: 1, tokensOut: 1 })
    meter.alias({ tokensIn: 1, tokensOut: 1 })

    const b = meter.breakdown()
    expect(b.judgeCalls).toBe(2)
    expect(b.aliasCalls).toBe(1)
  })

  // ★ 음수는 예산을 되돌린다. 조용히 받으면 원가가 실제보다 낮게 남는다.
  it('음수 수집 원가를 거부한다', () => {
    expect(() => createCostMeter().collection(-1)).toThrow()
  })

  it('음수 토큰을 거부한다', () => {
    expect(() => createCostMeter().judge({ tokensIn: -1, tokensOut: 0 })).toThrow()
    expect(() => createCostMeter().alias({ tokensIn: 0, tokensOut: -1 })).toThrow()
  })

  it('breakdown은 스냅샷이다 — 나중에 더해도 바뀌지 않는다', () => {
    const meter = createCostMeter()
    meter.collection(1_000)
    const before = meter.breakdown()
    meter.collection(1_000)
    expect(before.collectionMilliKrw).toBe(1_000)
  })

  describe('format', () => {
    it('항목과 합계를 소수 첫째 자리 원으로 적는다', () => {
      const meter = createCostMeter()
      meter.collection(238_300)
      expect(meter.format()).toBe('수집 238.3원 · 판정 0.0원 · 별칭 0.0원 · 합계 238.3원')
    })

    it('세 항목이 모두 있을 때도 합계가 맞는다', () => {
      const meter = createCostMeter()
      meter.collection(100_000)
      meter.judge({ tokensIn: 1_000_000, tokensOut: 0 }) // $1 = 1400원
      const text = meter.format()
      expect(text).toContain('수집 100.0원')
      expect(text).toContain('판정 1400.0원')
      expect(text).toContain('합계 1500.0원')
    })
  })
})
