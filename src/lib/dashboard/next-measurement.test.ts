import { describe, expect, it } from 'vitest'
import { nextMeasurementAfter } from './next-measurement'

/**
 * 실제 스케줄(UTC 일·화·목 18:00 = KST 월·수·금 03:00)의 다음 발화를
 * 계산한다는 계약. 스케줄(measure.yml)을 바꾸면 이 테스트가 먼저 깨져야 한다.
 */
describe('nextMeasurementAfter', () => {
  it('발화일 전이면 그 주의 다음 발화(UTC 일요일 18시)를 낸다', () => {
    // 2026-08-08 = 토요일(UTC). 다음 발화: 일요일 08-09 18:00 UTC.
    expect(nextMeasurementAfter('2026-08-08T10:00:00.000Z')).toBe('2026-08-09T18:00:00.000Z')
  })

  it('발화 시각 직전이면 같은 날을 낸다', () => {
    // 화요일 17:59 UTC → 같은 날 18:00.
    expect(nextMeasurementAfter('2026-08-11T17:59:00.000Z')).toBe('2026-08-11T18:00:00.000Z')
  })

  it('발화 시각을 지났으면 다음 발화일로 넘어간다', () => {
    // 화요일 18:00 정각(엄밀히 초과 조건) → 목요일 18:00.
    expect(nextMeasurementAfter('2026-08-11T18:00:00.000Z')).toBe('2026-08-13T18:00:00.000Z')
    // 목요일 저녁 → 다음 주 일요일.
    expect(nextMeasurementAfter('2026-08-13T20:00:00.000Z')).toBe('2026-08-16T18:00:00.000Z')
  })

  it('KST로 읽으면 월·수·금 새벽 3시다', () => {
    // UTC 08-09(일) 18:00 = KST 08-10(월) 03:00. 화면(measurement-status)은
    // 기존 회차 라벨과 같은 **UTC ISO 자르기** 관습을 쓴다 — 실제 회차도 같은
    // 시각대(UTC 18시대)에 돌므로 "마지막 08.03 · 다음 08.09"처럼 두 날짜가
    // 같은 잣대로 읽힌다. 여기서는 스케줄 자체가 KST 새벽임만 못박는다.
    const iso = nextMeasurementAfter('2026-08-08T10:00:00.000Z')
    const kst = new Date(Date.parse(iso) + 9 * 3600_000)
    expect(kst.getUTCDay()).toBe(1) // 월요일
    expect(kst.getUTCHours()).toBe(3)
  })
})
