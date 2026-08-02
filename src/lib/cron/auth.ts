import { createHash, timingSafeEqual } from 'node:crypto'

const BEARER_PREFIX = 'Bearer '

/**
 * 타이밍 안전 비교.
 *
 * `timingSafeEqual`은 길이가 다른 버퍼를 받으면 **던진다**. 그대로 두면
 * "틀린 시크릿"이 500이 되어 오류와 섞이고, 길이 비교를 앞에 두면 조기
 * 반환이 생긴다. 두 값을 SHA-256으로 먼저 고정 길이(32바이트)로 만들면
 * 길이 분기 없이 항상 같은 길이를 비교하게 된다.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(provided), digest(expected))
}

/**
 * Vercel Cron은 `CRON_SECRET`이 설정돼 있으면 호출에
 * `Authorization: Bearer $CRON_SECRET` 헤더를 붙인다. 이 라우트는 공개
 * URL이므로 이 검증이 유일한 방어선이다.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  // 시크릿이 설정돼 있지 않으면 통과시키지 않는다. 여기서 빈 문자열을
  // 허용하면 `Authorization: Bearer `만 보내도 세션 테이블이 비워진다.
  if (!secret) return false
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) return false
  return secretsMatch(authorizationHeader.slice(BEARER_PREFIX.length), secret)
}
