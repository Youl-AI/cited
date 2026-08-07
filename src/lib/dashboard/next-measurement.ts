/**
 * 다음 측정 예정 시각 — 신선도 줄("다음 측정 08.10 예정")의 계산. 순수 모듈.
 *
 * ## 근거는 실제 스케줄이다
 *
 * 측정은 GitHub Actions cron(10분 간격, 18-20시, 요일 0·2·4 — 전부 UTC)이
 * 돌린다 — UTC 일·화·목 18시대 = **KST 월·수·금 새벽 3시대**. 임의의 주기를
 * 지어내지 않고 그 스케줄의 다음 발화 시작(18:00 UTC)을 그대로 계산한다.
 * 스케줄을 바꾸면 이 상수도 같이 바꿔야 한다 — measure.yml 참고.
 *
 * ★ '예정'이지 약속이 아니다 — 실패한 회차는 점이 없는 것이 이 제품의
 *   규칙이고, 문구('예정')가 그 가능성을 말에 남긴다(measurement-status.tsx).
 * ★ 해지 계정은 이 함수를 부르지 않는다 — 호출부가 null(다음 측정 없음)을
 *   직접 넘긴다. 스케줄 계산과 "측정 대상인가"는 다른 층의 질문이다.
 */

/** cron의 발화 요일(UTC): 일(0)·화(2)·목(4). */
const CRON_UTC_DAYS = [0, 2, 4] as const
/** cron 첫 발화 시각(UTC): 18:00. */
const CRON_UTC_HOUR = 18

/** `now` 이후(엄밀히 초과)의 다음 측정 시작 시각을 ISO로 돌려준다. */
export function nextMeasurementAfter(nowIso: string): string {
  const now = new Date(nowIso)
  // 오늘(UTC 자정)부터 최대 7일 안에는 반드시 발화일이 있다.
  for (let addDays = 0; addDays <= 7; addDays++) {
    const candidate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + addDays,
        CRON_UTC_HOUR,
        0,
        0,
      ),
    )
    if (
      (CRON_UTC_DAYS as readonly number[]).includes(candidate.getUTCDay()) &&
      candidate.getTime() > now.getTime()
    ) {
      return candidate.toISOString()
    }
  }
  // 도달 불가 — 7일 창에는 발화일이 항상 있다.
  throw new Error('unreachable: no cron day within 7 days')
}
