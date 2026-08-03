/**
 * 온보딩 완주 E2E용 계정 시드 — **로컬 전용.** CI에서 돌리지 않는다
 * (CI의 DATABASE_URL에 테스트 행을 만들지 않는다는 기존 원칙 —
 * free-audit.spec.ts 상단 참고).
 *
 *   pnpm e2e:onboarding:seed
 *
 * Better Auth API로 가입한다 — 비밀번호 해시 형식을 우리가 알 필요가 없다.
 * 가입 인증 메일은 sendEmail이 실패를 삼키므로(발송 도메인 주소라 외부 반송
 * 없음) 여기서 emailVerified를 직접 세운다.
 */
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import { grantPlan } from '@/lib/subscriptions/repository'

export const E2E_EMAIL = 'e2e-onboarding@cited.co.kr'
export const E2E_PASSWORD = 'e2e-passw0rd!'

const existing = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (existing) {
  console.log(`이미 있음: ${E2E_EMAIL} — cleanup 후 다시 실행하세요 (pnpm e2e:onboarding:cleanup)`)
  process.exit(1)
}

await auth.api.signUpEmail({
  body: { email: E2E_EMAIL, password: E2E_PASSWORD, name: 'E2E 온보딩' },
})
await db
  .update(schema.user)
  .set({ emailVerified: true })
  .where(eq(schema.user.email, E2E_EMAIL))

const user = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (!user) throw new Error('가입이 저장되지 않았습니다')
await grantPlan({ userId: user.id, plan: 'starter', queryPacks: 0, fromAuditId: null })

console.log(`시드 완료: ${E2E_EMAIL} / ${E2E_PASSWORD} (starter)`)
console.log('실행: $env:E2E_ONBOARDING=\'1\'; $env:E2E_FAKE_QUERY_GENERATOR=\'1\'; pnpm test:e2e --grep 온보딩완주')
