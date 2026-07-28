import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Resend SDK를 통째로 대역으로 바꾼다. 이 테스트는 네트워크를 타지 않는다.
// (실제 발송 검증은 Resend 실키가 생긴 뒤 수동으로 한다 — 단위 테스트의 몫이 아니다.)
const sendSpy = vi.fn()
// Resend 생성자가 던지는 상황(잘못된 API 키 등)을 재현하기 위한 스위치.
let constructorError: Error | null = null

vi.mock('resend', () => ({
  // `new Resend(...)`로 생성되므로 생성자여야 한다.
  Resend: class {
    emails = { send: sendSpy }
    constructor() {
      if (constructorError) throw constructorError
    }
  },
}))

const { sendEmail } = await import('@/lib/email/send')
const { verificationEmail } = await import('@/lib/email/templates')

describe('sendEmail', () => {
  beforeEach(() => {
    sendSpy.mockReset()
    constructorError = null
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('from·to·subject·html을 Resend에 그대로 넘긴다', async () => {
    sendSpy.mockResolvedValue({ data: { id: 'email_1' }, error: null })

    const content = verificationEmail({ url: 'https://cited.test/verify?token=abc' })
    const result = await sendEmail({ to: 'reader@example.com', content })

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith({
      from: 'Cited <noreply@example.com>', // vitest.config.ts의 EMAIL_FROM
      to: 'reader@example.com',
      subject: content.subject,
      html: content.html,
    })
    expect(result).toEqual({ ok: true, id: 'email_1' })
  })

  it('본문에 인증 링크가 그대로 실린다', async () => {
    sendSpy.mockResolvedValue({ data: { id: 'email_2' }, error: null })

    const url = 'https://cited.test/api/auth/verify-email?token=t123&callbackURL=%2F'
    await sendEmail({ to: 'reader@example.com', content: verificationEmail({ url }) })

    const payload: unknown = sendSpy.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      html: expect.stringContaining(
        'https://cited.test/api/auth/verify-email?token=t123&amp;callbackURL=%2F',
      ) as unknown as string,
    })
  })

  it('Resend가 에러를 돌려주면 던지지 않고 ok:false를 반환한다', async () => {
    sendSpy.mockResolvedValue({
      data: null,
      error: { name: 'invalid_api_key', message: 'API key is invalid', statusCode: 401 },
    })

    const result = await sendEmail({
      to: 'reader@example.com',
      content: verificationEmail({ url: 'https://cited.test/v' }),
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_api_key: API key is invalid' })
  })

  it('네트워크 예외가 나도 던지지 않고 ok:false를 반환한다', async () => {
    sendSpy.mockRejectedValue(new Error('fetch failed'))

    const result = await sendEmail({
      to: 'reader@example.com',
      content: verificationEmail({ url: 'https://cited.test/v' }),
    })

    expect(result).toEqual({ ok: false, reason: 'fetch failed' })
  })

  // 회귀 테스트: Resend는 생성자에서 `Bearer <key>`로 Headers를 만든다. 키에
  // Latin-1 밖 문자(예: 한글 플레이스홀더)가 있으면 거기서 TypeError가 난다.
  // 클라이언트를 모듈 최상위에서 만들면 이 예외가 send.ts → auth.ts →
  // /api/auth/[...all] 라우트의 모듈 평가를 통째로 깨뜨려 `next build`까지
  // 실패한다(실제로 겪음). 생성은 지연시키고 실패는 발송 실패로만 격리한다.
  it('클라이언트 생성이 실패해도 던지지 않고 ok:false를 반환한다', async () => {
    constructorError = new TypeError(
      'Cannot convert argument to a ByteString because the character at index 22 has a value of 49892 which is greater than 255.',
    )

    // 다른 테스트가 이미 성공적으로 만들어 캐시해 둔 클라이언트를 쓰지 않도록
    // 모듈을 새로 적재한다 (send.ts는 생성한 클라이언트를 메모이즈한다).
    vi.resetModules()
    const { sendEmail: freshSendEmail } = await import('@/lib/email/send')

    const result = await freshSendEmail({
      to: 'reader@example.com',
      content: verificationEmail({ url: 'https://cited.test/v' }),
    })

    expect(result.ok).toBe(false)
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('반환하는 reason에도 이메일 원문이 남지 않는다', async () => {
    // Resend의 검증 에러 메시지에는 문제가 된 주소가 그대로 실려 온다.
    // 호출자가 이 reason을 그대로 로그에 넘겨도 안전해야 한다.
    sendSpy.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'Invalid `to` field: reader@example.com is not a valid address',
        statusCode: 422,
      },
    })

    const result = await sendEmail({
      to: 'reader@example.com',
      content: verificationEmail({ url: 'https://cited.test/v' }),
    })

    expect(result.ok).toBe(false)
    const reason = result.ok ? '' : result.reason
    expect(reason).not.toContain('reader@example.com')
    expect(reason).toContain('r***@e***.com')
  })

  it('실패 로그에 수신자 이메일 원문을 남기지 않는다', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    sendSpy.mockResolvedValue({
      data: null,
      error: { name: 'invalid_api_key', message: 'API key is invalid', statusCode: 401 },
    })

    await sendEmail({
      to: 'reader@example.com',
      content: verificationEmail({ url: 'https://cited.test/v' }),
    })

    expect(errorLog).toHaveBeenCalled()
    const logged = errorLog.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).not.toContain('reader@example.com')
    expect(logged).toContain('r***@e***.com')
  })
})
