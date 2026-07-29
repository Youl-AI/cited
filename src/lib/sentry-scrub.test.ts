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
    expect(event?.request?.cookies).toBeUndefined()
    expect(event?.request?.url).toBe('https://cited.co.kr/dashboard')
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
    expect(event?.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0' })
  })

  it('요청 본문(data)을 통째로 버린다 — 가입 요청에 비밀번호가 들어 있다', () => {
    const event = scrubEvent(
      makeEvent({ request: { data: { email: 'reader@example.com', password: 'hunter2' } } }),
    )
    expect(event?.request?.data).toBeUndefined()
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
    expect(event?.user).toEqual({ id: 'usr_123' })
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
    expect(event?.exception?.values?.[0]?.value).toBe(
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
    expect(event?.message).toBe('db down: postgres://owner:[redacted]@ep-x.neon.tech/db')
    expect(event?.request?.url).toBe('https://u:[redacted]@cited.co.kr/callback')
    expect(event?.request?.query_string).toBe('next=postgres://owner:[redacted]@h/db')
  })

  it('비어 있는 이벤트도 던지지 않고 그대로 돌려준다', () => {
    const event = makeEvent({})
    expect(scrubEvent(event)).toBe(event)
  })
})

// 아래 세 블록은 "저자가 생각한 네 필드"가 아니라 **Sentry가 실제로 만드는**
// 이벤트 모양을 흉내 낸다. 모양의 출처를 주석에 적어 둔다 — 상상한 모양으로
// 테스트하면 같은 사각지대를 그대로 재생산한다.

describe('scrubEvent — breadcrumbs', () => {
  // @sentry/core 10.68 integrations/console.js의 addConsoleBreadcrumb가 만드는
  // 모양 그대로: 포맷된 message와 raw data.arguments를 **둘 다** 담는다.
  it('console breadcrumb의 message와 data.arguments를 모두 가린다', () => {
    const line =
      '{"level":"error","event":"db.query_failed","err":"NeonDbError: failed to connect to postgresql://neondb_owner:npg_S3cr3t@ep-x.neon.tech/db"}'
    const event = scrubEvent(
      makeEvent({
        breadcrumbs: [
          {
            category: 'console',
            level: 'error',
            message: line,
            data: { arguments: [line], logger: 'console' },
            timestamp: 1_753_000_000,
          },
        ],
      }),
    )

    const crumb = event?.breadcrumbs?.[0]
    expect(crumb?.message).not.toContain('npg_S3cr3t')
    expect(crumb?.message).toContain('neondb_owner:[redacted]@')
    expect(crumb?.data?.['arguments']).toEqual([
      '{"level":"error","event":"db.query_failed","err":"NeonDbError: failed to connect to postgresql://neondb_owner:[redacted]@ep-x.neon.tech/db"}',
    ])
    // 비밀이 아닌 필드는 손대지 않는다.
    expect(crumb?.data?.['logger']).toBe('console')
    expect(crumb?.category).toBe('console')
  })

  // fetch/xhr breadcrumb의 data는 FetchBreadcrumbData(types/breadcrumb.d.ts):
  // { method, url, status_code, ... }
  it('fetch breadcrumb의 url에 박힌 자격증명을 가린다', () => {
    const event = scrubEvent(
      makeEvent({
        breadcrumbs: [
          {
            category: 'fetch',
            type: 'http',
            data: {
              method: 'POST',
              url: 'https://svc:s3cr3t@api.resend.com/emails',
              status_code: 401,
            },
          },
        ],
      }),
    )
    expect(event?.breadcrumbs?.[0]?.data?.['url']).toBe(
      'https://svc:[redacted]@api.resend.com/emails',
    )
    // 숫자는 문자열로 바뀌지 않는다.
    expect(event?.breadcrumbs?.[0]?.data?.['status_code']).toBe(401)
  })

  it('breadcrumb data의 중첩 객체·배열까지 훑는다', () => {
    const event = scrubEvent(
      makeEvent({
        breadcrumbs: [
          {
            category: 'http',
            data: {
              request: { headers: ['Authorization: Bearer re_AbC-123.x'] },
            },
          },
        ],
      }),
    )
    const data = event?.breadcrumbs?.[0]?.data
    expect(data).toEqual({ request: { headers: ['Authorization: Bearer [redacted]'] } })
  })
})

describe('scrubEvent — extra', () => {
  // logger.error가 `captureMessage(event, { extra: fields })`로 fields를 그대로 넘긴다.
  it('logger가 넘긴 extra 필드를 가린다', () => {
    const event = scrubEvent(
      makeEvent({
        message: 'db.query_failed',
        extra: {
          err: 'NeonDbError: postgresql://neondb_owner:npg_S3cr3t@ep-x.neon.tech/db',
          attempt: 3,
        },
      }),
    )
    expect(event?.extra?.['err']).toBe(
      'NeonDbError: postgresql://neondb_owner:[redacted]@ep-x.neon.tech/db',
    )
    expect(event?.extra?.['attempt']).toBe(3)
  })

  // @sentry/core 10.68 utils/eventbuilder.js:73 — Error가 아닌 것이 throw되면
  // 객체 전체가 extra.__serialized__에 들어간다.
  it('eventFromUnknownInput이 만드는 extra.__serialized__를 재귀로 훑는다', () => {
    const event = scrubEvent(
      makeEvent({
        exception: { values: [{ type: 'Error', value: "'ConfigError' captured as exception" }] },
        extra: {
          __serialized__: {
            name: 'ConfigError',
            config: {
              databaseUrl: 'postgresql://neondb_owner:npg_S3cr3t@ep-x.neon.tech/db',
              headers: { authorization: 'Bearer re_live_AbC123' },
              retries: 2,
            },
          },
        },
      }),
    )
    expect(event?.extra).toEqual({
      __serialized__: {
        name: 'ConfigError',
        config: {
          databaseUrl: 'postgresql://neondb_owner:[redacted]@ep-x.neon.tech/db',
          headers: { authorization: 'Bearer [redacted]' },
          retries: 2,
        },
      },
    })
  })

  it('순환 참조가 있어도 던지지 않고 문자열은 가린다', () => {
    const node: Record<string, unknown> = {
      dsn: 'postgres://owner:npg_S3cr3t@ep-x.neon.tech/db',
    }
    node['self'] = node
    const event = scrubEvent(makeEvent({ extra: { root: node } }))
    expect(node['dsn']).toBe('postgres://owner:[redacted]@ep-x.neon.tech/db')
    expect(event?.extra?.['root']).toBe(node)
  })

  it('비정상적으로 깊은 중첩에서도 던지지 않는다', () => {
    let deep: Record<string, unknown> = { dsn: 'postgres://owner:npg_S3cr3t@h/db' }
    for (let i = 0; i < 200; i++) deep = { child: deep }
    expect(() => scrubEvent(makeEvent({ extra: { deep } }))).not.toThrow()
  })
})

describe('scrubEvent — contexts', () => {
  // Contexts는 Record<string, Record<string, unknown>>(types/context.d.ts).
  // StateContext는 Sentry가 실제로 정의한 모양이다.
  it('contexts의 문자열 leaf를 재귀로 가린다', () => {
    const event = scrubEvent(
      makeEvent({
        contexts: {
          trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16) },
          state: {
            state: {
              type: 'app',
              value: { dbUrl: 'postgres://owner:npg_S3cr3t@ep-x.neon.tech/db' },
            },
          },
        },
      }),
    )
    expect(event?.contexts?.['state']).toEqual({
      state: { type: 'app', value: { dbUrl: 'postgres://owner:[redacted]@ep-x.neon.tech/db' } },
    })
    expect(event?.contexts?.['trace']?.['trace_id']).toBe('a'.repeat(32))
  })
})

describe('scrubEvent — 방어', () => {
  // client.js가 beforeSend의 throw를 잡으면 **원본 이벤트를 버리고** 내부 에러를
  // 대신 보낸다(build/cjs/client.js:638-655). scrub 버그가 진짜 에러를 침묵으로
  // 바꾸는 것을 막는다.
  it('타입이 어긋난 이벤트를 받아도 던지지 않는다', () => {
    const malformed = {
      type: undefined,
      request: 'not-an-object',
      user: 42,
      breadcrumbs: { nope: true },
      exception: { values: 'nope' },
      extra: null,
      contexts: 'nope',
    } as unknown as ErrorEvent
    expect(() => scrubEvent(malformed)).not.toThrow()
  })

  it('null·undefined를 받아도 던지지 않는다', () => {
    expect(() => scrubEvent(null as unknown as ErrorEvent)).not.toThrow()
    expect(() => scrubEvent(undefined as unknown as ErrorEvent)).not.toThrow()
  })
})
