import { describe, expect, it } from 'vitest'
import {
  auditRequestedNotice,
  auditVerificationEmail,
  measureFailureNotice,
} from '@/lib/email/templates'

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

describe('measureFailureNotice', () => {
  const base = {
    brandName: '무신사',
    brandId: 'brd_1',
    reason: '수집이 전부 실패했습니다 (12회 시도)',
    attempt: 1,
  }

  it('브랜드·id·시도·사유를 담는다', () => {
    // 운영자가 이 메일 하나로 "어느 브랜드가 왜 몇 번째로 실패했나"를 알아야
    // 한다 — 정기 측정 실패의 유일한 신호다.
    const mail = measureFailureNotice(base)
    for (const s of ['무신사', 'brd_1', '1 / 2', '수집이 전부 실패했습니다 (12회 시도)']) {
      expect(mail.html).toContain(s)
    }
  })

  it('1번째 시도면 자동 재시도를, 2번째면 회차 건너뜀을 알린다', () => {
    // 두 문구가 같으면 운영자가 지금 개입해야 하는지 판단할 수 없다.
    expect(measureFailureNotice(base).html).toContain('자동 재시도')
    expect(measureFailureNotice({ ...base, attempt: 2 }).html).toContain('건너뜁니다')
    expect(measureFailureNotice({ ...base, attempt: 2 }).html).not.toContain('자동 재시도')
  })

  it('제목에 브랜드명과 시도 회차가 있다', () => {
    // 15분 간격으로 여러 통이 쌓이므로 제목만 보고 구분해야 한다.
    const mail = measureFailureNotice(base)
    expect(mail.subject).toContain('무신사')
    expect(mail.subject).toContain('1번째')
  })

  it('본문의 HTML을 이스케이프한다', () => {
    // ★ reason에는 엔진 오류 원문이, brandName에는 **고객이 입력한 문자열**이
    //   그대로 실린다. 운영자 메일함에서 실행되면 피해는 우리 계정에서 난다.
    const mail = measureFailureNotice({
      ...base,
      brandName: '<script>x</script>',
      reason: '<img src=x onerror=y> HTTP 500',
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('사유의 따옴표가 속성을 탈출하지 못한다', () => {
    // 오류 메시지에는 따옴표가 흔하다(`Invalid "model"` 등).
    const mail = measureFailureNotice({ ...base, reason: '" onmouseover="alert(1)' })
    expect(mail.html).not.toContain('onmouseover="alert(1)"')
    expect(mail.html).toContain('&quot;')
  })

  it('제목은 이스케이프하지 않는다 — 평문 헤더다', () => {
    // 위 두 템플릿의 같은 이름 테스트와 이유가 같다(MIME 헤더는 평문이다).
    expect(measureFailureNotice({ ...base, brandName: 'H&M' }).subject).toContain('H&M')
  })

  it('긴 사유는 500자로 자른다', () => {
    // 엔진이 응답 본문을 통째로 실어 던지는 경우가 있다. 메일이 수십 KB가
    // 되면 클라이언트가 본문을 잘라 정작 필요한 앞부분까지 가려진다.
    const mail = measureFailureNotice({ ...base, reason: 'x'.repeat(900) })
    expect(mail.html).toContain('x'.repeat(500))
    expect(mail.html).not.toContain('x'.repeat(501))
  })
})
