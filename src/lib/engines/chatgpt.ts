import OpenAI from 'openai'
import { env } from '@/lib/env'
import type { Citation, Engine, EngineAnswer, EngineUsage, RunOptions } from './types'
import { EngineError } from './types'

/**
 * 기본 모델.
 *
 * 2026-07-30 실측으로 고른 값이다 (같은 질의 3개, 웹검색 강제):
 *
 *   gpt-5.4-mini  22원  인용 2건   답변 276~821자
 *   gpt-5-mini    44원  인용 11건  답변 1,030~1,190자
 *   gpt-5         89원  인용 14건  답변 595~1,410자
 *   gpt-5.5      110원  (호출 1회 기준)
 *
 * `gpt-5.4-mini`가 절반 값이지만 3건 중 2건에서 **인용 0건에 답변 276자**였다.
 * 얄팍한 답변은 브랜드를 덜 언급하므로 **언급률이 체계적으로 낮게 측정된다** —
 * 원가를 아끼려다 측정값 자체를 망가뜨린다. `gpt-5-mini`가 Gemini(33원,
 * 653~736자, 인용 4~5건)와 답변 길이·인용 밀도가 가장 비슷해 엔진 간
 * 비교 가능성이 유지된다.
 *
 * 모델을 바꾸면 답변이 바뀌고 시계열이 끊긴다. 반드시 원가를 다시 재고
 * 골드 라벨 회귀를 통과시켜라.
 */
export const CHATGPT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini'

/** Gemini 어댑터와 **글자 하나까지 같아야 한다.** 다르면 엔진 비교가 무의미해진다. */
const SYSTEM_PROMPT =
  '너는 일반 소비자의 질문에 답하는 어시스턴트다. 한국어로, 구체적인 브랜드나 제품명을 들어 간결하게 답하라.'

export interface ParsedChatgptResponse {
  text: string
  citations: Citation[]
  /** 빈 답변의 원인. 'incomplete' 등. 없으면 null. */
  status: string | null
}

/**
 * 인용 URL에서 OpenAI가 붙이는 추적 파라미터를 걷어낸다.
 *
 * 실측 응답의 인용은 전부 `?utm_source=openai`가 붙어서 온다. 이걸 그대로
 * 두면 두 가지가 생긴다.
 *   1. 고객 리포트에 남의 추적 파라미터가 그대로 노출된다.
 *   2. 같은 페이지가 파라미터 유무로 **다른 URL**이 되어 중복 제거가 새고,
 *      "인용 12건" 같은 부풀려진 숫자가 대시보드에 올라간다.
 * 원본은 `raw`에 그대로 남으므로 잃는 정보가 없다.
 */
export function cleanCitationUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('utm_source')
    // 파라미터를 지워 빈 쿼리가 남으면 '?'까지 없앤다.
    if ([...u.searchParams].length === 0) u.search = ''
    return u.toString()
  } catch {
    // 파싱 불가한 값은 손대지 않는다.
    return url
  }
}

/**
 * 본문에 박힌 인라인 인용을 걷어낸다.
 *
 * ★ **이걸 안 하면 언급률이 부풀려진다.** ChatGPT는 Gemini와 달리 인용을
 *   답변 본문 안에 마크다운 링크로 박아 넣는다. 2026-07-30 실측:
 *
 *     - Nike Pegasus 42 — 반응성 좋고 다목적. ([nike.com](https://www.nike.com/…))
 *
 *   URL과 라벨에 **브랜드명이 그대로 들어 있다.** 1차 매칭은 문자열을 보므로
 *   `nike.com`을 "나이키 언급"으로 센다. 답변이 어떤 브랜드를 추천하지 않고
 *   **출처로만** 인용해도 언급으로 잡히고, 고객의 Cited Rate가 실제보다
 *   높게 나온다. 우리가 파는 것이 그 숫자다.
 *
 *   인용 정보 자체는 `annotations`에서 이미 뽑아 `citations`에 담으므로
 *   잃는 것이 없다. 원본은 `raw`에 그대로 남는다.
 *
 * 괄호로 감싼 형태와 맨 링크를 모두 지운다. 링크가 아닌 일반 마크다운
 * (굵게, 목록)은 건드리지 않는다 — 고객에게 보여줄 증거 원문이기 때문이다.
 */
export function stripInlineCitations(text: string): string {
  return (
    text
      // ([라벨](http…)) — 실측에서 나온 형태
      .replace(/\s*\(\[[^\]]*\]\(https?:\/\/[^)\s]*\)\)/g, '')
      // [라벨](http…) — 괄호 없이 오는 경우
      .replace(/\s*\[[^\]]*\]\(https?:\/\/[^)\s]*\)/g, '')
      // 위에서 지우고 남은 줄끝 공백
      .replace(/[ \t]+$/gm, '')
  )
}

/**
 * 순수 파서. 어떤 입력을 받아도 던지지 않는다 — 파싱 실패는 원본이 살아 있어
 * 나중에 복구 가능한 문제지만, 여기서 던지면 수집 전체가 죽는다.
 */
export function parseChatgptResponse(raw: unknown): ParsedChatgptResponse {
  const empty: ParsedChatgptResponse = { text: '', citations: [], status: null }
  if (!isRecord(raw)) return empty

  const status = typeof raw.status === 'string' ? raw.status : null
  const output = raw.output
  if (!Array.isArray(output)) return { ...empty, status }

  let text = ''
  const citations: Citation[] = []
  const seen = new Set<string>()

  for (const item of output) {
    // reasoning·web_search_call 블록은 답변 본문이 아니다.
    if (!isRecord(item) || item.type !== 'message') continue
    const content = item.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (!isRecord(block)) continue
      if (typeof block.text === 'string') text += block.text

      const annotations = block.annotations
      if (!Array.isArray(annotations)) continue
      for (const a of annotations) {
        if (!isRecord(a) || a.type !== 'url_citation') continue
        if (typeof a.url !== 'string' || !a.url) continue
        const url = cleanCitationUrl(a.url)
        if (seen.has(url)) continue
        seen.add(url)
        citations.push({
          url,
          title: typeof a.title === 'string' && a.title ? a.title : url,
        })
      }
    }
  }

  return { text: stripInlineCitations(text), citations, status }
}

/**
 * 사용량 추출.
 *
 * ★ Gemini와 **정반대인 지점이 둘** 있다. 같은 공식을 쓰면 원가가 틀린다.
 *
 *   1. 검색 과금 단위. Gemini는 모델이 실행한 **검색 질의 수**로 청구하지만,
 *      OpenAI는 **web_search 호출 수**로 청구한다($10/1k calls). 실측에서
 *      `action.queries`에 질의가 3~4개 들어 있어도 청구 카운터
 *      `tool_usage.web_search.num_requests`는 1이었다. 질의를 세면 원가가
 *      3~4배로 부풀려진다.
 *
 *   2. 사고 토큰. Gemini의 `thoughtsTokenCount`는 `candidatesTokenCount`와
 *      **별개**지만, OpenAI의 `reasoning_tokens`는 `output_tokens`에
 *      **이미 포함**되어 있다(실측: total 8826 = in 8468 + out 358, 그중
 *      reasoning 84). pricing.ts가 `tokensOut + tokensThinking`으로 더하므로
 *      여기서 빼두지 않으면 사고 토큰이 두 번 청구된다.
 *
 *   3. 검색으로 긁어온 본문은 `input_tokens`에 이미 들어 있다(실측: 검색 없이
 *      4,491 → 검색 켜고 8,468). Gemini는 반대로 그라운딩 본문이 청구되지
 *      않는다. 여기서 따로 더할 항목은 없다.
 */
export function extractUsage(raw: unknown): EngineUsage {
  const usage = isRecord(raw) && isRecord(raw.usage) ? raw.usage : {}
  const details = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {}

  const totalOut = num(usage.output_tokens)
  const reasoning = Math.min(num(details.reasoning_tokens), totalOut)

  return {
    calls: 1,
    searches: countSearchRequests(raw),
    tokensIn: num(usage.input_tokens),
    tokensOut: totalOut - reasoning,
    tokensThinking: reasoning,
  }
}

/**
 * 청구되는 웹검색 호출 수.
 *
 * `tool_usage.web_search.num_requests`가 OpenAI가 직접 알려주는 청구 카운터다.
 * 추정하지 말고 이걸 읽는다. 없는 응답 형태를 대비해 `web_search_call` 항목
 * 수로 물러서되, **`action.queries`의 길이는 절대 세지 않는다** — 그건 모델이
 * 던진 질의 수이지 청구 단위가 아니다.
 */
function countSearchRequests(raw: unknown): number {
  if (!isRecord(raw)) return 0

  const toolUsage = raw.tool_usage
  if (isRecord(toolUsage) && isRecord(toolUsage.web_search)) {
    const n = toolUsage.web_search.num_requests
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n
  }

  const output = raw.output
  if (!Array.isArray(output)) return 0
  return output.filter((o) => isRecord(o) && o.type === 'web_search_call').length
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 빈 답변이 되돌아왔을 때 재시도할 가치가 있는가. */
function statusForEmptyAnswer(status: string | null): number {
  // 'incomplete'는 max_output_tokens 등으로 잘린 것 — 같은 요청이면 같은 결과다.
  if (status === 'incomplete') return 400
  return 502
}

export interface ChatgptEngineOptions {
  /** 모델 오버라이드. 무료 진단과 유료 측정이 다른 모델을 쓸 수 있다. */
  model?: string
  /** 테스트용 주입점 */
  client?: OpenAI
}

export function createChatgptEngine(opts: ChatgptEngineOptions = {}): Engine {
  const model = opts.model ?? CHATGPT_MODEL
  let client: OpenAI | null = opts.client ?? null

  function getClient(): OpenAI {
    if (!client) {
      if (!env.OPENAI_API_KEY) {
        throw new EngineError('OPENAI_API_KEY가 없습니다', { engineId: 'chatgpt', status: 401 })
      }
      client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
    }
    return client
  }

  return {
    id: 'chatgpt',
    tier: 'llm',

    isConfigured() {
      return Boolean(opts.client) || Boolean(env.OPENAI_API_KEY)
    },

    async run(query: string, runOpts: RunOptions): Promise<EngineAnswer> {
      let raw: unknown
      try {
        raw = await getClient().responses.create(
          {
            model,
            input: query,
            instructions: SYSTEM_PROMPT,
            tools: [{ type: 'web_search' }],
            // ★ 강제하지 않으면 검색이 실행되지 않는다. 실측에서 툴만 붙이고
            //   두었더니 `web_search_call`이 아예 없었고 인용도 0건이었다 —
            //   모델이 학습된 지식으로만 답한 것이다.
            //
            //   그 답변을 측정하면 우리가 재는 것이 **작년 학습 데이터**가 된다.
            //   GEO는 "지금 검색되는 내용이 답변에 어떻게 반영되는가"인데,
            //   검색을 안 하면 브랜드가 콘텐츠로 영향을 줄 여지가 없다.
            //   Gemini 어댑터도 그라운딩을 켜 두므로 이래야 비교가 성립한다.
            tool_choice: 'required',
          },
          runOpts.signal ? { signal: runOpts.signal } : {},
        )
      } catch (error) {
        // 취소는 감싸지 않는다. 감싸면 AbortError라는 사실이 사라져
        // isRetryable이 재시도로 판정하고, 끊은 호출이 백오프를 타고 되살아난다.
        if (error instanceof Error && error.name === 'AbortError') throw error
        if (error instanceof EngineError) throw error

        throw new EngineError(
          `ChatGPT 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
          { engineId: 'chatgpt', status: httpStatusOf(error), cause: error },
        )
      }

      const parsed = parseChatgptResponse(raw)

      // 빈 답변을 흘려보내면 판정 단계가 "언급 없음"으로 기록해 고객의
      // 언급률을 실제보다 낮게 만든다. 측정 실패는 측정 실패로 남아야 한다.
      if (!parsed.text.trim()) {
        throw new EngineError(
          `ChatGPT가 빈 답변을 돌려줬습니다 (status=${parsed.status ?? 'unknown'})`,
          { engineId: 'chatgpt', status: statusForEmptyAnswer(parsed.status), cause: raw },
        )
      }

      return {
        text: parsed.text,
        citations: parsed.citations,
        raw,
        usage: extractUsage(raw),
      }
    },
  }
}

function httpStatusOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined
  for (const key of ['status', 'code'] as const) {
    const n = Number(error[key])
    // code가 'ECONNRESET' 같은 문자열이면 NaN이 되어 걸러진다.
    if (Number.isInteger(n) && n >= 100 && n < 600) return n
  }
  return undefined
}

export const chatgptEngine: Engine = createChatgptEngine()
