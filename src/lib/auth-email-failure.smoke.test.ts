// 실제 Neon DB로 도는 스모크 테스트. `pnpm test:smoke` 전용.
//
// 검증하는 것 하나: **인증 메일 발송이 실패해도 회원가입이 무너지지 않고,
// 그 실패가 관측 가능하게 남는다.**
//
// ★ 이 파일은 Resend를 실제로 부르지 않는다.
//
//   예전에는 `@/lib/email/send`를 모킹하지 않고 배달 불가 주소(.invalid)로
//   진짜 발송을 시도해 "어차피 실패하겠지"에 기댔다. 두 가지가 잘못이었다.
//
//   1. 단언이 "던지지 않음 / user 행 존재 / emailVerified === false" 셋뿐이라
//      **발송이 성공해도 전부 참**이었다. Resend가 그 주소를 받아들이는 순간
//      이 파일은 영원히 통과하면서 아무것도 덮지 않는 가입 해피패스가 된다.
//   2. `pnpm test:smoke`를 돌릴 때마다 인증된 발신 도메인에서 반송될 주소로
//      실제 발송이 나가 쿼터를 쓰고 발신자 평판을 깎았다.
//
//   그래서 실패를 테스트가 **직접 만들고**(스텁), 실패가 실제로 관측됐는지를
//   단언한다. 발송이 예기치 않게 성공하면 아래 로그 단언이 깨진다.
//   진짜로 깨진 API 키에 대한 검증은 send.test.ts의 단위 테스트가
//   실제 Resend 생성자 throw로 이미 덮고 있다.

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SendEmailResult } from '@/lib/email/send'

/** 스텁이 돌려줄 실패 이유. 로그에 이 문자열이 그대로 실려야 한다. */
const FORCED_REASON = 'smoke-forced-send-failure'

/** 훅이 실제로 발송을 시도했는지, 그 결과가 실패였는지 확인하기 위한 기록. */
const sendResults: SendEmailResult[] = []

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (): Promise<SendEmailResult> => {
    const result: SendEmailResult = { ok: false, reason: FORCED_REASON }
    sendResults.push(result)
    return result
  },
}))

const { auth } = await import('@/lib/auth')
const { db, schema } = await import('@/lib/db')

const TEST_EMAIL = `cited-mailfail-${Date.now()}@cited-smoke.invalid`
const TEST_PASSWORD = 'smoke-test-password-1234'

/** logger.error가 흘리는 JSON 한 줄들. 테스트 출력은 조용히 유지한다. */
const errorLines: string[] = []

async function cleanup() {
  await db.delete(schema.user).where(sql`${schema.user.email} = ${TEST_EMAIL}`)
}

function failureLogs(): string[] {
  return errorLines.filter((line) => line.includes('auth.verification_email_failed'))
}

describe('인증 메일 발송 실패 격리', () => {
  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorLines.push(args.map((a) => String(a)).join(' '))
    })
    await cleanup()
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await cleanup()
  })

  it('발송이 실패해도 가입은 성공하고, 실패가 로그로 관측된다', async () => {
    // 던지지 않아야 한다. 던지면 여기서 실패한다.
    const result = await auth.api.signUpEmail({
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: '메일실패' },
    })

    // ── 전제 확인 ──────────────────────────────────────────────
    // 이 파일의 전제는 "발송이 실패했다"이다. 발송이 시도되지 않았거나
    // 성공했다면 아래 격리 단언들은 아무 의미가 없다. 먼저 못 박는다.
    expect(sendResults).toHaveLength(1)
    expect(sendResults[0]?.ok).toBe(false)

    // ── 실패가 관측 가능한가 ────────────────────────────────────
    // auth.ts의 sendVerificationEmail 훅이 남기는 이벤트. Better Auth는
    // 이 훅의 예외를 삼키므로(create-context.mjs의 runInBackgroundOrAwait)
    // 이 로그가 "메일이 안 나갔다"를 알 수 있는 유일한 통로다. 발송이
    // 성공하면 이 줄이 아예 생기지 않아 테스트가 실패한다.
    const logs = failureLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain(FORCED_REASON)
    // 개인정보는 로그에 남지 않는다.
    expect(logs[0]).not.toContain(TEST_EMAIL)

    // ── 그럼에도 가입은 온전하다 ────────────────────────────────
    expect(result.user.email).toBe(TEST_EMAIL)

    const users = await db
      .select()
      .from(schema.user)
      .where(sql`${schema.user.email} = ${TEST_EMAIL}`)
    expect(users).toHaveLength(1)
    // 메일을 못 보냈으므로 계정은 미인증 상태로 남는다.
    expect(users[0]?.emailVerified).toBe(false)
  })

  it('미인증 계정은 로그인할 수 없고, 로그인 시도가 확인 메일을 다시 밀어낸다', async () => {
    await expect(
      auth.api.signInEmail({ body: { email: TEST_EMAIL, password: TEST_PASSWORD } }),
    ).rejects.toMatchObject({ status: 'FORBIDDEN' })

    // auth.ts의 sendOnSignIn: 미인증 상태로 로그인을 다시 시도하면 확인
    // 메일이 새로 나간다 (sign-in.mjs:314-323). 별도 재발송 UI 없이 이게
    // 유일한 복구 경로이므로 실제로 시도되는지 확인한다 — 여기서도 스텁이
    // 실패를 돌려주므로 실패 로그가 하나 더 쌓인다.
    expect(sendResults).toHaveLength(2)
    expect(failureLogs()).toHaveLength(2)
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
