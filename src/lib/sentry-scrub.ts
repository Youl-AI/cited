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
//
// ★ exception/message만 훑는 것으로는 부족하다. 확인된 유출 경로가 셋 더 있다.
//
//   3. breadcrumbs — @sentry/core의 consoleIntegration이 모든 console 호출을
//      breadcrumb으로 만든다(integrations/console.js의 addConsoleBreadcrumb:
//      포맷된 `message`와 raw `data.arguments`를 **둘 다** 담는다).
//      `logger.error`가 console.error로 찍은 접속 문자열이 그대로 남고,
//      그 다음에 잡히는 예외에 얹혀 나간다. utils/prepareEvent.js:123-145가
//      beforeSend 시점에 breadcrumbs가 이벤트에 실려 있음을 확인해 준다.
//   4. extra — `@/lib/logger`가 `captureMessage(event, { extra: fields })`로
//      필드를 그대로 넘긴다.
//   5. extra.__serialized__ — Error가 아닌 값이 throw되면 utils/eventbuilder.js:73이
//      그 객체를 통째로 여기에 넣는다. 접속 문자열이 든 설정 객체가 대표적이다.
//      contexts도 같은 이유로 훑는다.
//
// prepareEvent가 beforeSend **앞에서** breadcrumbs.data·user·contexts·extra를
// normalize(기본 깊이 3)하므로 여기 도착하는 값은 이미 평범한 JSON이다.
// 그래도 normalizeDepth를 0으로 끄면 그 보장이 사라지므로 아래 순회는
// 순환 참조와 과도한 깊이를 스스로 방어한다.

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

// Sentry의 normalizeDepth 기본값은 3이다. 그보다 훨씬 깊은 12에서 끊으면
// 정상 이벤트는 영향을 받지 않으면서, normalize가 꺼진 이벤트가 스택을
// 터뜨리는 것만 막는다. 한계를 넘으면 값을 **버린다** — 못 훑은 하위 트리를
// 그대로 내보내면 이 함수의 존재 이유가 사라진다.
const MAX_DEPTH = 12
const DEPTH_LIMIT = '[depth limit]'

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null
}

/**
 * 객체·배열을 제자리에서 훑으며 모든 문자열 leaf에 `redactSecrets`를 적용한다.
 * 순환 참조는 `seen`으로, 비정상 깊이는 `MAX_DEPTH`로 막는다.
 */
function redactContainerInPlace(
  container: Record<string, unknown> | unknown[],
  seen: WeakSet<object>,
  depth: number,
): void {
  if (seen.has(container)) return
  seen.add(container)

  if (Array.isArray(container)) {
    for (let i = 0; i < container.length; i++) {
      const value = container[i]
      if (typeof value === 'string') container[i] = redactSecrets(value)
      else if (isContainer(value)) {
        if (depth >= MAX_DEPTH) container[i] = DEPTH_LIMIT
        else redactContainerInPlace(value, seen, depth + 1)
      }
    }
    return
  }

  for (const key of Object.keys(container)) {
    const value = container[key]
    if (typeof value === 'string') container[key] = redactSecrets(value)
    else if (isContainer(value)) {
      if (depth >= MAX_DEPTH) container[key] = DEPTH_LIMIT
      else redactContainerInPlace(value, seen, depth + 1)
    }
  }
}

/**
 * 이벤트에서 개인정보와 비밀을 제거한다. **이벤트를 제자리에서 수정하고**
 * 같은 객체를 돌려준다 (Sentry의 `beforeSend` 규약).
 *
 * 타입 가드가 꼼꼼한 이유: 여기서 던지면 client.js가 **원본 이벤트를 버리고**
 * 내부 에러를 대신 보낸다. 즉 scrub 버그 하나가 진짜 에러를 침묵으로 바꾼다.
 * 아래 `scrubEvent`가 마지막 안전망이지만, 애초에 던지지 않는 게 낫다.
 */
function scrubEventUnsafe(event: ErrorEvent): ErrorEvent {
  const request = event.request
  if (isContainer(request) && !Array.isArray(request)) {
    delete request.cookies
    // 요청 본문에는 가입·로그인 비밀번호가 들어 있다. 통째로 버린다.
    delete request.data
    const headers = request.headers
    if (isContainer(headers)) {
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase()
        if (lower === 'cookie' || lower === 'authorization') {
          delete (headers as Record<string, unknown>)[key]
        }
      }
    }
    if (typeof request.url === 'string') request.url = redactSecrets(request.url)
    if (typeof request.query_string === 'string') {
      request.query_string = redactSecrets(request.query_string)
    }
  }

  const user = event.user
  if (isContainer(user) && !Array.isArray(user)) {
    delete user.email
    delete user.ip_address
    delete user.username
  }

  if (typeof event.message === 'string') {
    event.message = redactSecrets(event.message)
  }

  const values = event.exception?.values
  if (Array.isArray(values)) {
    for (const exception of values) {
      if (isContainer(exception) && typeof exception.value === 'string') {
        exception.value = redactSecrets(exception.value)
      }
    }
  }

  // ── 여기부터가 이번에 막은 세 경로다. ──
  const seen = new WeakSet<object>()

  const breadcrumbs = event.breadcrumbs
  if (Array.isArray(breadcrumbs)) {
    for (const crumb of breadcrumbs) {
      if (!isContainer(crumb) || Array.isArray(crumb)) continue
      if (typeof crumb.message === 'string') crumb.message = redactSecrets(crumb.message)
      const data = crumb.data
      if (isContainer(data)) redactContainerInPlace(data, seen, 1)
    }
  }

  const extra = event.extra
  if (isContainer(extra)) redactContainerInPlace(extra, seen, 1)

  const contexts = event.contexts
  if (isContainer(contexts)) redactContainerInPlace(contexts, seen, 1)

  return event
}

/**
 * `scrubEventUnsafe`의 마지막 안전망. **실패하면 이벤트를 버린다(null).**
 *
 * 근거: 여기서 던지면 client.js가 어차피 원본 이벤트를 버리고 내부 에러를
 * 대신 보낸다 — 즉 "이벤트 보존"은 애초에 선택지가 아니다. 남은 선택지는
 * (a) 훑지 못한 원본을 그대로 내보내기와 (b) 버리기뿐인데, (a)는 이 모듈의
 * 존재 이유를 정확히 무효로 만든다. Sentry는 제3자 서비스이고 새는 것은
 * DB 비밀번호·API 키다. 에러 리포트 하나를 잃는 편이 낫다.
 *
 * 대신 침묵하지는 않는다 — 페이로드가 전혀 없는 고정 문자열을 stderr에 찍어
 * Vercel 로그에는 흔적이 남는다. (`@/lib/logger`를 쓰면 captureMessage로
 * 되돌아와 재귀가 된다. 그래서 console.error를 직접 쓴다.)
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent | null {
  if (!isContainer(event)) return null
  try {
    return scrubEventUnsafe(event)
  } catch {
    console.error('{"level":"error","event":"sentry.scrub_failed"}')
    return null
  }
}
