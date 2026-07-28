import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseClientEnv } from '@/lib/env.client'

const validPublic = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SENTRY_DSN: undefined,
  NEXT_PUBLIC_TOSS_CLIENT_KEY: undefined,
}

describe('parseClientEnv', () => {
  it('공개 변수만으로 파싱된다', () => {
    const result = parseClientEnv(validPublic)
    expect(result.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  it('NEXT_PUBLIC_APP_URL이 URL 형식이 아니면 거부한다', () => {
    expect(() =>
      parseClientEnv({ ...validPublic, NEXT_PUBLIC_APP_URL: 'not-a-url' }),
    ).toThrowError(/NEXT_PUBLIC_APP_URL/)
  })

  it('선택 변수는 없어도 통과하고 undefined가 된다', () => {
    const result = parseClientEnv(validPublic)
    expect(result.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()
    expect(result.NEXT_PUBLIC_TOSS_CLIENT_KEY).toBeUndefined()
  })
})

describe('클라이언트 env 모듈은 서버 시크릿 없이도 동작한다', () => {
  // 4단계 토스 위젯처럼 브라우저에서 실행되는 클라이언트 컴포넌트는
  // 서버 전용 시크릿(DATABASE_URL, BETTER_AUTH_SECRET 등)이 전혀 없는
  // 번들 환경에서도 '@/lib/env.client'를 문제없이 import할 수 있어야 한다.
  // 이 테스트는 process.env에서 서버 시크릿을 모두 제거한 뒤에도
  // env.client 모듈이 정상 동작하는지 검증한다.
  const serverOnlyKeys = [
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'RESEND_API_KEY',
    'EMAIL_FROM',
  ] as const

  let saved: Partial<Record<(typeof serverOnlyKeys)[number], string | undefined>>

  beforeEach(() => {
    saved = {}
    for (const key of serverOnlyKeys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of serverOnlyKeys) {
      const value = saved[key]
      if (value !== undefined) process.env[key] = value
    }
    vi.resetModules()
  })

  it('서버 시크릿이 모두 없어도 import가 throw하지 않는다', async () => {
    await expect(import('@/lib/env.client')).resolves.toBeDefined()
  })

  it('서버 시크릿이 없어도 공개 변수 값을 정상적으로 읽는다', async () => {
    const mod = await import('@/lib/env.client')
    expect(mod.clientEnv.NEXT_PUBLIC_APP_URL).toBe(process.env.NEXT_PUBLIC_APP_URL)
  })
})
