import { describe, expect, it } from 'vitest'
import { parseBaseUrlFlag, reportUrl, resolveReportBaseUrl } from '@/lib/audit/report-url'

describe('resolveReportBaseUrl', () => {
  // ★ 이 테스트가 막으려는 것: 2026-07-30 첫 실사용에서 리포트 메일이
  //   http://localhost:3000/audit/… 링크를 달고 나갔다. 고객은 못 연다.
  it('발송할 때 로컬 주소를 거부한다', () => {
    for (const local of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://0.0.0.0:3000',
      'https://app.localhost',
    ]) {
      const r = resolveReportBaseUrl(local, 'send')
      expect(r.ok, local).toBe(false)
      expect(r.reason, local).toMatch(/로컬 주소/)
    }
  })

  it('거부 사유가 고칠 방법을 말한다', () => {
    const r = resolveReportBaseUrl('http://localhost:3000', 'send')
    // 원인만 말하고 방법을 안 주면 운영자는 .env.local을 고치고, 그러면
    // 로컬 개발이 프로덕션 주소를 가리키게 된다.
    expect(r.reason).toContain('--base-url')
  })

  it('공개 주소는 통과시킨다', () => {
    const r = resolveReportBaseUrl('https://cited.co.kr', 'send')
    expect(r.ok).toBe(true)
    expect(r.baseUrl).toBe('https://cited.co.kr')
  })

  // --dry는 저장도 발송도 하지 않는다. 로컬에서 결과 화면을 열어보는 것이
  // 정상 사용이므로 막으면 안 된다.
  it('--dry에서는 로컬 주소를 허용한다', () => {
    expect(resolveReportBaseUrl('http://localhost:3000', 'dry').ok).toBe(true)
  })

  it('끝의 슬래시를 떼어 //audit이 되지 않게 한다', () => {
    expect(resolveReportBaseUrl('https://cited.co.kr/', 'send').baseUrl).toBe('https://cited.co.kr')
    expect(resolveReportBaseUrl('https://cited.co.kr///', 'send').baseUrl).toBe(
      'https://cited.co.kr',
    )
  })

  it('해석할 수 없는 주소를 거부한다', () => {
    for (const bad of ['', '   ', 'cited.co.kr', 'not a url']) {
      expect(resolveReportBaseUrl(bad, 'send').ok, bad).toBe(false)
    }
  })

  it('http(s)가 아닌 스킴을 거부한다', () => {
    // 링크는 메일 본문에 그대로 실린다.
    for (const bad of ['ftp://cited.co.kr', 'javascript:alert(1)', 'file:///tmp']) {
      expect(resolveReportBaseUrl(bad, 'send').ok, bad).toBe(false)
    }
  })

  it('해석 불가는 dry에서도 거부한다 (링크 자체를 못 만든다)', () => {
    expect(resolveReportBaseUrl('not a url', 'dry').ok).toBe(false)
  })

  it('http 공개 주소도 통과한다 (스킴이 아니라 호스트가 기준이다)', () => {
    expect(resolveReportBaseUrl('http://staging.cited.co.kr', 'send').ok).toBe(true)
  })
})

describe('reportUrl', () => {
  it('기준 주소에 경로를 붙인다', () => {
    expect(reportUrl('https://cited.co.kr', 'aud_abc')).toBe('https://cited.co.kr/audit/aud_abc')
  })
})

describe('parseBaseUrlFlag', () => {
  it('--base-url <값>을 읽는다', () => {
    expect(parseBaseUrlFlag(['--base-url', 'https://cited.co.kr'])).toBe('https://cited.co.kr')
  })

  it('--base-url=<값>도 읽는다', () => {
    // 한쪽만 지원하면 다른 표기를 쓴 운영자가 조용히 기본값(로컬)로 떨어진다.
    expect(parseBaseUrlFlag(['--base-url=https://cited.co.kr'])).toBe('https://cited.co.kr')
  })

  it('다른 플래그와 섞여 있어도 찾는다', () => {
    expect(parseBaseUrlFlag(['--dry', '--base-url', 'https://x.kr', '--verbose'])).toBe(
      'https://x.kr',
    )
  })

  it('없으면 null', () => {
    expect(parseBaseUrlFlag(['--dry'])).toBeNull()
    expect(parseBaseUrlFlag([])).toBeNull()
  })

  it('값이 빠지면 빈 문자열 — 조용히 기본값으로 떨어지지 않는다', () => {
    // null을 돌려주면 호출자가 env 기본값(로컬)을 쓰고, 운영자는 플래그를
    // 넣었다고 믿는다. 빈 문자열이면 resolveReportBaseUrl이 거부한다.
    expect(parseBaseUrlFlag(['--base-url'])).toBe('')
  })
})
