import type { EngineId } from '@/lib/plans'

/**
 * 엔진별 동시 실행 상한.
 *
 * 한꺼번에 던지면 rate limit에 걸린다. 429는 재시도로 살아나지만, 백오프를
 * 타는 동안 수집 전체가 늦어지고 `'long'` 힌트 때문에 특히 길게 쉰다 —
 * 애초에 넘기지 않는 것이 싸다.
 *
 * ★ SERP가 LLM보다 낮다. SerpApi는 월 1,000건짜리 쿼터를 쓰는데 동시성을
 *   올려도 총량이 늘지 않고, 대신 잘못된 질의를 대량으로 태울 위험만 커진다.
 *
 * ★ 2026-08-03 실측 조정: LLM 4 → 8. 근거 — Vercel Hobby 함수 상한이 300초
 *   고정인데, 동시성 4로는 브랜드 1개(엔진당 30콜)가 로컬 233초·프로덕션
 *   300초 초과로 cron 측정이 함수 킬로 죽었다(Task 12 실측, run a13483de).
 *   8이면 웨이브가 절반이라 ~120-150초. 60콜 규모에서 429는 관찰되지 않았고,
 *   재발하면 여기서 다시 낮추되 그때는 측정을 호출 여러 번에 나누는 구조
 *   변경이 필요하다.
 */
export const ENGINE_QUEUE_CONCURRENCY: Record<EngineId, number> = {
  chatgpt: 8,
  gemini: 8,
  naver: 2,
  google_aio: 2,
}

/**
 * 재시도 정책.
 *
 * ★ Trigger.dev의 `retry: { maxAttempts: 3 }`을 3단계에서 직접 구현한다.
 *   잡 껍데기가 4단계로 옮겨갔으므로, 여기서 만들지 않으면 재시도가 통째로
 *   없어진다 — 일시적인 502 하나로 그 주 답변 하나가 영영 사라진다.
 *   AI 답변은 소급 수집이 불가능하다.
 */
export const RETRY = {
  /** 최초 시도를 포함한 총 시도 횟수 */
  maxAttempts: 3,
  factor: 2,
  minTimeoutMs: 3_000,
  maxTimeoutMs: 120_000,
  /**
   * 429(`backoffHint: 'long'`)일 때 최소 대기.
   *
   * rate limit은 3초 뒤에 다시 던져도 또 429다. 짧게 재시도하면 시도 횟수만
   * 태우고 결국 잃는다.
   */
  longMinTimeoutMs: 30_000,
} as const

/**
 * 다음 재시도까지 기다릴 시간(ms).
 *
 * `attempt`는 1부터 센다(1 = 첫 시도가 실패한 직후).
 * `random`은 0 이상 1 미만 — 지터다. 같은 순간에 실패한 요청들이 같은 시각에
 * 동시에 되돌아오면 rate limit을 다시 때린다.
 */
export function backoffMs(
  attempt: number,
  hint: 'none' | 'normal' | 'long',
  random: number,
): number {
  const base = hint === 'long' ? RETRY.longMinTimeoutMs : RETRY.minTimeoutMs
  const raw = base * Math.pow(RETRY.factor, attempt - 1)
  const capped = Math.min(raw, RETRY.maxTimeoutMs)
  // 지터는 절반 아래로만 흔든다. 상한을 넘기지 않으면서 몰림을 깬다.
  return Math.round(capped * (0.5 + random * 0.5))
}
