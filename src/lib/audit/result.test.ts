import { describe, expect, it } from 'vitest'
import { AUDIT_RESULT_VERSION, buildAuditResult } from '@/lib/audit/result'
import { SELF_SUBJECT, competitorSubject } from '@/lib/detection/subject'
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * ★ `detections`의 `subject`는 **표시용 브랜드명이 아니다.** 판정 파이프라인이
 *   `'self'`와 `` `competitor:${canonical}` ``을 쓴다. 여기서 브랜드명을 그대로
 *   넣으면 실제 파이프라인과 다른 것을 테스트하게 되고, 언급 수가 전부 0으로
 *   집계되는 버그를 통과시킨다. `metrics.competitorRates`의 키도 같은 규약이다.
 */
const C = competitorSubject

const metrics = {
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  firstMentionRate: wilsonInterval(0, 3),
  shareOfVoice: wilsonInterval(1, 4),
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [
    { queryId: 'q1', queryText: '러닝화 추천', interval: wilsonInterval(0, 1) },
    { queryId: 'q2', queryText: '운동화 브랜드', interval: wilsonInterval(1, 1) },
  ],
  competitorRates: { [C('29CM')]: wilsonInterval(2, 3), [C('W컨셉')]: wilsonInterval(1, 3) },
}

const answers = [
  {
    id: 'a1',
    queryText: '러닝화 추천',
    engineId: 'gemini',
    text: '나이키와 아디다스를 추천합니다.',
    citations: [
      { url: 'https://namu.wiki/w/x', title: '나무위키' },
      { url: 'https://blog.naver.com/a', title: '네이버 블로그' },
    ],
  },
  {
    id: 'a2',
    queryText: '운동화 브랜드',
    engineId: 'gemini',
    text: '무신사에서 파는 제품이 좋습니다.',
    citations: [{ url: 'https://namu.wiki/w/y', title: '나무위키' }],
  },
  { id: 'a3', queryText: '러닝화 추천', engineId: 'gemini', text: '아식스도 괜찮습니다.', citations: [] },
]

const detections = [
  { answerId: 'a2', subject: SELF_SUBJECT, mentioned: true, position: 1, context: '추천 목록 첫 번째', sentiment: 'recommended' as const, unresolved: false },
  { answerId: 'a1', subject: SELF_SUBJECT, mentioned: false, position: null, context: null, sentiment: null, unresolved: false },
  { answerId: 'a3', subject: SELF_SUBJECT, mentioned: false, position: null, context: null, sentiment: null, unresolved: false },
  { answerId: 'a1', subject: C('29CM'), mentioned: true, position: 2, context: '함께 언급', sentiment: 'neutral' as const, unresolved: false },
  { answerId: 'a2', subject: C('29CM'), mentioned: true, position: 2, context: '함께 언급', sentiment: 'neutral' as const, unresolved: false },
]

const base = {
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM', 'W컨셉'],
  engines: ['gemini'],
  aliases: ['MUSINSA', '무탠다드'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  metrics,
  answers,
  detections,
  unresolved: 0,
}

describe('buildAuditResult', () => {
  it('증거를 1~3건 담고 언급된 답변을 먼저 보여준다', () => {
    const r = buildAuditResult(base)
    expect(r.evidence.length).toBeGreaterThanOrEqual(1)
    expect(r.evidence.length).toBeLessThanOrEqual(3)
    expect(r.evidence[0]?.mentioned).toBe(true)
    expect(r.evidence[0]?.text).toContain('무신사')
  })

  it('증거에 판정 근거(한 줄 요약·감정)를 함께 담는다', () => {
    // 숫자만 있으면 "그 숫자 어떻게 잰 건데?"에 답할 수 없다.
    const r = buildAuditResult(base)
    expect(r.evidence[0]?.context).toBe('추천 목록 첫 번째')
    expect(r.evidence[0]?.sentiment).toBe('recommended')
  })

  it('미언급 증거에는 판정 근거를 붙이지 않는다', () => {
    // ★ 미언급이어도 2차 판정은 context를 채워서 돌려준다 — `isBrandReference:
    //   false`("동명이의어라 우리 브랜드가 아니다")도 근거 문장이 있다. 그걸
    //   그대로 노출하면 화면이 "이렇게 언급됐습니다: 동명이의어로 판단됨"이 된다.
    //   그래서 미언급 판정의 context/sentiment는 값이 있어도 버린다.
    const r = buildAuditResult({
      ...base,
      detections: [
        {
          answerId: 'a1',
          subject: SELF_SUBJECT,
          mentioned: false,
          position: null,
          context: '동명이의 지명으로 판단됨',
          sentiment: 'negative' as const,
          unresolved: false,
        },
      ],
    })
    const items = r.evidence.filter((x) => !x.mentioned)
    expect(items.length).toBeGreaterThan(0)
    for (const e of items) {
      expect(e.context).toBeNull()
      expect(e.sentiment).toBeNull()
    }
  })

  it('같은 답변에 self 판정이 둘 오면 언급된 쪽을 남긴다', () => {
    // 재판정으로 행이 추가되면 한 답변에 self 판정이 둘이 된다. 나중 항목으로
    // 덮어쓰면 언급 증거가 미언급으로 보이고, 그건 고객에게 "안 나왔다"로 배송된다.
    const r = buildAuditResult({
      ...base,
      detections: [
        { answerId: 'a2', subject: SELF_SUBJECT, mentioned: true, position: 1, context: '언급됨', sentiment: 'recommended' as const, unresolved: false },
        { answerId: 'a2', subject: SELF_SUBJECT, mentioned: false, position: null, context: null, sentiment: null, unresolved: false },
      ],
    })
    const a2 = r.evidence.find((e) => e.query === '운동화 브랜드')
    expect(a2?.mentioned).toBe(true)
    expect(a2?.context).toBe('언급됨')
  })

  it('언급이 하나도 없어도 증거를 보여준다', () => {
    // ★ 0% 결과가 가장 흔하고 가장 중요한 화면이다. 여기서 빈 화면을 주면
    //   "측정이 안 된 건가?"가 되어 제품을 의심한다. 안 나온 답변 자체가 증거다.
    const r = buildAuditResult({
      ...base,
      detections: detections.filter((d) => d.subject !== SELF_SUBJECT),
      metrics: { ...metrics, citedRate: wilsonInterval(0, 3) },
    })
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.evidence.every((e) => !e.mentioned)).toBe(true)
  })

  it('증거 원문을 600자로 자른다', () => {
    // ★ 계획서 원안은 긴 답변을 맨 앞에 넣고 `evidence[0]`을 봤지만, 언급된
    //   답변이 먼저 정렬되므로 evidence[0]은 짧은 a2다 — 자르기를 지워도
    //   통과하는 테스트였다. 긴 답변이 어디에 오든 잘렸는지를 본다.
    const long = { ...answers[0]!, id: 'a9', text: 'ㄱ'.repeat(2000) }
    const r = buildAuditResult({ ...base, answers: [long, ...answers] })
    const item = r.evidence.find((e) => e.text.startsWith('ㄱ'))
    expect(item).toBeDefined()
    expect(item!.text.length).toBe(600)
    // 잘렸다는 표시가 있어야 고객이 "답변이 여기서 끝났다"고 오해하지 않는다.
    expect(item!.text.endsWith('…')).toBe(true)
  })

  it('evidenceMax를 넘기면 증거가 그만큼 늘어난다 (유료 리포트)', () => {
    // ★ 상한 테스트는 상한 **이상**의 데이터로 해야 한다 — 답변 3개짜리
    //   픽스처로는 evidenceMax를 무시해도 통과한다(기본 상한도 3이므로).
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i + 1}`,
      queryText: `질의 ${i + 1}`,
      engineId: 'gemini',
      text: `답변 ${i + 1}`,
      citations: [],
    }))
    const capped = buildAuditResult({ ...base, answers: many, detections: [], evidenceMax: 6 })
    expect(capped.evidence).toHaveLength(6)
    // 생략하면 기존 상한(3) 그대로다 — 무료 리포트 동작 불변.
    const free = buildAuditResult({ ...base, answers: many, detections: [] })
    expect(free.evidence).toHaveLength(3)
  })

  it('600자 이하의 답변은 손대지 않는다', () => {
    const r = buildAuditResult(base)
    expect(r.evidence[0]?.text).toBe('무신사에서 파는 제품이 좋습니다.')
  })

  it('순위에 경쟁사가 들어가고 언급 수 내림차순이다', () => {
    const r = buildAuditResult(base)
    expect(r.ranking.map((x) => x.name)).toEqual(['29CM', '무신사', 'W컨셉'])
    expect(r.ranking.find((x) => x.isSelf)?.name).toBe('무신사')
  })

  it('순위의 언급 수가 실제로 세어진다', () => {
    // ★ subject 규약이 어긋나면 여기서 전부 0이 된다. 지표(citedRate)는
    //   정상이라 "언급률 33%인데 순위표에는 아무도 언급되지 않음"이 배송된다.
    const r = buildAuditResult(base)
    expect(r.ranking.find((x) => x.name === '29CM')?.mentions).toBe(2)
    expect(r.ranking.find((x) => x.isSelf)?.mentions).toBe(1)
    expect(r.ranking.find((x) => x.name === 'W컨셉')?.mentions).toBe(0)
  })

  it('순위에 표시용 이름을 담는다 (subject 접두사가 새지 않는다)', () => {
    const r = buildAuditResult(base)
    for (const item of r.ranking) {
      expect(item.name).not.toContain('competitor:')
      expect(item.name).not.toBe('self')
    }
  })

  it('동점이면 이름순으로 고정한다', () => {
    // 실행마다 순서가 바뀌면 같은 리포트를 두 번 볼 때 다르게 보인다.
    const r = buildAuditResult({ ...base, detections: [], competitors: ['ㄴ', 'ㄱ'] })
    expect(r.ranking.map((x) => x.name)).toEqual(['ㄱ', 'ㄴ', '무신사'])
  })

  it('경쟁사가 없으면 순위에 자기 브랜드만 남는다', () => {
    const r = buildAuditResult({
      ...base,
      competitors: [],
      metrics: { ...metrics, competitorRates: {} },
    })
    expect(r.ranking).toHaveLength(1)
    expect(r.ranking[0]?.isSelf).toBe(true)
  })

  it('경쟁사가 없으면 Share of Voice를 "측정 없음"으로 남긴다', () => {
    // ★ "우리만 등록했으니 점유율 100%"는 거짓말이다. 2단계가 n=0으로 돌려주고
    //   여기서도 그대로 전달해야 화면이 숨길 수 있다.
    const r = buildAuditResult({
      ...base,
      competitors: [],
      metrics: { ...metrics, shareOfVoice: wilsonInterval(0, 0), competitorRates: {} },
    })
    expect(r.shareOfVoice.n).toBe(0)
  })

  it('질의별 결과를 언급률이 낮은 순으로 담는다', () => {
    // "이 질문에서 안 나온다"가 위로 와야 행동으로 이어진다.
    // 2단계 metrics가 이미 그 순서로 주므로 여기서 다시 정렬하지 않는다.
    const r = buildAuditResult(base)
    expect(r.byQuery[0]?.queryText).toBe('러닝화 추천')
    expect(r.byQuery.map((q) => q.queryText)).toEqual(['러닝화 추천', '운동화 브랜드'])
  })

  it('측정 조건을 함께 담는다 (재현과 비교 가능성)', () => {
    const r = buildAuditResult(base)
    expect(r.engines).toEqual(['gemini'])
    expect(r.competitors).toEqual(['29CM', 'W컨셉'])
    expect(r.measuredAt).toBe('2026-07-30T02:00:00.000Z')
    expect(r.totalAnswers).toBe(3)
    expect(r.version).toBe(AUDIT_RESULT_VERSION)
    // ★ 별칭도 측정 조건이다. 별칭이 언급률을 좌우하므로(없으면 ChatGPT 0%)
    //   어떤 표기로 쟀는지 모르면 리포트를 재현할 수 없다.
    expect(r.aliases).toEqual(['MUSINSA', '무탠다드'])
  })

  it('인용 출처를 답변 수 내림차순으로 담는다', () => {
    const r = buildAuditResult(base)
    // namu.wiki는 a1·a2 둘 다 → 최다
    expect(r.sources[0]).toMatchObject({ domain: 'namu.wiki', answers: 2 })
    expect(r.sources.map((s) => s.domain)).toContain('blog.naver.com')
  })

  it('인용 출처 점유율의 분모는 인용 0건인 답변까지 포함한다', () => {
    // a3은 인용이 없다. 분모를 "인용이 있는 답변"으로 잡으면 비율이 뻥튀긴다.
    const r = buildAuditResult(base)
    expect(r.sources[0]?.share.n).toBe(3)
    expect(r.sourceSummary.totalAnswers).toBe(3)
    expect(r.sourceSummary.answersWithCitations).toBe(2)
  })

  it('selfDomains를 주면 우리 사이트 인용을 센다', () => {
    const r = buildAuditResult({ ...base, selfDomains: ['namu.wiki'] })
    expect(r.sourceSummary.selfAnswers).toBe(2)
    expect(r.sources.find((s) => s.domain === 'namu.wiki')?.owner).toBe('self')
    expect(r.hasSelfDomains).toBe(true)
  })

  it('selfDomains가 없으면 소유 판정을 하지 않는다', () => {
    // ★ 여기가 중요하다. 도메인을 모르는데 owner를 판정하면 "당신 사이트는
    //   한 번도 인용되지 않았습니다"라는 가장 강한 문장을 근거 없이 만든다.
    //   selfAnswers가 0이면 화면은 그 줄을 **숨겨야** 하고, 그러려면
    //   hasSelfDomains로 "모른다"와 "0회"를 구분할 수 있어야 한다.
    const r = buildAuditResult(base)
    expect(r.sources.every((s) => s.owner === 'third-party')).toBe(true)
    expect(r.hasSelfDomains).toBe(false)
  })

  it('selfDomains가 빈 배열이면 모른다로 취급한다', () => {
    // 신청 폼에서 사이트 주소를 비워 두면 `selfDomains: []`가 넘어온다.
    const r = buildAuditResult({ ...base, selfDomains: [] })
    expect(r.hasSelfDomains).toBe(false)
    expect(r.sources.every((s) => s.owner === 'third-party')).toBe(true)
  })

  it('인용이 하나도 없어도 던지지 않는다', () => {
    const r = buildAuditResult({
      ...base,
      answers: answers.map((a) => ({ ...a, citations: [] })),
    })
    expect(r.sources).toEqual([])
    expect(r.sourceSummary.answersWithCitations).toBe(0)
    expect(r.sourceSummary.distinctDomains).toBe(0)
  })

  it('미판정 건수를 숨기지 않는다', () => {
    const r = buildAuditResult({ ...base, unresolved: 2 })
    expect(r.unresolved).toBe(2)
  })

  it('입력을 변형하지 않는다', () => {
    // ★ **공유 픽스처를 쓰면 안 된다.** 앞선 테스트가 이미 `base.answers`를
    //   제자리 정렬해 놨으면, 여기서 다시 정렬해도 순서가 안 바뀌어서 통과한다
    //   (실제로 그래서 "복사 없이 제자리 정렬" 변이가 살아남았다).
    //   매번 새 배열을 만들고 순서까지 명시적으로 단언한다.
    const fresh = {
      ...base,
      answers: answers.map((a) => ({ ...a, citations: [...a.citations] })),
      detections: detections.map((d) => ({ ...d })),
      competitors: [...base.competitors],
    }
    const snapshot = JSON.stringify(fresh)
    buildAuditResult(fresh)
    expect(JSON.stringify(fresh)).toBe(snapshot)
    // 정렬 대상이 `answers`이므로 순서를 직접 못박는다.
    expect(fresh.answers.map((a) => a.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('돌려준 배열을 고쳐도 입력이 오염되지 않는다', () => {
    // 리포트를 저장한 뒤 화면이 정렬을 다시 걸 수 있다.
    const r = buildAuditResult(base)
    r.competitors.push('X')
    r.engines.push('X')
    r.aliases.push('X')
    expect(base.competitors).toEqual(['29CM', 'W컨셉'])
    expect(base.engines).toEqual(['gemini'])
    expect(base.aliases).toEqual(['MUSINSA', '무탠다드'])
  })

  it('답변이 하나도 없어도 던지지 않는다', () => {
    const r = buildAuditResult({
      ...base,
      answers: [],
      detections: [],
      metrics: { ...metrics, totalAnswers: 0, citedRate: wilsonInterval(0, 0) },
    })
    expect(r.evidence).toEqual([])
    expect(r.totalAnswers).toBe(0)
    expect(r.sources).toEqual([])
  })

  it('JSON으로 왕복한다', () => {
    // free_audits.result에 jsonb로 저장된다. Date나 undefined가 섞이면
    // 저장·복원 후 화면이 다른 것을 보게 된다.
    const r = buildAuditResult({ ...base, selfDomains: ['namu.wiki'] })
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })
})
