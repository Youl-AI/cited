/**
 * PREMIUM 재측정을 등록한다 — 원본의 조건(질의·경쟁사·도메인·지역)을 그대로
 * 복제하고 parentId로 연결한다.
 *
 *   pnpm audit:remeasure aud_원본id
 *
 * ★ 질의를 새로 만들지 않는다. 같은 질의를 다시 던져야 "4주 전과 비교"가
 *   성립한다 — 질의가 다르면 변화가 실제인지 질문 차이인지 가릴 수 없다.
 */
import { createVerifiedAudit, freezeQueries, getAudit, hashIp } from '@/lib/audit/repository'

const [parentId] = process.argv.slice(2)
if (!parentId) {
  console.error('사용법: pnpm audit:remeasure <원본 auditId>')
  process.exit(1)
}

const parent = await getAudit(parentId)
if (!parent) {
  console.error(`원본을 찾을 수 없습니다: ${parentId}`)
  process.exit(1)
}
if (parent.status !== 'sent' || !parent.result) {
  console.error(`원본이 발송 완료 상태가 아닙니다 (status=${parent.status}). 비교할 결과가 없습니다.`)
  process.exit(1)
}
if (!parent.queries || parent.queries.length === 0) {
  console.error('원본에 동결 질의가 없습니다 — 무료 진단은 재측정 대상이 아닙니다.')
  process.exit(1)
}

const created = await createVerifiedAudit({
  brandName: parent.brandName,
  category: parent.category,
  email: parent.email,
  competitors: parent.competitors,
  selfDomains: parent.selfDomains,
  source: 'kmong',
  ipHash: hashIp('cli'),
  tier: 'premium',
  region: parent.region,
  parentId: parent.id,
})
// 원본 질의를 그대로 동결한다.
await freezeQueries(created.id, parent.queries)

console.log(`재측정 등록: ${created.id} (원본 ${parent.id})`)
console.log(`질의 ${parent.queries.length}개를 원본에서 복제·동결했습니다.`)
console.log(`\n실행: pnpm audit:run ${created.id} --dry`)
