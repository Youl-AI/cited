import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RANGE,
  isRangeUsable,
  RANGE_OPTIONS,
  resolveRange,
  sliceToRange,
} from './range-picker'

describe('보기 범위 — 자르기 규칙', () => {
  it('기본값은 전체다 — 우리가 임의로 잘라 보여주지 않는다', () => {
    expect(resolveRange(DEFAULT_RANGE)).toBeNull()
    expect(resolveRange(undefined)).toBeNull()
  })

  it('모르는 값은 전체로 떨어진다 — URL을 손으로 고쳐도 화면이 깨지지 않는다', () => {
    expect(resolveRange('99')).toBeNull()
    expect(resolveRange('<script>')).toBeNull()
  })

  it('최신 쪽을 남긴다 — points는 오래된 → 최신 순이다', () => {
    const points = [1, 2, 3, 4, 5, 6]
    expect(sliceToRange(points, 4)).toEqual([3, 4, 5, 6])
    expect(sliceToRange(points, null)).toEqual(points)
  })

  it('가진 회차보다 넓게 잘라도 있는 만큼만 낸다', () => {
    expect(sliceToRange([1, 2], 12)).toEqual([1, 2])
  })

  it('원본을 변형하지 않는다 — 잘라 낸 결과가 새 배열이다', () => {
    const points = [1, 2, 3]
    expect(sliceToRange(points, null)).not.toBe(points)
    expect(points).toEqual([1, 2, 3])
  })

  // ★ 4회차 미만으로 자르면 변화 판정에 쓸 직전 회차까지 잘려 추이가 점 몇
  //   개가 된다. 선택지를 늘릴 때 이 하한을 넘지 않게 잠근다.
  it('가장 좁은 선택지도 4회차 이상이다', () => {
    const finite = RANGE_OPTIONS.map((o) => o.runs).filter((r): r is number => r !== null)
    expect(finite.length).toBeGreaterThan(0)
    expect(Math.min(...finite)).toBeGreaterThanOrEqual(4)
  })
})

/**
 * ★ 예전 구현은 "자를 것이 없으면 컨트롤을 만들지 않는다"였고, 그 결과
 *   `?range=4`로 좁혀 놓은 상태에서 컨트롤이 통째로 사라져 **전체로 돌아갈
 *   길이 없었다**. 되돌아올 길은 언제나 있어야 한다.
 */
describe('선택지 가용성 — 되돌아올 길을 없애지 않는다', () => {
  it("'전체'는 회차 수와 무관하게 언제나 쓸 수 있다", () => {
    expect(isRangeUsable(null, 0)).toBe(true)
    expect(isRangeUsable(null, 1)).toBe(true)
    expect(isRangeUsable(null, 999)).toBe(true)
  })

  it('가진 회차보다 넓게 자르는 선택지는 쓸모가 없다 — 전체와 같은 화면이다', () => {
    expect(isRangeUsable(4, 4)).toBe(false)
    expect(isRangeUsable(12, 10)).toBe(false)
  })

  it('가진 회차보다 좁게 자르면 쓸모가 있다', () => {
    expect(isRangeUsable(4, 5)).toBe(true)
    expect(isRangeUsable(12, 30)).toBe(true)
  })

  it('회차가 많으면 유한 선택지가 하나 이상 열린다 — 컨트롤이 숨지 않는다', () => {
    const open = RANGE_OPTIONS.filter((o) => o.runs !== null && isRangeUsable(o.runs, 10))
    expect(open.length).toBeGreaterThan(0)
  })
})
