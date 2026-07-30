import { createHmac, randomBytes } from 'node:crypto'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { AuditSource, FreeAudit } from '@/lib/db/schema'
import { env } from '@/lib/env'

/**
 * 진단 신청 CRUD. **DB 접근만** 모은다 — 순수 로직은 두지 않는다.
 *
 * 검증(`request-schema.ts`)·질의 생성(`queries.ts`)·토큰(`token.ts`)이 각자
 * 따로 있고 전부 DB 없이 테스트된다. 이 파일은 그 결과를 저장할 뿐이다.
 */

/**
 * 추측 불가능한 ID.
 *
 * ★ `/audit/<id>`가 곧 비공개 링크다(로그인 벽이 없다 — 리포트를 받은 사람이
 *   못 보면 안 되니까). 짧거나 순차적이면 남의 리포트를 열 수 있다.
 *   16바이트 난수 = 128비트.
 */
function newAuditId(): string {
  return `aud_${randomBytes(16).toString('base64url')}`
}

/**
 * IP 원문은 저장하지 않는다. 토큰과 같은 이유로 용도별 키를 파생한다.
 *
 * ★ IP는 개인정보다. 스팸 관측에는 "같은 곳에서 또 왔는가"만 알면 되고,
 *   그건 해시로 충분하다. 원문을 두면 유출 시 피해가 커지고 처리방침에
 *   적어야 할 것이 늘어난다.
 */
export function hashIp(ip: string): string {
  const key = createHmac('sha256', env.BETTER_AUTH_SECRET).update('cited:audit-ip:v1').digest()
  return createHmac('sha256', key).update(ip).digest('base64url')
}

export interface CreateAuditArgs {
  brandName: string
  category: string
  email: string
  competitors: string[]
  /** `parseHostname`이 정규화한 호스트명. 없으면 소유 판정을 하지 않는다 */
  selfDomains: string[]
  ipHash: string
}

/** 폼 경로 전용. `source`는 'web' 기본값을 그대로 쓴다. */
export async function createAuditRequest(args: CreateAuditArgs): Promise<FreeAudit> {
  const rows = await db
    .insert(schema.freeAudits)
    .values({ id: newAuditId(), status: 'requested', ...args })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('진단 신청을 저장하지 못했습니다')
  return created
}

/**
 * 운영자가 직접 등록하는 신청 (`audit:new` CLI).
 *
 * 크몽 주문은 웹 폼을 거치지 않는다. 결제가 이미 확인됐으므로 이메일 인증을
 * 건너뛰어도 남용 위험이 없다.
 *
 * ★ `markVerified`를 재사용하지 않는다. 그 함수는 **토큰의 이메일이 저장된
 *   이메일과 같은지** 검사하는 것이 존재 이유다. 거기에 우회 옵션을 뚫으면
 *   웹 경로에서도 우회될 수 있다. 인증을 건너뛰는 경로는 별도 함수로 두고,
 *   그 함수가 `source`를 강제하게 한다.
 *
 * ★ `source: 'web'`을 거부한다. CLI로 만든 행에 'web'이 붙으면 나중에
 *   `email_verified = true`인 행 중 어느 것이 실제로 링크를 눌렀는지 구분할 수
 *   없고, 인증 게이트가 작동하는지 감사할 수 없게 된다.
 */
export async function createVerifiedAudit(
  args: CreateAuditArgs & { source: Exclude<AuditSource, 'web'> },
): Promise<FreeAudit> {
  if ((args.source as AuditSource) === 'web') {
    throw new Error("운영자 등록에 source='web'을 쓸 수 없습니다")
  }
  const rows = await db
    .insert(schema.freeAudits)
    .values({
      id: newAuditId(),
      status: 'verified',
      emailVerified: true,
      verifiedAt: new Date(),
      ...args,
    })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('진단 신청을 저장하지 못했습니다')
  return created
}

/**
 * 인증 처리. **토큰의 이메일이 저장된 이메일과 같을 때만** 넘어간다.
 * 다르면 다른 신청의 토큰을 가져다 쓴 것이다.
 *
 * ★ `status = 'requested'`도 조건이다. 이미 실행됐거나 발송된 건을 되돌리지
 *   않는다 — 인증 링크를 두 번 눌러도 무해해야 하고, 발송 완료를 대기 상태로
 *   돌려놓으면 같은 진단을 두 번 실행해 원가가 두 배가 된다.
 */
export async function markVerified(auditId: string, email: string): Promise<FreeAudit | null> {
  const rows = await db
    .update(schema.freeAudits)
    .set({ emailVerified: true, status: 'verified', verifiedAt: new Date() })
    .where(
      and(
        eq(schema.freeAudits.id, auditId),
        eq(schema.freeAudits.email, email),
        eq(schema.freeAudits.status, 'requested'),
      ),
    )
    .returning()
  return rows[0] ?? null
}

export async function getAudit(auditId: string): Promise<FreeAudit | null> {
  const row = await db.query.freeAudits.findFirst({
    where: eq(schema.freeAudits.id, auditId),
  })
  return row ?? null
}

/**
 * 운영자 대기 목록. 오래된 것부터 — 먼저 신청한 사람이 먼저 받아야 한다.
 *
 * `failed`도 포함한다. 실패한 건은 재실행 대상이고, 목록에서 빠지면 잊힌다.
 */
export async function listPendingAudits(): Promise<FreeAudit[]> {
  return db
    .select()
    .from(schema.freeAudits)
    .where(sql`${schema.freeAudits.status} in ('verified', 'failed')`)
    .orderBy(schema.freeAudits.createdAt)
}

export async function listRecentAudits(limit = 20): Promise<FreeAudit[]> {
  return db
    .select()
    .from(schema.freeAudits)
    .orderBy(desc(schema.freeAudits.createdAt))
    .limit(limit)
}

export async function markRunning(auditId: string): Promise<void> {
  // 이전 실패 사유를 지운다. 남겨두면 재실행이 성공했는데도 실패 사유가 붙어 있다.
  await db
    .update(schema.freeAudits)
    .set({ status: 'running', failureReason: null })
    .where(eq(schema.freeAudits.id, auditId))
}

/** 발송 완료. 결과와 측정에 쓴 별칭을 함께 남긴다. */
export async function markSent(
  auditId: string,
  result: unknown,
  aliases: readonly string[],
): Promise<void> {
  await db
    .update(schema.freeAudits)
    .set({ status: 'sent', result, aliases: [...aliases], sentAt: new Date() })
    .where(eq(schema.freeAudits.id, auditId))
}

export async function markFailed(auditId: string, reason: string): Promise<void> {
  await db
    .update(schema.freeAudits)
    // 사유를 자른다. 스택 트레이스가 통째로 들어오면 목록 출력이 망가진다.
    .set({ status: 'failed', failureReason: reason.slice(0, 500) })
    .where(eq(schema.freeAudits.id, auditId))
}

export async function markRejected(auditId: string, reason: string): Promise<void> {
  await db
    .update(schema.freeAudits)
    .set({ status: 'rejected', failureReason: reason.slice(0, 500) })
    .where(eq(schema.freeAudits.id, auditId))
}

/**
 * 같은 IP의 최근 신청 수. 신청 테이블이 스팸으로 차는 것만 막는다.
 *
 * ★ 이것은 원가 방어가 아니다. 인증 전에는 어떤 API도 부르지 않으므로 스팸
 *   신청에는 돈이 들지 않는다. 방어 대상은 운영자의 시간과 테이블 크기다.
 */
export async function countRecentByIpHash(ipHash: string, sinceHours: number): Promise<number> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.freeAudits)
    .where(and(eq(schema.freeAudits.ipHash, ipHash), gte(schema.freeAudits.createdAt, since)))
  return rows[0]?.n ?? 0
}
