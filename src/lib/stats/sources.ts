/**
 * 인용 출처 집계 — "AI가 이 카테고리에서 무엇을 읽고 있는가".
 *
 * 이 파일도 완전한 순수 함수다 (설계 ① 핵심 원칙, ESLint allow-list가 강제).
 *
 * ★ **이게 소규모 브랜드에게 유일하게 실행 가능한 정보다.**
 *   언급률 0%는 알려주는 값이 없다 — 고객이 이미 안다. 반면 "AI가 이 카테고리
 *   질문 30개에 답하면서 이 페이지를 12번 인용했다"는 집행할 수 있는 목록이다.
 *   구글 1위는 못 해도, AI가 반복 인용하는 리뷰 정리글에 들어가는 건 할 수 있다.
 *
 * ★ 세는 단위는 **답변 수**다. 원시 인용 수가 아니다.
 *   한 답변이 같은 페이지를 5번 인용해도 1로 센다. 원시 인용을 세면 답변이
 *   길수록 출처가 중요해 보이는데, 그건 출처의 영향력이 아니라 답변의 길이다.
 */

import { type Interval, wilsonInterval } from './wilson'

export interface Citation {
  url: string
  title: string
  /**
   * 엔진이 직접 알려준 실제 호스트명. 있으면 URL 파싱보다 **우선한다.**
   * Gemini는 인용 URI가 리다이렉트 프록시라 URL에서 뽑으면 전부 구글
   * 도메인 하나로 뭉개진다 (`engines/gemini.ts`의 `hostnameFromTitle` 참고).
   */
  domain?: string
}

export interface CitedAnswer {
  answerId: string
  citations: readonly Citation[]
}

/** 이 출처가 누구 것인가. */
export type SourceOwner = 'self' | 'competitor' | 'third-party'

export interface SourcePage {
  url: string
  title: string
  /** 이 URL을 인용한 답변 수 */
  answers: number
}

export interface SourceStat {
  /** 호스트명 (앞의 `www.`만 제거). 예: `namu.wiki`, `corp.musinsa.com` */
  domain: string
  /** 이 도메인을 인용한 답변 수 */
  answers: number
  /**
   * 전체 답변 중 이 도메인이 인용된 비율.
   *
   * ★ 신뢰구간이다. 무료 진단은 답변이 3개뿐이라 "3개 중 2개 = 67%"가 나오는데,
   *   그 구간은 [21%, 94%]다. 점추정만 보여주면 거짓말이 된다.
   */
  share: Interval
  /** 이 도메인 안에서 인용된 URL들. 답변 수 내림차순. */
  pages: SourcePage[]
  owner: SourceOwner
}

export interface SourceOptions {
  /** 우리 브랜드가 소유한 호스트명 (`www.` 유무 무관) */
  selfDomains?: readonly string[]
  /** 경쟁사가 소유한 호스트명 */
  competitorDomains?: readonly string[]
}

/**
 * 그룹 키로 쓸 호스트명.
 *
 * ★ eTLD+1(등록가능 도메인)을 계산하지 **않는다.** 제대로 하려면 public suffix
 *   list가 필요하고, 흔한 대안인 "뒤 두 레이블"은 한국 도메인을 전부 깨뜨린다 —
 *   `musinsa.co.kr`이 `co.kr`로 묶여서 서로 다른 회사가 한 덩어리가 된다.
 *
 *   그래서 호스트명을 그대로 쓴다. 대가는 `hoka.com`과 `nz.hoka.com`이 따로
 *   집계되는 것이고, 그건 리포트를 읽는 사람이 알아볼 수 있는 종류의 분리다.
 *   `co.kr` 오집계는 알아볼 수 없다.
 */
export function citationDomain(citation: Citation): string | null {
  // 엔진이 실제 도메인을 알려줬으면 그게 정답이다. URL 파싱보다 우선한다.
  if (citation.domain) return normalizeDomain(citation.domain)

  try {
    // hostname은 URL 파싱이 이미 소문자로 정규화한다(WHATWG URL). 여기에
    // toLowerCase를 또 붙여봤자 죽은 코드다 — 변이 테스트가 잡아냈다.
    // 반면 normalizeDomain은 **설정에서 온** 문자열을 다루므로 필요하다.
    const host = new URL(citation.url).hostname
    if (!host) return null
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    // 파싱 불가한 값은 집계에서 뺀다. 조용히 버리는 게 아니라, 도메인이
    // 없는 인용은 "어느 사이트인지 모른다"는 뜻이므로 집행할 수 없다.
    return null
  }
}

function normalizeDomain(value: string): string {
  const lower = value.trim().toLowerCase()
  return lower.startsWith('www.') ? lower.slice(4) : lower
}

/**
 * `domain`이 `owned` 중 하나이거나 그 하위 도메인인가.
 *
 * ★ 정확히 같은지만 보면 `corp.musinsa.com`이 남의 사이트로 분류된다. 실제
 *   실측에서 그랬다 — 무신사 회사 소개 페이지가 인용됐는데 "우리 사이트가
 *   한 번도 인용되지 않았습니다"라고 리포트에 적힐 상황이었다.
 *
 *   접미사 매칭은 반드시 점 경계로 한다. `endsWith('musinsa.com')`만 쓰면
 *   `fakemusinsa.com`이 우리 것으로 잡힌다.
 */
function ownedBy(domain: string, owned: ReadonlySet<string>): boolean {
  if (owned.has(domain)) return true
  for (const own of owned) {
    if (domain.endsWith(`.${own}`)) return true
  }
  return false
}

/**
 * 인용 출처를 도메인별로 집계한다.
 *
 * `answers`에는 **인용이 0건인 답변도 포함해야 한다.** 분모가 전체 답변 수이기
 * 때문이다. 인용이 있는 답변만 넘기면 모든 출처의 비율이 부풀려진다.
 */
export function aggregateSources(
  answers: readonly CitedAnswer[],
  opts: SourceOptions = {},
): SourceStat[] {
  const self = new Set((opts.selfDomains ?? []).map(normalizeDomain))
  const competitors = new Set((opts.competitorDomains ?? []).map(normalizeDomain))

  // 같은 answerId가 두 번 들어와도 분모가 부풀지 않게 한다.
  const totalAnswers = new Set(answers.map((a) => a.answerId)).size

  interface Acc {
    domain: string
    /** 이 도메인을 인용한 answerId 집합 */
    answerIds: Set<string>
    /** url → { title, 그 url을 인용한 answerId 집합 } */
    pages: Map<string, { title: string; answerIds: Set<string> }>
  }
  const byDomain = new Map<string, Acc>()

  for (const answer of answers) {
    for (const citation of answer.citations) {
      const domain = citationDomain(citation)
      if (domain === null) continue

      let acc = byDomain.get(domain)
      if (!acc) {
        acc = { domain, answerIds: new Set(), pages: new Map() }
        byDomain.set(domain, acc)
      }
      // Set이므로 같은 답변이 같은 페이지를 여러 번 인용해도 1로 센다.
      acc.answerIds.add(answer.answerId)

      let page = acc.pages.get(citation.url)
      if (!page) {
        page = { title: citation.title || citation.url, answerIds: new Set() }
        acc.pages.set(citation.url, page)
      }
      page.answerIds.add(answer.answerId)
    }
  }

  const stats: SourceStat[] = []
  for (const acc of byDomain.values()) {
    const pages: SourcePage[] = [...acc.pages.entries()]
      .map(([url, page]) => ({ url, title: page.title, answers: page.answerIds.size }))
      // 인용 답변 수 내림차순, 동률이면 URL 사전순 — 순서가 결정적이어야
      // 리포트를 두 번 만들었을 때 같은 결과가 나온다.
      .sort((a, b) => b.answers - a.answers || a.url.localeCompare(b.url))

    stats.push({
      domain: acc.domain,
      answers: acc.answerIds.size,
      share: wilsonInterval(acc.answerIds.size, totalAnswers),
      pages,
      owner: ownedBy(acc.domain, self)
        ? 'self'
        : ownedBy(acc.domain, competitors)
          ? 'competitor'
          : 'third-party',
    })
  }

  return stats.sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain))
}

export interface SourceSummary {
  /** 인용을 하나라도 남긴 답변 수 */
  answersWithCitations: number
  totalAnswers: number
  /** 서로 다른 도메인 수 */
  distinctDomains: number
  /** 우리 도메인이 인용된 답변 수. 0이면 AI가 우리 사이트를 읽지 않는다. */
  selfAnswers: number
}

/**
 * 한 줄 요약.
 *
 * `selfAnswers === 0`은 리포트에서 가장 중요한 문장 중 하나다 — "AI가 당신
 * 사이트를 한 번도 읽지 않았습니다"는 언급률 0%보다 구체적이고, 무엇을 해야
 * 하는지가 바로 따라온다.
 */
export function summarizeSources(
  answers: readonly CitedAnswer[],
  stats: readonly SourceStat[],
): SourceSummary {
  const withCitations = new Set<string>()
  for (const a of answers) {
    if (a.citations.some((c) => citationDomain(c) !== null)) withCitations.add(a.answerId)
  }
  return {
    answersWithCitations: withCitations.size,
    totalAnswers: new Set(answers.map((a) => a.answerId)).size,
    distinctDomains: stats.length,
    selfAnswers: stats
      .filter((s) => s.owner === 'self')
      .reduce((max, s) => Math.max(max, s.answers), 0),
  }
}
