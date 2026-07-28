import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/lib/env'

const valid = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgres://u:p@h/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Cited <noreply@example.com>',
}

describe('parseEnv', () => {
  it('필수 키가 모두 있으면 파싱된다', () => {
    const env = parseEnv(valid)
    expect(env.DATABASE_URL).toBe('postgres://u:p@h/db')
    expect(env.NODE_ENV).toBe('test')
  })

  it('필수 키가 빠지면 키 이름을 담은 에러를 던진다', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { DATABASE_URL, ...missing } = valid
    expect(() => parseEnv(missing)).toThrowError(/DATABASE_URL/)
  })

  it('BETTER_AUTH_SECRET이 32자 미만이면 거부한다', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrowError(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('선택 키는 없어도 통과하고 undefined가 된다', () => {
    expect(parseEnv(valid).SENTRY_DSN).toBeUndefined()
  })
})
