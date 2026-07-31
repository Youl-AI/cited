import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'

export interface EditorQuota {
  /** 이 브랜드가 확정해야 하는 질의 수 = 계정 전체 한도 − 다른 브랜드 사용분 */
  quota: number
  queriesOnOtherBrands: number
  maxQueries: number
}

/**
 * 질의 한도는 **계정 전체**다 (plans.ts `PlanLimits.maxQueries` 주석 — Business는
 * 브랜드에 나눠 쓴다). 강제 지점은 두 곳: 여기(동결 시)와 `validateRunStart`
 * (수집 시). 같은 규칙의 이중 방어다.
 */
export async function loadEditorQuota(
  userId: string,
  brandId: string,
  subscription: Subscription,
): Promise<EditorQuota> {
  const limits = resolveLimits(subscription.plan, subscription.queryPacks)
  const others = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, userId),
        ne(schema.brands.id, brandId),
        eq(schema.brands.isActive, true),
      ),
    )
  let queriesOnOtherBrands = 0
  if (others.length > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.queries)
      .where(
        and(
          inArray(
            schema.queries.brandId,
            others.map((b) => b.id),
          ),
          eq(schema.queries.isActive, true),
        ),
      )
    queriesOnOtherBrands = row?.n ?? 0
  }
  return {
    quota: Math.max(0, limits.maxQueries - queriesOnOtherBrands),
    queriesOnOtherBrands,
    maxQueries: limits.maxQueries,
  }
}
