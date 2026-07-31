/**
 * 개선 가이드를 저장한다. 운영자가 마크다운 파일로 쓴 것을 붙인다.
 *
 *   pnpm audit:guide aud_xxx guide.md
 *
 * 발송 전이면 리포트에 실려 나가고, 발송 후 저장하면 웹 링크에서만 갱신된다
 * (메일은 이미 나갔다 — 필요하면 audit:resend).
 */
import { readFileSync } from 'node:fs'
import { getAudit, saveGuide } from '@/lib/audit/repository'
import { isPaidTier } from '@/lib/audit/tiers'

const [auditId, file] = process.argv.slice(2)
if (!auditId || !file) {
  console.error('사용법: pnpm audit:guide <auditId> <가이드.md>')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}

// 가이드는 DELUXE부터다 (PREMIUM 포함). STANDARD에 저장하면 판 적 없는 것을
// 리포트가 렌더하게 된다.
if (!isPaidTier(audit.tier) || audit.tier === 'standard') {
  console.error(`개선 가이드는 DELUXE부터입니다 (tier=${audit.tier}).`)
  process.exit(1)
}

const md = readFileSync(file, 'utf8')
await saveGuide(audit.id, md)
console.log(`가이드 저장 완료 (${md.length}자) → /audit/${audit.id}`)
