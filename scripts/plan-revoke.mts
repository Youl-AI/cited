/**
 * 플랜 회수.
 *
 *   pnpm plan:revoke <이메일>
 *
 * ★ 행을 지우지 않는다 — status='canceled'로 바꾼다. 결제 이력 보존
 *   (`subscriptions.userId`의 restrict 주석)과 재부여 시 upsert 대상이 되기
 *   위해서다. 회수하면 cron 측정 대상에서 빠진다(측정은 active·past_due만).
 */
import { parseGrantArgs } from '@/lib/subscriptions/grant-args'
import { findUserByEmail, revokePlan } from '@/lib/subscriptions/repository'

const [emailRaw] = process.argv.slice(2)
if (!emailRaw) {
  console.error('사용법: pnpm plan:revoke <이메일>')
  process.exit(1)
}
// 정규화 규칙을 grant와 하나로 — parseGrantArgs를 재사용한다.
const parsed = parseGrantArgs([emailRaw, 'starter'])
if (!parsed.ok) {
  console.error(parsed.reason)
  process.exit(1)
}
const email = parsed.args.email

const user = await findUserByEmail(email)
if (!user) {
  console.error(`가입된 계정이 없습니다: ${email}`)
  process.exit(1)
}
const revoked = await revokePlan(user.id)
if (!revoked) {
  console.error(`구독이 없습니다: ${email} — 회수할 것이 없습니다.`)
  process.exit(1)
}
console.log(`회수 완료: ${email} (plan=${revoked.plan} → canceled)`)
console.log('데이터는 유지됩니다. 다음 측정부터 대상에서 빠집니다.')
