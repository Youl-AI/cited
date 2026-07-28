// 최소 구조화 로거. 한 줄 = JSON 한 객체라 Vercel/Sentry 어디에 붙여도
// 파싱된다. Task 7에서 Sentry와 합쳐지므로 여기서는 인터페이스만 고정한다.
//
// ★ 개인정보를 넣지 말 것. 이메일 원문·이름·IP는 필드에 담지 않는다.
//   식별이 필요하면 마스킹하거나 해시를 넣는다.

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (e: string, f?: Record<string, unknown>) => emit('debug', e, f),
  info: (e: string, f?: Record<string, unknown>) => emit('info', e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit('warn', e, f),
  error: (e: string, f?: Record<string, unknown>) => emit('error', e, f),
}
