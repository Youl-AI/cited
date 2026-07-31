/**
 * 저장된 측정이 얼마나 오래됐는가.
 *
 * dry(측정+저장)와 `audit:publish`(발송) 사이는 벌어질 수 있다 — 질의 검수,
 * 가이드 작성, 고객 확인 대기가 그 사이에 있다. AI 답변은 시간이 지나면
 * 달라지므로, 너무 오래된 측정을 그대로 보내면 리포트가 "지금"을 말하지
 * 않게 된다.
 *
 * ★ 경고만 한다, 막지 않는다. 재측정은 돈이 들고(60답변 1회 ≈ 2,400원 —
 *   2026-07-30 실측 단가), 오래된 측정이라도 보내는 것이 나은 경우가 있다
 *   (납기 임박 등). 판단은 운영자 몫이다.
 *
 * 순수 모듈 — I/O 없음.
 */

/**
 * 이 시간을 넘기면 재측정 고려를 경고한다.
 *
 * 72시간 = 납기 약속(질문 확정 후 영업일 2일, `docs/kmong/listing.md`)의
 * 상한 언저리. 정상 플로우면 dry와 발송이 이 안에 끝난다 — 넘겼다는 것 자체가
 * 무언가 지연됐다는 신호다.
 */
export const STALE_MEASUREMENT_HOURS = 72

export interface MeasurementAge {
  /** 경과 시간 (시간 단위, 내림). 미래 시각은 0으로 본다 */
  hours: number
  /** 운영자 출력용 — "N시간 전 측정" */
  label: string
  /** `STALE_MEASUREMENT_HOURS`를 넘겼는가 */
  stale: boolean
}

/**
 * @param measuredAt `AuditResult.measuredAt` (ISO 8601)
 * @returns 해석 불가능한 시각이면 null — 호출자가 "시각 불명"을 따로 말해야
 *   한다. 0시간으로 뭉개면 오래된 측정이 방금 것처럼 보인다.
 */
export function measurementAge(measuredAt: string, now: Date): MeasurementAge | null {
  const measured = Date.parse(measuredAt)
  if (Number.isNaN(measured)) return null

  const elapsedMs = now.getTime() - measured
  // 미래 시각은 시계 차이다 — 음수 나이를 보여주지 않는다.
  const hours = Math.max(0, Math.floor(elapsedMs / 3_600_000))
  return {
    hours,
    label: `${hours}시간 전 측정`,
    stale: elapsedMs > STALE_MEASUREMENT_HOURS * 3_600_000,
  }
}
