import { describe, expect, it } from 'vitest'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'

/** 답변 n개를 만든다. 엔진과 질의를 순환시킨다. */
function makeAnswers(spec: { queryId: string; engineId: string; count: number }[]): AnswerRecord[] {
  const out: AnswerRecord[] = []
  let i = 0
  for (const s of spec) {
    for (let j = 0; j < s.count; j++) {
      out.push({
        id: `a${i++}`,
        queryId: s.queryId,
        queryText: `질의 ${s.queryId}`,
        engineId: s.engineId,
      })
    }
  }
  return out
}

function detect(
  answers: AnswerRecord[],
  subject: string,
  pattern: (i: number) => { mentioned: boolean; position?: number },
): DetectionRecord[] {
  return answers.map((a, i) => {
    const r = pattern(i)
    return {
      answerId: a.id,
      queryId: a.queryId,
      engineId: a.engineId,
      subject,
      mentioned: r.mentioned,
      position: r.position ?? null,
    }
  })
}

describe('computeMetrics — Cited Rate', () => {
  it('언급된 응답 / 전체 응답', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 4,
      position: i < 4 ? 1 : undefined,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.point).toBeCloseTo(0.4, 6)
    expect(m.citedRate.n).toBe(10)
    expect(m.citedRate.k).toBe(4)
  })

  it('언급 0회여도 신뢰구간 상한은 0보다 크다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 90 }])
    const detections = detect(answers, 'self', () => ({ mentioned: false }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.point).toBe(0)
    expect(m.citedRate.n).toBe(90)
    expect(m.citedRate.upper).toBeGreaterThan(0)
    expect(m.citedRate.upper).toBeLessThan(0.1)
  })

  it('판정이 없는 답변은 미언급으로 센다 (분모에서 빼지 않는다)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers.slice(0, 5), 'self', () => ({ mentioned: true, position: 1 }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.n).toBe(10)
    expect(m.citedRate.k).toBe(5)
  })

  it('다른 브랜드(subject)의 언급은 우리 Cited Rate에 들어가지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const rival = detect(answers, 'competitor:A', () => ({ mentioned: true, position: 1 }))
    const m = computeMetrics(answers, rival, { self: 'self', competitors: ['competitor:A'] })
    expect(m.citedRate.k).toBe(0)
    expect(m.citedRate.n).toBe(10)
  })

  it('한 답변에 같은 브랜드가 여러 번 언급돼도 답변 1개로 센다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 4 }])
    const detections: DetectionRecord[] = [
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 3 },
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 5 },
      { answerId: 'a1', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 2 },
    ]
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    // 언급 "횟수" 3이 아니라 언급된 "답변 수" 2 — 분자가 분모를 넘으면 안 된다
    expect(m.citedRate.k).toBe(2)
    expect(m.citedRate.n).toBe(4)
  })

  it('answers에 없는 답변에 달린 판정은 무시한다 (k가 n을 넘지 않는다)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 2 }])
    const detections: DetectionRecord[] = [
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
      { answerId: 'ghost', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
      { answerId: 'ghost2', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
    ]
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.k).toBe(1)
    expect(m.citedRate.n).toBe(2)
  })
})

describe('computeMetrics — First-Mention Rate', () => {
  it('첫 번째로 언급된 응답 / 전체 응답', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 6,
      position: i < 6 ? (i < 2 ? 1 : 3) : undefined,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.k).toBe(6)
    expect(m.firstMentionRate.k).toBe(2)
    expect(m.firstMentionRate.n).toBe(10)
  })

  it('position이 null이면 순서를 모르는 것이므로 첫 언급으로 세지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 5 }])
    const detections = detect(answers, 'self', () => ({ mentioned: true }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.k).toBe(5)
    expect(m.firstMentionRate.k).toBe(0)
    expect(m.firstMentionRate.n).toBe(5)
  })

  it('한 답변에 여러 번 언급되면 가장 앞선 위치를 쓴다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 2 }])
    const detections: DetectionRecord[] = [
      // 뒤에 오는 레코드가 더 나중 위치다 — 마지막 것을 쓰면 첫 언급을 놓친다
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 4 },
      { answerId: 'a1', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 2 },
    ]
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.firstMentionRate.k).toBe(1)
  })

  it('position=null 레코드가 섞여 있어도 숫자 위치가 있으면 그것을 쓴다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 1 }])
    const detections: DetectionRecord[] = [
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: null },
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
    ]
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.firstMentionRate.k).toBe(1)
  })

  it('mentioned=false인 레코드의 position은 무시한다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 3 }])
    const detections: DetectionRecord[] = [
      { answerId: 'a0', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: false, position: 1 },
      { answerId: 'a1', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: true, position: 1 },
      { answerId: 'a2', queryId: 'q1', engineId: 'chatgpt', subject: 'self', mentioned: false, position: null },
    ]
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.k).toBe(1)
    expect(m.firstMentionRate.k).toBe(1)
  })
})

describe('computeMetrics — Share of Voice', () => {
  it('우리 언급 수 / (우리 + 경쟁사 언급 수)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 3, position: 1 }))
    const rival = detect(answers, 'competitor:A', (i) => ({ mentioned: i < 7, position: 1 }))
    const m = computeMetrics(answers, [...mine, ...rival], {
      self: 'self',
      competitors: ['competitor:A'],
    })
    expect(m.shareOfVoice.point).toBeCloseTo(3 / 10, 6)
    expect(m.shareOfVoice.k).toBe(3)
    expect(m.shareOfVoice.n).toBe(10)
    expect(m.competitorRates['competitor:A']?.point).toBeCloseTo(0.7, 6)
    expect(m.competitorRates['competitor:A']?.n).toBe(10)
  })

  it('경쟁사가 여럿이면 분모에 모두 더한다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 2, position: 1 }))
    const a = detect(answers, 'competitor:A', (i) => ({ mentioned: i < 3, position: 1 }))
    const b = detect(answers, 'competitor:B', (i) => ({ mentioned: i < 5, position: 1 }))
    const m = computeMetrics(answers, [...mine, ...a, ...b], {
      self: 'self',
      competitors: ['competitor:A', 'competitor:B'],
    })
    expect(m.shareOfVoice.point).toBeCloseTo(2 / 10, 6)
    expect(m.shareOfVoice.n).toBe(10)
  })

  it('등록하지 않은 브랜드의 언급은 SoV 분모에 들어가지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 2, position: 1 }))
    const known = detect(answers, 'competitor:A', (i) => ({ mentioned: i < 2, position: 1 }))
    const unknown = detect(answers, 'competitor:Z', () => ({ mentioned: true, position: 1 }))
    const m = computeMetrics(answers, [...mine, ...known, ...unknown], {
      self: 'self',
      competitors: ['competitor:A'],
    })
    // 등록된 경쟁사만 분모에 들어간다 → 2/(2+2). competitor:Z 10건은 빠진다.
    expect(m.shareOfVoice.point).toBeCloseTo(0.5, 6)
    expect(m.shareOfVoice.n).toBe(4)
    expect(m.competitorRates['competitor:Z']).toBeUndefined()
  })

  it('아무도 언급되지 않으면 SoV는 0이고 던지지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 5 }])
    const m = computeMetrics(answers, [], { self: 'self', competitors: ['competitor:A'] })
    expect(m.shareOfVoice.point).toBe(0)
    expect(m.shareOfVoice.n).toBe(0)
  })

  it('경쟁사를 하나도 등록하지 않으면 SoV는 "측정 없음"(n=0)이다 — 100%가 아니다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 4, position: 1 }))
    const m = computeMetrics(answers, mine, { self: 'self', competitors: [] })
    expect(m.shareOfVoice.n).toBe(0)
    expect(m.shareOfVoice.k).toBe(0)
    expect(m.shareOfVoice.point).toBe(0)
    // 우리만 등록했다고 "점유율 100%"라고 말하면 그건 거짓말이다
    expect(m.citedRate.k).toBe(4)
  })

  it('경쟁사가 등록됐지만 언급 0건이면 SoV는 100%다 (실제로 측정된 결과)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 4, position: 1 }))
    const m = computeMetrics(answers, mine, { self: 'self', competitors: ['competitor:A'] })
    expect(m.shareOfVoice.point).toBe(1)
    expect(m.shareOfVoice.n).toBe(4)
    expect(m.competitorRates['competitor:A']?.k).toBe(0)
    expect(m.competitorRates['competitor:A']?.n).toBe(10)
  })
})

describe('computeMetrics — 엔진별 · 질의별', () => {
  it('엔진별로 나눈다', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 10 },
      { queryId: 'q1', engineId: 'naver', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 10 ? i < 6 : i < 12,
      position: 1,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byEngine.chatgpt?.point).toBeCloseTo(0.6, 6)
    expect(m.byEngine.chatgpt?.n).toBe(10)
    expect(m.byEngine.naver?.point).toBeCloseTo(0.2, 6)
    expect(m.byEngine.naver?.n).toBe(10)
  })

  it('엔진별 답변 수가 달라도 각자의 분모로 계산한다', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 10 },
      { queryId: 'q1', engineId: 'naver', count: 2 },
    ])
    // chatgpt 3/10, naver 1/2
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 10 ? i < 3 : i === 10,
      position: 1,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byEngine.chatgpt?.n).toBe(10)
    expect(m.byEngine.chatgpt?.k).toBe(3)
    expect(m.byEngine.naver?.n).toBe(2)
    expect(m.byEngine.naver?.k).toBe(1)
    // 전체는 두 엔진 비율의 평균이 아니라 합산 분모다
    expect(m.citedRate.n).toBe(12)
    expect(m.citedRate.k).toBe(4)
    // 표본이 작은 엔진은 구간이 더 넓어야 한다
    const naverWidth = (m.byEngine.naver?.upper ?? 0) - (m.byEngine.naver?.lower ?? 0)
    const chatgptWidth = (m.byEngine.chatgpt?.upper ?? 0) - (m.byEngine.chatgpt?.lower ?? 0)
    expect(naverWidth).toBeGreaterThan(chatgptWidth)
  })

  it('한 답변도 없는 엔진은 byEngine에 나타나지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 3 }])
    const m = computeMetrics(answers, [], { self: 'self', competitors: [] })
    expect(Object.keys(m.byEngine)).toEqual(['chatgpt'])
  })

  it('질의별 0/N을 찾아낸다 (지금 조치할 것 카드의 근거)', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 10 },
      { queryId: 'q2', engineId: 'chatgpt', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({ mentioned: i < 10, position: 1 }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })

    const zero = m.byQuery.filter((q) => q.interval.k === 0)
    expect(zero).toHaveLength(1)
    expect(zero[0]?.queryId).toBe('q2')
    expect(zero[0]?.queryText).toBe('질의 q2')
    expect(zero[0]?.interval.n).toBe(10)
  })

  it('질의별 결과는 언급률 오름차순 — 못 나오는 질의가 위로 온다', () => {
    const answers = makeAnswers([
      { queryId: 'high', engineId: 'chatgpt', count: 10 },
      { queryId: 'low', engineId: 'chatgpt', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 10 ? true : i < 11,
      position: 1,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byQuery.map((q) => q.queryId)).toEqual(['low', 'high'])
  })

  it('언급률이 같으면 표본이 큰 질의를 위로 — 근거가 강한 쪽부터', () => {
    const answers = makeAnswers([
      { queryId: 'small', engineId: 'chatgpt', count: 2 },
      { queryId: 'big', engineId: 'chatgpt', count: 20 },
    ])
    const m = computeMetrics(answers, [], { self: 'self', competitors: [] })
    expect(m.byQuery.map((q) => q.queryId)).toEqual(['big', 'small'])
  })

  it('질의별 집계는 엔진을 가리지 않고 합산한다', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 4 },
      { queryId: 'q1', engineId: 'naver', count: 4 },
    ])
    const detections = detect(answers, 'self', (i) => ({ mentioned: i < 2, position: 1 }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byQuery).toHaveLength(1)
    expect(m.byQuery[0]?.interval.n).toBe(8)
    expect(m.byQuery[0]?.interval.k).toBe(2)
  })
})

describe('computeMetrics — 빈 입력', () => {
  it('답변이 없으면 전부 n=0이고 던지지 않는다', () => {
    const m = computeMetrics([], [], { self: 'self', competitors: [] })
    expect(m.totalAnswers).toBe(0)
    expect(m.citedRate.n).toBe(0)
    expect(m.firstMentionRate.n).toBe(0)
    expect(m.shareOfVoice.n).toBe(0)
    expect(m.byQuery).toEqual([])
    expect(m.byEngine).toEqual({})
  })

  it('답변이 없을 때 등록된 경쟁사는 n=0으로 나온다 (0%로 단정하지 않는다)', () => {
    const m = computeMetrics([], [], { self: 'self', competitors: ['competitor:A'] })
    expect(m.competitorRates['competitor:A']?.n).toBe(0)
    // n=0이면 lower/upper로는 "측정 없음"과 "측정했는데 0%"를 구별할 수 없다.
    // 소비자는 반드시 n===0으로 판별해야 한다.
    expect(m.competitorRates['competitor:A']?.upper).toBe(1)
  })

  it('n=0인 지표는 "0% ~ 100%"로 표시하면 안 된다는 사실을 소비자가 알 수 있다', () => {
    const empty = computeMetrics([], [], { self: 'self', competitors: [] })
    const measured = computeMetrics(
      makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 90 }]),
      [],
      { self: 'self', competitors: [] },
    )
    // 둘 다 point=0, lower=0이지만 n으로 구별된다
    expect(empty.citedRate.point).toBe(measured.citedRate.point)
    expect(empty.citedRate.lower).toBe(measured.citedRate.lower)
    expect(empty.citedRate.n).toBe(0)
    expect(measured.citedRate.n).toBe(90)
    expect(empty.citedRate.upper).toBeGreaterThan(measured.citedRate.upper)
  })
})

describe('computeMetrics — 입력을 변형하지 않는다', () => {
  it('answers/detections 배열과 원소를 건드리지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 3 }])
    const detections = detect(answers, 'self', (i) => ({ mentioned: i < 2, position: 1 }))
    const answersSnapshot = JSON.stringify(answers)
    const detectionsSnapshot = JSON.stringify(detections)
    computeMetrics(answers, detections, { self: 'self', competitors: ['competitor:A'] })
    expect(JSON.stringify(answers)).toBe(answersSnapshot)
    expect(JSON.stringify(detections)).toBe(detectionsSnapshot)
  })
})
