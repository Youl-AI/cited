import { describe, expect, it } from 'vitest'
import { SELF_SUBJECT, competitorSubject, parseSubject } from '@/lib/detection/subject'

describe('subject 조립·해체', () => {
  it('만든 값을 그대로 되읽는다', () => {
    expect(parseSubject(competitorSubject('29CM'))).toEqual({
      kind: 'competitor',
      canonical: '29CM',
    })
    expect(parseSubject(SELF_SUBJECT)).toEqual({ kind: 'self' })
  })

  it('이름에 콜론이 들어가도 온전히 되읽는다', () => {
    // 첫 콜론에서만 자른다. `split(':')[1]`로 구현하면 이름이 잘린다.
    const name = 'A:B:C'
    expect(parseSubject(competitorSubject(name))).toEqual({ kind: 'competitor', canonical: name })
  })

  it('접두사 없는 브랜드명을 경쟁사로 읽지 않는다', () => {
    // ★ 이것이 이 모듈이 생긴 이유다. 접두사 없이 브랜드명을 그대로 비교하면
    //   언급 수가 전부 0이 되는데, 지표 쪽 숫자는 정상이라 "언급률 33%인데
    //   순위표에는 아무도 언급되지 않음"인 리포트가 나간다.
    expect(parseSubject('29CM')).toBeNull()
    expect(parseSubject('무신사')).toBeNull()
  })

  it('이름 없는 경쟁사를 거부한다', () => {
    // 순위표에 빈 줄이 생긴다.
    expect(parseSubject('competitor:')).toBeNull()
  })

  it('빈 문자열과 유사 접두사를 거부한다', () => {
    for (const bad of ['', 'self ', 'SELF', 'Competitor:29CM', 'competitors:29CM']) {
      expect(parseSubject(bad), bad).toBeNull()
    }
  })

  it('self는 접두사 규약과 섞이지 않는다', () => {
    // 경쟁사 이름이 실제로 'self'여도 우리 브랜드로 오인되지 않는다.
    expect(parseSubject(competitorSubject('self'))).toEqual({
      kind: 'competitor',
      canonical: 'self',
    })
  })
})
