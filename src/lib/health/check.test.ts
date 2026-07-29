import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDbPing, handleHealthCheck } from '@/lib/health/check'

// 예외 메시지에 실려 오는 전형적인 값. Neon 드라이버는 접속 실패 시
// 호스트·사용자명이 든 문자열을 그대로 던진다. 이게 응답 본문에 새면
// 공개 URL 하나로 DB 접속 정보가 유출된다.
const CONNECTION_STRING = 'postgresql://cited_owner:s3cr3t@ep-secret-1234.ap-southeast-1.aws.neon.tech/citeddb'

describe('handleHealthCheck', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('DB가 응답하면 200과 ok:true를 돌려준다', async () => {
    const pingDb = vi.fn(async () => {})
    // 주입한 시계로 지연 시간을 고정한다 — 실제 시간에 의존하면 플레이키해진다.
    const clock = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_042)

    const response = await handleHealthCheck({ pingDb, now: clock })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, db: 'up', latencyMs: 42 })
    expect(pingDb).toHaveBeenCalledTimes(1)
  })

  it('DB가 던지면 503을 돌려주되 예외 메시지·접속 문자열을 응답에 담지 않는다', async () => {
    const pingDb = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED — ${CONNECTION_STRING}`)
    })

    const response = await handleHealthCheck({ pingDb })
    const body = await response.text()

    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toEqual({ ok: false, db: 'down' })
    expect(body).not.toContain(CONNECTION_STRING)
    expect(body).not.toContain('ECONNREFUSED')
    expect(body).not.toContain('neon.tech')
  })

  it('DB가 던지면 logger로 남기되 로그에도 접속 문자열을 넣지 않는다', async () => {
    const pingDb = vi.fn(async () => {
      throw new Error(`connect ECONNREFUSED — ${CONNECTION_STRING}`)
    })

    await handleHealthCheck({ pingDb })

    const line = vi.mocked(console.error).mock.calls[0]?.[0]
    expect(typeof line).toBe('string')
    expect(line as string).toContain('health.db.failed')
    expect(line as string).not.toContain(CONNECTION_STRING)
    expect(line as string).not.toContain('s3cr3t')
  })

  // 문자열이 아닌 것을 던지는 경로(드라이버가 객체를 reject하는 경우)에서도
  // 핸들러 자신이 터지면 안 된다. 터지면 500이 나가고 502/503 구분이 무너진다.
  it('Error가 아닌 값을 던져도 503을 돌려준다', async () => {
    const pingDb = vi.fn(async () => {
      throw CONNECTION_STRING
    })

    const response = await handleHealthCheck({ pingDb })

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain(CONNECTION_STRING)
  })
})

describe('createDbPing', () => {
  it('가장 싼 쿼리(select 1)만 실행한다', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createDbPing({ execute } as any)()

    expect(execute).toHaveBeenCalledTimes(1)
    const query = execute.mock.calls[0]?.[0]
    expect(query).toStrictEqual(sql`select 1`)
  })
})
