import { SELF_SUBJECT, competitorSubject } from '@/lib/detection/subject'
import type { Sentiment } from '@/lib/detection/types'
import type { BrandMetrics } from '@/lib/stats/metrics'
import { aggregateSources, summarizeSources } from '@/lib/stats/sources'
import type { Citation, SourceStat, SourceSummary } from '@/lib/stats/sources'
import type { Interval } from '@/lib/stats/wilson'

/**
 * 무료 진단 리포트 구성. 순수 함수 — 입력을 변형하지 않는다.
 *
 * ★ **여기가 machine 표기와 고객 표기의 경계다.** 판정 결과의 `subject`는
 *   `'self'` / `` `competitor:${canonical}` ``이고 고객이 볼 것은 브랜드명이다.
 *   그 변환을 이 파일에서만 한다 — `@/lib/detection/subject`의 조립 함수를
 *   그대로 재사용해서, 한쪽만 규약이 바뀌면 타입이 아니라 테스트가 잡게 한다.
 */

/**
 * 리포트 구조 버전.
 *
 * `free_audits.result`에 그대로 저장되므로, 구조를 바꾸면 예전에 보낸 리포트를
 * 새 화면이 못 읽는다. 필드를 지우거나 의미를 바꿀 때 올린다.
 */
export const AUDIT_RESULT_VERSION = 1

export interface EvidenceItem {
  query: string
  engineId: string
  /** 자른 답변 원문 */
  text: string
  mentioned: boolean
  /** 2차 판정의 한 줄 요약. 미언급이면 null */
  context: string | null
  sentiment: Sentiment | null
  /**
   * 이 답변에서 우리 브랜드가 **몇 번째로 언급된 브랜드인가**. 1부터.
   *
   * ★ 이미 재고 있던 값인데 리포트에 담지 않았다. 화면이 답변 원문에 밑줄만
   *   긋고 순서를 못 보여주면, 랜딩이 보여준 것과 배송물이 달라진다.
   *   미언급이거나 판정기가 순서를 모르면 null이다.
   */
  position: number | null
}

export interface RankingItem {
  /** 표시용 브랜드명. subject 접두사가 붙지 않는다. */
  name: string
  /** 이 브랜드가 언급된 답변 수 */
  mentions: number
  isSelf: boolean
}

export interface AuditResult {
  version: number
  brandName: string
  category: string
  /** 고객이 등록한 경쟁사. Share of Voice를 읽으려면 반드시 함께 봐야 한다 */
  competitors: string[]
  /** 이 측정에 쓴 엔진. 다른 엔진 구성끼리 비교하면 안 된다 */
  engines: string[]
  /**
   * 이 측정에 쓴 별칭 (Task 6-2가 생성). 측정 조건이다.
   *
   * ★ 별칭이 언급률을 좌우한다 — 영문 별칭이 없으면 ChatGPT 언급률이 구조적으로
   *   0%가 된다(2026-07-30 실측). 어떤 표기로 쟀는지 남기지 않으면 리포트를
   *   재현할 수도, 낮은 숫자가 실제인지 별칭 누락인지 가릴 수도 없다.
   */
  aliases: string[]
  /** ISO 8601 */
  measuredAt: string
  totalAnswers: number
  citedRate: Interval
  shareOfVoice: Interval
  ranking: RankingItem[]
  evidence: EvidenceItem[]
  byEngine: Record<string, Interval>
  byQuery: { queryText: string; interval: Interval }[]
  /**
   * AI가 읽는 출처. 답변 수 내림차순.
   *
   * ★ 0% 고객에게 **유일하게 집행 가능한 정보**다. 언급률 0%는 "당신은 없다"
   *   외에 아무것도 알려주지 않지만, "AI가 당신 카테고리를 답할 때 이 5개
   *   사이트를 읽는다"는 그 자리에서 할 일이 된다.
   */
  sources: SourceStat[]
  sourceSummary: SourceSummary
  /**
   * 우리 사이트 도메인을 알고 있는가.
   *
   * ★ `sourceSummary.selfAnswers === 0`은 두 가지 뜻이다 — "인용되지 않았다"와
   *   "도메인을 몰라서 못 셌다". 화면이 이 둘을 반드시 갈라야 한다. 후자를
   *   "한 번도 인용되지 않았습니다"로 쓰면 근거 없는 단정이 된다.
   */
  hasSelfDomains: boolean
  /** 2차 판정이 실패해 미판정으로 남은 건수. 0이 아니면 화면에 표시한다 */
  unresolved: number
}

const EVIDENCE_MAX = 3
const EVIDENCE_TEXT_LIMIT = 600

export interface DetectionRow {
  answerId: string
  /** `'self'` 또는 `` `competitor:${canonical}` ``. 표시용 이름이 아니다. */
  subject: string
  mentioned: boolean
  position: number | null
  context: string | null
  sentiment: Sentiment | null
  unresolved: boolean
}

export interface BuildAuditResultArgs {
  brandName: string
  category: string
  /** 표시용 경쟁사명. subject는 이 값으로 조립한다. */
  competitors: string[]
  engines: string[]
  /** Task 6-2가 생성한 자기 브랜드 별칭 */
  aliases: string[]
  measuredAt: string
  metrics: BrandMetrics
  answers: {
    id: string
    queryText: string
    engineId: string
    text: string
    citations: readonly Citation[]
  }[]
  detections: DetectionRow[]
  /**
   * 우리 브랜드가 소유한 호스트명. **추측하지 않는다** — 비어 있으면 소유
   * 판정을 하지 않는다. 브랜드명에서 도메인을 유추하면 틀리고, 틀린 추측이
   * "당신 사이트는 한 번도 인용되지 않았습니다"라는 가장 강한 문장을 만든다.
   */
  selfDomains?: readonly string[]
  competitorDomains?: readonly string[]
  unresolved: number
}

/**
 * 무료 진단 리포트를 구성한다.
 *
 * 설계 ④: 기다린 사람의 첫 질문은 "이거 진짜야?"이므로 첫 임무는 충격이 아니라
 * 신뢰다. 숫자와 순위는 반박 가능하지만("그 숫자 어떻게 잰 건데?") AI 답변
 * 원문은 반박할 수 없고 본인이 직접 그 서비스에 물어 확인할 수 있다.
 * 그래서 `evidence`가 맨 앞이다.
 */
export function buildAuditResult(args: BuildAuditResultArgs): AuditResult {
  // ★ `subject === args.brandName`이 아니다. 판정은 브랜드명을 모르고 `'self'`만
  //   안다. 브랜드명으로 비교하면 매칭이 0건이 되는데 metrics 쪽 숫자는 정상이라
  //   "언급률 33%인데 순위표에는 아무도 언급되지 않음"인 리포트가 배송된다.
  const selfDetections = args.detections.filter((d) => d.subject === SELF_SUBJECT)
  // 같은 답변에 self 판정이 둘 이상 오면 언급된 쪽을 남긴다 — 나중 항목으로
  // 덮어쓰면 언급 증거가 미언급으로 보이는 쪽으로 갈 수 있다.
  const byAnswer = new Map<string, DetectionRow>()
  for (const d of selfDetections) {
    const prev = byAnswer.get(d.answerId)
    if (!prev || (!prev.mentioned && d.mentioned)) byAnswer.set(d.answerId, d)
  }

  // 언급된 답변을 먼저. 같은 그룹 안에서는 입력 순서를 유지한다.
  // ★ `sort`는 제자리 정렬이므로 반드시 복사본에 건다.
  const sorted = [...args.answers].sort((a, b) => {
    const am = byAnswer.get(a.id)?.mentioned ? 0 : 1
    const bm = byAnswer.get(b.id)?.mentioned ? 0 : 1
    return am - bm
  })

  const evidence: EvidenceItem[] = sorted.slice(0, EVIDENCE_MAX).map((a) => {
    const d = byAnswer.get(a.id)
    return {
      query: a.queryText,
      engineId: a.engineId,
      text: truncate(a.text, EVIDENCE_TEXT_LIMIT),
      mentioned: d?.mentioned ?? false,
      context: d?.mentioned ? (d.context ?? null) : null,
      sentiment: d?.mentioned ? (d.sentiment ?? null) : null,
      position: d?.mentioned ? (d.position ?? null) : null,
    }
  })

  // 순위 — 언급 수 내림차순. 동점이면 이름순으로 고정한다(실행마다 순서가
  // 바뀌면 같은 리포트를 두 번 볼 때 다르게 보인다).
  const mentionCount = (subject: string): number =>
    args.detections.filter((d) => d.subject === subject && d.mentioned).length

  const ranking: RankingItem[] = [
    { name: args.brandName, mentions: mentionCount(SELF_SUBJECT), isSelf: true },
    ...args.competitors.map((name) => ({
      name,
      mentions: mentionCount(competitorSubject(name)),
      isSelf: false,
    })),
  ].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, 'ko'))

  // 인용 출처 — API 호출이 늘지 않는다. 이미 수집한 citations를 집계할 뿐이다.
  // ★ 분모는 인용 0건인 답변까지 포함한 **전체 답변 수**다. 2단계
  //   aggregateSources가 그렇게 동작한다 — 인용이 있는 답변만 분모로 잡으면
  //   비율이 뻥튀겨져서 "AI가 이 사이트를 늘 읽는다"처럼 보인다.
  const citedAnswers = args.answers.map((a) => ({ answerId: a.id, citations: a.citations }))
  const sources = aggregateSources(citedAnswers, {
    ...(args.selfDomains ? { selfDomains: args.selfDomains } : {}),
    ...(args.competitorDomains ? { competitorDomains: args.competitorDomains } : {}),
  })

  return {
    version: AUDIT_RESULT_VERSION,
    brandName: args.brandName,
    category: args.category,
    competitors: [...args.competitors],
    engines: [...args.engines],
    aliases: [...args.aliases],
    measuredAt: args.measuredAt,
    totalAnswers: args.metrics.totalAnswers,
    citedRate: args.metrics.citedRate,
    shareOfVoice: args.metrics.shareOfVoice,
    ranking,
    evidence,
    byEngine: args.metrics.byEngine,
    // 2단계 metrics가 이미 언급률 오름차순으로 준다. 여기서 다시 정렬하지 않는다.
    byQuery: args.metrics.byQuery.map((q) => ({ queryText: q.queryText, interval: q.interval })),
    sources,
    sourceSummary: summarizeSources(citedAnswers, sources),
    hasSelfDomains: (args.selfDomains?.length ?? 0) > 0,
    unresolved: args.unresolved,
  }
}

/** 상한을 넘으면 말줄임표를 붙여 자른다. 결과 길이는 정확히 `limit`이다. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
