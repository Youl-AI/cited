import { and, desc, eq } from 'drizzle-orm'
import { getAudit } from '@/lib/audit/repository'
import { db, schema } from '@/lib/db'

export interface OnboardingPrefill {
  brandName: string
  category: string
  region: string | null
  competitors: string[]
  selfDomains: string[]
  /** 크몽 동결 질의. 있으면 에디터가 그대로 프리필한다 (전후 비교 연속성) */
  frozenQueries: string[] | null
}

/**
 * 온보딩 프리필 (스펙 ①·②).
 *
 * 우선순위: ① `plan:grant --from-audit` 명시 연결(크몽 — 운영자 이메일로
 * 등록돼 자동 매칭 불가) ② 가입 이메일 = 인증된 신청 이메일인 최신 무료 진단.
 * 없으면 null — 빈 폼으로 시작한다.
 */
export async function loadPrefill(
  userEmail: string,
  fromAuditId: string | null,
): Promise<OnboardingPrefill | null> {
  if (fromAuditId) {
    const audit = await getAudit(fromAuditId)
    if (audit) return toPrefill(audit)
    // 연결이 깨졌으면 이메일 매칭으로 조용히 폴백하지 않는다 — 크몽 건의
    // 이메일은 운영자 것이라 폴백 결과가 남의 진단일 수 있다.
    return null
  }
  const rows = await db
    .select()
    .from(schema.freeAudits)
    .where(
      and(
        eq(schema.freeAudits.email, userEmail.toLowerCase()),
        eq(schema.freeAudits.emailVerified, true),
      ),
    )
    .orderBy(desc(schema.freeAudits.createdAt))
    .limit(1)
  const audit = rows[0]
  return audit ? toPrefill(audit) : null
}

function toPrefill(audit: typeof schema.freeAudits.$inferSelect): OnboardingPrefill {
  return {
    brandName: audit.brandName,
    category: audit.category,
    region: audit.region,
    competitors: audit.competitors,
    selfDomains: audit.selfDomains,
    frozenQueries: audit.queries,
  }
}
