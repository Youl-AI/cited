import 'server-only'

import type { RunStatus } from '@/lib/db/schema'
import { MEASURE_WEEKDAYS_KST, kstDayStart, kstWeekday } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { isAuthorizedCronRequest } from './auth'

/**
 * 정기 측정 핸들러 코어 — 순수 판정 + DI (스펙 ③).
 *
 * ★ 호출당 브랜드 1개만 처리한다. 실측 1브랜드 233초로 함수 한도(300초) 안.
 *   브랜드가 여러 개면 10분 뒤 다음 호출이 이어받는다 — 큐 없는 소진 방식.
 * ★ due 판정과 중복 실행 잠금은 collection_runs 상태로만 한다. 별도 잠금
 *   테이블을 만들지 않는다 — 상태의 출처가 둘이면 갈라진다.
 * ★ 월·수·금 불변식도 여기서 지킨다. 워크플로 cron 표현식 하나에만 두면
 *   `workflow_dispatch`·cron 수정·중복 발화가 그대로 유료 측정이 된다.
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
  /**
   * ★ `now`를 인자로 받는다. 어댑터가 스스로 `new Date()`를 잡으면 주입한
   *   시계가 SQL의 KST 하루 경계를 통제하지 못해, 자정 근처에서 `selectDueBrand`가
   *   보는 "오늘"과 쿼리가 읽어 온 "오늘"이 갈라진다.
   */
  loadDueContext: (now: Date) => Promise<DueContext>
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

  // ★ 월·수·금 게이트. due 판정은 KST 하루 단위라 화요일에 한 번 돌아도
  //   수요일 회차를 억제하지 못한다 — 순수하게 더해지는 비용이다. 그래서
  //   컨텍스트를 읽기 **전에** 막는다.
  //   운영자 우회는 `?force=1`. 이 라우트는 이미 CRON_SECRET으로 잠겨 있고,
  //   부를 수 있는 사람은 어차피 측정을 일으킬 수 있으므로 공격면이 늘지 않는다.
  const forced = new URL(request.url).searchParams.get('force') === '1'
  const weekday = kstWeekday(now)
  if (!(MEASURE_WEEKDAYS_KST as readonly number[]).includes(weekday)) {
    if (!forced) {
      logger.info('cron.measure.off_schedule', { weekday })
      // due 브랜드가 없는 idle과 구분되어야 한다 — 워크플로가 "오늘은 측정일이
      // 아니다"와 "다 쟀다"를 같은 응답으로 받으면 회차 누락을 못 알아챈다.
      return Response.json({ ok: true, measured: null, remaining: 0, skipped: 'off_schedule' })
    }
    // ★ 게이트를 **넘은** 실행도 남긴다. 이 줄이 없으면 비측정일의 수동 실행이
    //   정규 회차와 로그상 구별되지 않는다 — 그 회차는 회당 약 2,400원의 실지출인데
    //   "화요일에 왜 회차가 있나"를 나중에 로그로 되짚을 방법이 사라진다.
    logger.info('cron.measure.off_schedule', { weekday, forced: true })
  }

  const ctx = await deps.loadDueContext(now)
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
    // ★ 200으로 돌려준다. 10분 간격 반복 호출이 곧 재시도 메커니즘이라
    //   워크플로를 빨간불로 만들면 소음만 는다 — 실패 신호는 운영자 메일이다.
    // ★ 실패에도 `remaining`을 싣는다. 이게 없으면 Task 7 워크플로가 한 브랜드가
    //   실패했을 때 남은 브랜드를 계속 소진해야 하는지 판단할 수 없다.
    return Response.json({
      ok: false,
      measured: due.brandId,
      remaining: remainingAfter(due.brandId),
    })
  }
}
