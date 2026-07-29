import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createExpiredSessionDeleter,
  expiredSessionsCondition,
  handleCleanupSessions,
} from '@/lib/cron/cleanup-sessions'

const SECRET = 'test-cron-secret-value'
const NOW = new Date('2026-07-29T00:00:00.000Z')

/**
 * 실제 `session` 테이블을 대신하는 인메모리 저장소.
 *
 * 여기서 검증하는 것은 "핸들러가 인가된 요청에서만 삭제기를 호출하고, 삭제기에
 * 올바른 기준 시각을 넘기는가"다. 삭제 조건 자체(만료 행만 고르는 SQL)는 아래
 * `expiredSessionsCondition` 테스트가 실제 drizzle 표현식으로 검증한다 — 두
 * 테스트가 합쳐져야 "만료된 것만 지운다"가 증명된다.
 */
function createFakeSessionStore() {
  const rows = [
    { id: 'expired-old', expiresAt: new Date('2026-06-01T00:00:00.000Z') },
    { id: 'expired-just-now', expiresAt: new Date('2026-07-28T23:59:59.000Z') },
    { id: 'valid', expiresAt: new Date('2026-08-28T00:00:00.000Z') },
  ]
  return {
    ids: () => rows.map((r) => r.id),
    deleteExpiredSessions: vi.fn(async (now: Date) => {
      const expired = rows.filter((r) => r.expiresAt.getTime() < now.getTime())
      for (const row of expired) rows.splice(rows.indexOf(row), 1)
      return expired.length
    }),
  }
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://cited.example/api/cron/cleanup-sessions', { headers })
}

describe('expiredSessionsCondition', () => {
  it('기준 시각보다 이전에 만료된 행만 고르는 조건을 만든다', () => {
    const { sql, params } = new PgDialect().sqlToQuery(expiredSessionsCondition(NOW))
    expect(sql).toBe('"session"."expires_at" < $1')
    expect(params).toEqual([NOW.toISOString()])
  })
})

describe('handleCleanupSessions', () => {
  it('올바른 시크릿이면 만료 세션만 지우고 유효 세션은 남긴다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(
      request({ authorization: `Bearer ${SECRET}` }),
      { secret: SECRET, deleteExpiredSessions: store.deleteExpiredSessions, now: () => NOW },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, deleted: 2 })
    expect(store.ids()).toEqual(['valid'])
    expect(store.deleteExpiredSessions).toHaveBeenCalledWith(NOW)
  })

  it('시크릿이 틀리면 아무것도 지우지 않는다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(
      request({ authorization: 'Bearer test-cron-secret-WRONG' }),
      { secret: SECRET, deleteExpiredSessions: store.deleteExpiredSessions, now: () => NOW },
    )

    expect(response.status).toBe(401)
    expect(store.deleteExpiredSessions).not.toHaveBeenCalled()
    expect(store.ids()).toHaveLength(3)
  })

  it('Authorization 헤더가 아예 없으면 아무것도 지우지 않는다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(request(), {
      secret: SECRET,
      deleteExpiredSessions: store.deleteExpiredSessions,
      now: () => NOW,
    })

    expect(response.status).toBe(401)
    expect(store.deleteExpiredSessions).not.toHaveBeenCalled()
    expect(store.ids()).toHaveLength(3)
  })

  // 길이가 다른 값은 crypto.timingSafeEqual이 그대로 던진다. 던지면 500이
  // 되어 "틀린 시크릿"과 "서버 오류"가 뒤섞이므로, 비교 전에 고정 길이로
  // 정규화해야 한다.
  it('길이가 다른 시크릿을 보내도 예외 없이 거부한다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(request({ authorization: 'Bearer x' }), {
      secret: SECRET,
      deleteExpiredSessions: store.deleteExpiredSessions,
      now: () => NOW,
    })

    expect(response.status).toBe(401)
    expect(store.deleteExpiredSessions).not.toHaveBeenCalled()
  })

  it('Bearer 접두사 없이 시크릿만 보내면 거부한다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(request({ authorization: SECRET }), {
      secret: SECRET,
      deleteExpiredSessions: store.deleteExpiredSessions,
      now: () => NOW,
    })

    expect(response.status).toBe(401)
    expect(store.deleteExpiredSessions).not.toHaveBeenCalled()
  })

  // 시크릿이 비어 있으면 "빈 문자열과 일치"로 통과해 아무나 세션 테이블을
  // 지울 수 있다. 설정이 없으면 fail-closed여야 한다.
  it('서버에 시크릿이 설정돼 있지 않으면 어떤 요청도 통과하지 못한다', async () => {
    for (const secret of [undefined, '']) {
      const store = createFakeSessionStore()

      const noHeader = await handleCleanupSessions(request(), {
        secret,
        deleteExpiredSessions: store.deleteExpiredSessions,
        now: () => NOW,
      })
      const emptyBearer = await handleCleanupSessions(request({ authorization: 'Bearer ' }), {
        secret,
        deleteExpiredSessions: store.deleteExpiredSessions,
        now: () => NOW,
      })

      expect(noHeader.status).toBe(401)
      expect(emptyBearer.status).toBe(401)
      expect(store.deleteExpiredSessions).not.toHaveBeenCalled()
      expect(store.ids()).toHaveLength(3)
    }
  })

  it('응답 본문에 시크릿이 새지 않는다', async () => {
    const store = createFakeSessionStore()

    const response = await handleCleanupSessions(request({ authorization: `Bearer ${SECRET}` }), {
      secret: SECRET,
      deleteExpiredSessions: store.deleteExpiredSessions,
      now: () => NOW,
    })

    expect(await response.text()).not.toContain(SECRET)
  })

  it('삭제가 실패하면 500을 돌려주되 시크릿을 노출하지 않는다', async () => {
    const failing = vi.fn(async () => {
      throw new Error(`db down (secret was ${SECRET})`)
    })

    const response = await handleCleanupSessions(request({ authorization: `Bearer ${SECRET}` }), {
      secret: SECRET,
      deleteExpiredSessions: failing,
      now: () => NOW,
    })

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain(SECRET)
  })
})

describe('createExpiredSessionDeleter', () => {
  it('만료 조건으로 delete를 실행하고 삭제된 행 수를 돌려준다', async () => {
    const where = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    })
    const fakeDb = { delete: vi.fn().mockReturnValue({ where }) }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deleted = await createExpiredSessionDeleter(fakeDb as any)(NOW)

    expect(deleted).toBe(2)
    const condition = where.mock.calls[0]?.[0]
    expect(condition).toBeDefined()
    const { sql, params } = new PgDialect().sqlToQuery(condition)
    expect(sql).toBe('"session"."expires_at" < $1')
    expect(params).toEqual([NOW.toISOString()])
  })
})
