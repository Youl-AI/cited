import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'

export interface EditorQuota {
  /**
   * 이 브랜드가 쓸 수 있는 질의의 **상한** = 계정 전체 한도 − 다른 브랜드 사용분.
   *
   * ★ "정확히 이만큼"이 아니다. 그렇게 읽으면 앞 브랜드가 한도를 다 쓴 계정에서
   *   다음 브랜드의 동결이 **영원히 불가능**해진다(quota=0 → 어떤 입력도 거절 →
   *   `needs-queries` 고정 → 대시보드까지 잠김). `freezeQueriesAction`이
   *   `3 ≤ n ≤ quota` 범위로 검사하는 근거다.
   */
  quota: number
  queriesOnOtherBrands: number
  maxQueries: number
}

/**
 * 질의 한도는 **계정 전체**다 (plans.ts `PlanLimits.maxQueries` 주석 — Business는
 * 브랜드에 나눠 쓴다).
 *
 * ★ 지금 이 한도를 실제로 강제하는 곳은 **여기(동결 시) 하나뿐이다.**
 *   `validateRunStart`도 같은 규칙을 갖고 있지만 프로덕션 호출자가 아직 없다
 *   (정의와 테스트뿐 — Task 6 수집 파이프라인이 붙일 예정). 그 전까지
 *   "이중 방어"라고 부르면 안 된다. 여기가 뚫리면 그대로 뚫린다.
 *
 * ★ 남아 있는 창: 미동결 브랜드 두 개를 **동시에** 확정하면 둘 다
 *   `queriesOnOtherBrands = 0`을 읽어 각자 한도만큼 가져갈 수 있다.
 *   `createBrandAction`의 `pendingBrandId` 검사가 "미동결 브랜드가 둘"인 상태
 *   자체를 순차 경로에서는 막지만, 동시 생성까지는 못 막는다
 *   (task-4-report.md "리뷰 수정" 참고 — 트랜잭션 없는 드라이버의 한계다).
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
