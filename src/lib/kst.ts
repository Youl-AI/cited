/**
 * KST 시간 유틸 — 순수 모듈. I/O 없음.
 *
 * 정기 측정의 "하루"와 "요일"은 전부 KST 기준이다. UTC로 계산하면 due 판정이
 * 오전 9시에 날짜를 넘겨 하루 두 번 측정하거나 하루를 건너뛴다
 * (`recordSerpUsage`의 period가 KST인 것과 같은 이유).
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 기준 요일 (0=일 … 6=토) */
export function kstWeekday(now: Date): number {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCDay()
}

/** KST 기준 그 날 00:00의 UTC 시각 — due 판정의 "오늘" 경계 */
export function kstDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS,
  )
}

/** 측정 요일: 월·수·금 (스펙 ③). 워크플로 cron과 같은 값이어야 한다. */
export const MEASURE_WEEKDAYS_KST = [1, 3, 5] as const
/** 측정 창 시작: KST 03:00 (= UTC 전날 18:00) */
export const MEASURE_HOUR_KST = 3

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export interface NextMeasurement {
  weekdayLabel: string
  /** 창 시작 시각 (UTC Date) */
  date: Date
}

/** 다음 측정 창. 온보딩 완료 화면의 "다음 측정 시각 예고"가 쓴다. */
export function nextMeasurement(now: Date): NextMeasurement {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  for (let add = 0; add <= 7; add++) {
    const day = (kst.getUTCDay() + add) % 7
    if (!(MEASURE_WEEKDAYS_KST as readonly number[]).includes(day)) continue
    if (add === 0 && kst.getUTCHours() >= MEASURE_HOUR_KST) continue // 오늘 창은 지났다
    const date = new Date(
      Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate() + add,
        MEASURE_HOUR_KST,
      ) - KST_OFFSET_MS,
    )
    return { weekdayLabel: WEEKDAY_LABELS[day] ?? '월', date }
  }
  throw new Error('unreachable: 7일 안에 측정 요일이 반드시 있다')
}
