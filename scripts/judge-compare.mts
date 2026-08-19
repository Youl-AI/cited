/**
 * 판정 모델 비교 — 같은 골드셋, 같은 프롬프트, 모델만 교체.
 *
 *   pnpm tsx --env-file=.env.local scripts/judge-compare.mts
 *
 * ★ `createClaudeJudge`의 `client` 주입점에 **모델만 바꿔치는 프록시**를
 *   넣는다. 프롬프트·스키마·배치 크기·후처리를 전부 claude.ts 그대로 타므로
 *   비교에서 모델 외의 변인이 없다. JUDGE_MODEL 기본값은 건드리지 않는다 —
 *   측정 이력과의 비교 가능성이 깨진다.
 *
 * ★ 지연은 배치 호출 단위로 잰다(제품이 배치로 부르므로 그게 실제 지연이다).
 *   248라벨 → 1차 통과분 → 20건 배치라 호출 수가 적다(6~7회). p95는 그
 *   표본 위에서 계산하고, 표본 수를 결과에 같이 적는다.
 *
 * ★ 구조화 출력(output_config)을 지원하지 않는 모델은 여기서 에러로 죽는
 *   대신 "미지원"으로 기록한다 — 그 자체가 후보 탈락 사유다.
 */
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { detectMentions } from '@/lib/detection'
import { score } from '@/lib/detection/evaluate'
import type { BrandProfile } from '@/lib/detection/types'
import { ANSWER_MAX_CHARS, SYSTEM_PROMPT, createClaudeJudge } from '@/lib/judge/claude'
import type { JudgeFn } from '@/lib/judge/types'

const LABELS_PATH = 'tests/golden/labels.json'

/**
 * USD/1M 토큰 단가. 공식 가격표 (2026-08 확인).
 * gpt-5-mini는 engines/pricing.ts와 같은 값($0.25/$2)이다.
 *
 * 실행 예:
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/judge-compare.mts
 *   ... --only gpt        # 모델명 부분 일치 필터 (이미 잰 모델 재과금 방지)
 */
const CANDIDATES: {
  model: string
  provider: 'anthropic' | 'openai'
  inUsd: number
  outUsd: number
  note: string
}[] = [
  {
    model: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    inUsd: 0.8,
    outUsd: 4,
    note: '한 단계 아래(구세대)',
  },
  { model: 'claude-haiku-4-5', provider: 'anthropic', inUsd: 1, outUsd: 5, note: '현재 기본값' },
  { model: 'claude-sonnet-4-6', provider: 'anthropic', inUsd: 3, outUsd: 15, note: '한 단계 위' },
  {
    model: 'gpt-5-mini',
    provider: 'openai',
    inUsd: 0.25,
    outUsd: 2,
    note: '타사 교차 검증',
  },
]
const USD_TO_KRW = 1400
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? process.argv[i + 1] : undefined
})()

interface LabelRow {
  id: string
  brand: BrandProfile
  answerText: string
  label: boolean
}

const labels = JSON.parse(readFileSync(LABELS_PATH, 'utf8')) as LabelRow[]
console.log(`골드 라벨 ${labels.length}건\n`)

function p95(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? 0
}

/** 모델만 바꿔치는 클라이언트 프록시 — 나머지는 실제 SDK 그대로. */
function clientWithModel(model: string): Anthropic {
  const real = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop !== 'messages') return Reflect.get(target, prop, receiver)
      return new Proxy(target.messages, {
        get(m, mp, mr) {
          if (mp !== 'parse') return Reflect.get(m, mp, mr)
          return (params: Parameters<typeof m.parse>[0]) => m.parse({ ...params, model })
        },
      })
    },
  })
}

/**
 * GPT 판정기 — claude.ts와 **같은 프롬프트·같은 스키마·같은 후처리**.
 * 다른 것은 SDK와 구조화 출력 헬퍼(zodResponseFormat)뿐이다.
 */
function createGptJudge(model: string, onUsage: (u: { in: number; out: number }) => void): JudgeFn {
  const schema = z.object({
    results: z.array(
      z.object({
        id: z.string(),
        isBrandReference: z.boolean(),
        position: z.number().int().nullable(),
        sentiment: z.enum(['recommended', 'neutral', 'negative']),
        context: z.string(),
      }),
    ),
  })
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return async (batch) => {
    if (batch.length === 0) return []
    const payload = batch.map((b) => ({
      id: b.id,
      brand: b.brand.canonical,
      matched: b.matchedAlias,
      answer: b.answerText.slice(0, ANSWER_MAX_CHARS),
    }))
    const res = await client.chat.completions.parse({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload, null, 2) },
      ],
      response_format: zodResponseFormat(schema, 'results'),
      max_completion_tokens: 8192,
    })
    onUsage({ in: res.usage?.prompt_tokens ?? 0, out: res.usage?.completion_tokens ?? 0 })
    const choice = res.choices[0]
    if (!choice) throw new Error('응답에 choice가 없습니다')
    if (choice.finish_reason === 'length') {
      throw new Error(`판정 응답이 길이 제한에서 잘렸습니다 (배치 ${batch.length}건)`)
    }
    const parsed = choice.message.parsed
    if (!parsed) throw new Error('판정 응답을 스키마로 파싱하지 못했습니다')
    return parsed.results.map((r) => ({
      id: r.id,
      verdict: {
        isBrandReference: r.isBrandReference,
        // claude.ts와 같은 정합성 보정 — 미언급이면 순위도 없다.
        position: r.isBrandReference ? r.position : null,
        sentiment: r.sentiment,
        context: r.context,
      },
    }))
  }
}

for (const c of CANDIDATES) {
  if (only && !c.model.includes(only)) continue
  let tokensIn = 0
  let tokensOut = 0
  const batchMs: number[] = []

  const base: JudgeFn =
    c.provider === 'openai'
      ? createGptJudge(c.model, (u) => {
          tokensIn += u.in
          tokensOut += u.out
        })
      : createClaudeJudge({
          client: clientWithModel(c.model),
          onUsage: (u) => {
            tokensIn += u.tokensIn
            tokensOut += u.tokensOut
          },
        })
  const timed: JudgeFn = async (batch) => {
    const t0 = performance.now()
    const out = await base(batch)
    batchMs.push(performance.now() - t0)
    return out
  }

  const t0 = performance.now()
  try {
    const results = await detectMentions(
      labels.map((l) => ({
        answerId: l.id,
        answerText: l.answerText,
        self: l.brand,
        competitors: [],
      })),
      timed,
      { batchSize: 20, onBatchError: (e, ids) => console.error('배치 실패', ids.length, e) },
    )
    const wallMs = performance.now() - t0

    const predicted = new Map(
      results.filter((r) => r.subject === 'self').map((r) => [r.answerId, r.mentioned]),
    )
    const s = score(labels, predicted)
    const costKrw = ((tokensIn * c.inUsd + tokensOut * c.outUsd) / 1_000_000) * USD_TO_KRW
    const per1kKrw = (costKrw / labels.length) * 1000

    console.log(`── ${c.model} (${c.note})`)
    console.log(
      `   recall ${fmt(s.recall)} · precision ${fmt(s.precision)} · TP ${s.tp} / FP ${s.fp} / FN ${s.fn} / TN ${s.tn}` +
        (s.missing.length > 0 ? ` · 미판정 ${s.missing.length}` : ''),
    )
    console.log(
      `   토큰 in ${tokensIn} / out ${tokensOut} · 1회 ${costKrw.toFixed(0)}원 · 1,000건당 ${per1kKrw.toFixed(0)}원`,
    )
    console.log(
      `   배치 ${batchMs.length}회 · p95 ${(p95(batchMs) / 1000).toFixed(1)}s · 중앙값 ${(median(batchMs) / 1000).toFixed(1)}s · 전체 ${(wallMs / 1000).toFixed(1)}s\n`,
    )
  } catch (e) {
    console.log(`── ${c.model} (${c.note})`)
    console.log(`   실행 불가: ${e instanceof Error ? e.message : String(e)}\n`)
  }
}

function fmt(v: number | null): string {
  return v === null ? '측정 불가' : `${(v * 100).toFixed(1)}%`
}
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}
