import { and, eq, gte } from 'drizzle-orm'
import type { AuditResult } from '@/lib/audit/result'
import { db, schema } from '@/lib/db'
import type { Brand } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'
import { parseRunResult, toRunPoint, type RunListItem, type RunPoint } from './data'

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
  const months = subscription
    ? resolveLimits(subscription.plan, subscription.queryPacks).historyMonths
    : 0
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
    points: runs.map(toRunPoint).filter((p): p is RunPoint => p !== null),
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
