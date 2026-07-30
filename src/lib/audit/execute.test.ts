import { describe, expect, it, vi } from 'vitest'
import { answerId, executeAudit } from '@/lib/audit/execute'
import type { FanoutItem } from '@/lib/collection/fanout'
import type { CollectedAnswer } from '@/lib/collection/run'
import { SELF_SUBJECT, competitorSubject } from '@/lib/detection/subject'
import { PLANS } from '@/lib/plans'

const audit = {
  id: 'aud_1',
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
}

/** 무료 플랜 팬아웃 크기 = 질의 3개 × 엔진 2개 × 샘플 1개 */
const EXPECTED_CALLS = PLANS.free.maxQueries * PLANS.free.engines.length * PLANS.free.samples.llm

/**
 * ★ **팬아웃 항목을 그대로 되돌려줘야 한다.** 계획서 픽스처는 `engineId`를
 *   `'gemini'`로 고정하고 `queryId`를 `queryText`로 바꿨는데, 그러면 chatgpt
 *   항목과 gemini 항목의 `answerId`가 같아진다. 그 상태에서 `computeMetrics`는
 *   분모를 `answers.length`(6)로 잡고 분자는 answerId 집합(3)으로 세므로
 *   **언급률이 정확히 절반으로 나온다.** 실제 엔진 어댑터도 같은 계약을 지킨다.
 */
function fakeAnswer(item: FanoutItem, text: string): CollectedAnswer {
  return {
    queryId: item.queryId,
    queryText: item.queryText,
    engineId: item.engineId,
    sampleIndex: item.sampleIndex,
    text,
    citations: [{ url: 'https://namu.wiki/w/x', title: '나무위키' }],
    raw: {},
    usage: { calls: 1, searches: 2, tokensIn: 10, tokensOut: 900 },
    costMilliKrw: 42_400,
  }
}

function makeDeps() {
  return {
    runOne: vi.fn(async (item: FanoutItem) =>
      fakeAnswer(item, `${item.queryText}에는 무신사가 좋습니다. 29CM도 있습니다.`),
    ),
    judge: vi.fn(async (batch: readonly { id: string }[]) =>
      batch.map((r) => ({
        id: r.id,
        verdict: {
          isBrandReference: true,
          position: 1,
          sentiment: 'recommended' as const,
          context: '첫 번째로 언급',
        },
      })),
    ),
    // 별칭 생성기도 주입한다. 실제 호출은 Task 6-2의 실측에서 확인했다.
    // category 인자를 받아 둔다 — executeAudit이 그것을 넘기는지 단언하려면
    // mock의 시그니처에 자리가 있어야 한다.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    aliasFn: vi.fn(async (brands: readonly string[], category: string) =>
      brands.map((canonical) => ({ canonical, aliases: [`${canonical}-EN`], ambiguous: false })),
    ),
    // 재시도 대기를 실제로 기다리지 않는다.
    sleep: vi.fn(async () => {}),
    now: () => new Date('2026-07-30T02:00:00.000Z'),
  }
}

describe('executeAudit', () => {
  it('무료 플랜 설정대로 3질의 × 2엔진 × 1샘플을 수집한다', async () => {
    // ★ 이 수가 곧 원가다. 설정이 아니라 우연으로 늘어나면 예산이 조용히 샌다.
    //   계획서는 3회를 기대했지만 `buildFanout`은 엔진마다 팬아웃하므로 6회다
    //   (계획서 Step 9의 설명 자체가 "3질의 × 2엔진 × 1샘플 = 6회"였다).
    const deps = makeDeps()
    await executeAudit(audit, deps)
    expect(EXPECTED_CALLS).toBe(6)
    expect(deps.runOne).toHaveBeenCalledTimes(EXPECTED_CALLS)
  })

  it('두 엔진 모두 부른다', async () => {
    // ChatGPT만, 또는 Gemini만 돌면 엔진 비교가 통째로 빠진다.
    const deps = makeDeps()
    await executeAudit(audit, deps)
    const engines = new Set(deps.runOne.mock.calls.map(([item]) => item.engineId))
    expect([...engines].sort()).toEqual([...PLANS.free.engines].sort())
  })

  it('질의에 브랜드명을 넣지 않는다', async () => {
    const deps = makeDeps()
    await executeAudit(audit, deps)
    for (const [item] of deps.runOne.mock.calls) {
      expect(item.queryText).not.toContain('무신사')
      expect(item.queryText).not.toContain('29CM')
    }
  })

  it('경쟁사를 판정 대상에 넣는다', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.competitors).toEqual(['29CM'])
    expect(result.ranking.some((r) => r.name === '29CM')).toBe(true)
  })

  it('판정에 subject 규약을 쓴다', async () => {
    // ★ 순위표의 언급 수가 실제로 세어지려면 판정의 subject가 규약을 따라야 한다.
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.ranking.find((r) => r.isSelf)?.mentions).toBeGreaterThan(0)
    expect(result.ranking.find((r) => r.name === '29CM')?.mentions).toBeGreaterThan(0)
  })

  it('측정 시각과 엔진 구성을 리포트에 박제한다', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.measuredAt).toBe('2026-07-30T02:00:00.000Z')
    expect(result.engines).toEqual([...PLANS.free.engines])
  })

  it('답변 식별자가 팬아웃 항목마다 유일하다', async () => {
    // ★ 겹치면 언급률이 조용히 절반으로 나온다 (fakeAnswer 주석 참고).
    const deps = makeDeps()
    await executeAudit(audit, deps)
    const ids = deps.runOne.mock.calls.map(([item]) => answerId(item))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('엔진이 답변의 출처를 바꿔치기하면 던진다', async () => {
    // ★ 어댑터가 engineId나 queryId를 잘못 채우면 answerId가 겹쳐 분모와 분자가
    //   어긋난다. 리포트는 정상처럼 보이고 숫자만 틀린다 — 조용한 실패다.
    const deps = makeDeps()
    const broken = {
      ...deps,
      runOne: vi.fn(async (item: FanoutItem) =>
        fakeAnswer({ ...item, engineId: 'gemini' }, '무신사가 좋습니다.'),
      ),
    }
    await expect(executeAudit(audit, broken)).rejects.toThrow(/식별자/)
  })

  it('엔진이 하나 실패해도 나머지로 리포트를 만든다', async () => {
    let n = 0
    const deps = makeDeps()
    const flaky = {
      ...deps,
      runOne: vi.fn(async (item: FanoutItem) => {
        if (++n === 1) throw new Error('엔진 실패')
        return fakeAnswer(item, '무신사가 좋습니다.')
      }),
    }
    const result = await executeAudit(audit, flaky)
    expect(result.totalAnswers).toBeGreaterThan(0)
  })

  it('전부 실패하면 던진다 (빈 리포트를 보내지 않는다)', async () => {
    // ★ 답변 0건으로 만든 리포트는 "언급 0%"처럼 보인다. 측정 실패를 측정
    //   결과로 배송하면 안 된다.
    const deps = makeDeps()
    const dead = {
      ...deps,
      runOne: vi.fn(async () => {
        throw new Error('전부 실패')
      }),
    }
    await expect(executeAudit(audit, dead)).rejects.toThrow(/수집/)
  })

  it('2차 판정이 실패해도 리포트를 만들고 미판정 수를 남긴다', async () => {
    const deps = makeDeps()
    const noJudge = {
      ...deps,
      judge: vi.fn(async () => {
        throw new Error('판정 실패')
      }),
    }
    const result = await executeAudit(audit, noJudge)
    expect(result.unresolved).toBeGreaterThan(0)
  })

  it('자기 브랜드와 경쟁사를 한 번에 넘겨 별칭을 만든다', async () => {
    // ★ 경쟁사 별칭이 없으면 경쟁사가 과소 계상되고 Share of Voice가
    //   우리에게 유리한 쪽으로 틀린다. 호출은 1회여야 한다 — 브랜드마다
    //   부르면 원가가 4배가 되는데 얻는 게 없다.
    const deps = makeDeps()
    await executeAudit(audit, deps)
    expect(deps.aliasFn).toHaveBeenCalledTimes(1)
    expect(deps.aliasFn.mock.calls[0]?.[0]).toEqual(['무신사', '29CM'])
    expect(deps.aliasFn.mock.calls[0]?.[1]).toBe('패션')
  })

  it('생성된 별칭을 리포트에 박제한다 (측정 조건)', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.aliases).toEqual(['무신사-EN'])
  })

  it('경쟁사 별칭도 판정에 실제로 쓴다', async () => {
    // 별칭을 생성만 하고 프로파일에 넣지 않으면 경쟁사가 과소 계상된다.
    const deps = makeDeps()
    const seen: string[] = []
    const tracked = {
      ...deps,
      runOne: vi.fn(async (item: FanoutItem) => fakeAnswer(item, '29CM-EN에서 파는 옷')),
      judge: vi.fn(async (batch: readonly { id: string; brand: { canonical: string } }[]) => {
        for (const b of batch) seen.push(b.brand.canonical)
        return batch.map((r) => ({
          id: r.id,
          verdict: {
            isBrandReference: true,
            position: 1,
            sentiment: 'neutral' as const,
            context: 'x',
          },
        }))
      }),
    }
    await executeAudit(audit, tracked)
    // '29CM-EN'은 경쟁사 별칭이다. 1차 매칭이 걸렸다면 2차에 29CM으로 올라온다.
    expect(seen).toContain('29CM')
  })

  it('별칭은 수집 뒤에 만든다', async () => {
    // ★ 순서가 뒤집히면 수집이 전부 실패했을 때 별칭 비용을 이미 쓴 뒤에 던진다.
    const order: string[] = []
    const deps = makeDeps()
    const tracked = {
      ...deps,
      runOne: vi.fn(async (item: FanoutItem) => {
        order.push('collect')
        return fakeAnswer(item, '무신사가 좋습니다.')
      }),
      aliasFn: vi.fn(async (brands: readonly string[]) => {
        order.push('alias')
        return brands.map((canonical) => ({ canonical, aliases: [], ambiguous: false }))
      }),
    }
    await executeAudit(audit, tracked)
    expect(order.indexOf('alias')).toBeGreaterThan(order.lastIndexOf('collect'))
  })

  it('수집이 전부 실패하면 별칭을 만들지 않는다', async () => {
    const deps = makeDeps()
    const dead = {
      ...deps,
      runOne: vi.fn(async () => {
        throw new Error('전부 실패')
      }),
      aliasFn: vi.fn(async () => []),
    }
    await expect(executeAudit(audit, dead)).rejects.toThrow(/수집/)
    expect(dead.aliasFn).not.toHaveBeenCalled()
  })

  it('별칭 생성이 자기 브랜드를 빠뜨리면 던진다', async () => {
    const deps = makeDeps()
    const empty = { ...deps, aliasFn: vi.fn(async () => []) }
    await expect(executeAudit(audit, empty)).rejects.toThrow(/별칭/)
  })

  it('인용 출처를 리포트에 담는다', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.sources[0]?.domain).toBe('namu.wiki')
    expect(result.sourceSummary.answersWithCitations).toBe(EXPECTED_CALLS)
  })

  it('selfDomains를 주지 않으면 소유 판정을 하지 않는다', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    expect(result.hasSelfDomains).toBe(false)
  })

  it('selfDomains를 주면 우리 사이트 인용을 센다', async () => {
    const deps = makeDeps()
    const result = await executeAudit({ ...audit, selfDomains: ['namu.wiki'] }, deps)
    expect(result.hasSelfDomains).toBe(true)
    expect(result.sourceSummary.selfAnswers).toBe(EXPECTED_CALLS)
  })

  it('selfDomains가 빈 배열이면 모른다로 취급한다', async () => {
    // 신청 폼에서 사이트 주소를 비워 두면 `[]`가 넘어온다.
    const deps = makeDeps()
    const result = await executeAudit({ ...audit, selfDomains: [] }, deps)
    expect(result.hasSelfDomains).toBe(false)
  })

  it('경쟁사가 없으면 Share of Voice가 측정 없음이다', async () => {
    const deps = makeDeps()
    const result = await executeAudit({ ...audit, competitors: [] }, deps)
    expect(result.shareOfVoice.n).toBe(0)
    expect(deps.aliasFn.mock.calls[0]?.[0]).toEqual(['무신사'])
  })

  it('실행 통계를 알려준다 (원가·소요시간·완전성)', async () => {
    // ★ 진단 1건이 250원쯤 든다. 운영자가 그 숫자를 못 보면 무료 진단을 계속
    //   제공할지 판단할 근거가 없다.
    const deps = makeDeps()
    const stats: { costMilliKrw: number; answers: number; attempted: number }[] = []
    await executeAudit(audit, { ...deps, onStats: (s) => stats.push(s) })
    expect(stats).toHaveLength(1)
    expect(stats[0]?.costMilliKrw).toBe(42_400 * EXPECTED_CALLS)
    expect(stats[0]?.answers).toBe(EXPECTED_CALLS)
    expect(stats[0]?.attempted).toBe(EXPECTED_CALLS)
  })

  it('판정 배치 실패를 알려준다', async () => {
    // unresolved만 세면 운영자는 원인을 모른다.
    const deps = makeDeps()
    const errors: unknown[] = []
    await executeAudit(audit, {
      ...deps,
      judge: vi.fn(async () => {
        throw new Error('판정 실패')
      }),
      onJudgeError: (e) => errors.push(e),
    })
    expect(errors.length).toBeGreaterThan(0)
  })

  it('subject 규약이 리포트 밖으로 새지 않는다', async () => {
    const deps = makeDeps()
    const result = await executeAudit(audit, deps)
    const json = JSON.stringify(result)
    expect(json).not.toContain(competitorSubject('29CM'))
    expect(json).not.toContain(`"${SELF_SUBJECT}"`)
  })
})

describe('answerId', () => {
  it('질의·엔진·샘플의 조합이다', () => {
    expect(answerId({ queryId: 'q1', engineId: 'chatgpt', sampleIndex: 0 })).toBe('q1:chatgpt:0')
  })

  it('엔진이 다르면 다르다', () => {
    const base = { queryId: 'q1', sampleIndex: 0 } as const
    expect(answerId({ ...base, engineId: 'chatgpt' })).not.toBe(
      answerId({ ...base, engineId: 'gemini' }),
    )
  })

  it('샘플 인덱스가 다르면 다르다', () => {
    const base = { queryId: 'q1', engineId: 'gemini' } as const
    expect(answerId({ ...base, sampleIndex: 0 })).not.toBe(answerId({ ...base, sampleIndex: 1 }))
  })
})
