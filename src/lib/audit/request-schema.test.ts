import { describe, expect, it } from 'vitest'
import { MAX_COMPETITORS, parseAuditRequest, parseHostname } from '@/lib/audit/request-schema'
import { PLANS } from '@/lib/plans'

const valid = {
  brandName: '무신사',
  category: '패션',
  email: 'a@example.com',
  competitors: ['29CM', 'W컨셉'],
}

describe('parseAuditRequest', () => {
  it('정상 입력을 통과시킨다', () => {
    // ★ 출력에는 `siteUrl`·`selfDomains`가 항상 있다(기본값). 입력과 같기를
    //   기대하면 선택 항목이 추가될 때 이 테스트가 이유 없이 깨진다.
    expect(parseAuditRequest(valid)).toEqual({ ...valid, siteUrl: '', selfDomains: [] })
  })

  it('앞뒤 공백을 제거한다', () => {
    const r = parseAuditRequest({ ...valid, brandName: '  무신사  ', email: ' a@example.com ' })
    expect(r.brandName).toBe('무신사')
    expect(r.email).toBe('a@example.com')
  })

  it('이메일을 소문자로 정규화한다', () => {
    // 같은 사람이 대소문자만 바꿔 여러 번 신청하는 것을 세려면 정규화가 필요하다.
    expect(parseAuditRequest({ ...valid, email: 'A@Example.COM' }).email).toBe('a@example.com')
  })

  it('경쟁사를 생략할 수 있다', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { competitors: _omit, ...withoutCompetitors } = valid
    expect(parseAuditRequest(withoutCompetitors).competitors).toEqual([])
  })

  it('경쟁사 중복과 빈 값을 걷어낸다', () => {
    const r = parseAuditRequest({ ...valid, competitors: ['29CM', '', '  ', '29CM', 'W컨셉'] })
    expect(r.competitors).toEqual(['29CM', 'W컨셉'])
  })

  it('경쟁사의 앞뒤 공백도 제거한 뒤 중복을 센다', () => {
    // '29CM'과 ' 29CM '이 다른 값으로 남으면 Share of Voice가 같은 회사를 두 번 센다.
    expect(parseAuditRequest({ ...valid, competitors: [' 29CM ', '29CM'] }).competitors).toEqual([
      '29CM',
    ])
  })

  it('경쟁사가 브랜드 자신과 같으면 걷어낸다', () => {
    // 자기 자신이 경쟁사로 들어가면 Share of Voice가 자기를 두 번 센다.
    const r = parseAuditRequest({ ...valid, competitors: ['무신사', '29CM'] })
    expect(r.competitors).toEqual(['29CM'])
  })

  it('브랜드명에 공백이 섞여 있어도 자기 자신을 걷어낸다', () => {
    // 걷어내기를 trim 전 값으로 비교하면 '  무신사  '가 '무신사'를 못 걸러낸다.
    const r = parseAuditRequest({ ...valid, brandName: '  무신사  ', competitors: ['무신사'] })
    expect(r.competitors).toEqual([])
  })

  it(`경쟁사는 ${MAX_COMPETITORS}개를 넘을 수 없다`, () => {
    expect(() => parseAuditRequest({ ...valid, competitors: ['a', 'b', 'c', 'd'] })).toThrow()
    expect(() => parseAuditRequest({ ...valid, competitors: ['a', 'b', 'c'] })).not.toThrow()
  })

  it('경쟁사 한도가 무료 플랜 설정과 같다', () => {
    // 다르면 폼이 받아준 경쟁사를 측정이 버리거나(또는 그 반대) 리포트가
    // 신청 내용과 어긋난다.
    expect(MAX_COMPETITORS).toBe(PLANS.free.maxCompetitors)
  })

  it('중복을 걷어낸 뒤에 개수를 센다', () => {
    // 사용자가 실수로 같은 값을 두 번 넣은 것 때문에 거부당하면 안 된다.
    const r = parseAuditRequest({ ...valid, competitors: ['a', 'a', 'b', 'b', 'c'] })
    expect(r.competitors).toEqual(['a', 'b', 'c'])
  })

  it('잘못된 이메일을 거부한다', () => {
    for (const email of ['', 'a', 'a@', '@b.com', 'a b@c.com']) {
      expect(() => parseAuditRequest({ ...valid, email }), email).toThrow()
    }
  })

  it('빈 브랜드명·카테고리를 거부한다', () => {
    expect(() => parseAuditRequest({ ...valid, brandName: '   ' })).toThrow()
    expect(() => parseAuditRequest({ ...valid, category: '' })).toThrow()
  })

  it('지나치게 긴 입력을 거부한다', () => {
    // 길이 제한이 없으면 신청 테이블에 소설을 넣을 수 있다.
    expect(() => parseAuditRequest({ ...valid, brandName: 'ㄱ'.repeat(101) })).toThrow()
    expect(() => parseAuditRequest({ ...valid, category: 'ㄱ'.repeat(101) })).toThrow()
  })

  it('경쟁사 이름도 길이를 제한한다', () => {
    // 브랜드명만 막으면 경쟁사 칸이 그대로 우회로가 된다.
    expect(() => parseAuditRequest({ ...valid, competitors: ['ㄱ'.repeat(101)] })).toThrow()
  })

  it('객체가 아닌 입력에 던진다', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(() => parseAuditRequest(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('스키마에 없는 키는 결과에 담지 않는다', () => {
    // 라우트가 결과를 그대로 리포지토리에 넘긴다. 통과한 키가 늘어나면
    // drizzle이 모르는 컬럼을 만난다.
    const r = parseAuditRequest({ ...valid, status: 'sent', source: 'kmong' })
    expect(Object.keys(r).sort()).toEqual(
      ['brandName', 'category', 'competitors', 'email', 'selfDomains', 'siteUrl'].sort(),
    )
  })

  // ★ 2026-07-30(2) — 사이트 주소 (인용 출처의 소유 판정용)
  it('사이트 주소를 생략할 수 있다', () => {
    expect(parseAuditRequest(valid).selfDomains).toEqual([])
  })

  it('여러 형태의 주소에서 호스트명만 뽑는다', () => {
    const cases: [string, string][] = [
      ['musinsa.com', 'musinsa.com'],
      ['https://www.musinsa.com', 'musinsa.com'],
      ['http://musinsa.com/kr/main', 'musinsa.com'],
      ['WWW.Musinsa.CO.KR', 'musinsa.co.kr'],
      ['  https://corp.musinsa.com/about  ', 'corp.musinsa.com'],
    ]
    for (const [input, expected] of cases) {
      expect(parseAuditRequest({ ...valid, siteUrl: input }).selfDomains, input).toEqual([expected])
    }
  })

  it('알아볼 수 없는 주소를 거부한다 (조용히 버리지 않는다)', () => {
    // ★ 조용히 버리면 고객은 넣었다고 믿고, 리포트에는 그 줄이 없다.
    for (const bad of ['무신사', 'localhost', 'not a url', 'http://']) {
      expect(() => parseAuditRequest({ ...valid, siteUrl: bad }), bad).toThrow()
    }
  })

  it('빈 사이트 주소는 거부하지 않는다', () => {
    // 선택 항목이다. 빈 칸을 남긴 것을 오류로 만들면 신청이 막힌다.
    for (const blank of ['', '   ']) {
      expect(parseAuditRequest({ ...valid, siteUrl: blank }).selfDomains, blank).toEqual([])
    }
  })
})

describe('parseHostname', () => {
  it('호스트명이 아닌 입력에 null을 돌려준다', () => {
    for (const bad of ['', '   ', '무신사', 'localhost', 'not a url', 'http://', 'https://']) {
      expect(parseHostname(bad), bad).toBeNull()
    }
  })

  it('스킴이 없어도 붙여서 파싱한다', () => {
    expect(parseHostname('musinsa.com/kr')).toBe('musinsa.com')
  })

  it('www.만 떼고 다른 서브도메인은 남긴다', () => {
    // corp.musinsa.com과 musinsa.com은 다른 사이트다. 무조건 첫 라벨을 떼면
    // 고객 사이트 인용을 남의 것으로 판정한다.
    expect(parseHostname('https://www.musinsa.com')).toBe('musinsa.com')
    expect(parseHostname('https://shop.musinsa.com')).toBe('shop.musinsa.com')
  })

  it('대문자를 소문자로 정규화한다', () => {
    // 인용 출처 도메인과 문자열로 비교하므로 표기가 갈리면 못 맞춘다.
    expect(parseHostname('HTTPS://WWW.MUSINSA.COM')).toBe('musinsa.com')
  })

  it('포트와 쿼리를 떼어낸다', () => {
    expect(parseHostname('https://musinsa.com:8443/a?b=c#d')).toBe('musinsa.com')
  })

  it('http(s) 이외의 스킴을 거부한다', () => {
    // `javascript:`·`data:`가 호스트명으로 통과하면 리포트에 그대로 실린다.
    // `ftp://`·`file:///`는 점 없는 호스트('ftp','file')가 되어 걸러진다.
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<b>x',
      'ftp://musinsa.com',
      'file:///etc/passwd',
    ]) {
      expect(parseHostname(bad), bad).toBeNull()
    }
  })

  it('mailto:는 도메인 부분을 뽑는다 — 이 동작을 고정한다', () => {
    // 고객이 `mailto:contact@musinsa.com`을 붙여넣는 일이 실제로 있다.
    // 결과가 musinsa.com이라 원하는 값과 맞아떨어지지만, 그건 URL 파서가
    // `@` 앞을 credential로 읽은 부수효과다. 의도한 값과 같으니 그대로 두되,
    // 조용히 바뀌지 않게 못박는다.
    expect(parseHostname('mailto:contact@musinsa.com')).toBe('musinsa.com')
  })
})
