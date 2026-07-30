/**
 * 진단 신청을 운영자가 직접 등록한다. 이메일 인증을 건너뛴다.
 *
 *   pnpm audit:new "무신사" "패션" --email "고객@example.com" \
 *     --competitors "29CM,지그재그" --domains "musinsa.com" --source kmong
 *
 * ★ 크몽 주문은 웹 폼을 거치지 않는다. 고객이 크몽 메시지로 브랜드명을 알려주고
 *   운영자가 대신 입력한다. 이 CLI가 없으면 DB에 직접 INSERT하게 되는데, 그러면
 *   상태값과 제약을 손으로 맞춰야 하고 언젠가 틀린다.
 *
 * ★ 이메일 인증을 건너뛰는 것은 크몽에서 결제가 이미 확인됐기 때문이다.
 *   남용 위험이 없다. 다만 **`source`에 반드시 기록한다** — 그렇지 않으면
 *   나중에 `email_verified = true`인 행 중 어느 것이 실제로 링크를 눌렀고
 *   어느 것이 운영자가 통과시킨 것인지 구분할 수 없고, 인증 게이트가 실제로
 *   작동하는지 감사할 수 없게 된다.
 */
import { createVerifiedAudit, hashIp } from '@/lib/audit/repository'
import { MAX_COMPETITORS, parseHostname } from '@/lib/audit/request-schema'
import { AUDIT_SOURCES } from '@/lib/db/schema'
import type { AuditSource } from '@/lib/db/schema'

const argv = process.argv.slice(2)

function option(name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const value = argv[i + 1]
  argv.splice(i, value === undefined ? 1 : 2)
  return value
}

const email = option('--email')
const competitorsArg = option('--competitors')
const domainsArg = option('--domains')
const sourceArg = option('--source') ?? 'kmong'

const [brandName, category] = argv

if (!brandName || !category || !email) {
  console.error(
    '사용법: pnpm audit:new "<브랜드>" "<카테고리>" --email <이메일>' +
      ' [--competitors a,b] [--domains a,b] [--source kmong|manual]',
  )
  process.exit(1)
}
if (!(AUDIT_SOURCES as readonly string[]).includes(sourceArg)) {
  console.error(`알 수 없는 source: ${sourceArg} (${AUDIT_SOURCES.join(' | ')})`)
  process.exit(1)
}
// ★ 'web'은 실제로 폼을 거친 신청에만 쓴다. CLI로 만든 행에 'web'을 붙이면
//   인증 게이트 감사가 무의미해진다. `createVerifiedAudit`도 거부하지만,
//   여기서 먼저 막아야 사용법을 알려줄 수 있다.
if (sourceArg === 'web') {
  console.error("source에 'web'을 쓸 수 없습니다. 폼을 거친 신청에만 쓰는 값입니다.")
  process.exit(1)
}

const csv = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const competitorInputs = csv(competitorsArg)
// ★ 자기 자신이 경쟁사로 들어가면 Share of Voice가 자기를 두 번 센다.
//   폼(`request-schema.ts`)이 하는 정규화를 여기서도 해야 한다 — 이 경로는
//   폼을 거치지 않는다.
const competitors = [
  ...new Set(competitorInputs.filter((c) => c !== brandName.trim())),
].slice(0, MAX_COMPETITORS)

if (competitorInputs.length > competitors.length) {
  console.warn(
    `경쟁사 ${competitorInputs.length}개 중 ${competitors.length}개만 씁니다` +
      ` (중복·자기 자신 제거, 최대 ${MAX_COMPETITORS}개).`,
  )
}

// ★ 폼과 같은 정규화를 거친다. `https://www.musinsa.com/kr`을 그대로 넣으면
//   citationDomain이 뽑는 호스트명과 절대 일치하지 않아 소유 판정이 조용히
//   전부 실패한다 — 리포트가 "인용 0회"라고 말하는데 원인은 입력 형식이다.
const selfDomains: string[] = []
for (const raw of csv(domainsArg)) {
  const host = parseHostname(raw)
  if (host === null) {
    console.error(`사이트 주소를 알아볼 수 없습니다: ${raw}`)
    process.exit(1)
  }
  selfDomains.push(host)
}

// 결제가 확인됐으므로 인증을 건너뛴다. 그 사실이 source에 남는다.
const created = await createVerifiedAudit({
  brandName: brandName.trim(),
  category: category.trim(),
  email: email.trim().toLowerCase(),
  competitors,
  selfDomains,
  source: sourceArg as Exclude<AuditSource, 'web'>,
  // IP가 없다. 운영자 등록임을 나타내는 고정 값을 해시한다 — ipHash는 notNull이고
  // 스팸 관측용이므로 빈 문자열을 넣으면 웹 신청과 섞인다.
  ipHash: hashIp('cli'),
})

console.log(`등록 완료: ${created.id}`)
console.log(`  ${created.brandName} · ${created.category} · source=${created.source}`)
console.log(
  `  경쟁사 ${competitors.length}개${competitors.length ? `: ${competitors.join(', ')}` : ''}`,
)
console.log(
  selfDomains.length > 0
    ? `  우리 도메인: ${selfDomains.join(', ')}`
    : '  [주의] --domains 없음 — 인용 출처의 소유 판정을 하지 않습니다',
)
console.log(`\n실행: pnpm audit:run ${created.id} --dry`)
