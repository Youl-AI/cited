/**
 * E2E 계정 정리. 순서가 중요하다 — subscriptions.userId가 restrict라
 * 구독을 먼저 지워야 user가 지워진다 (결제 이력이 없는 테스트 계정이라
 * 하드 삭제가 허용된다). brands·queries·runs는 user cascade로 따라간다.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

const E2E_EMAIL = 'e2e-onboarding@cited.co.kr'

const user = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (!user) {
  console.log('정리할 계정이 없습니다.')
  process.exit(0)
}
await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id))
await db.delete(schema.user).where(eq(schema.user.id, user.id))
console.log(`정리 완료: ${E2E_EMAIL}`)
