/**
 * `--dry`로 저장해 둔 측정을 **처음으로** 발송한다. 재측정하지 않는다 — 0원.
 *
 *   pnpm audit:publish aud_xxx --base-url https://cited.co.kr
 *
 * ## 왜 이 스크립트가 있는가
 *
 * 2026-07-31 리허설 발견 #1: 유료 플로우가 측정을 두 번 샀다 —
 * `audit:run --dry`(확인용, ≈2,400원)가 결과를 버렸고, 발송하려면
 * `audit:run --base-url`이 **다시** 측정(≈2,400원)해야 했다. 원가가 두 배일
 * 뿐 아니라, 고객이 받는 숫자가 운영자가 눈으로 확인한 숫자와 다르다.
 * 이제 dry가 결과를 저장하고, 이 스크립트가 그 결과를 그대로 보낸다 —
 * 고객은 운영자가 승인한 바로 그 측정을 받는다.
 *
 * ## `audit:resend`와의 차이
 *
 * - resend — **이미 발송된** 리포트를 다시 보낸다. `status`·`sentAt`을
 *   건드리지 않는다 (최초 발송 시각이 납기 지표라서).
 * - publish — 저장된 dry 측정의 **최초 발송**이다. `status='sent'`와
 *   `sentAt`을 여기서 찍는다 — 리포트 페이지도 이때부터 열린다.
 */
import { STALE_MEASUREMENT_HOURS, measurementAge } from '@/lib/audit/freshness'
import { parseBaseUrlFlag, reportUrl, resolveReportBaseUrl } from '@/lib/audit/report-url'
import { getAudit, markSent } from '@/lib/audit/repository'
import type { AuditResult } from '@/lib/audit/result'
import { sendEmail } from '@/lib/email/send'
import { maskEmail } from '@/lib/email/mask'
import { auditReportEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'

const [auditId, ...flags] = process.argv.slice(2)

if (!auditId) {
  console.error('사용법: pnpm audit:publish <auditId> --base-url https://cited.co.kr')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}

// ★ 최초 발송 전용이다. 발송된 건을 다시 publish하면 `sentAt`이 덮여
//   "영업일 1일 이내" 납기 지표가 거짓이 된다 — 재발송은 resend가 맡는다.
if (audit.status === 'sent') {
  console.error(
    `이미 발송된 진단입니다 (${audit.sentAt?.toISOString() ?? '시각 불명'}).` +
      ` 다시 보내려면: pnpm audit:resend ${auditId} --base-url https://cited.co.kr`,
  )
  process.exit(1)
}

// ★ 저장된 결과가 없으면 보낼 것이 없다. 여기서 측정으로 넘어가지 않는다 —
//   측정은 돈이 들고, 검수 없이 나가면 안 된다. dry가 그 두 가지를 맡는다.
if (!audit.result) {
  console.error(
    `저장된 결과가 없습니다 (status=${audit.status}). 먼저 pnpm audit:run ${auditId} --dry로 측정하세요`,
  )
  process.exit(1)
}

if (!audit.emailVerified) {
  // ★ audit:run과 같은 게이트. 발송은 저장된 이메일로 나간다 — 인증 없이
  //   보내면 남의 이메일로 신청한 건에 리포트가 간다.
  console.error(`이메일이 인증되지 않았습니다 (status=${audit.status}). 보내지 않습니다.`)
  process.exit(1)
}

// 최초 발송은 정의상 실제 발송이다 — dry 모드가 없고, 로컬 주소를 거부한다
// (2026-07-30 localhost 링크 사고의 방어와 같다).
const resolved = resolveReportBaseUrl(parseBaseUrlFlag(flags) ?? env.NEXT_PUBLIC_APP_URL, 'send')
if (!resolved.ok) {
  console.error(`보내지 않았습니다 — ${resolved.reason}`)
  process.exit(1)
}

const result = audit.result as AuditResult
const url = reportUrl(resolved.baseUrl, audit.id)

console.log(`발송: ${audit.brandName} · ${maskEmail(audit.email)}`)
console.log(`링크: ${url}`)

// ★ 측정이 얼마나 오래됐는지 보여준다. dry와 발송 사이가 벌어지면 리포트가
//   "지금"을 말하지 않게 된다. 막지는 않는다 — 판단은 운영자 몫이다.
const age = measurementAge(result.measuredAt, new Date())
if (age) {
  console.log(age.label)
  if (age.stale) {
    console.warn(
      `[경고] 측정이 ${STALE_MEASUREMENT_HOURS}시간을 넘었습니다. AI 답변은 바뀝니다 — ` +
        `재측정을 고려하세요: pnpm audit:run ${auditId} --dry`,
    )
  }
} else {
  console.warn('[경고] 측정 시각(result.measuredAt)을 읽을 수 없습니다.')
}

// ★ 발송 완료 처리를 메일보다 먼저 한다 — audit:run의 발송 경로와 같은
//   순서다. 메일이 먼저 나가고 저장이 실패하면 고객 손에 404 링크가 남는다.
//   반대로 저장 후 메일이 실패하면 페이지는 이미 열려 있고, resend로 0원에
//   다시 보낼 수 있다.
// ★ 별칭은 dry가 저장한 측정 결과 안에 있다 — 그 측정에 실제로 쓴 별칭을
//   그대로 남긴다 (별칭이 언급률을 좌우하므로 측정 조건이다).
await markSent(audit.id, result, result.aliases)

// ★ tier를 반드시 넘긴다 — 생략하면 무료 본문이 된다(`auditReportEmail`의
//   기본값). publish 대상은 dry로 검수한 유료 건이다 — 유료 고객에게 무료
//   판촉 문단이 나가면 안 된다 (resend에서 최종 리뷰가 잡았던 버그와 같은 모양).
const sent = await sendEmail({
  to: audit.email,
  content: auditReportEmail({ result, url, tier: audit.tier }),
})
if (!sent.ok) {
  // 발송 완료 처리는 이미 됐다. 메일만 실패했으므로 재측정하지 말고 재발송한다.
  console.error(`리포트는 공개됐지만 메일 발송에 실패했습니다: ${sent.reason}`)
  console.error(`다시 보내기 (0원): pnpm audit:resend ${auditId} --base-url ${resolved.baseUrl}`)
  console.error(`수동 전달용 링크: ${url}`)
  process.exit(1)
}

console.log(`\n발송 완료 -> ${url}`)
