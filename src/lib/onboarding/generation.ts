import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 스펙 ②: AI 생성은 브랜드당 누적 5회. LLM 비용 남용 방지. */
export const QUERY_GENERATION_LIMIT = 5

/**
 * 크레딧 1개를 원자적으로 차감한다.
 *
 * ★ UPDATE … WHERE query_generations < 한도. 검사와 증가가 한 문장이라
 *   동시 요청이 와도 한도를 넘지 못한다 — SELECT 후 UPDATE로 나누면
 *   경합이 한도를 뚫는다. **클라이언트 카운터는 표시용일 뿐이다** (스펙:
 *   생성 한도 서버 강제).
 * ★ 동결된 브랜드(`queriesFrozenAt` not null)는 차감 자체가 거부된다.
 */
export async function takeGenerationCredit(
  brandId: string,
  userId: string,
): Promise<{ ok: true; used: number } | { ok: false }> {
  const rows = await db
    .update(schema.brands)
    .set({
      queryGenerations: sql`${schema.brands.queryGenerations} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.brands.id, brandId),
        eq(schema.brands.userId, userId),
        isNull(schema.brands.queriesFrozenAt),
        lt(schema.brands.queryGenerations, QUERY_GENERATION_LIMIT),
      ),
    )
    .returning({ used: schema.brands.queryGenerations })
  const used = rows[0]?.used
  return used === undefined ? { ok: false } : { ok: true, used }
}

/**
 * 생성 호출이 실패했을 때 크레딧을 돌려준다. 한도는 남용 방지 장치이지
 * 실패 벌점이 아니다 — rate limit에 다섯 번 걸린 고객이 한도를 다 잃으면
 * 그건 우리 잘못이다. `greatest(…, 0)`라 경합에도 음수가 되지 않는다.
 */
export async function refundGenerationCredit(brandId: string): Promise<void> {
  await db
    .update(schema.brands)
    .set({ queryGenerations: sql`greatest(${schema.brands.queryGenerations} - 1, 0)` })
    .where(eq(schema.brands.id, brandId))
}
