import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { BrandProfile } from '@/lib/detection/types'
import { env } from '@/lib/env'

/**
 * 별칭 생성 — 측정의 전제 조건이다.
 *
 * ★ 2026-07-30 실측: 같은 질의·같은 시스템 프롬프트인데 **ChatGPT는 영문 표기만,
 *   Gemini는 한글 표기만** 쓴다. 예외가 한 건도 없었다.
 *     ChatGPT: "ASICS GEL-CUMULUS 28"  (아식스 없음)
 *     Gemini : "아식스 노바블라스트"      (ASICS 없음)
 *   영문 별칭 없이 한글 브랜드명만 넘기면 ChatGPT 언급률이 **구조적으로 0%**로
 *   측정되고, 엔진 비교가 통째로 거짓이 된다.
 *
 * ★ 한국 전용 브랜드가 더 위험하다. ChatGPT가 쓰는 것은 **공식 상표 로마자**이고
 *   기계적 음차가 아니다 — 편강율은 `Pyunkang Yul`(Pyeongangyul이 아니다),
 *   이즈앤트리는 `Isntree`다. 규칙으로 유도할 수 없으므로 프롬프트가 **모르면
 *   비워 두게** 해야 한다. 지어낸 음차는 절대 매칭되지 않으면서 1차 후보만 늘린다.
 *
 * ★ 경쟁사도 같은 함수를 거친다. 경쟁사 별칭이 없으면 경쟁사가 과소 계상되고
 *   Share of Voice가 **우리에게 유리한 쪽으로** 틀린다.
 */

/** 브랜드당 별칭 상한. 넘으면 1차 후보가 늘어 2차 판정 원가만 커진다. */
export const MAX_ALIASES = 12
/** 별칭 최소 길이. 한 글자는 거의 모든 답변에 걸린다. */
const MIN_ALIAS_LENGTH = 2
/**
 * 별칭 최대 길이. 이보다 길면 모델이 설명 문장을 돌려준 것이다.
 *
 * ★ 계획서의 40자는 **한국어를 걸러내지 못한다.** "무신사는 한국의 대표적인
 *   온라인 패션 플랫폼입니다"가 27자다 — 한글은 한 글자가 한 단어에 가까워서
 *   영어 기준으로 잡은 상한이 문장을 통과시킨다.
 *
 *   24자는 가장 긴 정당한 표기(`The North Face Korea` 20자)를 남기고 문장을
 *   자른다. 길이는 "문장인가"의 근사치일 뿐이지만, 문장이 별칭으로 들어와도
 *   어떤 답변에도 매칭되지 않으므로 손실은 1차 후보 하나뿐이다.
 */
const MAX_ALIAS_LENGTH = 24

export const ALIAS_MODEL = 'claude-haiku-4-5'

export interface AliasSuggestion {
  canonical: string
  aliases: string[]
  ambiguous: boolean
}

export type AliasFn = (brands: readonly string[], category: string) => Promise<AliasSuggestion[]>

const responseSchema = z.object({
  brands: z.array(
    z.object({
      canonical: z.string(),
      aliases: z.array(z.string()),
      ambiguous: z.boolean(),
    }),
  ),
})

type AliasResponse = z.infer<typeof responseSchema>

/**
 * 이 프롬프트는 **측정 도구의 일부**다. 문구를 바꾸면 언급률이 바뀐다.
 * 바꿀 때는 `pnpm probe:aliases`를 다시 돌려 통과 기준을 확인한다.
 */
const SYSTEM_PROMPT = `당신은 한국 브랜드의 표기 변형을 정리하는 도구입니다.

각 브랜드에 대해, **AI 검색 답변에 실제로 등장할 수 있는 표기**를 나열하세요.

반드시 포함할 것:
- 영문 표기 (대문자·일반 표기 모두: "ASICS", "Asics")
- 한글 표기 (브랜드명이 영문으로 주어진 경우)
- 널리 쓰이는 줄임말 (예: "무신사스탠다드" → "무탠다드")
- 공식 자사 브랜드·서브 브랜드 (예: "무신사" → "무신사스탠다드")

넣지 말 것:
- 카테고리 일반어 ("패션", "쇼핑몰", "화장품")
- 제품 카테고리명 ("러닝화", "스킨케어")
- 경쟁사 이름, 그리고 함께 주어진 다른 브랜드의 이름
- 설명 문장

**영문 표기에 대한 가장 중요한 규칙:**

브랜드가 실제로 쓰는 **공식 영문 표기**를 적으세요. 두 가지를 모두 지켜야 합니다.

1. **아는 브랜드는 반드시 넣으세요.** 그 브랜드의 웹사이트·로고·해외 판매
   페이지에서 쓰는 표기를 당신이 알고 있다면 빠뜨리지 마세요. 한국 소비자
   대상 브랜드도 영문 표기가 있습니다 — "무신사"는 "MUSINSA", "지그재그"는
   "ZIGZAG", "에이블리"는 "ABLY"입니다. 영문 표기가 없으면 그 브랜드는
   영어로 답하는 AI 답변에서 한 번도 찾을 수 없게 됩니다.

2. **모르는 브랜드는 비워 두세요.** 한글 발음을 로마자로 옮겨 **만들어내지
   마세요.** 한국 브랜드의 공식 표기는 표준 로마자 규칙을 따르지 않습니다 —
   자음을 겹쳐 쓰거나(토리든 → "Torriden", 두 번째 r), 발음과 다르게 줄이거나
   (편강율 → "Pyunkang Yul", "Pyeongangyul"이 아님), 철자를 재조합합니다
   (이즈앤트리 → "Isntree"). 규칙으로는 맞출 수 없습니다.

   그러므로 철자를 **한 글자라도 확신하지 못하면 그 표기를 넣지 마세요.**
   틀린 철자는 어떤 답변에도 등장하지 않으므로 없는 것보다 나쁩니다.
   기억나는 대로 비슷하게 적는 것은 도움이 되지 않습니다.

대소문자만 다른 변형(MUSINSA / Musinsa)은 하나만 적으세요. 뒤에서 같은 것으로
처리합니다. 공백 유무(Round Lab / Roundlab)도 하나만 적으면 됩니다.

ambiguous는 브랜드명이 **일반 명사와 겹칠 때** true입니다.
예: "당근"(채소), "토스"(동작), "오늘의집", "배달의민족" → true
     "무신사", "ASICS", "29CM" → false

주어진 브랜드만 다루고, 주어진 순서로, 주어진 표기 그대로 canonical에
돌려주세요.`

export interface AliasGeneratorOptions {
  /** 테스트가 실제 호출을 대체한다 */
  parse?: (brands: readonly string[], category: string) => Promise<AliasResponse>
  /** 생성 실패를 알린다. 던지지 않는다 — 측정은 계속되어야 한다 */
  onError?: (error: unknown) => void
  onUsage?: (usage: { tokensIn: number; tokensOut: number }) => void
  /** 테스트·스모크용 주입점 (`judge/claude.ts`와 같은 규약) */
  client?: Anthropic
}

/** 비교용 정규화. 1차 매칭이 대소문자를 무시하므로 같은 기준을 쓴다. */
function key(value: string): string {
  return value.trim().toLowerCase()
}

export function createAliasGenerator(opts: AliasGeneratorOptions = {}): AliasFn {
  return async function aliasFn(brands, category) {
    // ★ 중복과 빈 이름을 먼저 걷어낸다. 신청 폼(`request-schema.ts`)이 이미
    //   걸러주지만 운영자 CLI(`audit:new`)는 그 경로를 타지 않는다. 중복이
    //   남으면 판정 subject가 겹쳐 언급 수가 두 배로 세어지고, 빈 이름은
    //   1차 매칭에서 모든 답변에 걸린다.
    const requested: string[] = []
    const requestedKeys = new Set<string>()
    for (const raw of brands) {
      const name = raw.trim()
      if (name.length === 0) continue
      if (requestedKeys.has(key(name))) continue
      requestedKeys.add(key(name))
      requested.push(name)
    }

    // 브랜드가 없으면 호출하지 않는다. 빈 호출도 돈이 나간다.
    if (requested.length === 0) return []

    let response: AliasResponse | null = null
    try {
      response = opts.parse
        ? await opts.parse(requested, category)
        : await callModel(requested, category, opts)
    } catch (error) {
      // ★ 던지지 않는다. 별칭 생성 실패로 진단 전체를 죽이면 안 된다 —
      //   이미 결제된 주문일 수 있다. 다만 조용히 넘어가지도 않는다.
      opts.onError?.(error)
    }

    // ★ 모델 응답의 canonical을 정규화해서 맞춘다. 계획서는
    //   `brands.includes(b.canonical)`로 정확히 비교했는데, 모델이 ' 29cm '처럼
    //   돌려주면 그 브랜드가 조용히 별칭 0개가 된다 — 경쟁사면 Share of Voice가
    //   우리에게 유리한 쪽으로 틀린다.
    const requestedByKey = new Map(requested.map((name) => [key(name), name]))
    const byName = new Map<string, AliasSuggestion>()
    for (const b of response?.brands ?? []) {
      // 요청하지 않은 브랜드는 버린다. 모델이 끼워 넣는 일이 있다.
      const canonical = requestedByKey.get(key(b.canonical))
      if (canonical === undefined) continue
      // 같은 브랜드를 두 번 돌려주면 첫 응답을 쓴다.
      if (byName.has(canonical)) continue
      byName.set(canonical, {
        // ★ **요청한 표기**를 쓴다. 모델 표기를 그대로 쓰면 판정의 subject가
        //   신청 내용과 어긋나고, 리포트 순위표에 다른 이름이 찍힌다.
        canonical,
        aliases: sanitizeAliases(
          canonical,
          b.aliases,
          category,
          // 함께 측정하는 다른 브랜드의 이름은 별칭이 될 수 없다.
          requested.filter((name) => name !== canonical),
        ),
        ambiguous: b.ambiguous,
      })
    }

    // ★ 입력 순서를 유지하고, 빠진 브랜드를 반드시 채운다. 조용히 빠뜨리면
    //   그 브랜드가 측정에서 통째로 사라진다 — 경쟁사가 사라지면 Share of
    //   Voice 분모가 줄어 우리 점유율이 올라간다.
    return requested.map(
      (canonical) => byName.get(canonical) ?? { canonical, aliases: [], ambiguous: false },
    )
  }
}

let shared: Anthropic | null = null
function sharedClient(): Anthropic {
  if (!shared) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다')
    shared = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return shared
}

async function callModel(
  brands: readonly string[],
  category: string,
  opts: AliasGeneratorOptions,
): Promise<AliasResponse> {
  const client = opts.client ?? sharedClient()
  const message = await client.messages.parse({
    model: ALIAS_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(responseSchema) },
    messages: [
      { role: 'user', content: JSON.stringify({ category, brands: [...brands] }, null, 2) },
    ],
  })

  opts.onUsage?.({
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
  })

  if (message.stop_reason === 'refusal') throw new Error('별칭 생성이 거부되었습니다')
  // max_tokens에서 끊기면 JSON이 잘려 parsed_output이 비어 있다. "별칭 0건"과
  // 구분되어야 하므로 원인을 그대로 드러낸다.
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`별칭 응답이 max_tokens에서 잘렸습니다 (브랜드 ${brands.length}개)`)
  }

  const parsed = message.parsed_output
  if (!parsed) throw new Error('별칭 응답을 스키마로 파싱하지 못했습니다')
  return parsed
}

/**
 * 생성된 별칭을 검증한다. 순수 함수.
 *
 * ★ 이 함수가 방어하는 것은 **오탐이 아니라 100%다.** 별칭에 카테고리 일반어가
 *   하나 섞이면("패션") 그 카테고리 질의의 모든 답변에 걸려 언급률이 100%가
 *   된다. 0%를 100%로 바꾸는 오류이고, 고객은 그것을 기뻐하며 믿는다.
 *   1차에 걸리면 2차 판정을 거치므로 최종 판정은 걸러지지만, 후보가 답변 수만큼
 *   늘어 판정 원가가 그만큼 커진다.
 *
 * @param others 함께 측정하는 다른 브랜드의 이름. **가장 위험한 오염을 막는다** —
 *   '29CM'이 무신사의 별칭이 되면 29CM 언급이 전부 무신사 언급으로 집계되어
 *   우리 언급률과 Share of Voice가 동시에 부풀려진다. 프롬프트도 금지하지만
 *   지시는 검증이 아니다.
 */
export function sanitizeAliases(
  canonical: string,
  raw: readonly string[],
  category: string,
  others: readonly string[] = [],
): string[] {
  const canonicalKey = key(canonical)
  const banned = new Set([category, ...CATEGORY_STOPWORDS].map(key))
  for (const other of others) {
    const otherKey = key(other)
    // 호출자가 자기 이름이 든 전체 목록을 그대로 넘겨도 동작해야 한다.
    if (otherKey !== canonicalKey) banned.add(otherKey)
  }

  const seen = new Set<string>([canonicalKey])
  const out: string[] = []

  for (const value of raw) {
    const alias = value.trim()
    if (alias.length < MIN_ALIAS_LENGTH) continue
    if (alias.length > MAX_ALIAS_LENGTH) continue

    // 1차 매칭이 대소문자를 무시하므로 소문자 기준으로 중복을 없앤다.
    const aliasKey = key(alias)
    if (banned.has(aliasKey)) continue
    if (seen.has(aliasKey)) continue

    seen.add(aliasKey)
    out.push(alias)
    if (out.length >= MAX_ALIASES) break
  }

  return out
}

/**
 * 카테고리와 무관하게 별칭이 될 수 없는 말.
 * `queries.ts`의 카테고리 별칭과 겹치는 것을 의도적으로 포함한다.
 */
const CATEGORY_STOPWORDS = [
  '패션', '의류', '옷', '쇼핑몰', '브랜드', '플랫폼',
  '화장품', '뷰티', '스킨케어', '코스메틱', '기초화장품',
  '식품', '음식', '먹거리', '간편식', '밀키트',
  '가전', '전자제품', '전자기기', '디지털',
  '교육', '학원', '강의', '인강',
  '추천', '순위', '인기', '최고', '베스트',
]

export const generateAliases: AliasFn = createAliasGenerator()

export function toBrandProfiles(suggestions: readonly AliasSuggestion[]): BrandProfile[] {
  return suggestions.map((s) => ({
    canonical: s.canonical,
    aliases: [...s.aliases],
    ambiguous: s.ambiguous,
  }))
}
