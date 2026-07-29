import type { ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { redactSecrets, scrubEvent } from '@/lib/sentry-scrub'

/** ErrorEvent는 `type: undefined`를 요구한다. 테스트마다 반복하지 않는다. */
function makeEvent(partial: Omit<ErrorEvent, 'type'>): ErrorEvent {
  return { type: undefined, ...partial }
}

describe('redactSecrets', () => {
  it('URL에 박힌 자격증명의 비밀번호를 가린다', () => {
    const text = 'connect ECONNREFUSED postgresql://neondb_owner:npg_S3cr3t@ep-x.neon.tech/db'
    expect(redactSecrets(text)).toBe(
      'connect ECONNREFUSED postgresql://neondb_owner:[redacted]@ep-x.neon.tech/db',
    )
  })

  it('한 문자열에 여러 개가 있어도 전부 가린다', () => {
    const text = 'postgres://a:pw1@h1/db and redis://b:pw2@h2'
    expect(redactSecrets(text)).toBe('postgres://a:[redacted]@h1/db and redis://b:[redacted]@h2')
  })

  it('Bearer 토큰을 가린다', () => {
    expect(redactSecrets('401 with header Authorization: Bearer re_AbC-123.x')).toBe(
      '401 with header Authorization: Bearer [redacted]',
    )
  })

  it('비밀이 없는 문자열은 그대로 둔다', () => {
    const text = 'fetch failed for https://api.openai.com/v1/responses (503)'
    expect(redactSecrets(text)).toBe(text)
  })
})

describe('scrubEvent', () => {
  it('쿠키를 제거한다', () => {
    const event = scrubEvent(
      makeEvent({
        request: {
          url: 'https://cited.co.kr/dashboard',
          cookies: { 'better-auth.session_token': 'abc.def' },
        },
      }),
    )
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.url).toBe('https://cited.co.kr/dashboard')
  })

  it('요청 헤더의 cookie·authorization을 제거한다 (대소문자 무관)', () => {
    const event = scrubEvent(
      makeEvent({
        request: {
          headers: {
            Cookie: 'better-auth.session_token=abc',
            authorization: 'Bearer re_live_key',
            'user-agent': 'Mozilla/5.0',
          },
        },
      }),
    )
    expect(event.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0' })
  })

  it('요청 본문(data)을 통째로 버린다 — 가입 요청에 비밀번호가 들어 있다', () => {
    const event = scrubEvent(
      makeEvent({ request: { data: { email: 'reader@example.com', password: 'hunter2' } } }),
    )
    expect(event.request?.data).toBeUndefined()
  })

  it('사용자 식별자 중 이메일·IP·사용자명을 지우고 id만 남긴다', () => {
    const event = scrubEvent(
      makeEvent({
        user: {
          id: 'usr_123',
          email: 'reader@example.com',
          ip_address: '203.0.113.7',
          username: 'reader',
        },
      }),
    )
    expect(event.user).toEqual({ id: 'usr_123' })
  })

  it('예외 메시지의 접속 문자열을 가린다', () => {
    const event = scrubEvent(
      makeEvent({
        exception: {
          values: [
            {
              type: 'NeonDbError',
              value: 'failed to connect to postgresql://owner:npg_S3cr3t@ep-x.neon.tech/db',
            },
          ],
        },
      }),
    )
    expect(event.exception?.values?.[0]?.value).toBe(
      'failed to connect to postgresql://owner:[redacted]@ep-x.neon.tech/db',
    )
  })

  it('message와 query_string, url도 가린다', () => {
    const event = scrubEvent(
      makeEvent({
        message: 'db down: postgres://owner:npg_S3cr3t@ep-x.neon.tech/db',
        request: {
          url: 'https://u:p@cited.co.kr/callback',
          query_string: 'next=postgres://owner:npg_S3cr3t@h/db',
        },
      }),
    )
    expect(event.message).toBe('db down: postgres://owner:[redacted]@ep-x.neon.tech/db')
    expect(event.request?.url).toBe('https://u:[redacted]@cited.co.kr/callback')
    expect(event.request?.query_string).toBe('next=postgres://owner:[redacted]@h/db')
  })

  it('비어 있는 이벤트도 던지지 않고 그대로 돌려준다', () => {
    const event = makeEvent({})
    expect(scrubEvent(event)).toBe(event)
  })
})
