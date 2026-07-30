import { describe, expect, it, vi } from 'vitest'
import { runDetection, type AnswerInput } from './pipeline'
import type { BrandProfile } from './types'
import type { JudgeFn } from '@/lib/judge/types'

const self: BrandProfile = { canonical: '아식스', aliases: ['ASICS'], ambiguous: false }
const competitors: BrandProfile[] = [
  { canonical: '나이키', aliases: ['Nike'], ambiguous: false },
]

function answer(id: string, queryId: string, engineId: string, text: string): AnswerInput {
  return { id, queryId, queryText: `질의 ${queryId}`, engineId, text }
}

const answers: AnswerInput[] = [
  answer('q1:chatgpt:0', 'q1', 'chatgpt', 'ASICS GEL-KAYANO를 가장 추천합니다. 그다음은 Nike.'),
  answer('q1:gemini:0', 'q1', 'gemini', '나이키 페가수스가 좋습니다. 아식스도 괜찮습니다.'),
  answer('q2:chatgpt:0', 'q2', 'chatgpt', 'Hoka와 Brooks를 추천합니다.'),
]

/** 매칭된 별칭이 앞쪽에 있으면 1위로 본다. 실제 판정기 흉내다. */
const judge: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: true,
      position: b.answerText.indexOf(b.matchedAlias) < 15 ? 1 : 2,
      sentiment: 'recommended' as const,
      context: '추천 목록에 포함',
    },
  }))

describe('runDetection — 조립', () => {
  it('판정과 지표를 한 번에 돌려준다', async () => {
    const r = await runDetection({ answers, self, competitors }, judge)

    // 답변 3개 × 주체 2개(self + 경쟁사 1)
    expect(r.detections).toHaveLength(6)
    expect(r.metrics.totalAnswers).toBe(3)
    // 아식스는 q1의 두 답변에 등장 → 2/3
    expect(r.metrics.citedRate.k).toBe(2)
    expect(r.metrics.citedRate.n).toBe(3)
  })

  it('판정 결과가 입력 순서를 유지한다', async () => {
    // ★ 순서가 어긋나면 호출자가 answerId로 되붙일 때는 괜찮지만, 순서에
    //   기대는 코드가 하나라도 있으면 조용히 뒤바뀐다.
    const r = await runDetection({ answers, self, competitors }, judge)
    expect(r.detections.map((d) => `${d.answerId}/${d.subject}`)).toEqual([
      'q1:chatgpt:0/self',
      'q1:chatgpt:0/competitor:나이키',
      'q1:gemini:0/self',
      'q1:gemini:0/competitor:나이키',
      'q2:chatgpt:0/self',
      'q2:chatgpt:0/competitor:나이키',
    ])
  })

  it('경쟁사를 Share of Voice 분모에 넣는다', async () => {
    const r = await runDetection({ answers, self, competitors }, judge)
    expect(r.metrics.competitorRates['competitor:나이키']?.k).toBe(2)
    expect(r.metrics.shareOfVoice.n).toBeGreaterThan(0)
  })

  it('경쟁사가 없으면 Share of Voice를 n=0으로 남긴다', async () => {
    // ★ "우리만 등록했으니 점유율 100%"는 거짓말이다. 화면이 숨기려면
    //   n을 볼 수 있어야 한다.
    const r = await runDetection({ answers, self, competitors: [] }, judge)
    expect(r.metrics.shareOfVoice.n).toBe(0)
    expect(r.detections).toHaveLength(3)
  })

  it('엔진별로 갈린다', async () => {
    const r = await runDetection({ answers, self, competitors }, judge)
    expect(r.metrics.byEngine.chatgpt?.n).toBe(2)
    expect(r.metrics.byEngine.gemini?.n).toBe(1)
  })

  it('아무것도 안 나오는 질의를 짚어낸다', async () => {
    const r = await runDetection({ answers, self, competitors }, judge)
    expect(r.metrics.byQuery[0]?.queryId).toBe('q2')
    expect(r.metrics.byQuery[0]?.interval.k).toBe(0)
  })

  it('답변이 없으면 판정기를 부르지 않는다', async () => {
    const spy = vi.fn(judge)
    const r = await runDetection({ answers: [], self, competitors }, spy)
    expect(spy).not.toHaveBeenCalled()
    expect(r.detections).toEqual([])
    expect(r.metrics.totalAnswers).toBe(0)
  })

  it('입력을 변형하지 않는다', async () => {
    const before = JSON.stringify({ answers, self, competitors })
    await runDetection({ answers, self, competitors }, judge)
    expect(JSON.stringify({ answers, self, competitors })).toBe(before)
  })
})

describe('runDetection — 관측값', () => {
  it('1차 통과율을 돌려준다', async () => {
    const r = await runDetection({ answers, self, competitors }, judge)
    // 후보 6 (답변 3 × 주체 2), 통과: q1 두 답변의 self·경쟁사 4건
    expect(r.stage1Candidates).toBe(6)
    expect(r.stage1Passed).toBe(4)
    expect(r.stage1PassRate).toBeCloseTo(4 / 6, 6)
    expect(r.stage2Called).toBe(4)
  })

  it('후보가 없으면 통과율은 null이다 (0이 아니다)', async () => {
    // ★ 0을 돌려주면 "1차가 전부 탈락시켰다"로 읽힌다. 후보 자체가 없는 것과
    //   전부 탈락한 것은 다른 사건이고, 앞은 답변이 없다는 뜻이다.
    const r = await runDetection({ answers: [], self, competitors }, judge)
    expect(r.stage1PassRate).toBeNull()
  })

  it('판정 원가를 계산하지 않는다 (판정기를 소유한 쪽의 몫이다)', async () => {
    // ★ JudgeFn은 사용량을 돌려주지 않는다. 토큰은 createClaudeJudge의
    //   onUsage로 나가고 그 콜백은 호출자가 붙인다. 여기서 원가를 흉내내면
    //   두 곳에서 따로 계산해 언젠가 갈린다.
    const r = await runDetection({ answers, self, competitors }, judge)
    expect(r).not.toHaveProperty('judgeCostMilliKrw')
  })
})

describe('runDetection — 판정 실패', () => {
  const failing: JudgeFn = async () => {
    throw new Error('판정 API 실패')
  }

  it('판정이 실패해도 던지지 않고 미판정으로 센다', async () => {
    // ★ 2차 LLM 하나가 실패했다고 진단 전체를 버리면 안 된다.
    //   이미 돈을 쓴 수집 데이터다.
    const r = await runDetection({ answers, self, competitors }, failing)
    expect(r.unresolved).toBe(4)
    expect(r.detections).toHaveLength(6)
    expect(r.metrics.totalAnswers).toBe(3)
  })

  it('미판정은 1차 결과를 따라 언급으로 둔다', async () => {
    // 재현율 우선 — 놓치는 것이 잘못 잡는 것보다 나쁘다. 원본이 남아 있으므로
    // 나중에 재판정할 수 있다.
    const r = await runDetection({ answers, self, competitors }, failing)
    const unresolved = r.detections.filter((d) => d.unresolved)
    expect(unresolved).toHaveLength(4)
    expect(unresolved.every((d) => d.mentioned)).toBe(true)
    expect(unresolved.every((d) => d.sentiment === null)).toBe(true)
  })

  it('배치 실패를 알린다', async () => {
    const onBatchError = vi.fn()
    await runDetection({ answers, self, competitors }, failing, { onBatchError })
    expect(onBatchError).toHaveBeenCalled()
  })

  it('일부만 실패해도 나머지 판정은 살린다', async () => {
    // 배치 하나가 죽어도 다른 배치의 결과는 남아야 한다.
    let batch = 0
    const flaky: JudgeFn = async (items) => {
      if (++batch === 1) throw new Error('첫 배치 실패')
      return items.map((b) => ({
        id: b.id,
        verdict: {
          isBrandReference: true,
          position: 1,
          sentiment: 'neutral' as const,
          context: '언급',
        },
      }))
    }
    const r = await runDetection({ answers, self, competitors }, flaky, { batchSize: 2 })
    expect(r.unresolved).toBe(2)
    expect(r.detections.filter((d) => !d.unresolved && d.mentioned)).toHaveLength(2)
  })
})

describe('runDetection — 판정 대상', () => {
  it('미언급으로 뒤집히면 순위·감성을 지운다', async () => {
    // "언급 안 됨 · 1위 · 추천"이 리포트에 나가면 안 된다.
    const rejecting: JudgeFn = async (batch) =>
      batch.map((b) => ({
        id: b.id,
        verdict: {
          isBrandReference: false,
          position: 1,
          sentiment: 'recommended' as const,
          context: '동명이인',
        },
      }))
    const r = await runDetection({ answers, self, competitors }, rejecting)
    for (const d of r.detections) {
      expect(d.mentioned).toBe(false)
      expect(d.position).toBeNull()
      expect(d.sentiment).toBeNull()
    }
    expect(r.metrics.citedRate.k).toBe(0)
  })

  it('별칭으로만 등장해도 잡는다', async () => {
    // ★ ChatGPT는 브랜드명을 영문·로마자로만 쓴다(2026-07-30 실측).
    //   별칭이 없으면 이 답변에서 언급률이 0%가 된다.
    const romanized = [answer('a1', 'q1', 'chatgpt', 'Pyunkang Yul Essence Toner를 추천합니다.')]
    const brand: BrandProfile = {
      canonical: '편강율',
      aliases: ['Pyunkang Yul'],
      ambiguous: false,
    }
    const r = await runDetection({ answers: romanized, self: brand, competitors: [] }, judge)
    expect(r.metrics.citedRate.k).toBe(1)
  })

  it('별칭이 없으면 로마자 답변을 놓친다 (별칭 생성이 전제 조건인 이유)', async () => {
    const romanized = [answer('a1', 'q1', 'chatgpt', 'Pyunkang Yul Essence Toner를 추천합니다.')]
    const brand: BrandProfile = { canonical: '편강율', aliases: [], ambiguous: false }
    const r = await runDetection({ answers: romanized, self: brand, competitors: [] }, judge)
    expect(r.metrics.citedRate.k).toBe(0)
    expect(r.stage1Passed).toBe(0)
  })
})
