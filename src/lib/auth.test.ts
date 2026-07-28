// 세션 쿠키 속성을 고정하는 단위 테스트.
//
// 실제 Set-Cookie 헤더는 auth.smoke.test.ts가 확인하지만, 그건 NODE_ENV=test로
// 돌기 때문에 **프로덕션의 Secure**를 볼 수 없다. 여기서 better-auth가 쿠키
// 속성을 계산할 때 쓰는 바로 그 함수(getCookies, dist/cookies/index.mjs)에
// 우리 정책을 먹여서 프로덕션 분기를 고정한다.

import { getCookies } from 'better-auth/cookies'
import { describe, expect, it } from 'vitest'
import { auth, secureCookiePolicy } from '@/lib/auth'

/** getCookies가 보는 최소 옵션. baseURL을 일부러 http로 둔다 (아래 설명 참고). */
function cookiesFor(nodeEnv: 'development' | 'test' | 'production', baseURL: string) {
  return getCookies({ baseURL, advanced: secureCookiePolicy(nodeEnv) })
}

describe('secureCookiePolicy', () => {
  it('프로덕션에서만 useSecureCookies가 켜진다', () => {
    expect(secureCookiePolicy('production')).toEqual({ useSecureCookies: true })
    expect(secureCookiePolicy('development')).toEqual({ useSecureCookies: false })
    expect(secureCookiePolicy('test')).toEqual({ useSecureCookies: false })
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
