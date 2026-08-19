import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { JudgeFn, JudgeRequest, JudgeResponse, JudgeUsage } from './types'

/**
 * 판정 모델. 설계 ③이 지정한 "저렴한 것부터 시작" 원칙.
 * 바꾸려면 골드 라벨 회귀 테스트(recall ≥95%, precision ≥90%)를 먼저 통과해야 한다.
 */
export const JUDGE_MODEL = 'claude-haiku-4-5'

/**
 * 답변 본문을 자르는 길이. 매칭 지점 주변 맥락만 있으면 판정이 되고,
 * 입력 토큰이 곧 원가다.
 */
export const ANSWER_MAX_CHARS = 4000

/**
 * ★ 이 프롬프트를 바꾸면 **측정값 자체가 바뀐다.**
 *
 * 실측으로 확인한 것 (2026-07-30, claude-haiku-4-5):
 *   - 이 프롬프트 없이 "브랜드 판정기"라고만 주면 position이 **문자 오프셋**
 *     (18 같은 값)으로 돌아온다. "몇 번째로 언급된 브랜드인가, 1부터 센다"를
 *     명시해야 2가 나온다.
 *   - context도 마찬가지로, 지시가 없으면 답변 원문을 그대로 되돌려준다.
 *
 * 바꾸려면 골드 라벨 회귀 테스트를 먼저 통과시켜라. 지난 측정치와의
 * 비교 가능성이 깨진다.
 *
 * export인 이유: 판정 모델 비교(scripts/judge-compare.mts)가 타사 판정기에도
 * **같은 프롬프트**를 써야 모델 외의 변인이 없다. 스크립트에 복사해 두면
 * 여기를 고칠 때 그쪽이 조용히 낡는다.
 */
export const SYSTEM_PROMPT = `너는 AI 답변에서 특정 브랜드가 실제로 언급되었는지 판정하는 분석기다.

각 항목에 대해 다음을 판정한다:
- isBrandReference: 매칭된 문자열이 진짜 그 브랜드를 가리키는가. 동음이의어(일반명사, 다른 회사, 지명 등)면 false.
- position: 답변 전체에서 이 브랜드가 몇 번째로 언급된 브랜드인가. 1부터 센다. 언급이 아니면 null.
- sentiment: recommended(추천/긍정) | neutral(단순 언급) | negative(비추천/부정)
- context: 어떤 맥락에서 언급되었는지 한 문장 한국어 요약. 고객에게 그대로 보여줄 문장이다.

반드시 입력받은 모든 id에 대해 결과를 돌려준다. 확신이 없으면 isBrandReference를 true로 두되 context에 불확실함을 적는다.`

const resultSchema = z.object({
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

export interface ClaudeJudgeOptions {
  /**
   * 실측 토큰 사용량 콜백. 3단계 수집 잡이 원가 기록에 쓴다.
   *
   * ★ 모듈 전역 `lastUsage` 변수로 두지 않는 이유: 배치는 동시에 여러 개가
   *   돌 수 있고, 그러면 마지막에 끝난 호출이 다른 호출의 사용량을 덮어쓴다.
   *   원가가 **조용히** 축소 집계된다. 콜백이면 호출마다 정확히 한 번 온다.
   */
  onUsage?: (usage: JudgeUsage) => void
  /** 테스트용 주입점 */
  client?: Anthropic
}

let shared: Anthropic | null = null
function sharedClient(): Anthropic {
  if (!shared) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다')
    shared = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return shared
}

export function createClaudeJudge(opts: ClaudeJudgeOptions = {}): JudgeFn {
  return async function claudeJudgeFn(
    batch: readonly JudgeRequest[],
  ): Promise<JudgeResponse[]> {
    if (batch.length === 0) return []

    const payload = batch.map((b) => ({
      id: b.id,
      brand: b.brand.canonical,
      matched: b.matchedAlias,
      answer: b.answerText.slice(0, ANSWER_MAX_CHARS),
    }))

    const client = opts.client ?? sharedClient()
    const message = await client.messages.parse({
      model: JUDGE_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(resultSchema) },
      messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
    })

    opts.onUsage?.({
      tokensIn: message.usage.input_tokens,
      tokensOut: message.usage.output_tokens,
    })

    if (message.stop_reason === 'refusal') {
      throw new Error('판정 모델이 요청을 거부했습니다')
    }
    // max_tokens에서 끊기면 JSON이 중간에 잘려 parsed_output이 비어 있다.
    // "판정 0건"과 구분되어야 하므로 원인을 그대로 드러낸다.
    if (message.stop_reason === 'max_tokens') {
      throw new Error(
        `판정 응답이 max_tokens에서 잘렸습니다 (배치 ${batch.length}건 — 배치 크기를 줄이세요)`,
      )
    }

    const parsed = message.parsed_output
    if (!parsed) throw new Error('판정 응답을 스키마로 파싱하지 못했습니다')

    const out: JudgeResponse[] = parsed.results.map((r) => ({
      id: r.id,
      verdict: {
        isBrandReference: r.isBrandReference,
        // 언급이 아니면 순위도 없다. 모델이 둘을 어긋나게 답할 수 있으므로
        // 여기서 한 번 맞춘다 — 리포트에 "미언급인데 3위" 같은 줄이 나가면 안 된다.
        position: r.isBrandReference ? r.position : null,
        sentiment: r.sentiment,
        context: r.context,
      },
    }))

    logger.info('judge.batch_done', { size: batch.length, returned: out.length })
    return out
  }
}

export const claudeJudge: JudgeFn = createClaudeJudge()
