import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { env } from '@/lib/env'

/**
 * 맞춤 질의(정밀 진단)의 **생성**.
 *
 * 흐름: 주문 → LLM이 후보 7개 생성 → 운영자가 파일로 검수·수정 →
 * `validateCustomQueries` 통과 → DB 동결(`freezeQueries`) → 영구 사용.
 */

// 검증은 query-rules.ts로 이동했다 (4단계) — 에디터 화면이 실시간 검증에
// 같은 함수를 써야 하는데, 이 파일은 Anthropic SDK와 server-only env를 끌고
// 있어 클라이언트가 import할 수 없다. 기존 호출자(audit-queries.mts 등)를
// 위해 그대로 re-export한다. **여기에 검증 로직을 되돌리지 말 것.**
export { validateCustomQueries } from '@/lib/audit/query-rules'
export type { CustomQueryContext } from '@/lib/audit/query-rules'

/** 별칭 생성과 같은 모델·같은 이유(싸고 충분) — aliases.ts 참고 */
export const CUSTOM_QUERY_MODEL = 'claude-haiku-4-5'

const responseSchema = z.object({ queries: z.array(z.string()) })

const SYSTEM_PROMPT = `한국 소비자가 AI 챗봇에게 실제로 묻는 말투의 질문을 만듭니다.

규칙:
- 특정 업체명·브랜드명·상호를 절대 넣지 마세요. 업종과 상황만으로 묻습니다.
- "~추천해줘", "~어디가 좋아?", "~차이가 뭐야?" 같은 반말 소비자 말투.
- 서로 겹치지 않는 다양한 의도: 가격, 비교, 초보 질문, 위치, 상황별(선물·처음·급함).
- 지역이 주어지면 대부분의 질문에 자연스럽게 지역을 넣되, 지역과 무관하게
  성립하는 일반 질문(개념·차이·선택 기준)이 1~2개 섞여도 좋습니다.
- 요청된 개수만큼만 만듭니다.`

export interface GenerateCustomQueriesArgs {
  brandName: string
  category: string
  region?: string
  /** 크몽 메시지에서 받은 서비스 설명. 질의를 그 가게답게 만드는 재료 */
  brief?: string
  competitors: readonly string[]
  count: number
}

export interface CustomQueryGeneratorOptions {
  /** 테스트 주입점. 인자는 사용자 프롬프트 문자열 */
  parse?: (prompt: string) => Promise<{ queries: string[] }>
  onUsage?: (usage: { tokensIn: number; tokensOut: number }) => void
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

export function createCustomQueryGenerator(opts: CustomQueryGeneratorOptions = {}) {
  return async function generate(args: GenerateCustomQueriesArgs): Promise<string[]> {
    // ★ 프롬프트에 브랜드명·경쟁사명을 넣지 않는다. 생성 모델이 이름을 질의에
    //   섞으면 어차피 validateCustomQueries가 거부하지만, 애초에 모르게 하는
    //   것이 낫다. 검증은 방어선이지 1차 수단이 아니다.
    const prompt = JSON.stringify(
      {
        category: args.category,
        region: args.region ?? null,
        service: args.brief ?? null,
        count: args.count,
      },
      null,
      2,
    )

    if (opts.parse) {
      const out = await opts.parse(prompt)
      return out.queries
    }

    const client = opts.client ?? sharedClient()
    const message = await client.messages.parse({
      model: CUSTOM_QUERY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(responseSchema) },
      messages: [{ role: 'user', content: prompt }],
    })
    opts.onUsage?.({
      tokensIn: message.usage.input_tokens,
      tokensOut: message.usage.output_tokens,
    })
    if (message.stop_reason === 'refusal') throw new Error('질의 생성이 거부되었습니다')
    if (message.stop_reason === 'max_tokens') throw new Error('질의 생성 응답이 잘렸습니다')
    const parsed = message.parsed_output
    if (!parsed) throw new Error('질의 생성 응답을 스키마로 파싱하지 못했습니다')
    return parsed.queries
  }
}
