import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 실제 SDK를 적재하지 않는다. 여기서 검증할 것은 "logger.error가 Sentry로도
// 나가는가"이지 Sentry가 전송을 잘 하는가가 아니다.
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...args: unknown[]) => captureMessage(...args) }))

const { logger } = await import('@/lib/logger')

describe('logger', () => {
  beforeEach(() => {
    captureMessage.mockClear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('한 줄 JSON으로 level·event·ts·필드를 남긴다', () => {
    logger.info('email.sent', { id: 'abc' })

    expect(console.log).toHaveBeenCalledTimes(1)
    const line: unknown = vi.mocked(console.log).mock.calls[0]?.[0]
    expect(typeof line).toBe('string')
    const parsed: unknown = JSON.parse(line as string)
    expect(parsed).toMatchObject({ level: 'info', event: 'email.sent', id: 'abc' })
    expect(typeof (parsed as { ts: unknown }).ts).toBe('string')
  })

  it('error는 console.error와 Sentry 양쪽으로 나간다', () => {
    logger.error('email.send_failed', { reason: 'rate_limited' })

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledTimes(1)
    expect(captureMessage).toHaveBeenCalledWith('email.send_failed', {
      level: 'error',
      extra: { reason: 'rate_limited' },
    })
  })

  it('필드를 넘기지 않아도 Sentry 호출이 깨지지 않는다', () => {
    logger.error('auth.verification_email_failed')

    expect(captureMessage).toHaveBeenCalledWith('auth.verification_email_failed', {
      level: 'error',
      extra: {},
    })
  })

  it('debug·info·warn은 Sentry로 보내지 않는다 — 이벤트 할당량을 error에만 쓴다', () => {
    logger.debug('a')
    logger.info('b')
    logger.warn('c')

    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
