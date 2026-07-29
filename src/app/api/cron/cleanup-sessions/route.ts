import { createExpiredSessionDeleter, handleCleanupSessions } from '@/lib/cron/cleanup-sessions'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

// 이 라우트는 빌드 시점에 프리렌더되면 안 된다. 프리렌더되면 `next build`가
// 빌드 머신에서 DELETE를 실행하고, 크론은 이후 캐시된 응답만 받아 아무것도
// 지우지 않는다. Authorization 헤더를 읽으므로 Next가 동적으로 판단할
// 가능성이 높지만, 그 추론에 법정 의무 집행을 걸지 않는다.
export const dynamic = 'force-dynamic'

/** Vercel Cron이 GET으로 호출한다 (`vercel.json`의 crons 참고). */
export async function GET(request: Request): Promise<Response> {
  return handleCleanupSessions(request, {
    secret: env.CRON_SECRET,
    deleteExpiredSessions: createExpiredSessionDeleter(db),
  })
}
