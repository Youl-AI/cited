import { describe, expect, test } from 'vitest'
import { kstDayStart, kstWeekday, nextMeasurement } from './kst'

describe('kst', () => {
  // 2026-08-05T20:00Z = 2026-08-06(목) 05:00 KST
  const thuDawn = new Date('2026-08-05T20:00:00Z')

  test('kstWeekday — UTC 수요일 밤은 KST 목요일', () => {
    expect(kstWeekday(thuDawn)).toBe(4)
  })

  test('kstDayStart — KST 자정의 UTC 표현', () => {
    // KST 2026-08-06 00:00 = UTC 2026-08-05 15:00
    expect(kstDayStart(thuDawn).toISOString()).toBe('2026-08-05T15:00:00.000Z')
  })

  test('nextMeasurement — 목요일이면 다음은 금요일 03:00 KST', () => {
    const n = nextMeasurement(thuDawn)
    expect(n.weekdayLabel).toBe('금')
    expect(n.date.toISOString()).toBe('2026-08-06T18:00:00.000Z') // 금 03:00 KST
  })

  test('nextMeasurement — 월요일 02:00 KST는 아직 오늘 새벽', () => {
    // 2026-08-02(일) 17:00Z = 월 02:00 KST
    const n = nextMeasurement(new Date('2026-08-02T17:00:00Z'))
    expect(n.weekdayLabel).toBe('월')
  })

  test('nextMeasurement — 월요일 04:00 KST는 창이 지나 수요일', () => {
    const n = nextMeasurement(new Date('2026-08-02T19:00:00Z'))
    expect(n.weekdayLabel).toBe('수')
  })
})
