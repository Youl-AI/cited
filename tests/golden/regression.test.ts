import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectMentions } from '@/lib/detection'
import { mistakes, score } from '@/lib/detection/evaluate'
import type { BrandProfile } from '@/lib/detection/types'
import { estimateJudgeCostKrw } from '@/lib/engines/pricing'
import { createClaudeJudge } from '@/lib/judge/claude'

/**
 * 골드 라벨 회귀 — 판정 정확도 게이트.
 *
 * 설계 ③: 검증하지 않은 숫자는 주장일 뿐이다.
 *
 * ★ 이 테스트는 조용히 건너뛰지 않는다. 라벨이 없거나 API 키가 없으면
 *   **실패한다.** 게이트가 꺼진 채 초록불이 뜨는 것이 게이트가 없는 것보다
 *   나쁘다 — 없으면 없는 줄 알지만, 꺼져 있으면 지켜지고 있다고 믿는다.
 */

const LABELS_PATH = 'tests/golden/labels.json'
const MIN_LABELS = 100
const MIN_RECALL = 0.95
const MIN_PRECISION = 0.9

interface LabelRow {
  id: string
  setId: string
  query: string
  brand: BrandProfile
  answerText: string
  label: boolean
  labelPosition: number | null
  labelNote: string
}

function loadLabels(): LabelRow[] {
  if (!existsSync(LABELS_PATH)) {
    throw new Error(
      `${LABELS_PATH}가 없습니다. 'pnpm label:collect' 후 'pnpm label'로 라벨링하세요.`,
    )
  }
  return JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as LabelRow[]
}

describe('골드 라벨 회귀 — 판정 정확도 게이트', () => {
  it('라벨 세트가 충분하고 긍정·부정이 모두 있다', () => {
    const labels = loadLabels()
    expect(
      labels.length,
      `라벨이 ${labels.length}건입니다. ${MIN_LABELS}건 이상이어야 지표를 신뢰할 수 있습니다`,
    ).toBeGreaterThanOrEqual(MIN_LABELS)
    // 한쪽만 있으면 다른 쪽 지표를 아예 잴 수 없다.
    expect(labels.some((l) => l.label), '긍정 라벨이 없습니다').toBe(true)
    expect(labels.some((l) => !l.label), '부정 라벨이 없습니다').toBe(true)
  })

  it('판정 API 키가 설정되어 있다', () => {
    // 키가 없으면 아래 게이트가 의미를 잃는다. 원인을 여기서 분명히 한다.
    expect(
      process.env.ANTHROPIC_API_KEY,
      'ANTHROPIC_API_KEY가 없습니다. 이 게이트는 실제 판정기로만 의미가 있습니다',
    ).toBeTruthy()
  })

  it(`recall ≥ ${MIN_RECALL * 100}% · precision ≥ ${MIN_PRECISION * 100}%`, async () => {
    const labels = loadLabels()

    // 이 게이트는 CI에서 매 PR마다 돌고 **실제로 돈이 나간다.** 원가를 출력해
    // 두면 라벨을 늘렸을 때 CI 비용이 어떻게 변하는지 바로 보인다.
    let tokensIn = 0
    let tokensOut = 0
    const judge = createClaudeJudge({
      onUsage: (u) => {
        tokensIn += u.tokensIn
        tokensOut += u.tokensOut
      },
    })

    // 라벨 한 건 = (답변 1개 × 브랜드 1개). detectMentions에는 주체 하나짜리
    // 입력으로 넣는다 — 라벨이 그 단위로 붙어 있기 때문이다.
    const results = await detectMentions(
      labels.map((l) => ({
        answerId: l.id,
        answerText: l.answerText,
        self: l.brand,
        competitors: [],
      })),
      judge,
      { batchSize: 20, onBatchError: (e, ids) => console.error('배치 실패', ids.length, e) },
    )

    const predicted = new Map(
      results.filter((r) => r.subject === 'self').map((r) => [r.answerId, r.mentioned]),
    )
    const s = score(labels, predicted)
    const byId = new Map(labels.map((l) => [l.id, l]))

    console.log(
      `\n판정 정확도  recall ${pct(s.recall)} · precision ${pct(s.precision)}\n` +
        `TP ${s.tp} / FP ${s.fp} / FN ${s.fn} / TN ${s.tn}` +
        (s.missing.length > 0 ? ` / 미측정 ${s.missing.length}` : '') +
        `\n라벨 ${labels.length}건 · 판정 원가 ${estimateJudgeCostKrw(tokensIn, tokensOut)}원` +
        ` (in ${tokensIn} / out ${tokensOut})`,
    )

    const wrong = mistakes(labels, predicted)
    if (wrong.length > 0) {
      console.log('\n오판정 (최대 20건):')
      for (const m of wrong.slice(0, 20)) {
        const l = byId.get(m.id)!
        console.log(`  ${m.kind} ${l.brand.canonical} · ${l.query}`)
        console.log(`     ${l.answerText.slice(0, 100).replace(/\s+/g, ' ')}…`)
        if (l.labelNote) console.log(`     메모: ${l.labelNote}`)
      }
    }

    // 판정이 절반만 돌고 끝났는데 지표만 보고 통과시키면 안 된다.
    expect(s.missing, `${s.missing.length}건이 판정되지 않았습니다`).toEqual([])

    // recall이 더 중요하다 — 놓치는 것이 잘못 잡는 것보다 나쁘다.
    // 고객은 "내 브랜드가 나왔는데 왜 안 잡혔냐"를 즉시 알아채지만,
    // 오탐은 증거 원문을 봐야 알 수 있다.
    expect(s.recall, `recall이 기준 미달입니다 (${pct(s.recall)})`).toBeGreaterThanOrEqual(
      MIN_RECALL,
    )
    expect(
      s.precision,
      `precision이 기준 미달입니다 (${pct(s.precision)})`,
    ).toBeGreaterThanOrEqual(MIN_PRECISION)
  })
})

function pct(v: number | null): string {
  return v === null ? '측정 불가' : `${(v * 100).toFixed(1)}%`
}
