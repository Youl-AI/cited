import { and, eq, gte } from 'drizzle-orm'
import type { AuditResult } from '@/lib/audit/result'
import { db, schema } from '@/lib/db'
import type { Brand } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'
import { parseRunResult, toRunPoints, type RunListItem, type RunPoint } from './data'

/**
 * 대시보드 DB 로더. 조립은 전부 `./data`(순수)가 하고 여기서는 읽기만 한다 —
 * 그래야 `data.ts`가 클라이언트 컴포넌트에서도 import 가능한 채로 남는다.
 */

export interface DashboardData {
  brands: { id: string; name: string }[]
  selected: Brand | null
  /** result 스냅샷이 있는 회차 — 오래된 → 최신 */
  points: RunPoint[]
  /** 전체 회차 — 최신 → 오래된 (실패 회차 포함 — 감추지 않는다) */
  runList: RunListItem[]
}

export async function loadDashboard(
  userId: string,
  brandId: string | undefined,
): Promise<DashboardData> {
  const brandRows = await db
    .select()
    .from(schema.brands)
    .where(and(eq(schema.brands.userId, userId), eq(schema.brands.isActive, true)))
    .orderBy(schema.brands.createdAt)
  const selected = brandRows.find((b) => b.id === brandId) ?? brandRows[0] ?? null
  const brands = brandRows.map((b) => ({ id: b.id, name: b.name }))
  if (!selected) return { brands, selected: null, points: [], runList: [] }

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  })
  // 이력 창 = 플랜의 historyMonths (null이면 무제한). 달력 월이 아니라 30일
  // 근사다 — 경계에서 하루 이틀 차이는 제품 약속("3개월")을 해치지 않는다.
  //
  // ★ 구독 조회에 status 필터가 **없다.** 의도된 정책이다 — 해지한 고객도
  //   자기가 돈 내고 받은 측정 이력을 그대로 본다. 정직한 측정을 소급해서
  //   감추지 않는다 (`revokePlan`은 행을 지우지 않고 status만 'canceled'로
  //   바꾼다). 이 정책은 `load.test.ts`가 못 박는다.
  //
  // ★ 구독 행이 없는 경우는 **도달하지 않는다.** `subscriptions.userId`는
  //   `onDelete: 'restrict'`라 행이 사라지지 않고, 구독이 없는 사용자는
  //   `createBrandAction`이 'no-plan'으로 막아 브랜드를 못 만들며, 브랜드가
  //   없으면 위 `if (!selected)`에서 이미 돌아간다.
  //
  //   그래서 **기본값을 두지 않고 던진다.** 여기에 `?? null`(무제한)이나
  //   `?? 0`(전부 숨김)을 두면, 도달 불가능하다던 분기가 언젠가 도달됐을 때
  //   (예: 무료 대시보드가 열리는 날) 아무 소리 없이 정책을 하나 만들어 낸다 —
  //   무료 사용자에게 무제한 이력을 주거나, 돈 낸 고객의 회차를 통째로 감추거나.
  //   이력 창은 **플랜에서만** 나온다. 플랜이 없으면 답이 없는 것이지
  //   기본값이 있는 게 아니다.
  if (!subscription) {
    throw new Error(`대시보드: 브랜드는 있는데 구독 행이 없습니다 (userId=${userId})`)
  }
  const months = resolveLimits(subscription.plan, subscription.queryPacks).historyMonths
  const conditions = [eq(schema.collectionRuns.brandId, selected.id)]
  if (months !== null) {
    conditions.push(
      gte(
        schema.collectionRuns.startedAt,
        new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000),
      ),
    )
  }
  const runs = await db
    .select()
    .from(schema.collectionRuns)
    .where(and(...conditions))
    .orderBy(schema.collectionRuns.startedAt)

  return {
    brands,
    selected,
    // ★ `map(toRunPoint).filter(...)`가 아니다. 스냅샷이 없어 버려진 회차의
    //   **자리**를 `skippedBefore`로 남겨야, 화면이 2주 떨어진 두 점을 붙어
    //   있는 두 점으로 그리지 않는다 (`toRunPoints` 주석).
    points: toRunPoints(runs),
    runList: [...runs].reverse().map((r) => ({
      runId: r.id,
      startedAt: r.startedAt.toISOString(),
      status: r.status,
      // ★ status가 아니라 스냅샷 유무로 판단한다. 측정은 성공했는데 스냅샷
      //   저장만 실패한 회차(`succeeded` + `result IS NULL`)가 실제로 존재한다 —
      //   `parseRunResult` 주석 참고.
      hasResult: parseRunResult(r.result) !== null,
    })),
  }
}

/** 회차 상세 — ★ 본인 소유 브랜드의 회차만 (세션 검증은 호출한 페이지가 한다). */
export async function loadRunDetail(
  userId: string,
  runId: string,
): Promise<{ brandName: string; startedAt: string; result: AuditResult } | null> {
  const rows = await db
    .select({ run: schema.collectionRuns, brand: schema.brands })
    .from(schema.collectionRuns)
    .innerJoin(schema.brands, eq(schema.collectionRuns.brandId, schema.brands.id))
    .where(and(eq(schema.collectionRuns.id, runId), eq(schema.brands.userId, userId)))
    .limit(1)
  const hit = rows[0]
  if (!hit) return null
  const result = parseRunResult(hit.run.result)
  if (!result) return null
  return { brandName: hit.brand.name, startedAt: hit.run.startedAt.toISOString(), result }
}
