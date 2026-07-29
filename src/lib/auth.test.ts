// 세션 쿠키 속성을 고정하는 단위 테스트.
//
// 실제 Set-Cookie 헤더는 auth.smoke.test.ts가 확인하지만, 그건 NODE_ENV=test로
// 돌기 때문에 **프로덕션의 Secure**를 볼 수 없다. 여기서 better-auth가 쿠키
// 속성을 계산할 때 쓰는 바로 그 함수(getCookies, dist/cookies/index.mjs)에
// 우리 정책을 먹인다.
//
// ★ 중요: 정책 함수만 단독으로 부르는 테스트는 **auth.ts의 실제 설정에 대해
//   아무것도 증명하지 않는다.** 배선이 `secureCookiePolicy('development')`로
//   바뀌어도, defaultCookieAttributes가 secure를 도로 꺼도, NODE_ENV=test에서는
//   기대값이 false라 전부 초록으로 통과한다. 그래서 아래 '재적재' 블록이
//   NODE_ENV를 바꿔 auth.ts 모듈을 다시 적재하고 그 인스턴스의 옵션을 본다.

import { getCookies } from 'better-auth/cookies'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auth, secureCookiePolicy } from '@/lib/auth'

/** getCookies가 보는 최소 옵션. baseURL을 일부러 http로 둔다 (아래 설명 참고). */
function cookiesFor(
  nodeEnv: 'development' | 'test' | 'production',
  baseURL: string,
  isDeployed = false,
) {
  return getCookies({ baseURL, advanced: secureCookiePolicy(nodeEnv, isDeployed) })
}

describe('secureCookiePolicy', () => {
  it('프로덕션에서 useSecureCookies가 켜진다', () => {
    expect(secureCookiePolicy('production', false)).toEqual({ useSecureCookies: true })
    expect(secureCookiePolicy('development', false)).toEqual({ useSecureCookies: false })
    expect(secureCookiePolicy('test', false)).toEqual({ useSecureCookies: false })
  })

  // NODE_ENV 하나에 걸어 두면, Vercel이 NODE_ENV를 덮어썼거나 커스텀 진입점이
  // 빠뜨린 배포에서 Secure가 조용히 꺼진다. 배포 신호가 두 번째 축이다.
  it('NODE_ENV가 production이 아니어도 배포 신호가 있으면 켜진다', () => {
    expect(secureCookiePolicy('development', true)).toEqual({ useSecureCookies: true })
    expect(secureCookiePolicy('test', true)).toEqual({ useSecureCookies: true })
  })
})

describe('auth 인스턴스가 쿠키 정책을 실제로 들고 있다', () => {
  // undefined면 better-auth가 baseURL 문자열로 secure를 정하는 옛 경로로
  // 돌아간다. `false`와 `undefined`의 차이가 이 태스크의 요점이다.
  it('advanced.useSecureCookies가 명시되어 있다', () => {
    expect(auth.options.advanced?.useSecureCookies).toBe(false) // NODE_ENV=test
    expect(auth.options.advanced?.useSecureCookies).not.toBeUndefined()
  })

  // 합성 옵션이 아니라 **실제 auth 인스턴스의 옵션**을 그대로 먹인다.
  // 누가 advanced.defaultCookieAttributes로 sameSite를 'none'으로 낮추거나
  // httpOnly를 끄면 여기서 걸린다.
  it('실제 옵션에서 계산한 세션 쿠키가 httpOnly·lax·/·30일이다', () => {
    const { sessionToken } = getCookies(auth.options)
    expect(sessionToken.attributes.httpOnly).toBe(true)
    expect(sessionToken.attributes.sameSite).toBe('lax')
    expect(sessionToken.attributes.path).toBe('/')
    expect(sessionToken.attributes.maxAge).toBe(60 * 60 * 24 * 30)
  })
})

describe('세션 쿠키 속성', () => {
  // 이것이 이 파일의 핵심이다. baseURL이 http://여도 — 즉 프로덕션에 로컬
  // 값이 복사되는 최악의 사고가 나도 — 쿠키는 Secure로 나가야 한다.
  // 이 단언이 깨지면 세션 토큰이 평문으로 흐른다는 뜻이다.
  it('프로덕션에서는 baseURL이 http여도 Secure가 켜진다', () => {
    const { sessionToken } = cookiesFor('production', 'http://localhost:3000')
    expect(sessionToken.attributes.secure).toBe(true)
    // better-auth는 secure 쿠키에 __Secure- 접두사까지 붙인다.
    expect(sessionToken.name).toBe('__Secure-better-auth.session_token')
  })

  it('개발 환경에서는 Secure가 꺼져 http://localhost가 그대로 동작한다', () => {
    const { sessionToken } = cookiesFor('development', 'http://localhost:3000')
    expect(sessionToken.attributes.secure).toBe(false)
    expect(sessionToken.name).toBe('better-auth.session_token')
  })

  it('httpOnly·sameSite·path는 환경과 무관하게 고정이다', () => {
    for (const nodeEnv of ['development', 'test', 'production'] as const) {
      const { sessionToken } = cookiesFor(nodeEnv, 'https://cited.co.kr')
      expect(sessionToken.attributes.httpOnly).toBe(true)
      expect(sessionToken.attributes.sameSite).toBe('lax')
      expect(sessionToken.attributes.path).toBe('/')
    }
  })
})

// 이 블록이 이 파일의 실질이다. 위쪽 테스트들은 정책 함수의 동작만 본다 —
// auth.ts가 그 함수를 **어떻게 호출하는지**는 보지 못한다. 여기서는 환경변수를
// 바꾼 뒤 모듈 그래프를 리셋하고 auth.ts를 통째로 다시 적재해서, 그렇게 만들어진
// 진짜 인스턴스의 옵션으로 쿠키를 계산한다. 그 결과 env.ts의 부팅 검증까지
// 같은 경로를 타므로, 두 방어선(https 강제 · 쿠키 Secure)이 서로 맞물리는지도
// 여기서 함께 확인된다.
describe('실제 auth 설정을 다른 환경으로 재적재했을 때', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /** env를 덮어쓰고 auth.ts를 새로 적재한다. 정적 import한 `auth`와는 별개 인스턴스다. */
  async function reloadAuth(overrides: Record<string, string>) {
    for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value)
    vi.resetModules()
    const { auth: reloaded } = await import('@/lib/auth')
    return reloaded
  }

  // 회귀 1: 배선이 `secureCookiePolicy('development', ...)`로 바뀌거나 삼항이
  //   뒤집히면 여기서 죽는다. 기존 테스트들은 NODE_ENV=test에서 false를
  //   기대하기 때문에 그 회귀를 통과시켰다.
  // 회귀 2: `defaultCookieAttributes: { secure: false }`를 얹으면
  //   cookies/index.mjs:37의 spread가 secure를 도로 끄는데, 그것도 여기서 죽는다.
  //   (__Secure- 접두사는 secureCookiePrefix로 따로 계산되므로 name은 남는다 —
  //    그래서 attributes.secure와 name을 둘 다 단언한다.)
  it('프로덕션 NODE_ENV로 재적재한 실제 설정이 Secure 쿠키를 낸다', async () => {
    const prodAuth = await reloadAuth({ NODE_ENV: 'production' })

    const { sessionToken } = getCookies(prodAuth.options)
    expect(sessionToken.attributes.secure).toBe(true)
    expect(sessionToken.name).toBe('__Secure-better-auth.session_token')
    expect(prodAuth.options.advanced?.useSecureCookies).toBe(true)
  })

  // NODE_ENV가 production이 아닌 배포 — Vercel이 NODE_ENV를 덮어썼거나
  // 커스텀 진입점이 빠뜨린 경우. env.ts의 https 강제와 쿠키 Secure가 **함께**
  // 켜져야 한다. 어느 한쪽이 NODE_ENV만 보고 있으면 이 테스트가 잡는다.
  it('배포 신호만 있어도(NODE_ENV≠production) Secure 쿠키를 낸다', async () => {
    const deployedAuth = await reloadAuth({
      VERCEL: '1',
      BETTER_AUTH_URL: 'https://cited.co.kr',
      NEXT_PUBLIC_APP_URL: 'https://cited.co.kr',
      // 배포에서는 env.ts가 CRON_SECRET을 필수로 요구한다(만료 세션 정리
      // 크론의 유일한 인증 수단). 여기서 검증하려는 건 쿠키 Secure이므로,
      // 부팅이 다른 이유로 막히지 않게 채워 준다.
      CRON_SECRET: 'c'.repeat(32),
    })
    expect(deployedAuth.options.baseURL).toBe('https://cited.co.kr')

    const { sessionToken } = getCookies(deployedAuth.options)
    expect(sessionToken.attributes.secure).toBe(true)
    expect(sessionToken.name).toBe('__Secure-better-auth.session_token')
  })

  // 그리고 그 배포에서 http BETTER_AUTH_URL은 부팅 자체가 막혀야 한다.
  // 즉 쿠키 정책이 실수로 꺼지더라도 평문 URL로는 뜨지도 못한다.
  it('배포 신호가 있는데 http URL이면 모듈 적재가 실패한다', async () => {
    await expect(
      reloadAuth({
        VERCEL: '1',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }),
    ).rejects.toThrowError(/BETTER_AUTH_URL/)
  })

  // 로컬 개발이 계속 돌아야 한다 — 배포 신호 없는 http://localhost.
  it('개발 환경으로 재적재하면 Secure가 꺼진 채 http://localhost가 동작한다', async () => {
    const devAuth = await reloadAuth({ NODE_ENV: 'development' })

    const { sessionToken } = getCookies(devAuth.options)
    expect(sessionToken.attributes.secure).toBe(false)
    expect(sessionToken.name).toBe('better-auth.session_token')
  })
})
