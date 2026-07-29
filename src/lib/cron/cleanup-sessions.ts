// 만료된 로그인 세션 일괄 삭제.
//
// ★ 이건 편의 기능이 아니라 법정 의무의 집행 경로다.
//
// better-auth는 만료된 세션을 "그 세션으로 다시 접속할 때" 지운다. 접속이
// 없으면 만료 행이 영원히 남는다 — 그 행에는 접속 IP와 User-Agent가 원문으로
// 들어 있다. 개인정보보호법 제21조 제1항은 보유기간이 지난 개인정보를 지체
// 없이 파기하도록 요구하므로, 접속에 의존하지 않는 삭제 경로가 반드시 필요하다.
// `src/app/legal/privacy/page.tsx` §3·§4가 이 코드의 존재를 전제로 쓰여 있다.
// 이 라우트를 지우거나 크론을 떼면 방침이 거짓이 된다.
import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'
import { lt } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { session } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

const BEARER_PREFIX = 'Bearer '

/** 만료 세션 삭제기. 기준 시각을 받아 삭제된 행 수를 돌려준다. */
export type ExpiredSessionDeleter = (now: Date) => Promise<number>

export interface CleanupSessionsDeps {
  /** `env.CRON_SECRET`. 없거나 비어 있으면 모든 요청을 거부한다(fail-closed). */
  secret: string | undefined
  deleteExpiredSessions: ExpiredSessionDeleter
  /** 테스트에서 기준 시각을 고정하기 위한 주입점 */
  now?: () => Date
}

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

/** 만료 조건: `expires_at < now`. 유효한 세션은 건드리지 않는다. */
export function expiredSessionsCondition(now: Date) {
  return lt(session.expiresAt, now)
}

export function createExpiredSessionDeleter(db: Db): ExpiredSessionDeleter {
  return async (now) => {
    // `.returning()`으로 삭제 행 수를 센다 — neon-http 결과의 rowCount는
    // 드라이버 구현에 딸린 값이라 드라이버를 바꾸면 조용히 깨진다.
    // id만 받아오므로 IP·User-Agent는 애플리케이션으로 돌아오지 않는다.
    const deleted = await db
      .delete(session)
      .where(expiredSessionsCondition(now))
      .returning({ id: session.id })
    return deleted.length
  }
}

/**
 * 크론 라우트 본체. 라우트 파일은 이 함수에 실제 의존성만 꽂는다.
 *
 * 인가되지 않은 요청에는 401만 돌려주고 **아무 일도 하지 않는다** — DB에
 * 닿지 않고, 응답에 시크릿이나 내부 상태를 담지 않는다.
 */
export async function handleCleanupSessions(
  request: Request,
  deps: CleanupSessionsDeps,
): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), deps.secret)) {
    // 시크릿 자체는 절대 로그에 남기지 않는다. 설정 누락과 값 불일치를
    // 구분할 수 있을 만큼만 남긴다.
    logger.warn('cron.cleanup_sessions.unauthorized', { configured: Boolean(deps.secret) })
    return new Response(null, { status: 401 })
  }

  const now = (deps.now ?? (() => new Date()))()

  try {
    const deleted = await deps.deleteExpiredSessions(now)
    logger.info('cron.cleanup_sessions.done', { deleted })
    return Response.json({ ok: true, deleted })
  } catch (caught) {
    // 예외 메시지에는 접속 문자열 같은 값이 실려 올 수 있다. 호출자(Vercel
    // Cron)에게는 사실만 돌려주고, 자세한 내용은 로거로만 보낸다.
    logger.error('cron.cleanup_sessions.failed', {
      reason: caught instanceof Error ? caught.name : 'unknown',
    })
    return Response.json({ ok: false }, { status: 500 })
  }
}
