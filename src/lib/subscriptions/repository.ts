import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import type { GrantablePlan } from './grant-args'

/**
 * 구독 CRUD — DB 접근만. 검증(`grant-args.ts`)은 순수 모듈에 있다.
 * `audit/repository.ts`와 같은 분리.
 */

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const row = await db.query.user.findFirst({ where: eq(schema.user.email, email) })
  return row ? { id: row.id, email: row.email, name: row.name } : null
}

export async function findSubscriptionByUserId(userId: string): Promise<Subscription | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  })
  return row ?? null
}

/**
 * 이 진단에 이미 걸려 있는 구독을 찾는다.
 *
 * ★ `from_audit_id`에는 FK도 unique도 없다(진단 행과 구독은 수명이 다르다 —
 *   schema.ts 주석 참고). 그래서 같은 진단을 두 계정에 붙이는 것을 DB가
 *   막지 않는다. 붙으면 두 고객의 온보딩이 같은 브랜드·같은 동결 질의로
 *   프리필되고, 원인은 몇 주 뒤 "왜 남의 브랜드가 뜨죠?"로 나타난다.
 *   `plan:grant`가 부여 전에 이 함수로 확인한다.
 */
export async function findSubscriptionByAuditId(
  fromAuditId: string,
): Promise<Subscription | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.fromAuditId, fromAuditId),
  })
  return row ?? null
}

/**
 * 부여 = upsert. 이미 구독 행이 있으면(회수됐던 고객 포함) 갱신한다 —
 * `subscriptions_user_idx`가 unique라 사용자당 행은 하나다.
 *
 * ★ 결제가 없으므로 `currentPeriodEnd`는 채우지 않는다. 기간 관리는 수동
 *   청구(계좌이체)와 함께 운영자 책임이고, 회수는 `plan:revoke`가 한다.
 */
export async function grantPlan(args: {
  userId: string
  plan: GrantablePlan
  queryPacks: number
  fromAuditId: string | null
}): Promise<Subscription> {
  const rows = await db
    .insert(schema.subscriptions)
    .values({
      id: randomUUID(),
      userId: args.userId,
      plan: args.plan,
      status: 'active',
      queryPacks: args.queryPacks,
      fromAuditId: args.fromAuditId,
      currentPeriodStart: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.userId,
      set: {
        plan: args.plan,
        status: 'active',
        queryPacks: args.queryPacks,
        fromAuditId: args.fromAuditId,
        canceledAt: null,
        updatedAt: new Date(),
      },
    })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('구독을 저장하지 못했습니다')
  return created
}

export async function revokePlan(userId: string): Promise<Subscription | null> {
  const rows = await db
    .update(schema.subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.subscriptions.userId, userId))
    .returning()
  return rows[0] ?? null
}
