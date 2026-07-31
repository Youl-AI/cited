import { describe, expect, it } from 'vitest'
import { STALE_MEASUREMENT_HOURS, measurementAge } from '@/lib/audit/freshness'

const NOW = new Date('2026-07-31T12:00:00.000Z')

describe('measurementAge', () => {
  it('경과 시간을 시간 단위 내림으로 센다', () => {
    const age = measurementAge('2026-07-31T08:30:00.000Z', NOW)
    expect(age).toEqual({ hours: 3, label: '3시간 전 측정', stale: false })
  })

  it('1시간 미만은 0시간이다', () => {
    expect(measurementAge('2026-07-31T11:59:00.000Z', NOW)?.hours).toBe(0)
  })

  it('정확히 72시간은 아직 stale이 아니다', () => {
    // "넘겼을 때"만 경고한다 — 경계값이 경고를 만들면 정상 납기 플로우의
    // 마지막 순간에 불필요한 경고가 붙는다.
    const age = measurementAge('2026-07-28T12:00:00.000Z', NOW)
    expect(age?.hours).toBe(STALE_MEASUREMENT_HOURS)
    expect(age?.stale).toBe(false)
  })

  it('72시간을 넘기면 stale이다', () => {
    expect(measurementAge('2026-07-28T11:59:59.999Z', NOW)?.stale).toBe(true)
  })

  it('미래 시각은 0시간으로 본다 (음수 나이를 보여주지 않는다)', () => {
    const age = measurementAge('2026-07-31T13:00:00.000Z', NOW)
    expect(age).toEqual({ hours: 0, label: '0시간 전 측정', stale: false })
  })

  it('해석할 수 없는 시각은 null이다 (0시간으로 뭉개지 않는다)', () => {
    // 0시간으로 돌려주면 오래된 측정이 방금 것처럼 보인다 — 호출자가
    // "시각 불명"을 따로 말하게 한다.
    expect(measurementAge('측정 안 함', NOW)).toBeNull()
    expect(measurementAge('', NOW)).toBeNull()
  })
})
