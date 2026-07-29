/**
 * 골드 라벨 후보 수집.
 *
 *   pnpm label:collect                 전부 수집 (미수집분만)
 *   pnpm label:collect --limit 5       5건만 (원가 확인용)
 *   pnpm label:collect --engine gemini 엔진 지정 (기본 gemini)
 *
 * 실제 엔진으로 답변을 모은다. **합성 데이터로 잰 정확도는 의미가 없다** —
 * 우리가 검증하려는 건 "실제 AI 답변에서 브랜드를 제대로 짚는가"이지
 * "우리가 만든 문장을 제대로 읽는가"가 아니다.
 *
 * 이미 수집한 질의는 건너뛴다. 중단하고 다시 돌려도 안전하다.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { estimateCostKrw } from '@/lib/engines/pricing'
import { getEngine, isEngineId } from '@/lib/engines'
import type { BrandProfile } from '@/lib/detection/types'
import { SUBJECT_SETS, TOTAL_ANSWERS, TOTAL_LABELS } from './label-subjects.mts'

const OUT = 'tests/golden/candidates.json'

export interface LabelCandidate {
  id: string
  setId: string
  engineId: string
  query: string
  answerText: string
  brands: BrandProfile[]
  /** canonical → 사람이 붙인 라벨. null이면 아직 라벨링 전. */
  labels: Record<string, { mentioned: boolean; position: number | null } | null>
  note: string
}

interface CandidateFile {
  collectedAt: string
  answers: LabelCandidate[]
}

const args = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const limit = Number(flag('--limit') ?? Number.POSITIVE_INFINITY)
const engineId = flag('--engine') ?? 'gemini'
if (!isEngineId(engineId)) {
  console.error(`알 수 없는 엔진: ${engineId}`)
  process.exit(1)
}

const engine = await getEngine(engineId)
if (!engine.isConfigured()) {
  console.error(`${engineId}: API 키가 없습니다. .env.local을 확인하세요.`)
  process.exit(1)
}

let file: CandidateFile = { collectedAt: new Date().toISOString(), answers: [] }
try {
  file = JSON.parse(await readFile(OUT, 'utf8')) as CandidateFile
  console.log(`기존 후보 ${file.answers.length}건을 이어받습니다.`)
} catch {
  await mkdir('tests/golden', { recursive: true })
}

const seen = new Set(file.answers.map((a) => a.id))
const todo: { setId: string; brands: BrandProfile[]; query: string; id: string }[] = []
for (const set of SUBJECT_SETS) {
  for (const query of set.queries) {
    const id = `${set.id}:${engineId}:${query}`
    if (seen.has(id)) continue
    todo.push({ setId: set.id, brands: set.brands, query, id })
  }
}

const planned = todo.slice(0, limit)
console.log(
  `수집 대상 ${planned.length}건 (전체 ${TOTAL_ANSWERS}건 중 ${file.answers.length}건 완료)\n` +
    `전부 모으면 라벨 ${TOTAL_LABELS}건이 나옵니다.\n`,
)

let costKrw = 0
let failed = 0

for (const [i, item] of planned.entries()) {
  process.stdout.write(`[${i + 1}/${planned.length}] ${item.query} … `)
  try {
    const answer = await engine.run(item.query, { sampleIndex: 0 })
    const cost = estimateCostKrw(engineId, answer.usage)
    costKrw += cost

    const labels: LabelCandidate['labels'] = {}
    for (const b of item.brands) labels[b.canonical] = null

    file.answers.push({
      id: item.id,
      setId: item.setId,
      engineId,
      query: item.query,
      answerText: answer.text,
      brands: item.brands,
      labels,
      note: '',
    })
    // 한 건씩 저장한다 — 중간에 끊겨도 이미 쓴 돈을 잃지 않는다.
    await writeFile(OUT, JSON.stringify(file, null, 2))
    console.log(`${answer.text.length}자 · ${cost}원`)
  } catch (error) {
    failed++
    console.log(`실패 — ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(
  `\n완료: 답변 ${file.answers.length}건 · 이번 원가 ${costKrw}원${failed ? ` · 실패 ${failed}건` : ''}`,
)
console.log(`저장: ${OUT}`)
console.log('\n다음: pnpm label')
