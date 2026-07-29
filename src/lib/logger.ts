// 최소 구조화 로거. 한 줄 = JSON 한 객체라 Vercel/Sentry 어디에 붙여도
// 파싱된다.
//
// ★ 개인정보를 넣지 말 것. 이메일 원문·이름·IP는 필드에 담지 않는다.
//   식별이 필요하면 마스킹하거나 해시를 넣는다.
//   이 규칙이 특히 중요해졌다 — 아래에서 error 레벨의 필드가 그대로
//   Sentry의 `extra`로 전송된다. (@/lib/email/send의 maskEmail이 주소를
//   로거에 닿기 전에 마스킹하는 이유가 이것이다.)
//   `@/lib/sentry-scrub`가 `extra`와 console breadcrumb의 문자열에서
//   접속 문자열·Bearer 토큰을 지우지만, 그건 **비밀** 전용 그물이다.
//   이메일·이름 같은 개인정보는 여전히 여기서 걸러야 한다.

import { captureMessage } from '@sentry/nextjs'

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') {
    console.error(line)
    // error만 보낸다. warn 이하까지 보내면 이벤트 할당량이 노이즈로 차서
    // 정작 볼 것을 못 본다. DSN이 없으면 SDK가 초기화되지 않아 no-op이다.
    captureMessage(event, { level: 'error', extra: fields })
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const logger = {
  debug: (e: string, f?: Record<string, unknown>) => emit('debug', e, f),
  info: (e: string, f?: Record<string, unknown>) => emit('info', e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit('warn', e, f),
  error: (e: string, f?: Record<string, unknown>) => emit('error', e, f),
}
