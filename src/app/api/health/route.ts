import { db } from '@/lib/db'
import { createDbPing, handleHealthCheck } from '@/lib/health/check'

// 프리렌더 금지. 이 라우트는 인자도 헤더도 읽지 않아서 Next가 정적으로
// 판단할 여지가 있는데, 그러면 `next build`가 빌드 머신에서 딱 한 번 DB에
// 붙어 본 결과가 배포된 뒤로 영원히 캐시된다 — DB가 죽어도 200 ok:true를
// 돌려주는 헬스체크가 된다. 그건 헬스체크가 아니라 거짓말이다.
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return handleHealthCheck({ pingDb: createDbPing(db) })
}
