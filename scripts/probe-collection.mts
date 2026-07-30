/**
 * `runCollection`을 **실제 엔진**으로 돌린다.
 *
 *   pnpm probe:collection
 *   pnpm probe:collection --queries 2 --concurrency 1
 *
 * 단위 테스트는 엔진을 주입해서 조립만 검증한다. 실제로 확인해야 하는 것은
 * 여기 있다 — 동시성 상한이 정말 걸리는가, 재시도가 살아 있는가, 원가가
 * 계획서 추정과 맞는가. 이 프로젝트에서 원가 계산은 세 번 틀렸고 실측만 맞았다.
 *
 * ★ 돈이 나간다. 기본값은 무료 플랜 팬아웃(3질의 × 2엔진 × 1샘플 = 6회)이고
 *   약 250원이다. DB는 건드리지 않는다 — 저장 계층은 유료 경로의 몫이다.
 */
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import { ENGINE_QUEUE_CONCURRENCY } from '@/lib/collection/queues'
import { answerKey, runCollection } from '@/lib/collection/run'
import { isDegraded } from '@/lib/collection/completeness'
import { buildRunMetrics, resolveRunStatus } from '@/lib/collection/repository'
import { citationDomain } from '@/lib/stats/sources'

const argv = process.argv.slice(2)

function option(name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const value = argv[i + 1]
  argv.splice(i, value === undefined ? 1 : 2)
  return value
}

const queryCount = Number(option('--queries') ?? 3)
const concurrencyArg = option('--concurrency')

const ALL_QUERIES = [
  '30대 남자 러닝화 추천해줘',
  '발볼 넓은 사람 운동화 뭐가 좋아?',
  '입문용 러닝화 브랜드 알려줘',
]

if (!Number.isInteger(queryCount) || queryCount < 1 || queryCount > ALL_QUERIES.length) {
  console.error(`--queries는 1~${ALL_QUERIES.length} 사이 정수여야 합니다`)
  process.exit(1)
}

const queries = ALL_QUERIES.slice(0, queryCount).map((text, i) => ({ id: `q${i + 1}`, text }))

// 무료 플랜 설정을 그대로 쓴다. 프로브가 더 크게 돌면 실측치가 제품과 어긋난다.
const snapshot = buildPlanSnapshot({
  plan: 'free',
  queryPacks: 0,
  queryIds: queries.map((q) => q.id),
  competitors: [],
  detectorVersion: 1,
})
const items = buildFanout(snapshot, queries)

const concurrency = concurrencyArg
  ? { chatgpt: Number(concurrencyArg), gemini: Number(concurrencyArg) }
  : undefined

console.log(`팬아웃 ${items.length}회 · 엔진 ${snapshot.engines.join(', ')}`)
console.log(
  `동시성 ${concurrency ? `${concurrencyArg} (강제)` : `기본값 chatgpt=${ENGINE_QUEUE_CONCURRENCY.chatgpt} gemini=${ENGINE_QUEUE_CONCURRENCY.gemini}`}`,
)

const started = Date.now()
const result = await runCollection(items, {
  ...(concurrency ? { concurrency } : {}),
  onProgress: (done, total) => process.stdout.write(`\r  수집 ${done}/${total}`),
})
process.stdout.write('\n')

console.log(`\n소요 ${((Date.now() - started) / 1000).toFixed(1)}초`)
console.log(`성공 ${result.answers.length}/${result.outcomes.length}`)

const retried = result.outcomes.filter((o) => o.attempts > 1)
if (retried.length > 0) {
  console.log(`재시도 발생 ${retried.length}건:`)
  for (const o of retried) console.log(`  ${o.engineId} · ${o.attempts}회 · ${o.error ?? '결국 성공'}`)
} else {
  console.log('재시도 없음')
}

for (const o of result.outcomes.filter((x) => !x.ok)) {
  console.error(`  실패: ${o.engineId} — ${o.error}`)
}

console.log('\n엔진별 완전성')
for (const [engineId, tally] of Object.entries(result.completeness)) {
  if (!tally) continue
  console.log(`  ${engineId.padEnd(10)} ${tally.succeeded}/${tally.attempted}`)
}
console.log(`상태 ${resolveRunStatus(result.completeness)}${isDegraded(result.completeness) ? ' (배지 대상)' : ''}`)

const metrics = buildRunMetrics(result.outcomes, result.answers, result.costMilliKrw)
console.log('\n원가·토큰')
console.log(`  호출 ${JSON.stringify(metrics.callsByEngine)}`)
console.log(`  토큰 in ${metrics.tokensIn} / out ${metrics.tokensOut}`)
console.log(`  원가 ${metrics.estimatedCostMilliKrw}밀리원 = ${metrics.estimatedCostKrw}원`)
console.log(
  `  호출당 ${result.answers.length > 0 ? Math.round(result.costMilliKrw / result.answers.length / 1000) : 0}원`,
)

console.log('\n답변 (입력 순서 유지 확인)')
for (const a of result.answers) {
  const domains = [...new Set(a.citations.map(citationDomain).filter(Boolean))]
  console.log(`  ${answerKey(a).padEnd(22)} ${a.text.length}자 · 인용 ${a.citations.length}건`)
  console.log(`      도메인 ${domains.slice(0, 4).join(', ') || '(없음)'}`)
  console.log(`      ${a.text.slice(0, 90).replace(/\s+/g, ' ')}…`)
}

// ★ raw를 잃으면 판정 로직을 개선한 뒤 재판정할 수가 없다. 실제로 채워지는지
//   프로브에서 확인한다 — 단위 테스트는 가짜 엔진이 넣어준 값만 본다.
const missingRaw = result.answers.filter((a) => a.raw === null || a.raw === undefined)
if (missingRaw.length > 0) {
  console.error(`\n⚠ raw가 빈 답변 ${missingRaw.length}건 — 재판정이 불가능해집니다`)
}
const noCitations = result.answers.filter((a) => a.citations.length === 0)
if (noCitations.length > 0) {
  console.warn(`\n⚠ 인용 0건인 답변 ${noCitations.length}건 — 어댑터가 citations를 흘리는지 확인하세요`)
}
