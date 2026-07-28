// 실제 Neon DB + 실제 Resend 설정으로 도는 스모크 테스트. `pnpm test:smoke` 전용.
//
// 검증하는 것 하나: **인증 메일 발송이 실패해도 회원가입이 무너지지 않는다.**
//
// 이 파일은 `@/lib/email/send`를 모킹하지 않는다. 즉 .env.local의 진짜
// RESEND_API_KEY로 진짜 발송을 시도한다. 키가 플레이스홀더면 클라이언트 생성
// 단계에서, 진짜 키라면 수신 도메인(.invalid)에서 실패한다 — 어느 쪽이든
// 발송은 실패하고, 그때 가입이 500으로 무너지지 않아야 한다는 것이 요점이다.

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'

const TEST_EMAIL = `cited-mailfail-${Date.now()}@cited-smoke.invalid`
const TEST_PASSWORD = 'smoke-test-password-1234'

async function cleanup() {
  await db.delete(schema.user).where(sql`${schema.user.email} = ${TEST_EMAIL}`)
}

describe('인증 메일 발송 실패 격리', () => {
  beforeAll(cleanup)
  afterAll(cleanup)

  it('메일이 안 나가도 가입 자체는 성공하고 user 행이 남는다', async () => {
    // 던지지 않는다는 것이 이 테스트의 전부다. 던지면 여기서 실패한다.
    const result = await auth.api.signUpEmail({
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: '메일실패' },
    })

    expect(result.user.email).toBe(TEST_EMAIL)

    const users = await db
      .select()
      .from(schema.user)
      .where(sql`${schema.user.email} = ${TEST_EMAIL}`)
    expect(users).toHaveLength(1)
    // 메일을 못 보냈으므로 계정은 미인증 상태로 남는다. 로그인은 막히고,
    // 재로그인 시 확인 메일이 다시 나간다 (auth.ts의 sendOnSignIn).
    expect(users[0]?.emailVerified).toBe(false)
  })

  it('미인증 계정은 로그인할 수 없다', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: TEST_EMAIL, password: TEST_PASSWORD } }),
    ).rejects.toMatchObject({ status: 'FORBIDDEN' })
  })

  it('정리하면 행이 남지 않는다', async () => {
    await cleanup()
    const users = await db
      .select()
      .from(schema.user)
      .where(sql`${schema.user.email} = ${TEST_EMAIL}`)
    expect(users).toHaveLength(0)
  })
})
