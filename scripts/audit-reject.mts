/**
 * 신청을 실행하지 않고 닫는다.
 *
 *   pnpm audit:reject aud_xxx "사유"
 *
 * ★ 왜 필요한가: 스팸·중복·장난 신청, 그리고 테스트로 만든 행을 대기 목록에서
 *   빼야 한다. 빼지 않으면 `audit:list`가 영원히 "24시간을 넘긴 신청"을
 *   경고하고, 그 경고가 늘 켜져 있으면 **진짜 늦은 신청을 못 본다.**
 *
 * ★ 지우지 않고 상태만 바꾼다. 인증 게이트가 실제로 작동했는지 감사하려면
 *   행이 남아 있어야 하고, 같은 사람이 반복 신청하는 것도 봐야 한다.
 */
import { getAudit, markRejected } from '@/lib/audit/repository'

const [auditId, reason] = process.argv.slice(2)

if (!auditId || !reason) {
  console.error('사용법: pnpm audit:reject <auditId> "<사유>"')
  console.error('  사유는 필수다 — 나중에 "왜 이 신청을 안 돌렸나"에 답해야 한다.')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (audit.status === 'sent') {
  // 이미 고객에게 리포트가 갔다. 그걸 rejected로 바꾸면 기록이 거짓이 된다.
  console.error(`이미 발송된 진단입니다 (${audit.sentAt?.toISOString() ?? '시각 불명'}).`)
  process.exit(1)
}

await markRejected(auditId, reason)
console.log(`반려 처리: ${auditId} (${audit.brandName})`)
console.log(`  사유: ${reason}`)
