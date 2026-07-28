// 실제 Neon DB에 붙는 스모크 테스트. `pnpm test:smoke`로만 돈다 (CI 기본 실행 제외).
//
// 검증하는 것: Better Auth 1.6.25의 drizzleAdapter가 우리가 이미 만들어 둔
// user/session/account/verification 테이블에 스키마 변경 없이 그대로 붙는지,
// 그리고 가입 → 인증 메일 링크 생성 → 이메일 확인 → 세션 발급까지 실제로 도는지.
//
// ★ 이 테스트는 끝나면 자기가 만든 행을 전부 지운다. 정상 상태는 13개 테이블 0행이다.

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmailContent } from '@/lib/email/templates'

// Resend를 실제로 부르지 않는다. 대신 인증 링크가 담긴 메일 본문을 가로채서
// 토큰을 꺼낸다 — 이렇게 하면 auth.ts의 sendVerificationEmail 훅 배선과
// 링크 URL 생성까지 같이 검증된다.
const sentEmails: { to: string; content: EmailContent }[] = []

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (params: { to: string; content: EmailContent }) => {
    sentEmails.push(params)
    return { ok: true, id: 'smoke-stub' }
  },
  maskEmail: (email: string) => email,
}))

const { auth } = await import('@/lib/auth')
const { db, schema } = await import('@/lib/db')

const TEST_EMAIL = `cited-smoke-${Date.now()}@cited-smoke.invalid`
const TEST_PASSWORD = 'smoke-test-password-1234'

/** 이 테스트가 만든 행만 지운다. session/account는 user에 cascade로 딸려간다. */
async function cleanup() {
  await db.delete(schema.user).where(sql`${schema.user.email} = ${TEST_EMAIL}`)
}

async function countAll(): Promise<Record<string, number>> {
  const tables = [
    'user',
    'session',
    'account',
    'verification',
    'subscriptions',
    'brands',
    'queries',
    'collection_runs',
    'answers',
    'detections',
    'free_audits',
    'payments',
    'serpapi_usage',
  ]
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const rows = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)}`,
    )
    counts[table] = Number(rows.rows[0]?.n ?? -1)
  }
  return counts
}

describe('Better Auth ↔ 기존 Drizzle 스키마', () => {
  beforeAll(cleanup)
  afterAll(cleanup)

  it('가입하면 user·account 행이 생기고 인증 링크가 만들어진다', async () => {
    const before = await countAll()
    expect(before['user']).toBe(0)

    const result = await auth.api.signUpEmail({
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: '스모크' },
    })

    expect(result.user.email).toBe(TEST_EMAIL)

    const users = await db
      .select()
      .from(schema.user)
      .where(sql`${schema.user.email} = ${TEST_EMAIL}`)
    expect(users).toHaveLength(1)
    const created = users[0]
    expect(created).toBeDefined()
    // 기존 스키마의 컬럼이 그대로 채워진다 — 어댑터가 재매핑 없이 붙었다는 증거.
    expect(created?.emailVerified).toBe(false)
    expect(created?.role).toBe('user') // user_role_check 제약을 통과한 값
    expect(created?.name).toBe('스모크')
    expect(created?.createdAt).toBeInstanceOf(Date)

    const accounts = await db
      .select()
      .from(schema.account)
      .where(sql`${schema.account.userId} = ${created?.id ?? ''}`)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]?.providerId).toBe('credential')
    expect(accounts[0]?.password).toBeTruthy() // 평문이 아니라 해시가 들어간다
    expect(accounts[0]?.password).not.toBe(TEST_PASSWORD)

    // requireEmailVerification: true라 가입 시점에는 세션이 없다.
    expect(result.token).toBeNull()

    // 인증 메일이 훅을 타고 나갔고, 링크가 우리 baseURL로 만들어졌다.
    expect(sentEmails).toHaveLength(1)
    expect(sentEmails[0]?.to).toBe(TEST_EMAIL)
    expect(sentEmails[0]?.content.html).toContain('/api/auth/verify-email?token=')
  })

  it('이메일 인증 토큰은 무상태 JWT다 — verification 테이블은 쓰지 않는다', async () => {
    // Better Auth 1.6.25는 이메일 인증 토큰을 서명된 JWT로 만든다
    // (dist/api/routes/email-verification.mjs의 createEmailVerificationToken).
    // 즉 가입 플로우는 verification 테이블에 행을 남기지 않는다. 이 테이블은
    // 어댑터 스키마에는 필요하지만(비밀번호 재설정 등 다른 플로우가 쓴다)
    // 여기서는 0행인 것이 정상이다.
    const rows = await db.select().from(schema.verification)
    expect(rows).toHaveLength(0)
  })

  it('메일 링크의 토큰으로 인증하면 emailVerified가 켜지고 세션이 발급된다', async () => {
    const html = sentEmails[0]?.content.html ?? ''
    // 템플릿이 &를 &amp;로 이스케이프하므로 되돌린 뒤 토큰을 꺼낸다.
    const match = /verify-email\?token=([^&"]+)/.exec(html)
    const token = match?.[1]
    expect(token).toBeTruthy()

    const verified = await auth.api.verifyEmail({ query: { token: token ?? '' } })
    expect(verified?.status).toBe(true)

    const users = await db
      .select()
      .from(schema.user)
      .where(sql`${schema.user.email} = ${TEST_EMAIL}`)
    expect(users[0]?.emailVerified).toBe(true)

    // autoSignInAfterVerification: true → session 행이 생긴다
    const sessions = await db
      .select()
      .from(schema.session)
      .where(sql`${schema.session.userId} = ${users[0]?.id ?? ''}`)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.token).toBeTruthy()
    expect(sessions[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('정리 후 13개 테이블이 전부 0행으로 돌아온다', async () => {
    await cleanup()
    const counts = await countAll()
    expect(counts).toEqual({
      user: 0,
      session: 0,
      account: 0,
      verification: 0,
      subscriptions: 0,
      brands: 0,
      queries: 0,
      collection_runs: 0,
      answers: 0,
      detections: 0,
      free_audits: 0,
      payments: 0,
      serpapi_usage: 0,
    })
  })
})
