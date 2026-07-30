import { describe, expect, it } from 'vitest'
import { DETECTOR_VERSION, detectMentions } from '@/lib/detection'
import type { JudgeFn } from '@/lib/judge/types'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'
import { aggregateSources, summarizeSources } from '@/lib/stats/sources'

/**
 * 2단계가 실제로 동작하는 소프트웨어인지 증명한다.
 *
 * 답변 → 1차 매칭 → 2차 판정 → 지표 집계 → 인용 출처까지 한 번에 흐른다.
 * 엔진과 판정기는 주입한다 — 이 테스트는 CI에서 돌아야 하고 돈이 나가면 안 된다.
 * 실제 API로 도는 검증은 `pnpm measure`와 스모크 테스트의 몫이다.
 */

const judge: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: true,
      position: b.answerText.indexOf(b.matchedAlias) < 20 ? 1 : 3,
      sentiment: 'recommended' as const,
      context: '추천됨',
    },
  }))

const rawAnswers = [
  {
    id: 'a1',
    queryId: 'q1',
    engineId: 'chatgpt',
    text: '아식스 젤카야노를 가장 추천합니다. 그다음은 나이키.',
    citations: [{ url: 'https://runningwikii.com/a' }, { url: 'https://namu.wiki/x' }],
  },
  {
    id: 'a2',
    queryId: 'q1',
    engineId: 'chatgpt',
    text: '나이키 페가수스가 좋습니다. 아식스도 괜찮습니다.',
    citations: [{ url: 'https://runningwikii.com/b' }],
  },
  {
    id: 'a3',
    queryId: 'q1',
    engineId: 'gemini',
    text: '뉴발란스 880을 추천합니다.',
    citations: [{ url: 'https://asics.com/kr/shoes' }],
  },
  {
    id: 'a4',
    queryId: 'q2',
    engineId: 'chatgpt',
    text: '호카와 브룩스를 추천합니다.',
    citations: [],
  },
]

const self = { canonical: '아식스', aliases: ['ASICS', '젤카야노'], ambiguous: false }
const competitors = [{ canonical: '나이키', aliases: ['NIKE'], ambiguous: false }]

async function runPipeline() {
  const detections = await detectMentions(
    rawAnswers.map((a) => ({
      answerId: a.id,
      answerText: a.text,
      self,
      competitors,
    })),
    judge,
  )

  const answerRecords: AnswerRecord[] = rawAnswers.map((a) => ({
    id: a.id,
    queryId: a.queryId,
    queryText: `질의 ${a.queryId}`,
    engineId: a.engineId,
  }))

  const detectionRecords: DetectionRecord[] = detections.map((d) => {
    const answer = rawAnswers.find((a) => a.id === d.answerId)!
    return {
      answerId: d.answerId,
      queryId: answer.queryId,
      engineId: answer.engineId,
      subject: d.subject,
      mentioned: d.mentioned,
      position: d.position,
    }
  })

  const metrics = computeMetrics(answerRecords, detectionRecords, {
    self: 'self',
    competitors: ['competitor:나이키'],
  })

  return { detections, metrics }
}

describe('엔진 → 판정 → 집계 파이프라인', () => {
  it('저장된 답변으로 지표를 끝까지 계산한다', async () => {
    const { metrics } = await runPipeline()

    // 아식스는 a1, a2에 언급됨 → 2/4
    expect(metrics.citedRate.k).toBe(2)
    expect(metrics.citedRate.n).toBe(4)
    expect(metrics.citedRate.point).toBeCloseTo(0.5, 6)

    // 신뢰구간이 존재하고 점추정을 감싼다
    expect(metrics.citedRate.lower).toBeLessThan(metrics.citedRate.point)
    expect(metrics.citedRate.upper).toBeGreaterThan(metrics.citedRate.point)
  })

  it('아무것도 안 나오는 질의를 짚어낸다 (= 지금 조치할 것)', async () => {
    const { metrics } = await runPipeline()
    const zeroQuery = metrics.byQuery.find((q) => q.interval.k === 0)
    expect(zeroQuery?.queryId).toBe('q2')
  })

  it('엔진별로 갈린다', async () => {
    const { metrics } = await runPipeline()
    expect(metrics.byEngine.chatgpt?.n).toBe(3)
    expect(metrics.byEngine.gemini?.n).toBe(1)
  })

  it('경쟁사도 함께 집계된다', async () => {
    const { metrics } = await runPipeline()
    // 나이키는 a1, a2에 등장
    expect(metrics.competitorRates['competitor:나이키']?.k).toBe(2)
    // SoV 분모는 우리 + 등록 경쟁사 언급 수
    expect(metrics.shareOfVoice.n).toBeGreaterThan(0)
  })

  it('판정 결과가 answerId로 원본 답변에 되붙는다', async () => {
    // 순서에 기대면 2차를 거친 항목이 뒤로 밀려 조용히 어긋난다.
    const { detections } = await runPipeline()
    const ids = new Set(rawAnswers.map((a) => a.id))
    for (const d of detections) expect(ids.has(d.answerId)).toBe(true)
    // 답변 4개 × 주체 2개(self + 경쟁사 1)
    expect(detections).toHaveLength(8)
  })

  it('인용 출처가 도메인별로 집계된다', async () => {
    const answers = rawAnswers.map((a) => ({
      answerId: a.id,
      citations: a.citations.map((c) => ({ ...c, title: c.url })),
    }))
    const stats = aggregateSources(answers, {
      selfDomains: ['asics.com'],
      competitorDomains: ['nike.com'],
    })

    // runningwikii.com이 a1·a2 둘 다에 걸렸다 → 최다 출처
    expect(stats[0]).toMatchObject({ domain: 'runningwikii.com', answers: 2, owner: 'third-party' })
    // 분모는 인용 0건인 a4까지 포함한 4다
    expect(stats[0]?.share.n).toBe(4)

    const summary = summarizeSources(answers, stats)
    expect(summary.totalAnswers).toBe(4)
    expect(summary.answersWithCitations).toBe(3)
    // 우리 사이트(asics.com)는 a3에서만 인용됐다
    expect(summary.selfAnswers).toBe(1)
  })

  it('DETECTOR_VERSION이 박혀 있다 (재판정 추적용)', () => {
    expect(DETECTOR_VERSION).toBe(1)
  })
})
