// Better Auth의 에러를 한국어 문구로 옮긴다.
//
// 왜 `error.message`를 쓰지 않는가: better-auth가 돌려주는 message는 전부
// 영어다("Invalid email or password"). 한국어 서비스에서 비밀번호를 틀렸을
// 때 영어 문장이 뜨는 건 결함이다. 그래서 message는 아예 버리고 `code`만
// 본다 — code는 안정적인 식별자이고, 문구는 우리가 정한다.
//
// ★ 사용자 열거(enumeration)를 다시 열지 말 것.
//   로그인 실패는 "그런 이메일이 없음"과 "비밀번호가 틀림"을 구분하지
//   않는다(better-auth가 둘 다 INVALID_EMAIL_OR_PASSWORD로 뭉갠다 —
//   dist/api/routes/sign-in.mjs:291,297,303,310). 한국어 문구도 그 구분을
//   만들면 안 된다. 아래에서 USER_NOT_FOUND와 CREDENTIAL_ACCOUNT_NOT_FOUND를
//   INVALID_EMAIL_OR_PASSWORD와 **같은 문자열**로 둔 이유가 이것이다.
//   폴백 문구로 흘려보내면 그 문구 자체가 "이 이메일은 없다"는 신호가 된다.
//
// 코드 문자열의 출처: node_modules/@better-auth/core/dist/error/codes.mjs의
// BASE_ERROR_CODES. defineErrorCodes가 객체 키를 그대로 code로 쓴다
// (utils/error-codes.mjs). auth-errors.test.ts가 이 목록이 실제
// `auth.$ERROR_CODES`에 존재하는지 검사해 드리프트를 막는다.

/** 가입 비밀번호 최소 길이. auth.ts의 minPasswordLength와 아래 문구가 공유한다. */
export const MIN_PASSWORD_LENGTH = 10

/** 매핑되지 않은 코드와 코드 없는 실패에 쓰는 기본 문구. */
export const AUTH_FALLBACK_MESSAGE = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'

/** 로그인 실패를 뭉개는 단일 문구. 어떤 계정이 존재하는지 드러내지 않는다. */
const CREDENTIALS_REJECTED = '이메일 또는 비밀번호가 올바르지 않습니다.'

const MESSAGES: Readonly<Record<string, string>> = {
  // ── 로그인 ──
  INVALID_EMAIL_OR_PASSWORD: CREDENTIALS_REJECTED,
  USER_NOT_FOUND: CREDENTIALS_REJECTED,
  CREDENTIAL_ACCOUNT_NOT_FOUND: CREDENTIALS_REJECTED,
  EMAIL_NOT_VERIFIED: '이메일 인증이 아직 끝나지 않았습니다. 받은 편지함에서 확인 메일을 열어 주세요.',

  // ── 가입 ──
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '이미 사용 중인 이메일입니다. 다른 이메일로 가입해 주세요.',
  USER_ALREADY_EXISTS: '이미 사용 중인 이메일입니다. 다른 이메일로 가입해 주세요.',
  PASSWORD_TOO_SHORT: `비밀번호는 ${String(MIN_PASSWORD_LENGTH)}자 이상이어야 합니다.`,
  PASSWORD_TOO_LONG: '비밀번호가 너무 깁니다. 조금 더 짧게 입력해 주세요.',
  INVALID_EMAIL: '이메일 주소 형식이 올바르지 않습니다.',
  INVALID_PASSWORD: '비밀번호를 입력해 주세요.',
  FAILED_TO_CREATE_USER: '가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',

  // ── 세션·인증 링크 ──
  FAILED_TO_CREATE_SESSION: '로그인 세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
  SESSION_EXPIRED: '세션이 만료되었습니다. 다시 로그인해 주세요.',
  INVALID_TOKEN: '인증 링크가 올바르지 않습니다. 로그인을 다시 시도하면 확인 메일이 새로 발송됩니다.',
  TOKEN_EXPIRED: '인증 링크가 만료되었습니다. 로그인을 다시 시도하면 확인 메일이 새로 발송됩니다.',
  EMAIL_ALREADY_VERIFIED: '이미 인증이 완료된 계정입니다. 바로 로그인해 주세요.',
}

/** 드리프트 검사용. 매핑한 코드가 실제로 better-auth에 존재하는지 테스트가 본다. */
export const MAPPED_ERROR_CODES: readonly string[] = Object.keys(MESSAGES)

/**
 * 인증 에러를 사용자에게 보여줄 한국어 문구로 바꾼다.
 *
 * `error.message`(영어)는 의도적으로 무시한다. 매핑되지 않은 코드는
 * `fallback`으로 떨어지므로 영어 문장이 화면에 새어 나가지 않는다.
 */
export function authErrorMessage(
  error: { code?: string | undefined } | null | undefined,
  fallback: string = AUTH_FALLBACK_MESSAGE,
): string {
  const code = error?.code
  if (code === undefined) return fallback
  return MESSAGES[code] ?? fallback
}
