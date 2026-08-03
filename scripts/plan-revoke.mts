/**
 * 플랜 회수.
 *
 *   pnpm plan:revoke <이메일>
 *
 * ★ 행을 지우지 않는다 — status='canceled'로 바꾼다. 결제 이력 보존
 *   (`subscriptions.userId`의 restrict 주석)과 재부여 시 upsert 대상이 되기
 *   위해서다.
 * ★ 회수해도 **아직은 측정이 자동으로 멈추지 않는다.** 구독 status로 측정
 *   대상을 거르는 코드는 `src/`에 없다(이후 태스크의 측정 cron이 할 일이다).
 *   그때까지는 회수 = "청구를 멈춘다"는 기록일 뿐이므로, 원가를 실제로 끊으려면
 *   운영자가 따로 확인해야 한다.
 */
import { normalizeEmail } from '@/lib/subscriptions/grant-args'
import { findUserByEmail, revokePlan } from '@/lib/subscriptions/repository'

// ★ 사용법 안내는 revoke의 것을 쓴다. 예전엔 parseGrantArgs를 재사용했는데,
//   그러면 실패할 때 grant의 사용법(`<이메일> starter|business ...`)이 찍혀
//   운영자에게 엉뚱한 명령을 알려 준다. 공유하는 것은 정규화 규칙뿐이다.
const USAGE = '사용법: pnpm plan:revoke <이메일>'

const email = normalizeEmail(process.argv[2] ?? '')
if (!email) {
  console.error(USAGE)
  process.exit(1)
}

const user = await findUserByEmail(email)
if (!user) {
  console.error(`가입된 계정이 없습니다: ${email}`)
  process.exit(1)
}
const result = await revokePlan(user.id)
if (!result.ok) {
  if (result.reason === 'already-canceled') {
    console.error(`이미 회수된 구독입니다: ${email}`)
    console.error('  최초 회수 시각(canceled_at)을 덮어쓰지 않으려고 아무것도 바꾸지 않았습니다.')
  } else {
    console.error(`구독이 없습니다: ${email} — 회수할 것이 없습니다.`)
  }
  process.exit(1)
}
console.log(`회수 완료: ${email} (plan=${result.subscription.plan} → canceled)`)
console.log('데이터는 유지됩니다 — 해지 고객도 결제한 기간의 측정 이력은 대시보드에서 계속 봅니다.')
// Task 6가 측정 필터를 status IN ('active','past_due')로 걸었다 — canceled는
// 다음 회차부터 측정에서 빠진다. (Task 12 검증에서 이 안내가 낡은 채 발견돼 정정.)
console.log('측정 중단: canceled 구독은 다음 회차부터 측정 대상에서 빠집니다.')
