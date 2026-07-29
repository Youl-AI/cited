import { describe, expect, it } from 'vitest'
import { isDeployedEnv, parseEnv } from '@/lib/env'

const valid = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgres://u:p@h/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Cited <noreply@example.com>',
}

// 배포로 판정되는 조합을 만들 때 얹는다. 배포에서는 CRON_SECRET이 필수라
// (아래 'CRON_SECRET' describe 참고), 이걸 빼면 BETTER_AUTH_URL을 검증하려던
// 테스트가 엉뚱하게 CRON_SECRET 때문에 실패한다.
const deployable = { CRON_SECRET: 'c'.repeat(32) }

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

// 세션 쿠키의 Secure 플래그는 auth.ts의 advanced.useSecureCookies가
// 결정하지만, BETTER_AUTH_URL이 http로 새면 인증 링크·콜백 URL이 전부 평문으로
// 나간다. 그리고 이 값이 NEXT_PUBLIC_APP_URL과 다르면 better-auth의 origin
// 검사가 모든 요청을 거부한다. 둘 다 부팅 시점에 막는다.
//
// 발동 조건은 auth.ts의 쿠키 정책과 **같은 판정**(NODE_ENV=production 또는
// isDeployedEnv)을 쓴다. 어긋나면 한쪽만 켜진 채로 세션이 평문으로 흐른다.
describe('BETTER_AUTH_URL 위생', () => {
  it('프로덕션에서 http:// BETTER_AUTH_URL을 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'http://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'http://cited.co.kr',
      }),
    ).toThrowError(/BETTER_AUTH_URL/)
  })

  // 이 태스크가 막으려던 바로 그 사고: 로컬 값이 Vercel 환경변수로 복사되는 것.
  it('Vercel에 로컬 http 값이 복사되면 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        VERCEL: '1',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toThrowError(/BETTER_AUTH_URL/)
  })

  // `next build`·`next start`는 로컬에서도 NODE_ENV=production이다. 여기서
  // 막으면 로컬 프로덕션 빌드가 통째로 죽는다 — 실제로 죽였다가 되돌렸다.
  it('배포가 아닌 로컬 프로덕션 빌드의 루프백 http는 통과한다', () => {
    const env = parseEnv({
      ...valid,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000')
  })

  it('루프백이 아닌 실호스트는 배포 신호가 없어도 http를 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'http://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'http://cited.co.kr',
      }),
    ).toThrowError(/BETTER_AUTH_URL/)
  })

  it('프로덕션의 https://는 통과한다', () => {
    const env = parseEnv({
      ...valid,
      ...deployable,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://cited.co.kr',
      NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
    })
    expect(env.BETTER_AUTH_URL).toBe('https://cited.co.kr')
  })

  // 이 테스트가 깨지면 로컬 개발이 통째로 막힌다. 규칙을 조일 때 반드시 지킬 것.
  it('개발 환경의 http://localhost:3000은 그대로 통과한다', () => {
    const env = parseEnv({
      ...valid,
      NODE_ENV: 'development',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    })
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000')
  })

  // 여기가 이번 수정의 요점이다. NODE_ENV 하나에만 걸어 두면, Vercel에서
  // NODE_ENV를 덮어썼거나 커스텀 진입점(`node server.js`)·컨테이너가 빠뜨린
  // 배포에서 https 강제가 조용히 꺼진다. NODE_ENV는 .default('development')라
  // 값이 없으면 fail-open이다.
  it('NODE_ENV가 production이 아니어도 배포 신호가 있으면 http를 거부한다', () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      expect(() =>
        parseEnv({
          ...valid,
          NODE_ENV: nodeEnv,
          VERCEL: '1',
          BETTER_AUTH_URL: 'http://cited.co.kr',
          NEXT_PUBLIC_APP_URL: 'http://cited.co.kr',
        }),
      ).toThrowError(/BETTER_AUTH_URL/)
    }
  })

  // 배포에는 루프백 예외가 없다 — NODE_ENV와 무관하게.
  it('NODE_ENV가 production이 아니어도 배포 신호가 있으면 루프백 http도 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'development',
        VERCEL: '1',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).toThrowError(/BETTER_AUTH_URL/)
  })

  it('배포 신호가 있어도 https면 통과한다', () => {
    const env = parseEnv({
      ...valid,
      ...deployable,
      NODE_ENV: 'development',
      VERCEL: '1',
      BETTER_AUTH_URL: 'https://cited.co.kr',
      NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
    })
    expect(env.VERCEL).toBe('1')
  })

  // 호스트명은 대소문자를 구분하지 않는다(RFC 3986 §3.2.2). 예전 정규식은
  // 소문자만 받아서 이 값이 로컬 프로덕션 빌드를 막았다.
  it('루프백 판정이 대소문자를 가리지 않는다', () => {
    const env = parseEnv({
      ...valid,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'http://LOCALHOST:3000',
      NEXT_PUBLIC_APP_URL: 'http://LOCALHOST:3000',
    })
    expect(env.BETTER_AUTH_URL).toBe('http://LOCALHOST:3000')
  })

  // 반대로 앵커·종결자는 그대로여야 한다. 이게 없으면 아래 위조 호스트가
  // 루프백으로 통과해 https 강제를 우회한다.
  it('localhost를 흉내 낸 위조 호스트는 루프백으로 봐주지 않는다', () => {
    for (const forged of [
      'http://localhost.evil.com',
      'http://localhost@evil.com',
      'http://LocalHost.evil.com',
      'http://evil.com/localhost',
      'http://notlocalhost:3000',
    ]) {
      expect(() =>
        parseEnv({
          ...valid,
          NODE_ENV: 'production',
          BETTER_AUTH_URL: forged,
          NEXT_PUBLIC_APP_URL: forged,
        }),
      ).toThrowError(/BETTER_AUTH_URL/)
    }
  })

  it('BETTER_AUTH_URL과 NEXT_PUBLIC_APP_URL이 다르면 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
      }),
    ).toThrowError(/NEXT_PUBLIC_APP_URL/)
  })

  // 끝 슬래시는 표기 차이일 뿐 같은 오리진이다. 여기서 거부하면 실제로는
  // 잘 도는 설정이 부팅만 막는다.
  it('끝 슬래시만 다른 같은 오리진은 일치로 본다', () => {
    const env = parseEnv({
      ...valid,
      ...deployable,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://cited.co.kr/',
      NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
    })
    // 정규화는 비교에만 쓴다 — 값은 입력 그대로 남는다.
    expect(env.BETTER_AUTH_URL).toBe('https://cited.co.kr/')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://cited.co.kr')
  })

  it('호스트가 다르면 여전히 거부한다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        BETTER_AUTH_URL: 'https://cited.co.kr/',
        NEXT_PUBLIC_APP_URL: 'https://app.cited.co.kr/',
      }),
    ).toThrowError(/NEXT_PUBLIC_APP_URL/)
  })

  it('불일치 에러 메시지에도 두 키 이름이 모두 드러난다', () => {
    let thrown: unknown
    try {
      parseEnv({
        ...valid,
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain('BETTER_AUTH_URL')
  })
})

// CRON_SECRET은 /api/cron/* 라우트의 유일한 인증 수단이다. 배포에서 이 값이
// 비어 있으면 라우트가 fail-closed로 401을 돌려줘 만료 세션 정리가 조용히
// 멈춘다(= 보유기간 집행이 멈춘다). 그래서 부팅 시점에 막는다.
//
// 다만 로컬은 없이도 돌아가야 한다. `next build`·`next start`는 로컬에서도
// NODE_ENV=production이므로, BETTER_AUTH_URL의 https 강제와 **같은 카브아웃**
// (배포 신호 없음 + 루프백 주소 = 로컬 빌드)을 적용한다.
describe('CRON_SECRET', () => {
  it('로컬 개발에서는 없어도 통과한다', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'development' }).CRON_SECRET).toBeUndefined()
  })

  it('배포가 아닌 로컬 프로덕션 빌드(루프백)에서는 없어도 통과한다', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'production' }).CRON_SECRET).toBeUndefined()
  })

  it('배포 신호가 있으면 필수다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        VERCEL: '1',
        BETTER_AUTH_URL: 'https://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      }),
    ).toThrowError(/CRON_SECRET/)
  })

  it('프로덕션 실호스트면 배포 신호가 없어도 필수다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      }),
    ).toThrowError(/CRON_SECRET/)
  })

  // `.env.example`을 그대로 복사하면 `CRON_SECRET=`(빈 문자열)이 된다.
  // 빈 값은 "설정됨"이 아니라 "없음"으로 취급해야 한다 — 라우트도 빈 값을
  // 거부하므로 배포에서 통과시키면 크론이 영원히 401을 받는다.
  it('배포에서 빈 문자열은 설정된 것으로 보지 않는다', () => {
    expect(() =>
      parseEnv({
        ...valid,
        VERCEL: '1',
        CRON_SECRET: '',
        BETTER_AUTH_URL: 'https://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      }),
    ).toThrowError(/CRON_SECRET/)
  })

  it('배포에 값이 있으면 통과한다', () => {
    const env = parseEnv({
      ...valid,
      VERCEL: '1',
      CRON_SECRET: 'c'.repeat(32),
      BETTER_AUTH_URL: 'https://cited.co.kr',
      NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
    })
    expect(env.CRON_SECRET).toBe('c'.repeat(32))
  })

  it('검증 실패 메시지에 시크릿 값 자체는 담기지 않는다', () => {
    const plausible = 'crn_live_9f2a'
    let thrown: unknown
    try {
      parseEnv({
        ...valid,
        VERCEL: '1',
        CRON_SECRET: '',
        BETTER_AUTH_URL: 'https://cited.co.kr',
        NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      })
    } catch (error) {
      thrown = error
    }
    expect((thrown as Error).message).toContain('CRON_SECRET')
    expect((thrown as Error).message).not.toContain(plausible)
  })
})

// env.ts의 https 강제와 auth.ts의 쿠키 Secure가 "배포됨"을 서로 다르게
// 판정하면, 한쪽만 켜진 채로 세션 토큰이 평문으로 흐른다. 그래서 판정은
// 이 함수 하나에만 있고 auth.ts가 이걸 import해서 쓴다.
describe('isDeployedEnv', () => {
  it('VERCEL이 있으면 배포로 본다 (빈 문자열도 포함)', () => {
    expect(isDeployedEnv({ VERCEL: '1' })).toBe(true)
    expect(isDeployedEnv({ VERCEL: '' })).toBe(true)
  })

  it('VERCEL이 없으면 배포가 아니다 — 로컬 프로덕션 빌드가 여기 해당한다', () => {
    expect(isDeployedEnv({ VERCEL: undefined })).toBe(false)
    expect(isDeployedEnv(parseEnv(valid))).toBe(false)
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
