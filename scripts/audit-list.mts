/**
 * 실행 대기 중인 진단 신청 목록.
 *
 *   pnpm audit:list
 *
 * ★ 무료 진단은 자동 트리거가 없다. 이 목록을 보지 않으면 신청이 방치되고
 *   "영업일 1일 이내"라는 약속이 조용히 깨진다.
 */
import { listPendingAudits, listRecentAudits } from '@/lib/audit/repository'
import { AUDIT_TIERS } from '@/lib/audit/tiers'
import { maskEmail } from '@/lib/email/mask'

const pending = await listPendingAudits()
const recent = await listRecentAudits(10)

if (pending.length === 0) {
  console.log('대기 중인 진단이 없습니다.')
} else {
  console.log(`대기 ${pending.length}건 (오래된 순)\n`)
  for (const a of pending) {
    const waited = Math.round((Date.now() - a.createdAt.getTime()) / 3_600_000)
    const flag = a.status === 'failed' ? ' [실패·재실행 필요]' : ''
    console.log(`  ${a.id}`)
    console.log(
      `    ${a.brandName} · ${a.category} · ${AUDIT_TIERS[a.tier].label} · 경쟁사 ${a.competitors.length}개 · ` +
        `${maskEmail(a.email)} · ${waited}시간 경과${flag}`,
    )
    // 도메인이 없으면 리포트에서 "우리 사이트 인용 여부" 줄이 빠진다.
    // 운영자가 실행 전에 고객에게 물어볼 기회를 준다.
    if (a.selfDomains.length === 0) {
      console.log('    도메인 없음 — 인용 출처의 소유 판정을 하지 않습니다')
    }
    if (a.failureReason) console.log(`    사유: ${a.failureReason}`)
    console.log(`    실행: pnpm audit:run ${a.id} --dry`)
  }
}

console.log('\n최근 10건:')
for (const a of recent) {
  console.log(
    `  ${a.status.padEnd(9)} ${a.source.padEnd(6)} ${a.brandName.padEnd(16)} ` +
      a.createdAt.toISOString().slice(0, 16),
  )
}

// ★ 24시간을 넘긴 대기 건은 약속 위반이다. 눈에 띄게 경고한다.
const overdue = pending.filter((a) => Date.now() - a.createdAt.getTime() > 24 * 3_600_000)
if (overdue.length > 0) {
  console.warn(
    `\n[경고] 24시간을 넘긴 신청이 ${overdue.length}건 있습니다. '영업일 1일 이내'를 약속했습니다.`,
  )
}
