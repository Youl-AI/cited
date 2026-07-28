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

  it('시크릿이 유효하지 않아도 에러 메시지에 값 자체는 노출되지 않는다', () => {
    // 32자 미만이지만 실제 시크릿처럼 보이는 값. 결제를 다루는
    // 서비스이므로 이런 값이 에러 메시지나 로그로 새면 안 된다.
    const plausibleButInvalidSecret = 'sk_live_51Hh2M9K3jF8n2Qz'
    expect(plausibleButInvalidSecret.length).toBeLessThan(32)

    let thrown: unknown
    try {
      parseEnv({ ...valid, BETTER_AUTH_SECRET: plausibleButInvalidSecret })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    const message = (thrown as Error).message
    expect(message).not.toContain(plausibleButInvalidSecret)
    expect(message).toContain('BETTER_AUTH_SECRET')
  })
})

describe('공유 검증자 드리프트 방지', () => {
  // env.ts와 env.client.ts가 NEXT_PUBLIC_APP_URL과 NEXT_PUBLIC_SENTRY_DSN의
  // 검증자를 env.shared.ts에서 import해 사용하므로, 같은 입력값은 양쪽에서
  // 같은 검증 결과를 낸다. 만약 한쪽이 공유 모듈을 깨뜨리고 독립적으로
  // 정의하기 시작하면 이 테스트가 실패해 알려준다.
  it('서버와 클라이언트가 NEXT_PUBLIC_APP_URL의 같은 잘못된 값을 모두 거부한다', async () => {
    const invalidUrl = 'not-a-valid-url'

    // 서버 스키마 검증 실패
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_APP_URL: invalidUrl })).toThrowError(
      /NEXT_PUBLIC_APP_URL/,
    )

    // 클라이언트 스키마도 같은 값에 대해 거부해야 한다
    const { parseClientEnv } = await import('@/lib/env.client')
    expect(() =>
      parseClientEnv({
        NEXT_PUBLIC_APP_URL: invalidUrl,
        NEXT_PUBLIC_SENTRY_DSN: undefined,
        NEXT_PUBLIC_TOSS_CLIENT_KEY: undefined,
      }),
    ).toThrowError(/NEXT_PUBLIC_APP_URL/)
  })

  it('서버와 클라이언트가 NEXT_PUBLIC_SENTRY_DSN의 같은 값을 같게 처리한다', async () => {
    // 선택 필드이므로 undefined는 통과한다
    const serverResult = parseEnv({ ...valid, NEXT_PUBLIC_SENTRY_DSN: undefined })
    expect(serverResult.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()

    const { parseClientEnv } = await import('@/lib/env.client')
    const clientResult = parseClientEnv({
      NEXT_PUBLIC_APP_URL: valid.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SENTRY_DSN: undefined,
      NEXT_PUBLIC_TOSS_CLIENT_KEY: undefined,
    })
    expect(clientResult.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()

    // 값이 있을 때도 같게 처리된다
    const validDsn = 'https://key@sentry.io/123456'
    const serverWithDsn = parseEnv({ ...valid, NEXT_PUBLIC_SENTRY_DSN: validDsn })
    expect(serverWithDsn.NEXT_PUBLIC_SENTRY_DSN).toBe(validDsn)

    const clientWithDsn = parseClientEnv({
      NEXT_PUBLIC_APP_URL: valid.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SENTRY_DSN: validDsn,
      NEXT_PUBLIC_TOSS_CLIENT_KEY: undefined,
    })
    expect(clientWithDsn.NEXT_PUBLIC_SENTRY_DSN).toBe(validDsn)
  })
})
