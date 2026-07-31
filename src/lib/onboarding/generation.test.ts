import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * 생성 크레딧 SQL의 **회귀 잠금**.
 *
 * ★ 이 함수들은 라이브 DB에서 한 번도 돌지 않았다(프로덕션 쓰기 금지).
 *   그래도 잠글 수 있는 것이 하나 있다 — **드리즐이 실제로 뱉는 SQL 문자열**이다.
 *   `vitest.config.ts`가 형식이 유효한 더미 `DATABASE_URL`을 주므로,
 *   `@neondatabase/serverless`의 `neon()`만 가로채면 드리즐은 진짜로 돌고
 *   쿼리만 우리 손에 들어온다(HTTP는 첫 쿼리 때 나가는데 그 자리를 우리가 막는다).
 *
 *   여기서 못 박는 WHERE 절들이 이 모듈의 안전성 전부다. 누가 무심코 지워도
 *   타입은 통과하고 다른 테스트도 전부 통과한다 — 그래서 문자열로 잠근다.
 */

const capture = vi.hoisted(() => {
  const queries: { sql: string; params: unknown[] }[] = []
  /** 쿼리 순서대로 돌려줄 행 목록. 드리즐은 필드가 있으면 배열 모드로 읽는다. */
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

const { QUERY_GENERATION_LIMIT, refundGenerationCredit, takeGenerationCredit } =
  await import('./generation')

/** 공백을 뭉개고 소문자로 — 드리즐의 줄바꿈 차이에 테스트가 흔들리지 않게 */
function flat(sql: string): string {
  return sql.replaceAll(/\s+/g, ' ').toLowerCase()
}

beforeEach(() => {
  capture.reset()
})

describe('takeGenerationCredit', () => {
  test('한도 검사가 UPDATE의 WHERE 안에 있다 — 검사와 증가가 한 문장', async () => {
    capture.responses.push([[3]])
    const result = await takeGenerationCredit('brd_1', 'usr_1')
    expect(result).toEqual({ ok: true, used: 3 })

    expect(capture.queries).toHaveLength(1)
    const { sql, params } = capture.queries[0]!
    const flatSql = flat(sql)
    expect(flatSql).toContain('update')
    // ★ 이 조건이 사라지면 한도 강제가 통째로 사라진다(SELECT 후 UPDATE와 같아진다).
    expect(flatSql).toContain('"query_generations" <')
    expect(params).toContain(QUERY_GENERATION_LIMIT)
    // ★ 동결된 브랜드에는 크레딧을 쓰지 못한다.
    expect(flatSql).toContain('"queries_frozen_at" is null')
    // ★ 남의 브랜드 크레딧을 깎지 못한다.
    expect(flatSql).toContain('"user_id" =')
    expect(flatSql).toContain('returning')
  })

  test('한도 소진이면 reason=limit — 재조회로 원인을 가른다', async () => {
    capture.responses.push([]) // UPDATE 0행
    capture.responses.push([[QUERY_GENERATION_LIMIT, null]]) // 재조회: 다 씀, 미동결
    expect(await takeGenerationCredit('brd_1', 'usr_1')).toEqual({ ok: false, reason: 'limit' })
    expect(capture.queries).toHaveLength(2)
    expect(flat(capture.queries[1]!.sql)).toContain('select')
  })

  test('브랜드가 없으면 reason=gone — 한 번도 안 쓴 고객에게 "5회 소진"을 말하지 않는다', async () => {
    capture.responses.push([])
    capture.responses.push([]) // 재조회도 0행
    expect(await takeGenerationCredit('brd_1', 'usr_1')).toEqual({ ok: false, reason: 'gone' })
  })

  test('이미 동결됐으면 reason=gone (크레딧이 남아 있어도)', async () => {
    capture.responses.push([])
    capture.responses.push([[0, new Date()]])
    expect(await takeGenerationCredit('brd_1', 'usr_1')).toEqual({ ok: false, reason: 'gone' })
  })
})

describe('refundGenerationCredit', () => {
  test('greatest(… - 1, 0) — 경합에도 음수가 되지 않는다', async () => {
    await refundGenerationCredit('brd_1', 'usr_1')
    expect(capture.queries).toHaveLength(1)
    const { sql, params } = capture.queries[0]!
    expect(flat(sql)).toContain('greatest("brands"."query_generations" - 1, 0)')
    // ★ M-2: 환불도 소유를 확인한다(차감의 거울).
    expect(flat(sql)).toContain('"user_id" =')
    expect(params).toEqual(['brd_1', 'usr_1'])
  })
})
