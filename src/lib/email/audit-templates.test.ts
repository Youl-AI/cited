import { describe, expect, it } from 'vitest'
import { auditRequestedNotice, auditVerificationEmail } from '@/lib/email/templates'

describe('auditVerificationEmail', () => {
  it('인증 링크와 브랜드명을 담는다', () => {
    const mail = auditVerificationEmail({
      url: 'https://cited.co.kr/api/audit/verify?token=abc',
      brandName: '무신사',
    })
    expect(mail.subject).toContain('무신사')
    expect(mail.html).toContain('https://cited.co.kr/api/audit/verify?token=abc')
  })

  it('토큰의 &를 이스케이프해도 링크가 깨지지 않는다', () => {
    // base64url에는 &가 없지만 URL에 파라미터가 하나 더 붙는 날이 온다.
    // `&`를 `&amp;`로 쓰는 것이 HTML 속성에서 올바르고, 브라우저가 되돌려 읽는다.
    const mail = auditVerificationEmail({
      url: 'https://cited.co.kr/api/audit/verify?token=abc&x=1',
      brandName: 'A',
    })
    expect(mail.html).toContain('token=abc&amp;x=1')
    expect(mail.html).not.toContain('token=abc&x=1')
  })

  it('언제 결과를 받는지 말한다', () => {
    // 즉시 결과가 아니므로 기다림을 명시하지 않으면 이탈한다.
    const mail = auditVerificationEmail({ url: 'https://x', brandName: 'A' })
    expect(mail.html).toMatch(/영업일|1일|24시간/)
  })

  it('확인하지 않으면 아무것도 실행되지 않는다고 알린다', () => {
    // 본인이 신청하지 않은 사람에게는 이 문장이 유일한 안심 근거다.
    const mail = auditVerificationEmail({ url: 'https://x', brandName: 'A' })
    expect(mail.html).toMatch(/무시/)
  })

  it('본문의 HTML을 이스케이프한다', () => {
    const mail = auditVerificationEmail({ url: 'https://x', brandName: '<script>x</script>' })
    expect(mail.html).not.toContain('<script>')
  })

  it('제목은 이스케이프하지 않는다 — 평문 헤더다', () => {
    // ★ 메일 제목은 MIME 헤더로 나가고 메일 클라이언트가 **평문으로** 렌더한다.
    //   HTML 파서를 타지 않으므로 `<script>`가 실행될 곳이 없고, 반대로
    //   이스케이프하면 `H&M` 같은 실제 브랜드명이 제목에 `H&amp;M`으로 보인다.
    //   본문(html)은 이스케이프한다 — 그쪽은 실제로 파싱된다.
    expect(auditVerificationEmail({ url: 'https://x', brandName: 'H&M' }).subject).toContain('H&M')
  })

  it('브랜드명의 따옴표가 링크 속성을 탈출하지 못한다', () => {
    // 제목은 텍스트라 이스케이프가 필요 없지만 본문은 속성 안에 들어간다.
    const mail = auditVerificationEmail({ url: 'https://x" onerror="y', brandName: 'A' })
    expect(mail.html).not.toContain('onerror="y"')
    expect(mail.html).toContain('&quot;')
  })
})

describe('auditRequestedNotice', () => {
  const audit = {
    id: 'aud_1',
    brandName: '무신사',
    category: '패션',
    competitors: ['29CM'],
    email: 'someone@example.com',
  }

  it('운영자가 바로 실행할 수 있게 명령을 담는다', () => {
    const mail = auditRequestedNotice({ audit })
    expect(mail.html).toContain('pnpm audit:run aud_1')
  })

  it('브랜드·카테고리·경쟁사를 담는다', () => {
    const mail = auditRequestedNotice({ audit })
    for (const s of ['무신사', '패션', '29CM']) expect(mail.html).toContain(s)
  })

  it('제목에 브랜드명이 있다', () => {
    // 여러 건이 쌓이면 제목만 보고 구분해야 한다.
    expect(auditRequestedNotice({ audit }).subject).toContain('무신사')
  })

  it('신청자 이메일을 마스킹한다', () => {
    // 운영자 메일함도 유출 경로다. 실행에 필요한 것은 id지 이메일이 아니다.
    const mail = auditRequestedNotice({ audit })
    expect(mail.html).not.toContain('someone@example.com')
  })

  it('경쟁사가 없으면 없다고 쓴다', () => {
    const mail = auditRequestedNotice({ audit: { ...audit, competitors: [] } })
    expect(mail.html).toContain('없음')
  })

  it('사이트 주소가 있으면 담고 없으면 없다고 쓴다', () => {
    // 운영자가 `audit:run` 전에 소유 판정이 가능한 건인지 알아야 한다.
    const withDomain = auditRequestedNotice({
      audit: { ...audit, selfDomains: ['musinsa.com'] },
    })
    expect(withDomain.html).toContain('musinsa.com')
    expect(auditRequestedNotice({ audit }).html).toMatch(/없음/)
  })

  it('신청 내용의 HTML을 이스케이프한다', () => {
    // 신청 내용은 임의의 사용자 입력이다. 운영자 메일함에서 실행되면
    // 그 피해는 우리 계정에서 난다.
    const mail = auditRequestedNotice({
      audit: {
        ...audit,
        brandName: '<script>x</script>',
        category: '<img onerror=y>',
        competitors: ['<b>c</b>'],
      },
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).not.toContain('<b>c</b>')
  })

  it('제목은 이스케이프하지 않는다 — 평문 헤더다', () => {
    // 위 auditVerificationEmail의 같은 이름 테스트와 이유가 같다.
    expect(auditRequestedNotice({ audit: { ...audit, brandName: 'H&M' } }).subject).toContain('H&M')
  })

  it('id도 이스케이프한다', () => {
    // id는 우리가 만들지만, 그 사실이 템플릿 안에서 보이지 않는다.
    const mail = auditRequestedNotice({ audit: { ...audit, id: 'aud_<x>' } })
    expect(mail.html).not.toContain('aud_<x>')
    expect(mail.html).toContain('aud_&lt;x&gt;')
  })
})
