import { beforeEach, describe, expect, test, vi } from 'vitest'
import { generateAuditQueries } from '@/lib/audit/queries'

/**
 * `freezeQueriesAction`·`generateQueriesAction`의 **결정 로직** 테스트.
 *
 * ★ DB는 가짜다. 이 파일이 검증하는 것은 "어떤 입력에 어떤 판정이 나오고,
 *   쓰기가 **어떤 순서로** 일어나는가"다 — 실제 SQL 문자열은
 *   `generation.test.ts`·`freeze.test.ts`가 따로 못 박는다(라이브 DB 없이
 *   확인 가능한 최대치를 두 각도에서 나눠 덮는다).
 */

const mocks = vi.hoisted(() => ({
  writes: [] as string[],
  loadOnboardingGate: vi.fn(),
  loadEditorQuota: vi.fn(),
  findFirst: vi.fn(),
  claimQueryFreeze: vi.fn(),
  releaseQueryFreeze: vi.fn(),
  takeGenerationCredit: vi.fn(),
  refundGenerationCredit: vi.fn(),
  deleteWhere: vi.fn(async () => undefined),
  insertValues: vi.fn(async () => undefined),
  generate: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    schema: actual.schema,
    db: {
      query: { brands: { findFirst: mocks.findFirst } },
      delete: () => {
        mocks.writes.push('delete')
        return { where: mocks.deleteWhere }
      },
      insert: () => {
        mocks.writes.push('insert')
        return { values: mocks.insertValues }
      },
    },
  }
})

vi.mock('@/lib/audit/custom-queries', () => ({
  createCustomQueryGenerator: () => mocks.generate,
}))
vi.mock('@/lib/onboarding/gate', () => ({ loadOnboardingGate: mocks.loadOnboardingGate }))
vi.mock('@/lib/onboarding/quota', () => ({ loadEditorQuota: mocks.loadEditorQuota }))
vi.mock('@/lib/onboarding/freeze', () => ({
  claimQueryFreeze: mocks.claimQueryFreeze,
  releaseQueryFreeze: mocks.releaseQueryFreeze,
}))
vi.mock('@/lib/onboarding/generation', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/onboarding/generation')>(
      '@/lib/onboarding/generation',
    )
  return {
    QUERY_GENERATION_LIMIT: actual.QUERY_GENERATION_LIMIT,
    takeGenerationCredit: mocks.takeGenerationCredit,
    refundGenerationCredit: mocks.refundGenerationCredit,
  }
})

const { freezeQueriesAction, generateQueriesAction } = await import('./actions')

const CATEGORY = '패션'
const TEMPLATES = generateAuditQueries(CATEGORY, '바디텍')

/** 템플릿 3개 + 맞춤 n개 = 총 3+n개의 유효한 질의 */
function queriesOfLength(total: number): string[] {
  const custom = Array.from(
    { length: Math.max(0, total - TEMPLATES.length) },
    (_, i) => `가성비 좋은 브랜드 ${i + 1}번째로 알려줘`,
  )
  return [...TEMPLATES, ...custom].slice(0, total)
}

function setBrand(overrides: Record<string, unknown> = {}): void {
  mocks.findFirst.mockResolvedValue({
    id: 'brd_1',
    userId: 'usr_1',
    name: '바디텍',
    category: CATEGORY,
    region: null,
    competitors: [{ name: '경쟁사', aliases: [] }],
    queriesFrozenAt: null,
    ...overrides,
  })
}

function setGate(): void {
  mocks.loadOnboardingGate.mockResolvedValue({
    user: { id: 'usr_1', email: 'a@b.c', name: '고객' },
    subscription: { plan: 'business', queryPacks: 0, status: 'active' },
    limits: null,
    brandCount: 2,
    pendingBrandId: 'brd_1',
    frozenBrandCount: 1,
    state: 'needs-queries',
  })
}

/** Business 한도 30, 다른 브랜드가 `used`개를 쓰고 있는 상태 */
function setQuota(used: number, maxQueries = 30): void {
  mocks.loadEditorQuota.mockResolvedValue({
    quota: Math.max(0, maxQueries - used),
    queriesOnOtherBrands: used,
    maxQueries,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.writes.length = 0
  setGate()
  setBrand()
  mocks.claimQueryFreeze.mockImplementation(async () => {
    mocks.writes.push('claim')
    return true
  })
  mocks.releaseQueryFreeze.mockImplementation(async () => {
    mocks.writes.push('release')
  })
})

describe('freezeQueriesAction — quota는 상한이지 정확한 개수가 아니다 (C-1)', () => {
  test('Business 첫 브랜드가 한도(30)보다 적은 10개로 확정할 수 있다', async () => {
    setQuota(0)
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(result).toEqual({ ok: true, value: { frozen: 10 } })
  })

  test('두 번째 브랜드는 남은 몫(30−10=20) 안에서 확정된다 — 영구 잠금 없음', async () => {
    setQuota(10)
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(12) })
    expect(result).toEqual({ ok: true, value: { frozen: 12 } })
  })

  test('남은 몫을 넘기면 허용 범위를 알려 주고 거절한다', async () => {
    setQuota(10)
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(25) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('20')
    expect(mocks.writes).toEqual([])
  })

  test('템플릿 3개보다 적으면 거절한다', async () => {
    setQuota(0)
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(2) })
    expect(result.ok).toBe(false)
    expect(mocks.writes).toEqual([])
  })

  test('빈 칸 패딩은 제출 전에 걸러진다 — 에디터가 채우는 빈 문자열로 실패하지 않는다', async () => {
    setQuota(0)
    const result = await freezeQueriesAction({
      brandId: 'brd_1',
      queries: [...queriesOfLength(10), '', '   ', ''],
    })
    expect(result).toEqual({ ok: true, value: { frozen: 10 } })
  })

  test('남은 몫이 템플릿 수보다 적으면 진짜 이유(다른 브랜드가 다 씀)를 말한다', async () => {
    setQuota(30)
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('다른 브랜드')
    expect(mocks.writes).toEqual([])
  })
})

describe('freezeQueriesAction — 동결 레이스 (I-1)', () => {
  test('선점이 delete·insert보다 **먼저** 온다', async () => {
    setQuota(0)
    await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(mocks.writes).toEqual(['claim', 'delete', 'insert'])
  })

  test('선점에 지면 질의를 한 줄도 건드리지 않는다', async () => {
    setQuota(0)
    mocks.claimQueryFreeze.mockImplementation(async () => {
      mocks.writes.push('claim')
      return false
    })
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(result).toEqual({ ok: false, reason: '이미 확정된 질의입니다.' })
    // ★ 예전에는 여기서 delete·insert가 이미 끝나 있었다 — 이긴 쪽의 동결 질의를
    //   지우고 자기 것을 넣은 뒤 "실패"를 돌려주던 경로다.
    expect(mocks.writes).toEqual(['claim'])
    expect(mocks.releaseQueryFreeze).not.toHaveBeenCalled()
  })

  test('질의 저장이 실패하면 선점을 되돌린다 — 최악이 "미동결로 복귀"가 된다', async () => {
    setQuota(0)
    mocks.insertValues.mockRejectedValueOnce(new Error('boom'))
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(result.ok).toBe(false)
    expect(mocks.writes).toEqual(['claim', 'delete', 'insert', 'release'])
    expect(mocks.releaseQueryFreeze).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brd_1', userId: 'usr_1' }),
    )
  })

  test('되돌리기까지 실패해도 예외를 밖으로 흘리지 않는다', async () => {
    setQuota(0)
    mocks.insertValues.mockRejectedValueOnce(new Error('boom'))
    mocks.releaseQueryFreeze.mockRejectedValueOnce(new Error('also boom'))
    const result = await freezeQueriesAction({ brandId: 'brd_1', queries: queriesOfLength(10) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('다시 시도')
  })
})

describe('generateQueriesAction — 실패 원인 구분 (I-2·M-1)', () => {
  test('한도 소진일 때만 "5회까지입니다"라고 말한다', async () => {
    mocks.takeGenerationCredit.mockResolvedValue({ ok: false, reason: 'limit' })
    const result = await generateQueriesAction({ brandId: 'brd_1', count: 3 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('5회')
  })

  test('브랜드가 사라졌거나 이미 동결이면 크레딧 이야기를 꺼내지 않는다', async () => {
    mocks.takeGenerationCredit.mockResolvedValue({ ok: false, reason: 'gone' })
    const result = await generateQueriesAction({ brandId: 'brd_1', count: 3 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).not.toContain('5회')
    expect(result.reason).toContain('새로고침')
  })

  test('생성 실패 시 크레딧을 환불한다 — userId까지 넘긴다 (M-2)', async () => {
    mocks.takeGenerationCredit.mockResolvedValue({ ok: true, used: 1 })
    mocks.generate.mockRejectedValue(new Error('rate limit'))
    const result = await generateQueriesAction({ brandId: 'brd_1', count: 3 })
    expect(result.ok).toBe(false)
    expect(mocks.refundGenerationCredit).toHaveBeenCalledWith('brd_1', 'usr_1')
  })

  test('환불이 던져도 친절한 안내가 살아남는다 (M-1)', async () => {
    mocks.takeGenerationCredit.mockResolvedValue({ ok: true, used: 1 })
    mocks.generate.mockRejectedValue(new Error('rate limit'))
    mocks.refundGenerationCredit.mockRejectedValue(new Error('db down'))
    const result = await generateQueriesAction({ brandId: 'brd_1', count: 3 })
    expect(result).toEqual({
      ok: false,
      reason: '질의 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    })
  })
})
