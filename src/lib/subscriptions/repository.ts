import { randomUUID } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
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
        // ★ graceUntil도 함께 비운다. schema.ts가 "status=past_due일 때만 채워진다"를
        //   불변식으로 적어 놨는데, status만 active로 바꾸고 graceUntil을 남기면
        //   active인데 유예 만료 시각이 있는 행이 된다 — 나중에 그 열을 읽는
        //   판정이 생기면 조용히 틀린다.
        graceUntil: null,
        updatedAt: new Date(),
      },
    })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('구독을 저장하지 못했습니다')
  return created
}

export type RevokeResult =
  | { ok: true; subscription: Subscription }
  | { ok: false; reason: 'not-found' | 'already-canceled' }

/**
 * 회수 = status를 'canceled'로. 행은 지우지 않는다.
 *
 * ★ 이미 canceled인 행은 **건드리지 않는다**(`ne(status,'canceled')`). 다시
 *   덮어쓰면 최초 회수 시각이 사라지는데, 결제가 없어 `currentPeriodEnd`를
 *   채우지 않으므로 `canceledAt`이 "언제부터 청구를 멈췄는가"의 유일한 증거다.
 *   증거를 잃는 것은 조용하다 — 나중에 정산을 되짚을 때야 없어진 걸 안다.
 */
export async function revokePlan(userId: string): Promise<RevokeResult> {
  const rows = await db
    .update(schema.subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        ne(schema.subscriptions.status, 'canceled'),
      ),
    )
    .returning()

  const revoked = rows[0]
  if (revoked) return { ok: true, subscription: revoked }

  // 0행에는 두 가지 원인이 있고, 운영자에게는 전혀 다른 상황이다 —
  // "구독이 없다"(이메일을 잘못 쳤나?)와 "이미 회수했다"(할 일이 없다).
  const existing = await findSubscriptionByUserId(userId)
  return { ok: false, reason: existing ? 'already-canceled' : 'not-found' }
}
