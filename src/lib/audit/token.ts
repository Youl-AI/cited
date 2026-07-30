import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'

/**
 * 진단 이메일 인증 토큰.
 *
 * 상태를 DB에 두지 않는다 — 토큰 자체가 서명된 페이로드다. 인증 링크 하나에
 * 행을 하나 더 만들면 만료 청소가 필요해지고, 그 청소를 잊으면 테이블이 큰다.
 */

/** 인증 링크 유효기간. 메일을 하루 뒤에 열어보는 사람이 흔하다. */
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * ★ 인증 키를 `BETTER_AUTH_SECRET` 그대로 쓰지 않고 용도 문자열로 한 번 파생한다.
 *   같은 키를 두 목적(로그인 세션 / 진단 인증)에 쓰면, 한쪽에서 서명한 값이
 *   다른 쪽에서 유효해질 여지가 생긴다. env 변수를 늘리지 않으면서 키를
 *   분리하는 표준적인 방법이다.
 */
function key(): Buffer {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update('cited:audit-verify:v1').digest()
}

function sign(payload: string): string {
  return createHmac('sha256', key()).update(payload).digest('base64url')
}

export function createVerifyToken(auditId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ auditId, email, exp: Date.now() + VERIFY_TTL_MS }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readVerifyToken(token: string): { auditId: string; email: string } | null {
  // base64url에는 점이 없으므로 유효한 토큰의 점은 정확히 하나다. 점이 여럿인
  // 입력은 어디서 자르든 서명이 안 맞아 거부된다 — 첫 점을 쓰는 것은 규약을
  // 분명히 하기 위한 것이고 보안상의 차이는 없다.
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payload = token.slice(0, dot)
  const provided = token.slice(dot + 1)

  // ★ 서명이 **페이로드 전체**를 덮으므로 다른 진단의 서명을 가져다 붙일 수 없다.
  //
  // ★ 길이가 다르면 timingSafeEqual이 **던진다.** 길이를 먼저 비교하면 조기
  //   반환이 생기지만, 길이는 비밀이 아니므로(서명 길이는 고정) 문제되지 않는다.
  const expected = sign(payload)
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    // 배열과 null도 typeof 'object'다. 아래 필드 타입 검사와 try/catch가
    // 결과적으로 둘 다 막아내지만, 그 방어를 **던지는 것에 의존하지 않는다** —
    // 명시적으로 거른다.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

    const { auditId, email, exp } = parsed as Record<string, unknown>
    // ★ exp의 타입을 확인한다. 문자열이면 `Date.now() > exp` 비교가 조용히
    //   이상하게 동작해 만료 검사가 무력화된다 — 영구 토큰이 된다.
    if (typeof auditId !== 'string' || typeof email !== 'string' || typeof exp !== 'number') {
      return null
    }
    if (Date.now() > exp) return null
    return { auditId, email }
  } catch {
    return null
  }
}
