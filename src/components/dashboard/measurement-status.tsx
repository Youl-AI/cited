/**
 * 측정 신선도 한 줄 — "마지막 측정 08.03 · 다음 측정 08.10 예정".
 *
 * API 대시보드의 관습(Stripe·Vercel의 "Last updated …")인데 우리에게는 더
 * 중요하다: 측정이 **주기**라서, 지금 보는 숫자가 언제 것이고 언제 갱신되는지
 * 모르면 화면 전체의 시제가 없다.
 *
 * ## 정직성 규칙
 *
 * - `next`가 null이면 "다음 측정 없음"을 **명시한다**(해지 계정·측정 중지).
 *   그냥 비우면 "곧 갱신되겠지"로 읽힌다 — 없는 예정을 암시하는 셈이다.
 * - 예정일은 계획이지 약속이 아니다 — "예정"을 붙여 측정 실패 가능성을
 *   말 안에 남긴다(실패한 회차는 점 자체가 없는 것이 이 제품의 규칙).
 *
 * 순수 표시 컴포넌트다 — 값 계산(플랜 주기 + 마지막 회차)은 호출부 책임.
 */
export function MeasurementStatus({
  last,
  next,
}: {
  /** 마지막으로 성공한 측정의 ISO 시각. 없으면 null(아직 측정 전). */
  last: string | null
  /** 다음 측정 예정 ISO 시각. null이면 예정 없음(해지 등) — 명시적으로 적는다. */
  next: string | null
}) {
  const mmdd = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
  return (
    <p className="font-mono text-xs tracking-[0.06em] text-muted-foreground" data-testid="measurement-status">
      {last ? `마지막 측정 ${mmdd(last)}` : '아직 측정 전'}
      <span aria-hidden="true" className="mx-1.5 opacity-50">
        ·
      </span>
      {next ? `다음 측정 ${mmdd(next)} 예정` : '다음 측정 없음'}
    </p>
  )
}
