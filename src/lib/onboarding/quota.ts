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
 * ★ 이 한도를 강제하는 곳은 두 군데다. 여기(동결 시)와 `validateRunStart`
 *   (측정 시작 시). 4단계 Task 6의 `measureBrand`가 매 회차마다 **이 함수의
 *   `queriesOnOtherBrands`를 그대로 받아** `validateRunStart`에 넘긴다 —
 *   같은 규칙을 두 번 구현하지 않기 위해서다. 즉 이 함수의 계산이 틀리면
 *   동결과 측정이 **함께** 틀린다. 두 번째 방어선이 아니라 같은 방어선의
 *   두 번째 관문이라고 읽어야 한다.
 *
 * ★ 남아 있는 창: 미동결 브랜드 두 개를 **동시에** 확정하면 둘 다
 *   `queriesOnOtherBrands = 0`을 읽어 각자 한도만큼 가져갈 수 있다.
 *   `createBrandAction`의 `pendingBrandId` 검사가 "미동결 브랜드가 둘"인 상태
 *   자체를 순차 경로에서는 막지만, 동시 생성까지는 못 막는다
 *   (task-4-report.md "리뷰 수정" 참고 — 트랜잭션 없는 드라이버의 한계다).
 *
 * @param brandId 몫을 계산할 대상 브랜드. **null이면 "아직 만들지 않은 브랜드"**로
 *   보고 활성 브랜드 전부를 사용분에 넣는다 — `createBrandAction`이 "이 계정에
 *   새 브랜드를 하나 더 만들 질의가 남아 있는가"를 물을 때 쓴다(브랜드를 만들기
 *   전에는 뺄 id가 없다). 빈 문자열 같은 센티널을 쓰면 조용히 뜻이 바뀐다.
 */
export async function loadEditorQuota(
  userId: string,
  brandId: string | null,
  subscription: Subscription,
): Promise<EditorQuota> {
  const limits = resolveLimits(subscription.plan, subscription.queryPacks)
  const others = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, userId),
        ...(brandId === null ? [] : [ne(schema.brands.id, brandId)]),
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
