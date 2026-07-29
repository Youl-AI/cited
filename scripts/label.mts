/**
 * 골드 라벨링 CLI.
 *
 *   pnpm label            라벨링 (미완료분부터)
 *   pnpm label --stats    진행 상황만 보기
 *
 * 답변을 한 번 보여주고 **그 답변에 실제로 언급된 브랜드 번호**를 받는다.
 * 브랜드마다 y/n을 묻지 않는 이유는 속도다 — 답변 하나에 입력 한 번이면
 * 라벨 5건이 나온다. 40개 답변이면 한 시간 안에 200건이 끝난다.
 *
 * ★ 1차 매칭 결과를 일부러 보여주지 않는다.
 *   이 라벨은 **우리 판정기를 채점하는 정답지**다. 채점받을 쪽의 답을 먼저
 *   보여주면 사람이 거기에 끌려간다(anchoring). 그러면 게이트가 통과해도
 *   그건 "우리가 우리 답에 동의했다"는 뜻일 뿐이다.
 *
 * ★ 같은 이유로 이 라벨을 LLM으로 채우면 안 된다. 판정기가 Claude인데
 *   정답지도 Claude가 만들면 자기 자신을 자기 자신으로 검증하게 된다.
 *
 * 중단해도 진행 상황이 저장된다. 여러 번 나눠서 해도 된다.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import type { LabelCandidate } from './label-collect.mts'

const CANDIDATES = 'tests/golden/candidates.json'
const LABELS = 'tests/golden/labels.json'

interface CandidateFile {
  collectedAt: string
  answers: LabelCandidate[]
}

const file = JSON.parse(await readFile(CANDIDATES, 'utf8')) as CandidateFile
const answers = file.answers

function isDone(a: LabelCandidate): boolean {
  return a.brands.every((b) => a.labels[b.canonical] != null)
}

function counts() {
  let labeled = 0
  let positive = 0
  for (const a of answers) {
    for (const b of a.brands) {
      const l = a.labels[b.canonical]
      if (l == null) continue
      labeled++
      if (l.mentioned) positive++
    }
  }
  const total = answers.reduce((n, a) => n + a.brands.length, 0)
  return { labeled, positive, total }
}

/** 라벨링 완료분만 확정 파일로 내보낸다. */
async function exportLabels(): Promise<number> {
  const rows = []
  for (const a of answers) {
    for (const b of a.brands) {
      const l = a.labels[b.canonical]
      if (l == null) continue
      rows.push({
        id: `${a.id}::${b.canonical}`,
        setId: a.setId,
        engineId: a.engineId,
        query: a.query,
        brand: b,
        answerText: a.answerText,
        label: l.mentioned,
        labelPosition: l.position,
        labelNote: a.note,
      })
    }
  }
  await writeFile(LABELS, JSON.stringify(rows, null, 2))
  return rows.length
}

const stats = counts()
if (process.argv.includes('--stats')) {
  console.log(`라벨 ${stats.labeled} / ${stats.total}`)
  console.log(`  언급  ${stats.positive}`)
  console.log(`  미언급 ${stats.labeled - stats.positive}`)
  console.log(`답변 ${answers.filter(isDone).length} / ${answers.length} 완료`)
  console.log(`확정 파일: ${await exportLabels()}건 → ${LABELS}`)
  process.exit(0)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })

console.log(`라벨 ${stats.labeled} / ${stats.total} 완료. 이어서 시작합니다.`)
console.log('답변을 읽고, 실제로 언급된 브랜드 번호를 쉼표로 입력하세요.')
console.log('  없으면 그냥 엔터 · s=건너뛰기 · q=저장하고 종료\n')

let quit = false
for (const a of answers) {
  if (quit) break
  if (isDone(a)) continue

  const c = counts()
  console.log('═'.repeat(72))
  console.log(`[라벨 ${c.labeled}/${c.total}]  질의: ${a.query}`)
  console.log('─'.repeat(72))
  console.log(a.answerText)
  console.log('─'.repeat(72))
  a.brands.forEach((b, i) => {
    const alias = b.aliases.length > 0 ? `  (${b.aliases.join(', ')})` : ''
    console.log(`  ${i + 1}. ${b.canonical}${alias}`)
  })

  const input = (await rl.question('\n언급된 브랜드 번호 > ')).trim().toLowerCase()

  if (input === 'q') {
    quit = true
    break
  }
  if (input === 's') continue

  const picked = new Set(
    input
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= a.brands.length),
  )

  // 입력이 있었는데 하나도 유효하지 않으면 오타로 보고 다시 묻는다.
  // 그냥 넘기면 "전부 미언급"으로 잘못 확정된다.
  if (input !== '' && picked.size === 0) {
    console.log('⚠ 유효한 번호가 없습니다. 이 답변은 건너뜁니다 — 다시 돌리면 나옵니다.')
    continue
  }

  a.brands.forEach((b, i) => {
    a.labels[b.canonical] = { mentioned: picked.has(i + 1), position: null }
  })

  const note = (await rl.question('메모 (애매했던 이유 등, 없으면 엔터) > ')).trim()
  if (note) a.note = note

  await writeFile(CANDIDATES, JSON.stringify(file, null, 2))
}

rl.close()

const final = counts()
const exported = await exportLabels()
console.log(`\n라벨 ${final.labeled} / ${final.total}`)
console.log(`  언급  ${final.positive}`)
console.log(`  미언급 ${final.labeled - final.positive}`)
console.log(`확정: ${exported}건 → ${LABELS}`)

if (final.labeled > 0) {
  const ratio = final.positive / final.labeled
  if (ratio > 0.8 || ratio < 0.2) {
    // 한쪽으로 쏠리면 다른 쪽 지표를 잴 수 없다.
    console.warn(
      `\n⚠ 긍정 비율이 ${(ratio * 100).toFixed(0)}%로 치우쳤습니다. ` +
        `한쪽이 너무 적으면 ${ratio > 0.5 ? 'precision' : 'recall'}을 신뢰할 수 없습니다.`,
    )
  }
}
