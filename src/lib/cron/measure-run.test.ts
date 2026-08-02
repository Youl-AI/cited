import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `measureBrand`의 **순서 불변식** 테스트.
 *
 * ★ 이 파일이 지키는 것은 두 가지뿐이다. 둘 다 리뷰에서 Critical로 잡혔던
 *   순서이고, 둘 다 주석으로만 눌려 있었다 — 아무 테스트도 이 모듈을 부르지
 *   않아서 줄을 옮겨도 스위트가 초록이었다.
 *
 *   (a) `createRun`이 `validateRunStart`보다 **먼저** 온다. 회차 행 없이 던지면
 *       `selectDueBrand`가 세는 실패 시도가 영원히 0이라 하루 상한(2회)이 안
 *       걸리고, id 순 소진이라 그 브랜드가 큐 앞을 막아 뒤 브랜드 전부가 그 날
 *       측정되지 않는다.
 *   (b) 성공으로 닫은(`finishRun` succeeded) 뒤의 예외는 회차를 **다시 열지
 *       못한다.** 다시 failed로 덮으면 다음 호출이 그 실패를 시도로 세어 이미
 *       측정된 브랜드에 유료 파이프라인을 통째로 다시 돌린다(회차당 약 2,400원).
 *
 * ★ DB·수집·판정·별칭은 전부 가짜다. 이 파일은 네트워크도 DB도 건드리지 않는다
 *   (`actions.test.ts`의 `vi.mock('@/lib/db')` 방식과 같다). 검증하는 것은
 *   "어떤 실패가 어느 지점에서 나면 회차가 어떤 상태로 남는가"다.
 */

const mocks = vi.hoisted(() => ({
  /** 부작용의 **순서**를 그대로 담는다 — 이 파일의 본론이다 */
  calls: [] as string[],
  brandFindFirst: vi.fn(),
  subscriptionFindFirst: vi.fn(),
  selectQueries: vi.fn(),
  insertDetections: vi.fn(),
  createRun: vi.fn(),
  finishRun: vi.fn(),
  saveAnswers: vi.fn(),
  saveRunResult: vi.fn(),
  recordSerpUsage: vi.fn(),
  loadEditorQuota: vi.fn(),
  runCollection: vi.fn(),
  runDetection: vi.fn(),
  aliasFn: vi.fn(),
  buildAuditResult: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db')>('@/lib/db')
  return {
    schema: actual.schema,
    db: {
      query: {
        brands: { findFirst: mocks.brandFindFirst },
        subscriptions: { findFirst: mocks.subscriptionFindFirst },
      },
      select: () => ({ from: () => ({ where: () => ({ orderBy: mocks.selectQueries }) }) }),
      insert: () => ({ values: () => ({ onConflictDoNothing: mocks.insertDetections }) }),
    },
  }
})

// ★ 순수 조립기(`validateRunStart`·`buildAnswerRow`·`buildRunMetrics`·
//   `resolveRunStatus`)는 진짜를 쓴다. 검증 실패를 진짜 한도 초과로 일으켜야
//   (a)가 실제 경로를 덮는다 — 가짜 throw를 심으면 검증 자체가 사라진 뒤에도
//   테스트가 통과한다.
vi.mock('@/lib/collection/repository', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/collection/repository')>(
      '@/lib/collection/repository',
    )
  return {
    ...actual,
    createRun: mocks.createRun,
    finishRun: mocks.finishRun,
    saveAnswers: mocks.saveAnswers,
    saveRunResult: mocks.saveRunResult,
    recordSerpUsage: mocks.recordSerpUsage,
  }
})

vi.mock('@/lib/collection/run', async () => {
  const actual = await vi.importActual<typeof import('@/lib/collection/run')>('@/lib/collection/run')
  return { ...actual, runCollection: mocks.runCollection }
})

// 별칭·판정·리포트 조립은 유료 호출이거나 이 파일의 관심사가 아니다.
vi.mock('@/lib/audit/aliases', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/audit/aliases')>('@/lib/audit/aliases')
  return { ...actual, createAliasGenerator: () => mocks.aliasFn }
})
vi.mock('@/lib/judge/claude', () => ({ createClaudeJudge: () => vi.fn() }))
vi.mock('@/lib/detection/pipeline', () => ({ runDetection: mocks.runDetection }))
vi.mock('@/lib/audit/result', () => ({ buildAuditResult: mocks.buildAuditResult }))
vi.mock('@/lib/onboarding/quota', () => ({ loadEditorQuota: mocks.loadEditorQuota }))
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: mocks.loggerError },
}))

const { measureBrand } = await import('./measure-run')

const BRAND_ID = 'brd_1'

/** 수집 답변 1건 — `buildRunMetrics`·`buildAnswerRow`가 진짜라 형태가 맞아야 한다 */
const answer = {
  queryId: 'qry_1',
  queryText: '가성비 좋은 브랜드 알려줘',
  engineId: 'chatgpt' as const,
  sampleIndex: 0,
  text: '바디텍이 좋습니다.',
  citations: [],
  raw: {},
  usage: { calls: 1, tokensIn: 100, tokensOut: 200 },
}

/** 전부 성공하는 파이프라인. 각 테스트가 필요한 지점만 실패로 바꾼다. */
function setHappyPath(): void {
  mocks.brandFindFirst.mockResolvedValue({
    id: BRAND_ID,
    userId: 'usr_1',
    name: '바디텍',
    category: '패션',
    competitors: [{ name: '경쟁사', aliases: [] }],
    selfDomains: [],
    queriesFrozenAt: new Date('2026-07-01T00:00:00Z'),
    isActive: true,
  })
  mocks.subscriptionFindFirst.mockResolvedValue({
    userId: 'usr_1',
    plan: 'business',
    queryPacks: 0,
    status: 'active',
  })
  mocks.selectQueries.mockResolvedValue([{ id: 'qry_1', text: answer.queryText }])
  mocks.loadEditorQuota.mockImplementation(async () => {
    mocks.calls.push('loadEditorQuota')
    return { quota: 29, queriesOnOtherBrands: 0, maxQueries: 30 }
  })
  mocks.createRun.mockImplementation(async () => {
    mocks.calls.push('createRun')
    return 'run_1'
  })
  mocks.runCollection.mockImplementation(async () => {
    mocks.calls.push('runCollection')
    return {
      answers: [answer],
      outcomes: [{ engineId: 'chatgpt' as const, ok: true, attempts: 1 }],
      completeness: { chatgpt: { attempted: 1, succeeded: 1 } },
      costMilliKrw: 1_200_000,
      durationMs: 1000,
    }
  })
  mocks.saveAnswers.mockImplementation(async () => {
    mocks.calls.push('saveAnswers')
    return ['ans_1']
  })
  mocks.aliasFn.mockResolvedValue([
    { canonical: '바디텍', aliases: ['bodytech'], ambiguous: false },
    { canonical: '경쟁사', aliases: [], ambiguous: false },
  ])
  mocks.runDetection.mockResolvedValue({
    detections: [
      {
        answerId: 'ans_1',
        subject: '바디텍',
        mentioned: true,
        position: 1,
        sentiment: 'positive',
        context: '바디텍이 좋습니다.',
        unresolved: false,
      },
    ],
    metrics: {},
    stage1Candidates: 2,
    stage1Passed: 1,
    stage1PassRate: 0.5,
    stage2Called: 1,
    unresolved: 0,
  })
  mocks.insertDetections.mockImplementation(async () => {
    mocks.calls.push('insertDetections')
  })
  mocks.finishRun.mockImplementation(async (args: { status: string }) => {
    mocks.calls.push(`finishRun:${args.status}`)
  })
  mocks.recordSerpUsage.mockImplementation(async () => {
    mocks.calls.push('recordSerpUsage')
  })
  mocks.buildAuditResult.mockReturnValue({ snapshot: true })
  mocks.saveRunResult.mockImplementation(async () => {
    mocks.calls.push('saveRunResult')
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.calls.length = 0
  setHappyPath()
})

describe('measureBrand — 정상 경로', () => {
  test('성공하면 succeeded로 닫고 스냅샷까지 저장한다', async () => {
    // ★ 이 테스트가 없으면 아래 두 테스트가 "그냥 항상 던지는 코드"에도
    //   통과할 수 있다 — 해피 패스가 실제로 끝까지 도는 것을 먼저 못 박는다.
    await expect(measureBrand(BRAND_ID)).resolves.toEqual({
      runId: 'run_1',
      status: 'succeeded',
    })
    expect(mocks.calls).toEqual([
      'createRun',
      'loadEditorQuota',
      'runCollection',
      'saveAnswers',
      'insertDetections',
      'finishRun:succeeded',
      'recordSerpUsage',
      'saveRunResult',
    ])
  })
})

describe('measureBrand — 회차 행은 검증보다 먼저 만든다 (C-1)', () => {
  test('계정 한도 초과로 검증이 던져도 회차는 이미 있고 failed로 닫힌다', async () => {
    // 다른 브랜드가 Business 한도 30개를 다 쓴 상태 — `validateRunStart`가 던진다.
    mocks.loadEditorQuota.mockImplementation(async () => {
      mocks.calls.push('loadEditorQuota')
      return { quota: 0, queriesOnOtherBrands: 30, maxQueries: 30 }
    })

    await expect(measureBrand(BRAND_ID)).rejects.toThrow(/한도/)

    // ★ 핵심: 검증이 던지기 **전에** 회차 행이 만들어져 있어야 한다.
    expect(mocks.createRun).toHaveBeenCalledTimes(1)
    expect(mocks.calls).toEqual(['createRun', 'loadEditorQuota', 'finishRun:failed'])
  })

  test('검증 실패 회차는 failed로 남는다 — 하루 상한이 이 행을 센다', async () => {
    mocks.loadEditorQuota.mockResolvedValue({
      quota: 0,
      queriesOnOtherBrands: 30,
      maxQueries: 30,
    })
    await expect(measureBrand(BRAND_ID)).rejects.toThrow()
    // ★ `selectDueBrand`가 세는 것이 바로 이 status다. 여기가 안 남으면
    //   실패 시도가 영원히 0이고, 같은 브랜드가 큐 앞에서 무한히 재시도되며
    //   뒤 브랜드 전부의 그 날 측정을 막는다 (호출마다 운영자 메일 한 통은 덤).
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ runId: 'run_1', status: 'failed' }),
    )
  })

  test('검증에서 막히면 돈은 한 푼도 쓰지 않는다', async () => {
    // 회차 행을 먼저 만드는 것은 **DB 행 한 줄**일 뿐이다. 이 순서 변경이
    // 유료 호출을 앞당기지 않는다는 것을 여기서 못 박는다.
    mocks.loadEditorQuota.mockResolvedValue({
      quota: 0,
      queriesOnOtherBrands: 30,
      maxQueries: 30,
    })
    await expect(measureBrand(BRAND_ID)).rejects.toThrow()
    expect(mocks.runCollection).not.toHaveBeenCalled()
    expect(mocks.aliasFn).not.toHaveBeenCalled()
    expect(mocks.runDetection).not.toHaveBeenCalled()
  })

  test('수집이 전부 실패하면 회차를 failed로 닫고 던진다', async () => {
    // 성공 전(`settled` 이전)의 실패는 예전대로 failed로 닫히고 밖으로 나가야
    // 한다 — 아래 (C-2)의 빗장이 너무 일찍 걸리면 이 테스트가 깨진다.
    mocks.runCollection.mockResolvedValue({
      answers: [],
      outcomes: [{ engineId: 'chatgpt' as const, ok: false, attempts: 2 }],
      completeness: { chatgpt: { attempted: 1, succeeded: 0 } },
      costMilliKrw: 300_000,
      durationMs: 500,
    })
    await expect(measureBrand(BRAND_ID)).rejects.toThrow(/수집이 전부 실패/)
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'failed' }),
    )
    expect(mocks.saveRunResult).not.toHaveBeenCalled()
  })
})

describe('measureBrand — 성공으로 닫힌 회차는 다시 열지 않는다 (C-2)', () => {
  test('스냅샷 저장이 실패해도 succeeded 그대로 두고 성공 결과를 돌려준다', async () => {
    // 가장 현실적인 경로다 — 파이프라인에서 가장 큰 jsonb 쓰기이고 stateless
    // neon-http 연결 위에서 돈다.
    mocks.saveRunResult.mockRejectedValue(new Error('neon: connection reset'))

    // ★ 예외가 밖으로 나가면 라우트가 이 회차를 실패로 취급해 운영자 메일을
    //   보내고, 다음 호출이 같은 브랜드를 다시 잰다.
    await expect(measureBrand(BRAND_ID)).resolves.toEqual({
      runId: 'run_1',
      status: 'succeeded',
    })
    // ★ finishRun은 **정확히 한 번**, succeeded로만. 두 번째 호출이 있으면
    //   completeness가 비고 metrics가 전부 0인 거짓 회차가 남는다.
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ runId: 'run_1', status: 'succeeded' }),
    )
    expect(mocks.calls).not.toContain('finishRun:failed')
    // 조용히 삼키지 않는다 — 스냅샷이 없는 회차는 운영자가 알아야 한다.
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'cron.measure.snapshot_save_failed',
      expect.objectContaining({ runId: 'run_1', brandId: BRAND_ID }),
    )
  })

  test('SerpApi 사용량 기록이 실패해도 같은 빗장이 걸린다', async () => {
    // 빗장(`settled`)은 `finishRun` 직후에 걸린다 — 그 뒤의 **모든** 쓰기가
    // 대상이다. saveRunResult 하나만 감싸면 이 경로가 다시 열린다.
    mocks.recordSerpUsage.mockRejectedValue(new Error('db timeout'))
    await expect(measureBrand(BRAND_ID)).resolves.toEqual({
      runId: 'run_1',
      status: 'succeeded',
    })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'succeeded' }),
    )
  })

  test('partial로 닫힌 회차도 다시 열지 않는다 — 그 상태도 오늘 몫을 끝낸 것이다', async () => {
    mocks.runCollection.mockResolvedValue({
      answers: [answer],
      outcomes: [
        { engineId: 'chatgpt' as const, ok: true, attempts: 1 },
        { engineId: 'chatgpt' as const, ok: false, attempts: 2 },
      ],
      completeness: { chatgpt: { attempted: 4, succeeded: 1 } },
      costMilliKrw: 800_000,
      durationMs: 900,
    })
    mocks.saveRunResult.mockRejectedValue(new Error('neon: connection reset'))
    await expect(measureBrand(BRAND_ID)).resolves.toEqual({ runId: 'run_1', status: 'partial' })
    expect(mocks.finishRun).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 'partial' }),
    )
  })
})
