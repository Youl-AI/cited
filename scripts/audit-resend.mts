/**
 * 이미 측정이 끝난 진단의 리포트 메일을 **다시 보낸다.**
 *
 *   pnpm audit:resend aud_xxx --base-url https://cited.co.kr
 *
 * ★ 측정을 다시 하지 않는다. DB에 저장된 결과를 그대로 쓰므로 **돈이 들지
 *   않고**, 숫자도 처음 보낸 것과 완전히 같다. 재측정하면 AI 답변이 달라져
 *   "아까 받은 것과 숫자가 다른데요"가 된다.
 *
 * ## 언제 쓰는가
 *
 * - 링크가 잘못 나갔을 때. 2026-07-30에 실제로 그랬다 — 리포트 메일이
 *   `http://localhost:3000/audit/…`을 달고 나갔고 고객은 열 수 없었다.
 * - `audit:run`이 "리포트는 저장했지만 메일 발송에 실패했습니다"로 끝났을 때.
 *
 * ★ `status`·`sentAt`을 건드리지 않는다. 최초 발송 시각이 "영업일 1일 이내"
 *   약속을 지켰는지 판단하는 근거이고, 재발송으로 그것을 덮으면 지표가 거짓이
 *   된다.
 */
import { parseBaseUrlFlag, reportUrl, resolveReportBaseUrl } from '@/lib/audit/report-url'
import { getAudit } from '@/lib/audit/repository'
import type { AuditResult } from '@/lib/audit/result'
import { sendEmail } from '@/lib/email/send'
import { maskEmail } from '@/lib/email/mask'
import { auditReportEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'

const [auditId, ...flags] = process.argv.slice(2)

if (!auditId) {
  console.error('사용법: pnpm audit:resend <auditId> --base-url https://cited.co.kr')
  process.exit(1)
}

// 재발송은 정의상 실제 발송이다 — dry 모드가 없다.
const resolved = resolveReportBaseUrl(parseBaseUrlFlag(flags) ?? env.NEXT_PUBLIC_APP_URL, 'send')
if (!resolved.ok) {
  console.error(`보내지 않았습니다 — ${resolved.reason}`)
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}

// ★ 저장된 결과가 없으면 보낼 것이 없다. 여기서 재측정으로 넘어가지 않는다 —
//   그건 `audit:run`의 일이고, 돈이 든다.
if (!audit.result) {
  console.error(
    `저장된 결과가 없습니다 (status=${audit.status}). 먼저 실행하세요: pnpm audit:run ${auditId}`,
  )
  process.exit(1)
}

const result = audit.result as AuditResult
const url = reportUrl(resolved.baseUrl, audit.id)

console.log(`재발송: ${audit.brandName} · ${maskEmail(audit.email)}`)
console.log(`링크: ${url}`)

const sent = await sendEmail({ to: audit.email, content: auditReportEmail({ result, url }) })
if (!sent.ok) {
  console.error(`발송 실패: ${sent.reason}`)
  console.error(`수동 전달용 링크: ${url}`)
  process.exit(1)
}

console.log('재발송 완료')
