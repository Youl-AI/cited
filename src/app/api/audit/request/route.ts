import { handleAuditRequest } from '@/lib/audit/handlers'
import { countRecentByIpHash, createAuditRequest, hashIp } from '@/lib/audit/repository'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'

// 요청 본문과 `x-forwarded-for`를 읽으므로 프리렌더 대상이 아니지만, 그 추론에
// 신청 접수를 걸지 않는다. 프리렌더되면 신청이 캐시된 응답만 받고 행이 생기지 않는다.
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleAuditRequest(request, {
    createAuditRequest,
    countRecentByIpHash,
    hashIp,
    sendEmail,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  })
}
