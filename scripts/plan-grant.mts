/**
 * 플랜 수동 부여 (4단계 ① — 결제 없음, 수동 청구).
 *
 *   pnpm plan:grant <이메일> starter|business [--from-audit aud_xxx] [--packs N]
 *
 * ★ 부여 전 가입 여부를 확인한다. 미가입 이메일이면 거부 — 구독 행은
 *   user FK가 필요하고, 고객이 먼저 가입해야 온보딩으로 이어진다.
 * ★ --from-audit: 크몽 진단 행을 온보딩 프리필로 연결한다. 크몽 건은 운영자
 *   이메일로 등록돼 있어 자동 매칭이 불가능하다 — 명시 연결이 유일한 길이다.
 * ★ 부여한 만큼 운영자 원가가 나간다 (Starter 1명 ≈ 월 ~10,000원 실측 단가).
 *   돈 받은 고객만 부여하는 것이 비용 통제 장치다.
 */
import { getAudit } from '@/lib/audit/repository'
import { monthlyPriceKrw, resolveLimits } from '@/lib/plans'
import { parseGrantArgs } from '@/lib/subscriptions/grant-args'
import {
  findSubscriptionByAuditId,
  findSubscriptionByUserId,
  findUserByEmail,
  grantPlan,
} from '@/lib/subscriptions/repository'

const parsed = parseGrantArgs(process.argv.slice(2))
if (!parsed.ok) {
  console.error(parsed.reason)
  process.exit(1)
}
const { email, plan, queryPacks, fromAuditId } = parsed.args

const user = await findUserByEmail(email)
if (!user) {
  console.error(`가입된 계정이 없습니다: ${email}`)
  console.error('먼저 가입을 안내하세요 — 가입 후 다시 실행하면 됩니다.')
  process.exit(1)
}

if (fromAuditId) {
  // ★ 진단 id는 반드시 실재를 확인하고 넘어간다. `subscriptions.from_audit_id`에는
  //   FK가 없어서(진단 행과 구독은 수명이 다르다 — schema.ts 주석) 오타를 DB가
  //   받아준다. 받아주면 조용히 끊긴 id가 저장되고, 증상은 몇 주 뒤 고객이 보는
  //   "빈 온보딩 폼"으로 처음 나타난다 — 그때는 원인을 여기까지 되짚어야 한다.
  const audit = await getAudit(fromAuditId)
  if (!audit) {
    console.error(`진단을 찾을 수 없습니다: ${fromAuditId}`)
    console.error('id를 확인하세요: pnpm audit:list')
    process.exit(1)
  }

  // ★ unique 제약도 없다. 같은 진단을 두 계정에 붙이면 두 고객의 온보딩이
  //   같은 브랜드·같은 동결 질의로 프리필된다 — 남의 브랜드가 뜨는 사고다.
  //   다른 사용자면 **중단**한다(복붙 오타가 압도적으로 흔한 원인이다).
  //   같은 사용자의 재부여(플랜 변경·회수 후 복구)는 정상 경로이므로 통과시킨다.
  const linked = await findSubscriptionByAuditId(fromAuditId)
  if (linked && linked.userId !== user.id) {
    console.error(`이 진단은 이미 다른 계정의 구독에 연결돼 있습니다: ${fromAuditId}`)
    console.error(`  연결된 구독 id: ${linked.id} (plan=${linked.plan}, status=${linked.status})`)
    console.error('id를 잘못 붙였는지 확인하세요. 연결을 옮기려면 기존 구독을 먼저 정리해야 합니다.')
    process.exit(1)
  }

  // ★ 연결 "교체"도 해제만큼 조용하다. aud_OLD → aud_NEW는 upsert가 한 줄로
  //   덮어쓰고 끝나서, 잘못된 id를 붙였을 때 원래 무엇이 걸려 있었는지 되짚을
  //   길이 사라진다. 해제(else 가지)와 같은 원칙으로 두 id를 모두 이름 대서 말한다.
  const existing = await findSubscriptionByUserId(user.id)
  if (existing?.fromAuditId && existing.fromAuditId !== fromAuditId) {
    console.warn(`[주의] 기존 진단 연결이 교체됩니다: ${existing.fromAuditId} → ${fromAuditId}`)
    console.warn(`  되돌리려면: pnpm plan:grant ${email} ${plan} --from-audit ${existing.fromAuditId}`)
  }

  // ★ status를 같이 찍는다. rejected·requested 진단도 id만 맞으면 연결되는데,
  //   그런 진단은 동결 질의·리포트가 없거나 못 쓰는 것이다 — 확인 줄에 안 보이면
  //   운영자는 잘못 붙인 걸 알 방법이 없다.
  console.log(
    `진단 연결: ${audit.brandName} · ${audit.category} · tier=${audit.tier} · status=${audit.status}`,
  )
  if (!audit.queries || audit.queries.length === 0) {
    // 동결 질의가 없으면 프리필은 브랜드 정보뿐이다. 막지는 않는다 — 무료
    // 진단 전환도 이 경로를 쓸 수 있다.
    console.warn('  [주의] 동결 질의가 없습니다 — 질의 프리필 없이 템플릿으로 시작합니다.')
  }
} else {
  // ★ 부여는 upsert고 `fromAuditId`를 인자 그대로 덮어쓴다. 그래서 플랜 변경
  //   (starter → business)을 --from-audit 없이 실행하면 기존 크몽 연결이 조용히
  //   null이 된다 — 막지는 않는다(잘못 붙인 연결을 끊는 유일한 방법이기도 하다).
  //   대신 무엇이 사라지는지 여기서 말한다.
  const existing = await findSubscriptionByUserId(user.id)
  if (existing?.fromAuditId) {
    console.warn(`[주의] 기존 진단 연결이 해제됩니다: ${existing.fromAuditId}`)
    console.warn(`  유지하려면: pnpm plan:grant ${email} ${plan} --from-audit ${existing.fromAuditId}`)
  }
}

const subscription = await grantPlan({ userId: user.id, plan, queryPacks, fromAuditId })
const limits = resolveLimits(plan, queryPacks)

console.log(`부여 완료: ${user.name} <${email}>`)
console.log(
  `  플랜 ${plan} · 질의 팩 ${queryPacks} → 질의 한도 ${limits.maxQueries}개(계정 전체) · 브랜드 ${limits.maxBrands}개`,
)
console.log(`  월 청구액(수동): ${monthlyPriceKrw(plan, queryPacks).toLocaleString('ko-KR')}원`)
console.log(`  구독 id: ${subscription.id}`)
console.log('\n다음: 고객이 로그인하면 온보딩(브랜드 → 질의 확정)으로 안내됩니다.')
