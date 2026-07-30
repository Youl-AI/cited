import { describe, expect, it } from 'vitest'
import type { AuditResult } from '@/lib/audit/result'
import { auditReportEmail } from '@/lib/email/templates'
import { wilsonInterval } from '@/lib/stats/wilson'

const result: AuditResult = {
  version: 1,
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
  engines: ['gemini'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  shareOfVoice: wilsonInterval(1, 3),
  ranking: [
    { name: '29CM', mentions: 2, isSelf: false },
    { name: '무신사', mentions: 1, isSelf: true },
  ],
  evidence: [
    {
      query: '러닝화 추천',
      engineId: 'gemini',
      text: '무신사가 좋습니다.',
      mentioned: true,
      context: '첫 번째로 언급',
      sentiment: 'recommended',
    },
  ],
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [{ queryText: '러닝화 추천', interval: wilsonInterval(0, 1) }],
  aliases: ['MUSINSA'],
  sources: [
    {
      domain: 'namu.wiki',
      answers: 2,
      share: wilsonInterval(2, 3),
      pages: [{ url: 'https://namu.wiki/w/x', title: '나무위키 - 무신사', answers: 2 }],
      owner: 'third-party',
    },
  ],
  sourceSummary: { totalAnswers: 3, answersWithCitations: 2, distinctDomains: 1, selfAnswers: 0 },
  hasSelfDomains: false,
  unresolved: 0,
}

const url = 'https://cited.co.kr/audit/aud_1'

describe('auditReportEmail', () => {
  it('제목에 브랜드명과 언급률을 담는다', () => {
    const mail = auditReportEmail({ result, url })
    expect(mail.subject).toContain('무신사')
    expect(mail.subject).toMatch(/\d+%/)
  })

  it('신뢰구간을 숫자와 함께 보여준다', () => {
    // ★ 33%만 쓰면 거짓말이다. 3회 측정 1건이면 구간이 [2%, 87%]다.
    //   이 넓이를 숨기면 첫 유료 리포트에서 숫자가 달라졌을 때 답할 수 없다.
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toContain('33%')
    expect(mail.html).toMatch(/\d+%\s*~\s*\d+%/)
  })

  it('큰 숫자 바로 옆에 신뢰구간을 붙인다', () => {
    // ★ 본문 어딘가에 구간이 있는 것만으로는 부족하다. 33%를 크게 보여주는
    //   블록에 구간이 없으면 고객은 그 숫자를 점추정으로 읽는다.
    //   (구간이 두 곳에 나오므로 "어딘가에 있는가"만 보는 단언은 큰 숫자 옆의
    //    구간을 지워도 통과했다 — 변이 테스트가 잡았다.)
    const mail = auditReportEmail({ result, url })
    const block = /font-size:34px[\s\S]{0,400}?<\/div>\s*<\/div>/.exec(mail.html)?.[0] ?? ''
    expect(block).toContain('33%')
    expect(block).toMatch(/\d+%\s*~\s*\d+%/)
  })

  it('측정 횟수가 적다는 사실과 유료의 차이를 말한다', () => {
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toMatch(/1회|3회 측정|주 3회/)
  })

  it('전체 리포트 링크를 담는다', () => {
    expect(auditReportEmail({ result, url }).html).toContain(url)
  })

  it('증거 원문을 담는다', () => {
    expect(auditReportEmail({ result, url }).html).toContain('무신사가 좋습니다.')
  })

  it('미언급 증거도 보여준다', () => {
    // ★ 0% 결과가 가장 흔하다. 증거가 없으면 "측정이 안 된 건가?"가 된다.
    const zero: AuditResult = {
      ...result,
      citedRate: wilsonInterval(0, 3),
      evidence: [
        {
          query: '러닝화 추천',
          engineId: 'gemini',
          text: '나이키를 추천합니다.',
          mentioned: false,
          context: null,
          sentiment: null,
        },
      ],
    }
    const mail = auditReportEmail({ result: zero, url })
    expect(mail.html).toContain('나이키를 추천합니다.')
    expect(mail.html).toMatch(/언급 없음|언급되지/)
  })

  it('인용 출처를 담는다', () => {
    // ★ 0% 고객이 메일에서 유일하게 얻어갈 수 있는 것이다. 링크를 눌러야
    //   보인다면 대부분은 못 본다.
    expect(auditReportEmail({ result, url }).html).toContain('namu.wiki')
  })

  it('인용이 하나도 없으면 출처 절을 빼고 던지지 않는다', () => {
    const noSources: AuditResult = {
      ...result,
      sources: [],
      sourceSummary: { ...result.sourceSummary, answersWithCitations: 0, distinctDomains: 0 },
    }
    const mail = auditReportEmail({ result: noSources, url })
    expect(mail.html).not.toContain('AI가 읽는 출처')
  })

  it('도메인을 모르면 "우리 사이트 인용 없음"을 쓰지 않는다', () => {
    expect(auditReportEmail({ result, url }).html).not.toMatch(/한 번도 인용되지 않/)
  })

  it('도메인을 모르면 알려 달라고 요청한다', () => {
    // "모른다"를 침묵으로 두면 고객은 그 줄이 왜 없는지 알 수 없다.
    expect(auditReportEmail({ result, url }).html).toMatch(/사이트 주소를 알려/)
  })

  it('도메인을 알고 0회면 그 사실을 쓴다', () => {
    const mail = auditReportEmail({ result: { ...result, hasSelfDomains: true }, url })
    expect(mail.html).toMatch(/한 번도 인용되지 않/)
  })

  it('도메인을 알고 1회 이상이면 인용됐다고 쓴다', () => {
    const mail = auditReportEmail({
      result: {
        ...result,
        hasSelfDomains: true,
        sourceSummary: { ...result.sourceSummary, selfAnswers: 2 },
      },
      url,
    })
    expect(mail.html).toMatch(/2개 답변에서 인용/)
    expect(mail.html).not.toMatch(/한 번도 인용되지 않/)
  })

  it('경쟁사가 없으면 Share of Voice를 아예 쓰지 않는다', () => {
    // n=0은 "측정 없음"이다. 0%로 보이면 안 된다.
    const noCompetitors: AuditResult = {
      ...result,
      competitors: [],
      shareOfVoice: wilsonInterval(0, 0),
      ranking: [{ name: '무신사', mentions: 1, isSelf: true }],
    }
    const mail = auditReportEmail({ result: noCompetitors, url })
    expect(mail.html).not.toContain('Share of Voice')
    expect(mail.html).not.toContain('점유율')
  })

  it('경쟁사가 있으면 분모와 경쟁사 목록을 함께 보여준다', () => {
    // ★ 경쟁사를 적게 등록할수록 SoV가 높아진다. 측정의 성질이지 성과가
    //   아니므로, 숫자만 두면 고객이 성과로 읽는다.
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toContain('29CM')
  })

  it('미판정이 있으면 표시한다', () => {
    const mail = auditReportEmail({ result: { ...result, unresolved: 2 }, url })
    expect(mail.html).toMatch(/미판정|판정하지 못/)
  })

  it('미판정이 0이면 그 줄을 쓰지 않는다', () => {
    const mail = auditReportEmail({ result, url })
    expect(mail.html).not.toMatch(/판정하지 못/)
  })

  it('측정에 쓴 표기를 보여준다', () => {
    // ★ 별칭이 언급률을 좌우한다. 어떤 표기로 쟀는지 보여주지 않으면 고객이
    //   빠진 표기를 알려줄 수 없고, 그것이 유일한 복구 경로다.
    const mail = auditReportEmail({ result, url })
    expect(mail.html).toContain('MUSINSA')
  })

  it('HTML을 이스케이프한다', () => {
    const mail = auditReportEmail({
      result: { ...result, brandName: '<img src=x onerror=alert(1)>' },
      url,
    })
    expect(mail.html).not.toContain('<img src=x')
  })

  it('증거 원문과 출처 도메인도 이스케이프한다', () => {
    // 답변 원문은 AI가 만든 것이고 무엇이 들어 있을지 모른다.
    const mail = auditReportEmail({
      result: {
        ...result,
        evidence: [{ ...result.evidence[0]!, text: '<script>alert(1)</script>' }],
        sources: [{ ...result.sources[0]!, domain: '<b>x</b>.com' }],
      },
      url,
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<b>x</b>.com')
  })

  it('링크 URL도 이스케이프한다', () => {
    const mail = auditReportEmail({ result, url: 'https://x" onmouseover="y' })
    expect(mail.html).not.toContain('onmouseover="y"')
  })
})
