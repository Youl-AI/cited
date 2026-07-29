import { describe, expect, it } from 'vitest'
import { mistakes, score, type GoldLabel } from '@/lib/detection/evaluate'

function labels(spec: Record<string, boolean>): GoldLabel[] {
  return Object.entries(spec).map(([id, label]) => ({ id, label }))
}

describe('score', () => {
  it('네 칸을 각각 센다', () => {
    const s = score(
      labels({ a: true, b: true, c: false, d: false }),
      new Map([
        ['a', true], // TP
        ['b', false], // FN
        ['c', true], // FP
        ['d', false], // TN
      ]),
    )
    expect(s).toMatchObject({ tp: 1, fn: 1, fp: 1, tn: 1 })
  })

  it('recall은 놓치지 않는 능력이다', () => {
    // 긍정 4건 중 3건을 맞춤
    const s = score(
      labels({ a: true, b: true, c: true, d: true }),
      new Map([
        ['a', true],
        ['b', true],
        ['c', true],
        ['d', false],
      ]),
    )
    expect(s.recall).toBeCloseTo(0.75, 10)
  })

  it('precision은 잘못 잡지 않는 능력이다', () => {
    // 언급이라고 4번 했는데 그중 3건만 진짜
    const s = score(
      labels({ a: true, b: true, c: true, d: false }),
      new Map([
        ['a', true],
        ['b', true],
        ['c', true],
        ['d', true],
      ]),
    )
    expect(s.precision).toBeCloseTo(0.75, 10)
  })

  it('recall과 precision을 뒤바꾸지 않는다', () => {
    // FN 2건, FP 0건 → recall만 떨어지고 precision은 1이어야 한다.
    const s = score(
      labels({ a: true, b: true, c: true, d: false }),
      new Map([
        ['a', true],
        ['b', false],
        ['c', false],
        ['d', false],
      ]),
    )
    expect(s.recall).toBeCloseTo(1 / 3, 10)
    expect(s.precision).toBe(1)
  })

  it('긍정 라벨이 없으면 recall은 0이 아니라 null이다', () => {
    // 0으로 두면 "재현율 0%"라는 거짓 실패가 나고, 1로 두면 게이트가
    // 빈 라벨 세트에 초록불을 준다. 잴 수 없는 것은 잴 수 없다고 말한다.
    const s = score(labels({ a: false, b: false }), new Map([['a', false], ['b', false]]))
    expect(s.recall).toBeNull()
  })

  it('언급이라고 한 적이 없으면 precision은 null이다', () => {
    const s = score(labels({ a: true }), new Map([['a', false]]))
    expect(s.precision).toBeNull()
  })

  it('예측이 없는 라벨을 미언급으로 때우지 않는다', () => {
    // 이걸 false로 때우면 파이프라인이 절반만 돌아도 지표가 그럴듯하게 나온다.
    const s = score(labels({ a: true, b: true }), new Map([['a', true]]))
    expect(s.missing).toEqual(['b'])
    expect(s.tp).toBe(1)
    expect(s.fn).toBe(0)
    expect(s.recall).toBe(1)
  })

  it('빈 입력이면 전부 0이고 지표는 null이다', () => {
    const s = score([], new Map())
    expect(s).toEqual({
      tp: 0,
      fp: 0,
      fn: 0,
      tn: 0,
      recall: null,
      precision: null,
      missing: [],
    })
  })

  it('예측 맵에만 있는 id는 무시한다', () => {
    const s = score(labels({ a: true }), new Map([['a', true], ['ghost', true]]))
    expect(s.tp).toBe(1)
    expect(s.fp).toBe(0)
  })

  it('완벽하면 둘 다 1이다', () => {
    const s = score(
      labels({ a: true, b: false }),
      new Map([
        ['a', true],
        ['b', false],
      ]),
    )
    expect(s.recall).toBe(1)
    expect(s.precision).toBe(1)
  })
})

describe('mistakes', () => {
  it('오탐과 놓침을 종류별로 돌려준다', () => {
    const m = mistakes(
      labels({ a: true, b: true, c: false, d: false }),
      new Map([
        ['a', true],
        ['b', false],
        ['c', true],
        ['d', false],
      ]),
    )
    expect(m).toEqual([
      { id: 'b', kind: 'FN' },
      { id: 'c', kind: 'FP' },
    ])
  })

  it('맞춘 것은 넣지 않는다', () => {
    const m = mistakes(labels({ a: true, b: false }), new Map([['a', true], ['b', false]]))
    expect(m).toEqual([])
  })

  it('예측이 없는 라벨은 오판정이 아니다 (미측정이다)', () => {
    const m = mistakes(labels({ a: true }), new Map())
    expect(m).toEqual([])
  })
})
