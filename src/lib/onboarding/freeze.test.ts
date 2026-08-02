import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * 동결 선점/되돌리기 SQL의 **회귀 잠금**. 방식과 근거는 `generation.test.ts`
 * 상단 주석과 같다 — 라이브 DB 없이 잠글 수 있는 것은 드리즐이 뱉는 SQL뿐이다.
 */

const capture = vi.hoisted(() => {
  const queries: { sql: string; params: unknown[] }[] = []
  const responses: unknown[][][] = []
  return {
    queries,
    responses,
    reset() {
      queries.length = 0
      responses.length = 0
    },
    client(sql: string, params: unknown[]) {
      queries.push({ sql, params })
      const out = responses.shift() ?? []
      return Promise.resolve({ rows: out, rowCount: out.length, fields: [], command: '' })
    },
  }
})

vi.mock('@neondatabase/serverless', () => ({ neon: () => capture.client }))

const { claimQueryFreeze, releaseQueryFreeze } = await import('./freeze')

function flat(sql: string): string {
  return sql.replaceAll(/\s+/g, ' ').toLowerCase()
}

const FROZEN_AT = new Date('2026-08-01T00:00:00.000Z')

beforeEach(() => {
  capture.reset()
})

describe('claimQueryFreeze', () => {
  test('WHERE queries_frozen_at IS NULL + RETURNING — 조건부 선점이 한 문장', async () => {
    capture.responses.push([['brd_1']])
    const claimed = await claimQueryFreeze({
      brandId: 'brd_1',
      userId: 'usr_1',
      frozenAt: FROZEN_AT,
      queryQuota: 12,
    })
    expect(claimed).toBe(true)

    expect(capture.queries).toHaveLength(1)
    const { sql, params } = capture.queries[0]!
    const flatSql = flat(sql)
    expect(flatSql).toContain('update "brands"')
    // ★ 이 조건이 사라지면 두 번째 [확정]이 첫 번째의 동결 시각을 덮어쓴다
    //   (PREMIUM 전후 비교 불변식이 깨진다).
    expect(flatSql).toContain('"queries_frozen_at" is null')
    expect(flatSql).toContain('"user_id" =')
    expect(flatSql).toContain('returning')
    // 이 브랜드가 계정 한도에서 가져간 몫을 같이 기록한다.
    expect(params).toContain(12)
  })

  test('0행이면 false — 이미 남이 선점했다', async () => {
    capture.responses.push([])
    await expect(
      claimQueryFreeze({ brandId: 'brd_1', userId: 'usr_1', frozenAt: FROZEN_AT, queryQuota: 3 }),
    ).resolves.toBe(false)
  })
})

describe('releaseQueryFreeze', () => {
  test('내가 쓴 시각과 일치할 때만 되돌린다 — 남의 성공한 동결을 풀지 않는다', async () => {
    await releaseQueryFreeze({ brandId: 'brd_1', userId: 'usr_1', frozenAt: FROZEN_AT })
    expect(capture.queries).toHaveLength(1)
    const { sql, params } = capture.queries[0]!
    const flatSql = flat(sql)
    expect(flatSql).toContain('"queries_frozen_at" = $')
    expect(flatSql).toContain('"user_id" =')
    // brandId · userId · 되돌릴 대상 시각이 전부 WHERE로 간다.
    expect(params).toContain('brd_1')
    expect(params).toContain('usr_1')
    expect(params.some((p) => String(p).startsWith('2026-08-01'))).toBe(true)
  })
})
