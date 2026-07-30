import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { VERIFY_TTL_MS, createVerifyToken, readVerifyToken } from '@/lib/audit/token'

describe('진단 이메일 인증 토큰', () => {
  it('만든 토큰을 되읽는다', () => {
    const token = createVerifyToken('aud_1', 'a@example.com')
    expect(readVerifyToken(token)).toEqual({ auditId: 'aud_1', email: 'a@example.com' })
  })

  it('URL에 그대로 넣을 수 있다 (base64url)', () => {
    const token = createVerifyToken('aud_1', 'a+b@example.com')
    expect(token).toBe(encodeURIComponent(token))
  })

  it('한 글자만 바뀌어도 거부한다', () => {
    const token = createVerifyToken('aud_1', 'a@example.com')
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect(readVerifyToken(tampered)).toBeNull()
  })

  it('페이로드를 바꿔치기하면 거부한다', () => {
    // 서명 없이 페이로드만 만들어 붙인 위조 토큰
    const forged = Buffer.from(
      JSON.stringify({ auditId: 'aud_2', email: 'x@example.com', exp: Date.now() + 1000 }),
    ).toString('base64url')
    expect(readVerifyToken(`${forged}.deadbeef`)).toBeNull()
  })

  it('다른 진단의 서명을 가져다 붙이면 거부한다', () => {
    // ★ 페이로드와 서명이 각각은 유효하지만 짝이 아니다. 서명이 페이로드
    //   전체를 덮지 않으면 이 조합이 통과한다.
    const a = createVerifyToken('aud_1', 'a@example.com')
    const b = createVerifyToken('aud_2', 'b@example.com')
    const mixed = `${a.split('.')[0]}.${b.split('.')[1]}`
    expect(readVerifyToken(mixed)).toBeNull()
  })

  it('만료된 토큰을 거부한다', () => {
    vi.useFakeTimers()
    try {
      const token = createVerifyToken('aud_1', 'a@example.com')
      vi.advanceTimersByTime(VERIFY_TTL_MS + 1)
      expect(readVerifyToken(token)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('만료 직전에는 통과한다', () => {
    vi.useFakeTimers()
    try {
      const token = createVerifyToken('aud_1', 'a@example.com')
      vi.advanceTimersByTime(VERIFY_TTL_MS - 1000)
      expect(readVerifyToken(token)?.auditId).toBe('aud_1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('유효기간이 7일이다', () => {
    // 메일을 하루 뒤에 열어보는 사람이 흔하다. 짧게 잡으면 인증 못 한
    // 신청이 쌓이고, 그건 우리가 실행할 수 없는 신청이다.
    expect(VERIFY_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('형식이 깨진 입력에 던지지 않는다', () => {
    for (const bad of ['', '.', '.sig', 'payload.', 'a.b.c', 'notbase64!!!.sig', '없는토큰']) {
      expect(readVerifyToken(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('페이로드에 필드가 빠지면 거부한다', () => {
    // 서명이 유효해도 내용이 불완전하면 쓸 수 없다. exp가 없으면 만료 검사가
    // 통째로 건너뛰어져 영구 토큰이 된다.
    expect(readVerifyToken(signedPayload({ auditId: 'aud_1', email: 'a@example.com' }))).toBeNull()
    expect(readVerifyToken(signedPayload({ auditId: 'aud_1', exp: Date.now() + 1000 }))).toBeNull()
    expect(readVerifyToken(signedPayload({ email: 'a@example.com', exp: Date.now() + 1000 }))).toBeNull()
  })

  it('exp가 숫자가 아니면 거부한다', () => {
    // exp가 문자열이면 `Date.now() > exp` 비교가 조용히 이상하게 동작한다.
    const token = signedPayload({ auditId: 'aud_1', email: 'a@example.com', exp: '9999999999999' })
    expect(readVerifyToken(token)).toBeNull()
  })

  it('BETTER_AUTH_SECRET으로 직접 서명한 토큰을 거부한다', () => {
    // ★ 인증 키를 시크릿 그대로 쓰지 않고 용도 문자열로 파생하는 이유를 지킨다.
    //   같은 키를 로그인 세션과 진단 인증에 함께 쓰면, 한쪽에서 서명된 값이
    //   다른 쪽에서 유효해질 여지가 생긴다. better-auth가 만든 서명이 이
    //   경로를 통과하면 안 된다.
    const payload = Buffer.from(
      JSON.stringify({ auditId: 'aud_1', email: 'a@example.com', exp: Date.now() + 60_000 }),
    ).toString('base64url')
    const rawSigned = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
      .update(payload)
      .digest('base64url')
    expect(readVerifyToken(`${payload}.${rawSigned}`)).toBeNull()
    // 파생 키로 서명한 같은 페이로드는 통과한다 — 거부 이유가 키뿐임을 못박는다.
    expect(readVerifyToken(`${payload}.${signForTest(payload)}`)?.auditId).toBe('aud_1')
  })

  it('페이로드가 JSON이 아니면 거부한다', () => {
    expect(readVerifyToken(signedRaw('not json'))).toBeNull()
    // 배열도 객체가 아니다.
    expect(readVerifyToken(signedRaw('[1,2,3]'))).toBeNull()
    expect(readVerifyToken(signedRaw('null'))).toBeNull()
  })
})

/**
 * 유효한 서명을 붙인 임의 페이로드를 만든다.
 *
 * ★ 프로덕션 코드의 sign()을 재사용하지 않고 같은 방식으로 다시 만든다.
 *   token.ts에서 서명 대상을 바꾸면 이 헬퍼가 만든 토큰이 거부되어 테스트가
 *   깨지는데, 그게 맞다 — 서명 규약이 바뀐 것이다.
 */
function signedRaw(json: string): string {
  const payload = Buffer.from(json).toString('base64url')
  return `${payload}.${signForTest(payload)}`
}

function signedPayload(obj: Record<string, unknown>): string {
  return signedRaw(JSON.stringify(obj))
}

function signForTest(payload: string): string {
  // vitest.config.ts가 넣는 BETTER_AUTH_SECRET과 token.ts의 용도 문자열을 그대로 쓴다.
  const key = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update('cited:audit-verify:v1')
    .digest()
  return createHmac('sha256', key).update(payload).digest('base64url')
}
