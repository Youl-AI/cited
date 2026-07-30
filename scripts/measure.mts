/**
 * 실제 엔진으로 브랜드 언급률과 인용 출처를 측정한다.
 *
 *   pnpm measure "아식스" "30대 남자 러닝화 추천해줘" "발볼 넓은 운동화"
 *   pnpm measure --samples 1 --engines gemini "무신사" "온라인 패션 쇼핑몰 추천해줘"
 *   pnpm measure --competitors "나이키,뉴발란스" --domains asics.com "아식스" "러닝화 추천"
 *
 * 3단계에서 Trigger.dev 위로 옮길 흐름의 축소판이다. 원가도 함께 출력해
 * 설계 문서의 추정치가 맞는지 확인한다 — 이 프로젝트에서 원가 계산은
 * 세 번 틀렸고 실측만 맞았다.
 *
 * ★ 돈이 나간다. 기본값은 질의 × 엔진 2종 × 3샘플이다. 질의 3개면 18회
 *   호출이고 약 700원이다. 먼저 `--samples 1`로 감을 잡아라.
 */
import { detectMentions } from '@/lib/detection'
import { getEngine, implementedEngineIds, isEngineId } from '@/lib/engines'
import { estimateCostKrw, estimateJudgeCostKrw } from '@/lib/engines/pricing'
import type { EngineId } from '@/lib/plans'
import { createClaudeJudge } from '@/lib/judge/claude'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'
import { aggregateSources, summarizeSources, type Citation } from '@/lib/stats/sources'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

const argv = process.argv.slice(2)

function option(name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const value = argv[i + 1]
  argv.splice(i, value === undefined ? 1 : 2)
  return value
}

const samples = Number(option('--samples') ?? 3)
const enginesArg = option('--engines')
const competitorsArg = option('--competitors')
const domainsArg = option('--domains')
const aliasesArg = option('--aliases')

const [brandName, ...queries] = argv
if (!brandName || queries.length === 0 || !Number.isInteger(samples) || samples < 1) {
  console.error(
    '사용법: pnpm measure [--samples N] [--engines a,b] [--aliases a,b]' +
      ' [--competitors a,b] [--domains a,b] "<브랜드>" "<질의1>" ...',
  )
  process.exit(1)
}

const engineIds: EngineId[] = enginesArg
  ? enginesArg.split(',').map((s) => {
      const id = s.trim()
      if (!isEngineId(id)) {
        console.error(`알 수 없는 엔진: ${id}`)
        process.exit(1)
      }
      return id
    })
  : implementedEngineIds()

const competitorNames = (competitorsArg ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const selfDomains = (domainsArg ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const selfAliases = (aliasesArg ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

interface Collected extends AnswerRecord {
  text: string
  citations: Citation[]
}

const answers: Collected[] = []
let engineCostKrw = 0
let failures = 0

console.log(
  `측정 시작: ${brandName} · 질의 ${queries.length}개 · 엔진 ${engineIds.join(', ')} × ${samples}샘플`,
)
if (selfAliases.length > 0) console.log(`별칭: ${selfAliases.join(', ')}`)
else
  console.warn(
    '⚠ 별칭이 없다. ChatGPT는 영문 표기만 쓰므로 한글 브랜드명만으로는 0%로 측정된다 (--aliases 참고).',
  )
if (competitorNames.length > 0) console.log(`경쟁사: ${competitorNames.join(', ')}`)

for (const [qi, query] of queries.entries()) {
  for (const engineId of engineIds) {
    const engine = await getEngine(engineId)
    if (!engine.isConfigured()) {
      console.warn(`  ${engineId}: 키 없음 — 건너뜀`)
      continue
    }
    process.stdout.write(`  q${qi} ${engineId} `)
    for (let s = 0; s < samples; s++) {
      try {
        const a = await engine.run(query, { sampleIndex: s })
        engineCostKrw += estimateCostKrw(engineId, a.usage)
        answers.push({
          id: `q${qi}-${engineId}-${s}`,
          queryId: `q${qi}`,
          queryText: query,
          engineId,
          text: a.text,
          citations: a.citations,
        })
        process.stdout.write('.')
      } catch (error) {
        failures++
        process.stdout.write('x')
        console.error(`\n    실패: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    process.stdout.write('\n')
  }
}

if (answers.length === 0) {
  // 답변 0건으로 만든 리포트는 "언급 0%"처럼 보인다. 측정 실패를 측정
  // 결과로 배송하면 안 된다.
  console.error('\n수집된 답변이 없습니다. 측정을 중단합니다.')
  process.exit(1)
}
console.log(`\n수집 완료: ${answers.length}건${failures > 0 ? ` (실패 ${failures}건)` : ''}`)

let judgeIn = 0
let judgeOut = 0
const judge = createClaudeJudge({
  onUsage: (u) => {
    judgeIn += u.tokensIn
    judgeOut += u.tokensOut
  },
})

// ★ 별칭은 선택 사항이 아니다. 2026-07-30 실측: 같은 질의·같은 시스템
//   프롬프트인데 **ChatGPT는 영문 표기만, Gemini는 한글 표기만** 쓴다.
//     ChatGPT: "ASICS GEL-CUMULUS 28"  (아식스 없음)
//     Gemini : "아식스 노바블라스트"      (ASICS 없음)
//   영문 별칭 없이 `canonical: '아식스'`만 넘기면 ChatGPT 언급률이
//   **구조적으로 0%**로 측정된다. 엔진 비교가 통째로 거짓이 된다.
const self = { canonical: brandName, aliases: selfAliases, ambiguous: false }
const competitors = competitorNames.map((canonical) => ({
  canonical,
  aliases: [],
  ambiguous: false,
}))

const detections = await detectMentions(
  answers.map((a) => ({ answerId: a.id, answerText: a.text, self, competitors })),
  judge,
  {
    onStats: (s) =>
      console.log(
        `판정: 1차 후보 ${s.stage1Candidates} → 통과 ${s.stage1Passed}` +
          ` (${formatPercent(s.stage1Passed / s.stage1Candidates)})` +
          ` → 2차 호출 ${s.stage2Called}, 미판정 ${s.unresolved}`,
      ),
    onBatchError: (e, ids) =>
      console.error(`판정 배치 실패 (${ids.length}건): ${e instanceof Error ? e.message : e}`),
  },
)

const byId = new Map(answers.map((a) => [a.id, a]))
const detectionRecords: DetectionRecord[] = detections.map((d) => {
  const a = byId.get(d.answerId)!
  return {
    answerId: d.answerId,
    queryId: a.queryId,
    engineId: a.engineId,
    subject: d.subject,
    mentioned: d.mentioned,
    position: d.position,
  }
})

const m = computeMetrics(answers, detectionRecords, {
  self: 'self',
  competitors: competitorNames.map((c) => `competitor:${c}`),
})

const line = '─'.repeat(64)
console.log(`\n${line}\n${brandName} · ${m.totalAnswers}회 시행\n${line}`)
console.log(`Cited Rate     ${formatPercent(m.citedRate.point).padStart(6)}  ${formatInterval(m.citedRate)}`)
console.log(`First-Mention  ${formatPercent(m.firstMentionRate.point).padStart(6)}`)
if (m.shareOfVoice.n > 0) {
  console.log(
    `Share of Voice ${formatPercent(m.shareOfVoice.point).padStart(6)}  ${formatInterval(m.shareOfVoice)}` +
      `  (분모 ${m.shareOfVoice.n} — 등록 경쟁사 대비)`,
  )
}

console.log('\n엔진별')
for (const [engineId, ci] of Object.entries(m.byEngine)) {
  console.log(`  ${engineId.padEnd(12)} ${formatPercent(ci.point).padStart(6)}  ${formatInterval(ci)}`)
}

console.log('\n질의별 (못 나오는 것부터 — 여기가 조치 대상)')
for (const q of m.byQuery) {
  console.log(`  ${formatPercent(q.interval.point).padStart(6)}  ${q.interval.k}/${q.interval.n}  ${q.queryText}`)
}

if (competitorNames.length > 0) {
  console.log('\n경쟁사')
  for (const [subject, ci] of Object.entries(m.competitorRates)) {
    console.log(
      `  ${subject.replace('competitor:', '').padEnd(12)} ${formatPercent(ci.point).padStart(6)}  ${ci.k}/${ci.n}`,
    )
  }
}

// ★ 소규모 브랜드에게 유일하게 집행 가능한 정보. 언급률 0%는 알려주는 게 없다.
const sourceInput = answers.map((a) => ({ answerId: a.id, citations: a.citations }))
const sources = aggregateSources(sourceInput, { selfDomains })
const summary = summarizeSources(sourceInput, sources)

console.log(`\n${line}`)
console.log(
  `AI가 읽는 출처 — 답변 ${summary.totalAnswers}개 중 ${summary.answersWithCitations}개에 인용 · 도메인 ${summary.distinctDomains}개`,
)
if (selfDomains.length > 0) {
  console.log(
    summary.selfAnswers > 0
      ? `우리 사이트(${selfDomains.join(', ')})는 ${summary.selfAnswers}개 답변에서 인용됨`
      : `⚠ 우리 사이트(${selfDomains.join(', ')})는 한 번도 인용되지 않았습니다`,
  )
}
console.log(line)
for (const s of sources.slice(0, 15)) {
  const tag = s.owner === 'self' ? ' [우리]' : s.owner === 'competitor' ? ' [경쟁사]' : ''
  console.log(
    `  ${String(s.answers).padStart(3)}개 ${formatPercent(s.share.point).padStart(6)} ${formatInterval(s.share).padEnd(16)} ${s.domain}${tag}`,
  )
  for (const p of s.pages.slice(0, 2)) console.log(`        └ ${p.title.slice(0, 60)}`)
}
if (sources.length > 15) console.log(`  … 외 ${sources.length - 15}개 도메인`)

const judgeCostKrw = estimateJudgeCostKrw(judgeIn, judgeOut)
const total = engineCostKrw + judgeCostKrw
console.log(`\n${line}`)
console.log(`원가: 엔진 ${engineCostKrw}원 + 판정 ${judgeCostKrw}원 = ${total}원`)
console.log(`측정 1회당 ${Math.round(total / m.totalAnswers)}원 · 판정 비중 ${formatPercent(judgeCostKrw / total)}`)
