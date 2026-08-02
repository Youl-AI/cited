import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 스펙 ②: AI 생성은 브랜드당 누적 5회. LLM 비용 남용 방지. */
export const QUERY_GENERATION_LIMIT = 5

/**
 * 크레딧 차감 실패의 이유.
 *
 * ★ 하나로 뭉뚱그리면 안 된다. 원래 코드는 `{ ok: false }` 하나로 네 가지 원인
 *   (없는 brandId · 남의 브랜드 · 이미 동결 · 한도 소진)을 덮었고, 호출자는 그걸
 *   전부 "5회까지입니다"로 번역했다 — **한 번도 생성한 적 없는 고객에게
 *   "크레딧을 다 썼다"고 말하는** 경로다. 고객은 자기가 안 쓴 크레딧을 찾으러
 *   문의를 넣고, 우리는 재현이 안 된다.
 */
export type CreditFailure = 'limit' | 'gone'

export type CreditResult = { ok: true; used: number } | { ok: false; reason: CreditFailure }

/**
 * 크레딧 1개를 원자적으로 차감한다.
 *
 * ★ UPDATE … WHERE query_generations < 한도. 검사와 증가가 한 문장이라
 *   동시 요청이 와도 한도를 넘지 못한다 — SELECT 후 UPDATE로 나누면
 *   경합이 한도를 뚫는다. **클라이언트 카운터는 표시용일 뿐이다** (스펙:
 *   생성 한도 서버 강제).
 * ★ 동결된 브랜드(`queriesFrozenAt` not null)는 차감 자체가 거부된다.
 * ★ 실패했을 때만 원인을 알아보러 한 번 더 읽는다(성공 경로는 질의 1회 그대로).
 *   이 재조회는 판정이 아니라 **문구 선택용**이다 — 한도 강제는 위 UPDATE가
 *   이미 끝냈으므로, 재조회와 UPDATE 사이에 값이 변해도 한도가 새지 않는다.
 */
export async function takeGenerationCredit(
  brandId: string,
  userId: string,
): Promise<CreditResult> {
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
  if (used !== undefined) return { ok: true, used }

  const [row] = await db
    .select({
      used: schema.brands.queryGenerations,
      frozenAt: schema.brands.queriesFrozenAt,
    })
    .from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
    .limit(1)
  // 브랜드가 없거나(남의 것 포함) 이미 동결됐다면 한도 이야기를 꺼내면 안 된다.
  if (!row || row.frozenAt) return { ok: false, reason: 'gone' }
  return { ok: false, reason: row.used >= QUERY_GENERATION_LIMIT ? 'limit' : 'gone' }
}

/**
 * 생성 호출이 실패했을 때 크레딧을 돌려준다. 한도는 남용 방지 장치이지
 * 실패 벌점이 아니다 — rate limit에 다섯 번 걸린 고객이 한도를 다 잃으면
 * 그건 우리 잘못이다. `greatest(…, 0)`라 경합에도 음수가 되지 않는다.
 *
 * ★ `userId`도 WHERE에 건다. 지금 호출자는 하나뿐이고 그 앞에서 소유를 이미
 *   확인하지만, 환불은 **차감의 거울**이어야 한다 — 차감이 `user_id`를 걸고
 *   환불이 안 걸면, 나중에 brandId만 들고 오는 호출자가 생기는 순간
 *   남의 브랜드 카운터를 깎을 수 있다. 조건 하나 더 거는 비용은 0이다.
 */
export async function refundGenerationCredit(brandId: string, userId: string): Promise<void> {
  await db
    .update(schema.brands)
    .set({ queryGenerations: sql`greatest(${schema.brands.queryGenerations} - 1, 0)` })
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)))
}
