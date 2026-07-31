import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { normalizeQueryKey } from '@/lib/audit/query-rules'
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
- existing에 이미 있는 질문과 같거나 사실상 같은 뜻의 질문은 만들지 마세요.
  그 질문들이 다루지 않은 의도를 고르세요.
- 요청된 개수만큼만 만듭니다.`

export interface GenerateCustomQueriesArgs {
  brandName: string
  category: string
  region?: string
  /** 크몽 메시지에서 받은 서비스 설명. 질의를 그 가게답게 만드는 재료 */
  brief?: string
  competitors: readonly string[]
  count: number
  /**
   * 이미 쓰고 있는 질의. **겹치지 말라고 미리 말하기 위한 것이다.**
   *
   * ★ 없으면 페이로드가 무상태라 같은 브랜드의 [재생성]이 매번 바이트까지 같은
   *   요청이 되고, 같은 후보가 돌아오기 쉽다. 중복이 돌아온 시점에는 유료
   *   크레딧(브랜드당 5회) 중 1회가 이미 나간 뒤다 — 받아 놓고 화면에서 걸러 봐야
   *   슬롯만 조용히 빈다. 막을 수 있는 유일한 자리가 여기다.
   *   선택 필드다: 넘기지 않으면 예전과 **완전히 같은 페이로드**가 나간다
   *   (`scripts/audit-queries.mts`의 기존 호출이 그대로 동작한다).
   */
  existing?: readonly string[]
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
    //
    // ★ `existing`은 **고객이 편집 중인 문장**이라 이름이 섞여 있을 수 있다
    //   (확정에서 거부될 줄이라도 편집 중에는 존재한다). 그대로 실으면 위 규칙이
    //   `existing`이라는 뒷문으로 뚫린다 — 중립성을 지키는 자리가 여기이므로
    //   거르는 자리도 여기다(호출부마다 기억해야 하는 규칙으로 만들지 않는다).
    //   비교 기준은 `validateCustomQueries`와 같은 `normalizeQueryKey`다.
    const brandKey = normalizeQueryKey(args.brandName)
    const competitorKeys = args.competitors
      .map((c) => normalizeQueryKey(c))
      .filter((c) => c.length > 0)
    const existing = (args.existing ?? [])
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
      .filter((q) => {
        const key = normalizeQueryKey(q)
        if (brandKey.length > 0 && key.includes(brandKey)) return false
        return !competitorKeys.some((c) => key.includes(c))
      })
    const prompt = JSON.stringify(
      {
        category: args.category,
        region: args.region ?? null,
        service: args.brief ?? null,
        // 넘기지 않았거나 전부 걸러졌으면 키 자체를 넣지 않는다 — 기존 호출자의
        // 페이로드가 한 바이트도 달라지지 않게 한다.
        ...(existing.length > 0 ? { existing } : {}),
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
