import { describe, expect, it } from 'vitest'
import {
  aggregateSources,
  citationDomain,
  summarizeSources,
  type Citation,
  type CitedAnswer,
} from '@/lib/stats/sources'

function answer(id: string, ...urls: string[]): CitedAnswer {
  return { answerId: id, citations: urls.map((url) => ({ url, title: `제목 ${url}` })) }
}

/** citationDomain은 Citation을 받는다 — 테스트에서 URL만 넘길 때 쓴다. */
function cite(url: string, domain?: string): Citation {
  return { url, title: '제목', ...(domain ? { domain } : {}) }
}

describe('citationDomain', () => {
  it('호스트명을 뽑아낸다', () => {
    expect(citationDomain(cite('https://namu.wiki/w/무신사'))).toBe('namu.wiki')
  })

  it('www만 벗긴다', () => {
    expect(citationDomain(cite('https://www.nike.com/kr/a/b'))).toBe('nike.com')
  })

  it('서브도메인은 남긴다', () => {
    // eTLD+1을 계산하지 않는다. 대가로 이게 따로 집계되지만 알아볼 수 있는 분리다.
    expect(citationDomain(cite('https://corp.musinsa.com/ko'))).toBe('corp.musinsa.com')
  })

  it('.co.kr을 잘라먹지 않는다', () => {
    // "뒤 두 레이블"로 eTLD+1을 흉내 내면 서로 다른 회사가 co.kr로 묶인다.
    expect(citationDomain(cite('https://musinsa.co.kr/a'))).toBe('musinsa.co.kr')
    expect(citationDomain(cite('https://29cm.co.kr/b'))).toBe('29cm.co.kr')
  })

  it('대문자 호스트는 URL 파싱이 소문자로 통일해준다', () => {
    expect(citationDomain(cite('https://NAMU.WIKI/w/x'))).toBe('namu.wiki')
  })

  it('파싱 불가한 값은 null이다', () => {
    expect(citationDomain(cite('그냥 문자열'))).toBeNull()
    expect(citationDomain(cite(''))).toBeNull()
  })

  it('엔진이 알려준 domain이 URL보다 우선한다', () => {
    // Gemini 실측: URI가 리다이렉트 프록시라 URL을 파싱하면 모든 출처가
    // vertexaisearch.cloud.google.com 하나로 뭉개져 집계가 무의미해진다.
    expect(
      citationDomain(
        cite('https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ', 'tistory.com'),
      ),
    ).toBe('tistory.com')
  })

  it('엔진이 알려준 domain도 정규화한다', () => {
    expect(citationDomain(cite('https://x.com/a', 'WWW.Tistory.COM'))).toBe('tistory.com')
  })

  it('엔진이 domain을 안 주면 URL에서 뽑는다', () => {
    expect(citationDomain(cite('https://nike.com/a'))).toBe('nike.com')
  })
})

describe('aggregateSources', () => {
  it('도메인별로 인용한 답변 수를 센다', () => {
    const stats = aggregateSources([
      answer('a1', 'https://namu.wiki/1'),
      answer('a2', 'https://namu.wiki/2'),
      answer('a3', 'https://other.com/1'),
    ])
    expect(stats.map((s) => [s.domain, s.answers])).toEqual([
      ['namu.wiki', 2],
      ['other.com', 1],
    ])
  })

  it('한 답변이 같은 페이지를 여러 번 인용해도 1로 센다', () => {
    // 원시 인용을 세면 답변이 길수록 출처가 중요해 보인다 — 그건 출처의
    // 영향력이 아니라 답변의 길이다.
    const stats = aggregateSources([
      answer('a1', 'https://namu.wiki/1', 'https://namu.wiki/1', 'https://namu.wiki/1'),
    ])
    expect(stats[0]?.answers).toBe(1)
    expect(stats[0]?.pages[0]?.answers).toBe(1)
  })

  it('한 답변이 같은 도메인의 다른 페이지를 인용하면 도메인은 1, 페이지는 각각 1이다', () => {
    const stats = aggregateSources([answer('a1', 'https://namu.wiki/1', 'https://namu.wiki/2')])
    expect(stats[0]?.answers).toBe(1)
    expect(stats[0]?.pages).toHaveLength(2)
  })

  it('인용 0건인 답변도 분모에 들어간다', () => {
    // 인용 있는 답변만 넘기면 모든 출처의 비율이 부풀려진다.
    const stats = aggregateSources([
      answer('a1', 'https://namu.wiki/1'),
      answer('a2'),
      answer('a3'),
      answer('a4'),
    ])
    expect(stats[0]?.share.n).toBe(4)
    expect(stats[0]?.share.point).toBeCloseTo(0.25, 10)
  })

  it('비율을 신뢰구간으로 준다 (무료 진단은 n=3이다)', () => {
    const stats = aggregateSources([
      answer('a1', 'https://namu.wiki/1'),
      answer('a2', 'https://namu.wiki/2'),
      answer('a3'),
    ])
    const share = stats[0]!.share
    expect(share.k).toBe(2)
    expect(share.n).toBe(3)
    // 3개 중 2개면 점추정 67%지만 구간은 매우 넓다. 점추정만 보여주면 거짓말이다.
    expect(share.lower).toBeLessThan(0.3)
    expect(share.upper).toBeGreaterThan(0.9)
  })

  it('같은 answerId가 두 번 와도 분모가 부풀지 않는다', () => {
    const stats = aggregateSources([
      answer('dup', 'https://a.com/1'),
      answer('dup', 'https://b.com/1'),
    ])
    expect(stats[0]?.share.n).toBe(1)
  })

  it('답변 수 내림차순으로 정렬한다', () => {
    const stats = aggregateSources([
      answer('a1', 'https://low.com/1'),
      answer('a2', 'https://high.com/1'),
      answer('a3', 'https://high.com/1'),
    ])
    expect(stats[0]?.domain).toBe('high.com')
  })

  it('동률이면 도메인 사전순 — 순서가 결정적이다', () => {
    // 리포트를 두 번 만들면 같은 결과가 나와야 한다.
    const stats = aggregateSources([answer('a1', 'https://zzz.com/1', 'https://aaa.com/1')])
    expect(stats.map((s) => s.domain)).toEqual(['aaa.com', 'zzz.com'])
  })

  it('페이지도 답변 수 내림차순, 동률이면 URL 사전순이다', () => {
    const stats = aggregateSources([
      answer('a1', 'https://n.com/hot', 'https://n.com/zzz'),
      answer('a2', 'https://n.com/hot', 'https://n.com/aaa'),
    ])
    expect(stats[0]?.pages.map((p) => p.url)).toEqual([
      'https://n.com/hot',
      'https://n.com/aaa',
      'https://n.com/zzz',
    ])
  })

  it('우리 도메인과 경쟁사 도메인을 분류한다', () => {
    const stats = aggregateSources(
      [answer('a1', 'https://musinsa.com/a', 'https://29cm.co.kr/b', 'https://namu.wiki/c')],
      { selfDomains: ['musinsa.com'], competitorDomains: ['29cm.co.kr'] },
    )
    const owners = Object.fromEntries(stats.map((s) => [s.domain, s.owner]))
    expect(owners).toEqual({
      'musinsa.com': 'self',
      '29cm.co.kr': 'competitor',
      'namu.wiki': 'third-party',
    })
  })

  it('소유 도메인 지정에 www와 대문자가 섞여도 맞춘다', () => {
    const stats = aggregateSources([answer('a1', 'https://www.Musinsa.com/a')], {
      selfDomains: ['WWW.musinsa.com'],
    })
    expect(stats[0]?.owner).toBe('self')
  })

  it('하위 도메인도 우리 것으로 본다', () => {
    // 실측에서 corp.musinsa.com이 인용됐는데 "우리 사이트 인용 0건"으로
    // 분류될 상황이었다. 리포트에 거짓이 적힌다.
    const stats = aggregateSources([answer('a1', 'https://corp.musinsa.com/ko')], {
      selfDomains: ['musinsa.com'],
    })
    expect(stats[0]?.owner).toBe('self')
  })

  it('접미사가 같아도 점 경계가 아니면 우리 것이 아니다', () => {
    // endsWith만 쓰면 fakemusinsa.com이 우리 것으로 잡힌다.
    const stats = aggregateSources([answer('a1', 'https://fakemusinsa.com/a')], {
      selfDomains: ['musinsa.com'],
    })
    expect(stats[0]?.owner).toBe('third-party')
  })

  it('경쟁사 하위 도메인도 경쟁사로 본다', () => {
    const stats = aggregateSources([answer('a1', 'https://official.zigzag.kr/a')], {
      competitorDomains: ['zigzag.kr'],
    })
    expect(stats[0]?.owner).toBe('competitor')
  })

  it('우리 도메인이 경쟁사에도 들어 있으면 우리 것이 이긴다', () => {
    const stats = aggregateSources([answer('a1', 'https://x.com/a')], {
      selfDomains: ['x.com'],
      competitorDomains: ['x.com'],
    })
    expect(stats[0]?.owner).toBe('self')
  })

  it('파싱 불가한 URL은 집계에서 뺀다', () => {
    const stats = aggregateSources([answer('a1', '그냥 문자열', 'https://ok.com/1')])
    expect(stats.map((s) => s.domain)).toEqual(['ok.com'])
  })

  it('제목이 비면 URL을 제목으로 쓴다', () => {
    const stats = aggregateSources([{ answerId: 'a1', citations: [{ url: 'https://a.com/1', title: '' }] }])
    expect(stats[0]?.pages[0]?.title).toBe('https://a.com/1')
  })

  it('입력이 없으면 빈 배열이다', () => {
    expect(aggregateSources([])).toEqual([])
  })

  it('인용이 하나도 없으면 빈 배열이다', () => {
    expect(aggregateSources([answer('a1'), answer('a2')])).toEqual([])
  })
})

describe('summarizeSources', () => {
  it('인용을 남긴 답변 수를 센다', () => {
    const answers = [answer('a1', 'https://a.com/1'), answer('a2'), answer('a3', 'https://b.com/1')]
    const s = summarizeSources(answers, aggregateSources(answers))
    expect(s.answersWithCitations).toBe(2)
    expect(s.totalAnswers).toBe(3)
    expect(s.distinctDomains).toBe(2)
  })

  it('우리 사이트가 인용된 답변 수를 알려준다', () => {
    const answers = [
      answer('a1', 'https://musinsa.com/a'),
      answer('a2', 'https://musinsa.com/b'),
      answer('a3', 'https://namu.wiki/c'),
    ]
    const stats = aggregateSources(answers, { selfDomains: ['musinsa.com'] })
    expect(summarizeSources(answers, stats).selfAnswers).toBe(2)
  })

  it('우리 사이트가 한 번도 인용되지 않으면 0이다', () => {
    // 리포트에서 가장 중요한 문장 중 하나다 — 언급률 0%보다 구체적이다.
    const answers = [answer('a1', 'https://namu.wiki/c')]
    const stats = aggregateSources(answers, { selfDomains: ['musinsa.com'] })
    expect(summarizeSources(answers, stats).selfAnswers).toBe(0)
  })

  it('우리 도메인이 여러 개면 가장 많이 인용된 쪽을 쓴다 (합치지 않는다)', () => {
    // 합치면 같은 답변이 두 도메인을 인용했을 때 이중 계상된다.
    const answers = [answer('a1', 'https://musinsa.com/a', 'https://corp.musinsa.com/b')]
    const stats = aggregateSources(answers, {
      selfDomains: ['musinsa.com', 'corp.musinsa.com'],
    })
    expect(summarizeSources(answers, stats).selfAnswers).toBe(1)
  })

  it('파싱 불가한 인용만 있는 답변은 인용 있는 답변으로 세지 않는다', () => {
    const answers = [answer('a1', '그냥 문자열')]
    expect(summarizeSources(answers, aggregateSources(answers)).answersWithCitations).toBe(0)
  })

  it('빈 입력을 처리한다', () => {
    expect(summarizeSources([], [])).toEqual({
      answersWithCitations: 0,
      totalAnswers: 0,
      distinctDomains: 0,
      selfAnswers: 0,
    })
  })
})
