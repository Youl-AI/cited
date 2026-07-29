/**
 * 지표 집계 — Cited Rate · First-Mention Rate · Share of Voice · 엔진별/질의별.
 *
 * 이 파일도 완전한 순수 함수다 (설계 ① 핵심 원칙, ESLint allow-list가 강제).
 * 외부 I/O를 import하지 마라.
 *
 * ★ 모든 지표는 `Interval`로 나온다. `n === 0`은 **"측정이 없다"**는 뜻이고,
 *   그때 `lower/upper`는 0~1이다. `wilsonInterval(0, 0)`이 던지지 않고 전 범위를
 *   돌려주기 때문에 **"측정 없음"과 "측정했는데 0%"는 lower/upper로 구별할 수 없다.**
 *   소비자(대시보드·집계 잡)는 반드시 `n === 0`으로 판별해라. 이걸 놓치면
 *   화면에 "0% ~ 100%"라는 무의미한 숫자가 뜬다.
 */

import { type Interval, wilsonInterval } from './wilson'

export interface AnswerRecord {
  id: string
  queryId: string
  queryText: string
  engineId: string
}

export interface DetectionRecord {
  answerId: string
  /**
   * 비정규화된 편의 필드. 집계는 이 값을 쓰지 않고 `answerId`로 answers를 찾는다
   * — 두 값이 어긋나면 답변 쪽이 원본이다.
   */
  queryId: string
  /** 위와 같다. 집계에서 쓰지 않는다. */
  engineId: string
  /** 'self' 또는 'competitor:<name>' */
  subject: string
  mentioned: boolean
  /** 답변에서 몇 번째로 언급된 브랜드인가. 1부터 시작. 모르면 null. */
  position: number | null
}

export interface QueryBreakdown {
  queryId: string
  queryText: string
  interval: Interval
}

export interface BrandMetrics {
  totalAnswers: number
  /** 대표 지표 — 언급된 응답 / 전체 응답 */
  citedRate: Interval
  /** 첫 번째로 언급된 응답 / 전체 응답 */
  firstMentionRate: Interval
  /**
   * 우리 언급 수 / (우리 + **등록된** 경쟁사 언급 수).
   *
   * ★ 분모는 "답변에 등장한 모든 브랜드"가 아니라 **고객이 등록한 브랜드 집합**이다.
   *   우리는 등록되지 않은 브랜드를 셀 수 없다(판정기가 별칭을 모른다). 그래서
   *   **경쟁사를 적게 등록할수록 SoV가 높아진다.** 이건 측정의 성질이지 성과가 아니다.
   *   화면에 노출할 때 반드시 분모(=`n`)와 경쟁사 목록을 함께 보여줘야 한다.
   *
   *   경쟁사를 하나도 등록하지 않았으면 분모가 정의되지 않으므로 `n = 0`
   *   ("측정 없음")을 돌려준다. "우리만 등록했으니 점유율 100%"는 거짓말이다.
   */
  shareOfVoice: Interval
  byEngine: Record<string, Interval>
  /** 언급률 오름차순 — "이 질문에서 안 나온다"가 위로 온다 */
  byQuery: QueryBreakdown[]
  /** 경쟁사별 Cited Rate. 분모는 전체 답변 수(SoV 분모가 아니다). */
  competitorRates: Record<string, Interval>
}

export interface MetricsOptions {
  /** 우리 브랜드의 subject 값 */
  self: string
  /** 경쟁사 subject 값 목록 */
  competitors: readonly string[]
}

export function computeMetrics(
  answers: readonly AnswerRecord[],
  detections: readonly DetectionRecord[],
  opts: MetricsOptions,
): BrandMetrics {
  const n = answers.length
  const answerIds = new Set(answers.map((a) => a.id))

  // subject → 언급된 답변 id 집합. Set이므로 한 답변에 같은 브랜드가 여러 번
  // 언급돼도 1로 센다 (언급 "횟수"가 아니라 언급된 "답변 수"가 지표의 정의다).
  const mentionedAnswersBySubject = new Map<string, Set<string>>()
  // 우리 브랜드가 각 답변에서 등장한 가장 앞선 위치. 위치를 모르면 담지 않는다.
  const selfBestPosition = new Map<string, number>()

  for (const d of detections) {
    if (!d.mentioned) continue
    // answers에 없는 답변의 판정은 버린다. 남겨두면 k > n이 되어 wilsonInterval이
    // 던진다 — 집계 잡 전체가 죽는 것보다 그 판정을 무시하는 편이 낫다.
    if (!answerIds.has(d.answerId)) continue

    let set = mentionedAnswersBySubject.get(d.subject)
    if (!set) {
      set = new Set()
      mentionedAnswersBySubject.set(d.subject, set)
    }
    set.add(d.answerId)

    if (d.subject === opts.self && d.position !== null) {
      const best = selfBestPosition.get(d.answerId)
      if (best === undefined || d.position < best) {
        selfBestPosition.set(d.answerId, d.position)
      }
    }
  }

  const selfAnswers = mentionedAnswersBySubject.get(opts.self) ?? new Set<string>()
  const selfMentions = selfAnswers.size

  let firstMentions = 0
  for (const position of selfBestPosition.values()) {
    if (position === 1) firstMentions++
  }

  // 경쟁사별 Cited Rate + SoV 분모.
  let competitorMentionTotal = 0
  const competitorRates: Record<string, Interval> = {}
  for (const c of opts.competitors) {
    const k = mentionedAnswersBySubject.get(c)?.size ?? 0
    competitorMentionTotal += k
    competitorRates[c] = wilsonInterval(k, n)
  }

  // 등록된 경쟁사가 없으면 SoV는 정의되지 않는다 → "측정 없음"(n=0).
  const shareOfVoice =
    opts.competitors.length === 0
      ? wilsonInterval(0, 0)
      : wilsonInterval(selfMentions, selfMentions + competitorMentionTotal)

  // 엔진별 — 엔진마다 답변 수가 다를 수 있으므로 각자의 분모로 계산한다.
  const byEngine: Record<string, Interval> = {}
  for (const [engineId, t] of groupBy(answers, (a) => a.engineId, selfAnswers)) {
    byEngine[engineId] = wilsonInterval(t.k, t.n)
  }

  // 질의별 — 엔진을 가리지 않고 합산한다.
  const byQuery: QueryBreakdown[] = [...groupBy(answers, (a) => a.queryId, selfAnswers)]
    .map(([queryId, t]) => ({
      queryId,
      queryText: t.text,
      interval: wilsonInterval(t.k, t.n),
    }))
    // 못 나오는 질의를 위로. 동률이면 표본이 큰 쪽을 먼저 — 근거가 강한 쪽이
    // 위에 와야 "이 질문을 손봐라"라는 카드가 헛짚지 않는다.
    .sort((a, b) => a.interval.point - b.interval.point || b.interval.n - a.interval.n)

  return {
    totalAnswers: n,
    citedRate: wilsonInterval(selfMentions, n),
    firstMentionRate: wilsonInterval(firstMentions, n),
    shareOfVoice,
    byEngine,
    byQuery,
    competitorRates,
  }
}

/** 답변을 키별로 묶어 분모 n과 분자 k(= 우리가 언급된 답변 수)를 센다. */
function groupBy(
  answers: readonly AnswerRecord[],
  keyOf: (a: AnswerRecord) => string,
  selfAnswers: ReadonlySet<string>,
): Map<string, { text: string; n: number; k: number }> {
  const out = new Map<string, { text: string; n: number; k: number }>()
  for (const a of answers) {
    const key = keyOf(a)
    let cur = out.get(key)
    if (!cur) {
      cur = { text: a.queryText, n: 0, k: 0 }
      out.set(key, cur)
    }
    cur.n++
    if (selfAnswers.has(a.id)) cur.k++
  }
  return out
}
