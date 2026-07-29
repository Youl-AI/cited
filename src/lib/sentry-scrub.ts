// Sentry로 나가기 직전의 마지막 방어선.
//
// `sendDefaultPii: false`가 이미 IP·쿠키·요청 본문의 자동 첨부를 막는다.
// 그런데 그건 "Sentry가 알아서 붙이는" 경로만 막는다. 예외 **메시지 본문**에
// 비밀이 박혀 오는 경로는 그 설정으로 못 막는다. 이 프로젝트에는 그런 경로가
// 실제로 두 개 있다.
//
//   1. @neondatabase/serverless는 접속 실패 시 DATABASE_URL을 통째로 담은
//      메시지를 던진다 — 비밀번호까지 같이 온다.
//   2. Resend SDK는 잘못된 API 키를 `Bearer <키>` 형태로 헤더에 실으므로
//      그 값이 에러 문자열에 섞여 나올 수 있다.
//
// 그래서 `beforeSend`에서 문자열을 한 번 더 훑는다. 이 모듈은 순수 함수만
// 담는다 — 그래야 Sentry 없이 단위 테스트로 검증할 수 있다.
//
// 이메일 주소는 여기서 다루지 않는다. `@/lib/email/send`의 maskEmail이
// 로거·반환값 양쪽에서 이미 마스킹하고, 아래에서 `user.email`을 지운다.

import type { ErrorEvent } from '@sentry/nextjs'

const REDACTED = '[redacted]'

// scheme://user:password@host — DATABASE_URL·REDIS_URL 등이 예외 메시지에
// 통째로 실려 오는 경우. 사용자명은 남긴다(어느 접속인지 알아야 고친다).
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s/@]+)@/gi

// `Bearer <토큰>` 형태의 API 키.
const BEARER_TOKEN = /\bBearer\s+[\w\-.~+/]+=*/gi

/** 문자열에서 비밀번호·API 키처럼 보이는 부분을 가린다. */
export function redactSecrets(text: string): string {
  return text
    .replace(URL_CREDENTIALS, (_match, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`)
    .replace(BEARER_TOKEN, `Bearer ${REDACTED}`)
}

/**
 * 이벤트에서 개인정보와 비밀을 제거한다. **이벤트를 제자리에서 수정하고**
 * 같은 객체를 돌려준다 (Sentry의 `beforeSend` 규약).
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request
  if (request) {
    delete request.cookies
    // 요청 본문에는 가입·로그인 비밀번호가 들어 있다. 통째로 버린다.
    delete request.data
    const headers = request.headers
    if (headers) {
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase()
        if (lower === 'cookie' || lower === 'authorization') delete headers[key]
      }
    }
    if (request.url) request.url = redactSecrets(request.url)
    if (request.query_string && typeof request.query_string === 'string') {
      request.query_string = redactSecrets(request.query_string)
    }
  }

  const user = event.user
  if (user) {
    delete user.email
    delete user.ip_address
    delete user.username
  }

  if (event.message && typeof event.message === 'string') {
    event.message = redactSecrets(event.message)
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value)
  }

  return event
}
