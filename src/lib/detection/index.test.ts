import { describe, expect, it, vi } from 'vitest'
import { DETECTOR_VERSION, detectMentions } from '@/lib/detection'
import type { DetectMentionsInput } from '@/lib/detection'
import type { JudgeFn } from '@/lib/judge/types'

const alwaysYes: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: true,
      position: 1,
      sentiment: 'recommended' as const,
      context: '추천됨',
    },
  }))

const alwaysNo: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: false,
      position: null,
      sentiment: 'neutral' as const,
      context: '동음이의어',
    },
  }))

function input(overrides: Partial<DetectMentionsInput> = {}): DetectMentionsInput {
  return {
    answerId: 'a1',
    answerText: '무신사에서 파는 옷을 추천합니다.',
    self: { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false },
    competitors: [],
    ...overrides,
  }
}

describe('DETECTOR_VERSION', () => {
  it('양의 정수다', () => {
    expect(Number.isInteger(DETECTOR_VERSION)).toBe(true)
    expect(DETECTOR_VERSION).toBeGreaterThan(0)
  })
})

describe('detectMentions', () => {
  it('1차에서 안 걸리면 미언급으로 판정하고 LLM을 부르지 않는다', async () => {
    const spy = vi.fn(alwaysYes)
    const results = await detectMentions([input({ answerText: '나이키를 추천합니다.' })], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(results[0]?.mentioned).toBe(false)
    expect(results[0]?.subject).toBe('self')
  })

  it('명백한 매칭은 2차를 건너뛴다 (원가 절감)', async () => {
    const spy = vi.fn(alwaysYes)
    const results = await detectMentions([input()], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(results[0]?.mentioned).toBe(true)
  })

  it('ambiguous 브랜드는 2차를 거치고 결과를 따른다', async () => {
    const results = await detectMentions(
      [
        input({
          answerText: '오후에 소나기가 내렸습니다.',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      alwaysNo,
    )
    expect(results[0]?.mentioned).toBe(false)
    expect(results[0]?.context).toBe('동음이의어')
  })

  it('2차가 미언급으로 뒤집으면 순위와 감성을 지운다', async () => {
    // "언급 안 됨 · 1위 · 추천"이 리포트에 나가면 안 된다.
    const contradictory: JudgeFn = async (batch) =>
      batch.map((b) => ({
        id: b.id,
        verdict: {
          isBrandReference: false,
          position: 1,
          sentiment: 'recommended' as const,
          context: '동음이의어',
        },
      }))
    const results = await detectMentions(
      [
        input({
          answerText: '오후에 소나기가 내렸습니다.',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      contradictory,
    )
    expect(results[0]?.mentioned).toBe(false)
    expect(results[0]?.position).toBeNull()
    expect(results[0]?.sentiment).toBeNull()
  })

  it('경쟁사가 함께 있으면 순서 판정을 위해 2차를 거친다', async () => {
    const spy = vi.fn(alwaysYes)
    await detectMentions(
      [
        input({
          answerText: '무신사와 29CM를 추천합니다.',
          competitors: [{ canonical: '29CM', aliases: [], ambiguous: false }],
        }),
      ],
      spy,
    )
    expect(spy).toHaveBeenCalled()
  })

  it('경쟁사가 등록됐어도 답변에 없으면 2차를 부르지 않는다', async () => {
    // otherBrandsPresent는 "등록됨"이 아니라 "이 답변에 실제로 나옴"이어야 한다.
    const spy = vi.fn(alwaysYes)
    await detectMentions(
      [
        input({
          answerText: '무신사를 추천합니다.',
          competitors: [{ canonical: '29CM', aliases: [], ambiguous: false }],
        }),
      ],
      spy,
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('우리 브랜드와 경쟁사 각각에 대해 결과를 낸다', async () => {
    const results = await detectMentions(
      [
        input({
          answerText: '무신사와 29CM를 추천합니다.',
          competitors: [
            { canonical: '29CM', aliases: [], ambiguous: false },
            { canonical: '지그재그', aliases: [], ambiguous: false },
          ],
        }),
      ],
      alwaysYes,
    )
    const subjects = results.map((r) => r.subject).sort()
    expect(subjects).toEqual(['competitor:29CM', 'competitor:지그재그', 'self'])
  })

  it('결과 순서가 입력 순서를 따른다 (2차를 거친 항목이 뒤로 밀리지 않는다)', async () => {
    // 호출자가 zip으로 매핑할 수 있어야 한다. 2차를 거친 주체만 뒤로 모이면
    // "self가 2번째 결과"가 되어 조용히 어긋난다.
    const results = await detectMentions(
      [
        input({
          answerText: '무신사와 29CM를 추천합니다.',
          competitors: [{ canonical: '29CM', aliases: [], ambiguous: false }],
        }),
        input({ answerId: 'a2', answerText: '나이키만 나옵니다.' }),
      ],
      alwaysYes,
    )
    expect(results.map((r) => `${r.answerId}/${r.subject}`)).toEqual([
      'a1/self',
      'a1/competitor:29CM',
      'a2/self',
    ])
  })

  it('결과에 answerId가 담겨 호출자가 매핑할 수 있다', async () => {
    const results = await detectMentions([input({ answerId: 'xyz' })], alwaysYes)
    expect(results[0]?.answerId).toBe('xyz')
  })

  it('2차 판정이 실패하면 unresolved로 남기고 mentioned는 1차 결과를 따른다', async () => {
    const broken: JudgeFn = async () => {
      throw new Error('판정기 장애')
    }
    const results = await detectMentions(
      [
        input({
          answerText: '오후에 소나기가 내렸습니다.',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      broken,
    )
    expect(results[0]?.unresolved).toBe(true)
    expect(results[0]?.mentioned).toBe(true) // 1차 결과 — 나중에 재판정한다
  })

  it('1차에서 걸러진 항목은 unresolved가 아니다', async () => {
    const results = await detectMentions([input({ answerText: '나이키를 추천합니다.' })], alwaysYes)
    expect(results[0]?.unresolved).toBe(false)
  })

  it('여러 답변을 한 번의 배치로 묶는다', async () => {
    const spy = vi.fn(alwaysYes)
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({
        answerId: `a${i}`,
        answerText: '소나기 브랜드',
        self: { canonical: '소나기', aliases: [], ambiguous: true },
      }),
    )
    await detectMentions(inputs, spy, { batchSize: 100 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toHaveLength(5)
  })

  it('같은 answerId가 두 번 와도 판정이 섞이지 않는다', async () => {
    // 키가 `answerId:subject`뿐이면 두 입력이 같은 키를 공유해 한쪽 판정이
    // 다른 쪽에 조용히 복사된다.
    const byText: JudgeFn = async (batch) =>
      batch.map((b) => ({
        id: b.id,
        verdict: {
          isBrandReference: b.answerText.includes('브랜드'),
          position: 1,
          sentiment: 'neutral' as const,
          context: b.answerText,
        },
      }))
    const self = { canonical: '소나기', aliases: [], ambiguous: true }
    const results = await detectMentions(
      [
        input({ answerId: 'dup', answerText: '소나기 브랜드', self }),
        input({ answerId: 'dup', answerText: '오후에 소나기가 내렸다', self }),
      ],
      byText,
    )
    expect(results[0]?.mentioned).toBe(true)
    expect(results[1]?.mentioned).toBe(false)
  })

  it('1차 통과율을 보고한다 (원가를 좌우하는 수치)', async () => {
    const onStats = vi.fn()
    await detectMentions(
      [
        input({ answerText: '나이키만 나옵니다.' }),
        input({ answerId: 'a2', answerText: '무신사가 나옵니다.' }),
      ],
      alwaysYes,
      { onStats },
    )
    expect(onStats).toHaveBeenCalledWith(
      expect.objectContaining({ stage1Candidates: 2, stage1Passed: 1 }),
    )
  })

  it('2차 호출 수와 미판정 수도 보고한다', async () => {
    const onStats = vi.fn()
    const broken: JudgeFn = async () => {
      throw new Error('장애')
    }
    await detectMentions(
      [
        input({
          answerText: '소나기 브랜드',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      broken,
      { onStats },
    )
    expect(onStats).toHaveBeenCalledWith({
      stage1Candidates: 1,
      stage1Passed: 1,
      stage2Called: 1,
      unresolved: 1,
    })
  })

  it('입력이 없으면 빈 결과를 내고 judge를 부르지 않는다', async () => {
    const spy = vi.fn(alwaysYes)
    const results = await detectMentions([], spy)
    expect(results).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('배치 실패 원인을 onBatchError로 넘긴다', async () => {
    const onBatchError = vi.fn()
    const boom = new Error('장애')
    const broken: JudgeFn = async () => {
      throw boom
    }
    await detectMentions(
      [
        input({
          answerText: '소나기 브랜드',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      broken,
      { onBatchError },
    )
    expect(onBatchError).toHaveBeenCalledWith(boom, expect.arrayContaining([expect.any(String)]))
  })
})
