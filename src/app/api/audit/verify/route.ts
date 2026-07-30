import { handleAuditVerify } from '@/lib/audit/handlers'
import { getAudit, markVerified } from '@/lib/audit/repository'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'

// 쿼리스트링의 토큰마다 결과가 달라진다. 프리렌더되면 첫 번째 방문자의 결과가
// 모두에게 캐시된다.
export const dynamic = 'force-dynamic'

/** 인증 메일의 링크가 GET으로 들어온다. */
export async function GET(request: Request): Promise<Response> {
  return handleAuditVerify(request, {
    markVerified,
    getAudit,
    sendEmail,
    operatorEmail: env.OPERATOR_EMAIL,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  })
}
