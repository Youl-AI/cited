// 헬스체크 본체. 라우트 파일(`src/app/api/health/route.ts`)은 여기에 실제
// 의존성만 꽂는다 — 그래야 실제 Postgres 없이 단위 테스트가 돈다.
// (`src/lib/cron/cleanup-sessions.ts`와 같은 구조다.)
//
// ★ 이 엔드포인트는 인증이 없는 공개 URL이다. 실패 경로에서 **예외의 내용을
//   응답에 절대 담지 않는다.** Neon 드라이버는 접속 실패 시 호스트·사용자명이
//   든 접속 문자열을 예외 메시지에 그대로 실어 던진다. 그걸 그대로 흘리면
//   공개 URL 하나로 DB 접속 정보가 새어 나간다. 자세한 내용은 logger로만
//   보낸다 (`@/lib/sentry-scrub`가 Sentry로 가는 경로에서 한 번 더 지운다).
import 'server-only'

import { sql } from 'drizzle-orm'
import type { Db } from '@/lib/db'
import { logger } from '@/lib/logger'

/** DB가 살아 있는지만 확인하는 최소 쿼리. 결과값은 쓰지 않는다. */
export type DbPing = () => Promise<void>

export interface HealthCheckDeps {
  pingDb: DbPing
  /** 테스트에서 지연 시간을 고정하기 위한 주입점 */
  now?: () => number
}

/**
 * `select 1`. 테이블을 읽지 않는 가장 싼 왕복이라 "커넥션이 살아 있는가"만
 * 재고 그 이상 아무것도 하지 않는다.
 */
export function createDbPing(db: Db): DbPing {
  return async () => {
    await db.execute(sql`select 1`)
  }
}

/**
 * 응답 계약:
 *   200 `{ ok: true, db: 'up', latencyMs }`
 *   503 `{ ok: false, db: 'down' }`  ← 필드가 늘어나면 안 된다
 *
 * 503 본문에 진단 정보를 추가하고 싶어지면 참아라. 그게 정확히 위에서 막고
 * 있는 유출이다. 진단은 로그에서 본다.
 */
export async function handleHealthCheck(deps: HealthCheckDeps): Promise<Response> {
  const now = deps.now ?? Date.now
  const started = now()

  try {
    await deps.pingDb()
    return Response.json({ ok: true, db: 'up', latencyMs: now() - started })
  } catch (caught) {
    // 예외의 **이름만** 남긴다. message는 접속 문자열을 실어 오므로 넣지 않는다.
    // logger.error는 필드를 그대로 Sentry의 extra로 보낸다 (@/lib/logger 주석).
    logger.error('health.db.failed', {
      reason: caught instanceof Error ? caught.name : 'unknown',
      latencyMs: now() - started,
    })
    return Response.json({ ok: false, db: 'down' }, { status: 503 })
  }
}
