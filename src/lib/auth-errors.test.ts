import { describe, expect, it } from 'vitest'
import {
  AUTH_FALLBACK_MESSAGE,
  MAPPED_ERROR_CODES,
  MIN_PASSWORD_LENGTH,
  authErrorMessage,
} from '@/lib/auth-errors'

/** 한글 음절이 하나라도 있으면 한국어 문구로 본다. */
const HANGUL = /[가-힣]/

describe('authErrorMessage', () => {
  it('주요 코드를 한국어로 옮긴다', () => {
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
    expect(authErrorMessage({ code: 'PASSWORD_TOO_SHORT' })).toContain(
      String(MIN_PASSWORD_LENGTH),
    )
    expect(authErrorMessage({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' })).toContain(
      '이미 사용 중인 이메일',
    )
    expect(authErrorMessage({ code: 'EMAIL_NOT_VERIFIED' })).toContain('이메일 인증')
  })

  it('매핑된 문구는 전부 한국어다 — 영어 message가 새어 나갈 자리가 없다', () => {
    for (const code of MAPPED_ERROR_CODES) {
      expect(authErrorMessage({ code })).toMatch(HANGUL)
    }
  })

  it('better-auth의 영어 message는 무시한다', () => {
    const message = authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })
    expect(message).not.toContain('Invalid email or password')
  })

  it('모르는 코드·코드 없음은 폴백으로 떨어진다', () => {
    expect(authErrorMessage({ code: 'SOME_FUTURE_CODE' })).toBe(AUTH_FALLBACK_MESSAGE)
    expect(authErrorMessage({})).toBe(AUTH_FALLBACK_MESSAGE)
    expect(authErrorMessage(null)).toBe(AUTH_FALLBACK_MESSAGE)
    expect(authErrorMessage(undefined)).toBe(AUTH_FALLBACK_MESSAGE)
  })

  it('페이지별 폴백을 넘기면 그걸 쓴다', () => {
    expect(authErrorMessage({ code: 'SOME_FUTURE_CODE' }, '로그인에 실패했습니다.')).toBe(
      '로그인에 실패했습니다.',
    )
  })
})

describe('사용자 열거 방지', () => {
  // 이 단언이 깨지면 로그인 화면이 "이 이메일은 존재하지 않는다"를 말하기
  // 시작한다. better-auth가 서버에서 뭉개 놓은 구분을 UI가 되살리면 안 된다.
  it('계정 존재 여부를 드러내는 코드들이 모두 같은 문구를 낸다', () => {
    const combined = authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })
    expect(authErrorMessage({ code: 'USER_NOT_FOUND' })).toBe(combined)
    expect(authErrorMessage({ code: 'CREDENTIAL_ACCOUNT_NOT_FOUND' })).toBe(combined)
  })

  it('로그인 실패 문구가 이메일과 비밀번호를 구분하지 않는다', () => {
    const message = authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })
    expect(message).toContain('또는')
    expect(message).not.toMatch(/가입되지|등록되지|존재하지|없는 (계정|이메일)/)
  })
})

describe('better-auth 코드 드리프트 방지', () => {
  // 우리가 매핑한 코드가 실제로 better-auth에 존재해야 한다. 오타나
  // 업그레이드로 코드가 사라지면 그 문구는 영원히 죽은 채 폴백만 나간다.
  it('매핑한 코드가 모두 auth.$ERROR_CODES에 있다', async () => {
    const { auth } = await import('@/lib/auth')
    const known = new Set(Object.keys(auth.$ERROR_CODES))
    const unknown = MAPPED_ERROR_CODES.filter((code) => !known.has(code))
    expect(unknown).toEqual([])
  })
})
