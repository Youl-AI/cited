import 'server-only'

import type { RunStatus } from '@/lib/db/schema'
import { kstDayStart } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { isAuthorizedCronRequest } from './auth'

/**
 * 정기 측정 핸들러 코어 — 순수 판정 + DI (스펙 ③).
 *
 * ★ 호출당 브랜드 1개만 처리한다. 실측 1브랜드 233초로 함수 한도(300초) 안.
 *   브랜드가 여러 개면 15분 뒤 다음 호출이 이어받는다 — 큐 없는 소진 방식.
 * ★ due 판정과 중복 실행 잠금은 collection_runs 상태로만 한다. 별도 잠금
 *   테이블을 만들지 않는다 — 상태의 출처가 둘이면 갈라진다.
 */

/** running이 이보다 오래됐으면 죽은 실행으로 본다 (함수 한도 300초 + 여유) */
export const RUNNING_STALE_MS = 15 * 60 * 1000
/** KST 하루 안의 시도 상한. 1회 재시도 후 재실패면 회차를 건너뛴다 (스펙 ③) */
export const MAX_ATTEMPTS_PER_WINDOW = 2

export interface RunSummary {
  brandId: string
  status: RunStatus
  startedAt: Date
}

export interface DueContext {
  /** 측정 대상: 활성 구독 + 동결 완료 + isActive. id 순 정렬(안정 소진) */
  brands: { id: string; name: string }[]
  /** KST 오늘 시작 이후의 schedule 트리거 회차들 */
  todaysRuns: RunSummary[]
}

export interface MeasureOutcome {
  runId: string
  status: RunStatus
}

/**
 * 다음으로 측정할 브랜드. 없으면 null.
 *
 * 브랜드마다 (KST 오늘 기준):
 *  - succeeded/partial 회차가 있다 → 오늘 몫은 끝
 *  - RUNNING_STALE_MS 미만의 running → 진행 중(잠금) — 건너뜀
 *  - 실패 시도 수 = failed + 죽은 running. 상한 미만이면 due (attempt = 시도+1)
 */
export function selectDueBrand(
  brands: readonly { id: string; name: string }[],
  todaysRuns: readonly RunSummary[],
  now: Date,
): { brandId: string; brandName: string; attempt: number } | null {
  const dayStart = kstDayStart(now).getTime()
  for (const brand of brands) {
    const runs = todaysRuns.filter(
      (r) => r.brandId === brand.id && r.startedAt.getTime() >= dayStart,
    )
    if (runs.some((r) => r.status === 'succeeded' || r.status === 'partial')) continue
    const inFlight = runs.some(
      (r) => r.status === 'running' && now.getTime() - r.startedAt.getTime() < RUNNING_STALE_MS,
    )
    if (inFlight) continue
    const failedAttempts = runs.filter(
      (r) =>
        r.status === 'failed' ||
        (r.status === 'running' && now.getTime() - r.startedAt.getTime() >= RUNNING_STALE_MS),
    ).length
    if (failedAttempts >= MAX_ATTEMPTS_PER_WINDOW) continue
    return { brandId: brand.id, brandName: brand.name, attempt: failedAttempts + 1 }
  }
  return null
}

export interface MeasureDeps {
  /** `env.CRON_SECRET`. 없으면 fail-closed */
  secret: string | undefined
  loadDueContext: () => Promise<DueContext>
  measureBrand: (brandId: string) => Promise<MeasureOutcome>
  /** 실패 통지 — 운영자 메일. 통지 실패는 측정 실패를 덮지 않는다 */
  notifyFailure: (args: {
    brandId: string
    brandName: string
    reason: string
    attempt: number
  }) => Promise<void>
  now?: () => Date
}

export async function handleMeasure(request: Request, deps: MeasureDeps): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), deps.secret)) {
    logger.warn('cron.measure.unauthorized', { configured: Boolean(deps.secret) })
    return new Response(null, { status: 401 })
  }
  const now = (deps.now ?? (() => new Date()))()
  const ctx = await deps.loadDueContext()
  const due = selectDueBrand(ctx.brands, ctx.todaysRuns, now)
  const remainingAfter = (excluded: string) =>
    ctx.brands.filter(
      (b) => b.id !== excluded && selectDueBrand([b], ctx.todaysRuns, now) !== null,
    ).length

  if (!due) {
    logger.info('cron.measure.idle', { brands: ctx.brands.length })
    return Response.json({ ok: true, measured: null, remaining: 0 })
  }

  try {
    const outcome = await deps.measureBrand(due.brandId)
    logger.info('cron.measure.done', {
      brandId: due.brandId, runId: outcome.runId, status: outcome.status,
    })
    return Response.json({
      ok: true,
      measured: due.brandId,
      runId: outcome.runId,
      status: outcome.status,
      remaining: remainingAfter(due.brandId),
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught)
    logger.error('cron.measure.failed', { brandId: due.brandId, attempt: due.attempt })
    try {
      await deps.notifyFailure({
        brandId: due.brandId, brandName: due.brandName, reason, attempt: due.attempt,
      })
    } catch {
      logger.error('cron.measure.notify_failed', { brandId: due.brandId })
    }
    // ★ 200으로 돌려준다. 15분 간격 반복 호출이 곧 재시도 메커니즘이라
    //   워크플로를 빨간불로 만들면 소음만 는다 — 실패 신호는 운영자 메일이다.
    return Response.json({ ok: false, measured: due.brandId })
  }
}
