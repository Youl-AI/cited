/**
 * 정밀 진단의 질의를 만들고 동결한다.
 *
 *   pnpm audit:queries aud_xxx --brief "기구 필라테스 전문, 그룹·개인 레슨"
 *     → 템플릿 3 + LLM 후보 7을 audit-queries.aud_xxx.json 에 쓴다
 *   (운영자가 파일을 열어 검수·수정한다 — 후보는 초안이지 완성본이 아니다)
 *   pnpm audit:queries aud_xxx --freeze
 *     → 파일을 검증해 DB에 동결한다
 *
 * ★ 동결 후에는 질의를 바꾸지 않는다. 재측정(전후 비교)이 이 질의를 그대로
 *   다시 던지는 것이 상품의 근거다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createCustomQueryGenerator, validateCustomQueries } from '@/lib/audit/custom-queries'
import { generateAuditQueries, isRegionalCategory } from '@/lib/audit/queries'
import { freezeQueries, getAudit } from '@/lib/audit/repository'
import { AUDIT_TIERS, isPaidTier } from '@/lib/audit/tiers'

const argv = process.argv.slice(2)
const freeze = argv.includes('--freeze')
const briefIdx = argv.indexOf('--brief')
const brief = briefIdx >= 0 ? argv[briefIdx + 1] : undefined
const auditId = argv.find((a) => !a.startsWith('--') && a !== brief)

if (!auditId) {
  console.error('사용법: pnpm audit:queries <auditId> [--brief "서비스 설명"] [--freeze]')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (!isPaidTier(audit.tier)) {
  console.error(`무료 진단은 템플릿 질의를 씁니다 (tier=${audit.tier}). 이 단계가 필요 없습니다.`)
  process.exit(1)
}
// ★ 재측정 건은 질의를 원본에서 복제한다(`audit-remeasure.mts`) — 전후 비교의
//   유효성이 "같은 질의"에 걸려 있다. 여기서 새로 만들거나 다시 동결하면
//   비교가 조용히 거짓이 되므로, 생성·동결 둘 다 들어가기 전에 거부한다.
if (audit.parentId) {
  console.error('재측정 건입니다 — 질의는 원본에서 복제됩니다. 새로 만들면 전후 비교가 무효가 됩니다.')
  process.exit(1)
}

const tierCfg = AUDIT_TIERS[audit.tier]
const file = `audit-queries.${audit.id}.json`
const ctx = {
  brandName: audit.brandName,
  competitors: audit.competitors,
  regional: isRegionalCategory(audit.category),
  ...(audit.region ? { region: audit.region } : {}),
  requiredCount: tierCfg.queryCount,
}

if (freeze) {
  if (!existsSync(file)) {
    console.error(`${file}이 없습니다. 먼저 --freeze 없이 실행해 후보를 만드세요.`)
    process.exit(1)
  }
  const queries = JSON.parse(readFileSync(file, 'utf8')) as string[]
  const validated = validateCustomQueries(queries, ctx)
  await freezeQueries(audit.id, validated)
  console.log(`동결 완료 — ${validated.length}개`)
  for (const [i, q] of validated.entries()) console.log(`  q${i + 1}  ${q}`)
  console.log(`\n다음: pnpm audit:run ${audit.id} --dry`)
  process.exit(0)
}

// 템플릿 3개(항상 포함 — 무료 샘플과의 연속성) + LLM 후보
const template = generateAuditQueries(audit.category, audit.brandName, audit.region ?? undefined)
const generate = createCustomQueryGenerator({
  onUsage: (u) => console.log(`  생성 토큰 in=${u.tokensIn} out=${u.tokensOut}`),
})
const candidates = await generate({
  brandName: audit.brandName,
  category: audit.category,
  ...(audit.region ? { region: audit.region } : {}),
  ...(brief ? { brief } : {}),
  competitors: audit.competitors,
  count: tierCfg.queryCount - template.length,
})

const draft = [...template, ...candidates]
writeFileSync(file, JSON.stringify(draft, null, 2) + '\n', 'utf8')

console.log(
  `후보 ${draft.length}개를 ${file} 에 썼습니다 (앞 ${template.length}개는 템플릿 — 무료 샘플과 같은 질문).`,
)
console.log('파일을 열어 검수·수정한 뒤 동결하세요:')
console.log(`  pnpm audit:queries ${audit.id} --freeze`)
// 검증을 미리 돌려 문제를 알려준다 — 동결 때 처음 알면 왕복이 늘어난다.
try {
  validateCustomQueries(draft, ctx)
  console.log('사전 검증: 통과 (수정해도 --freeze가 다시 검증합니다)')
} catch (error) {
  console.warn(`사전 검증 경고: ${error instanceof Error ? error.message : String(error)}`)
}
