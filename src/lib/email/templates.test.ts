import { describe, expect, it } from 'vitest'
import { verificationEmail, weeklyReportEmail } from '@/lib/email/templates'

describe('verificationEmail', () => {
  it('제목과 본문에 링크가 들어간다', () => {
    const mail = verificationEmail({ url: 'https://cited.test/verify?t=abc' })
    expect(mail.subject).toContain('이메일')
    expect(mail.html).toContain('https://cited.test/verify?t=abc')
  })

  it('HTML 특수문자를 이스케이프한다', () => {
    const mail = verificationEmail({ url: 'https://x.test/?a=1&b=2' })
    expect(mail.html).toContain('a=1&amp;b=2')
    expect(mail.html).not.toContain('a=1&b=2')
  })
})

describe('weeklyReportEmail', () => {
  it('Cited Rate와 대시보드 링크를 담는다', () => {
    const mail = weeklyReportEmail({
      brandName: '무신사',
      citedRate: 0.34,
      dashboardUrl: 'https://cited.test/dashboard',
      changed: false,
    })
    expect(mail.subject).toContain('무신사')
    expect(mail.html).toContain('34%')
    expect(mail.html).toContain('https://cited.test/dashboard')
  })

  it('변화가 없으면 화살표를 쓰지 않는다', () => {
    const mail = weeklyReportEmail({
      brandName: 'X',
      citedRate: 0.1,
      dashboardUrl: 'https://x.test',
      changed: false,
    })
    expect(mail.html).not.toMatch(/[▲▼]/)
  })
})
