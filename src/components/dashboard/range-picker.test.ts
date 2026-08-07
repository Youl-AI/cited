import { describe, expect, it } from 'vitest'
import { DEFAULT_RANGE, RANGE_OPTIONS, resolveRange, sliceToRange } from './range-picker'

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
