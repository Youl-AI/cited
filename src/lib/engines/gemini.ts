import { GoogleGenAI } from '@google/genai'
import { env } from '@/lib/env'
import type { Citation, Engine, EngineAnswer, EngineUsage, RunOptions } from './types'
import { EngineError } from './types'

/**
 * 기본 모델.
 *
 * 2026-07-29 실측으로 고른 값이다. `flash-lite`는 사고 토큰이 0이라 호출당
 * 3.2원이지만 `flash`는 한 번에 2,404 토큰을 태워 41.9원이 된다 — **13배**다.
 * 모델을 올릴 때는 반드시 원가를 다시 재라.
 * (docs/superpowers/notes/2026-07-29-gemini-token-actuals.md)
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'

const SYSTEM_PROMPT =
  '너는 일반 소비자의 질문에 답하는 어시스턴트다. 한국어로, 구체적인 브랜드나 제품명을 들어 간결하게 답하라.'

export interface ParsedGeminiResponse {
  text: string
  citations: Citation[]
  /** 빈 답변의 원인을 가리기 위해 그대로 넘긴다. 없으면 null. */
  finishReason: string | null
}

export function parseGeminiResponse(raw: unknown): ParsedGeminiResponse {
  const empty: ParsedGeminiResponse = { text: '', citations: [], finishReason: null }

  if (!isRecord(raw)) return empty
  const candidates = raw.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return empty
  const first = candidates[0]
  if (!isRecord(first)) return empty

  // 텍스트
  let text = ''
  const content = first.content
  if (isRecord(content) && Array.isArray(content.parts)) {
    for (const part of content.parts) {
      if (isRecord(part) && typeof part.text === 'string') text += part.text
    }
  }

  // 인용
  const citations: Citation[] = []
  const seen = new Set<string>()
  const grounding = first.groundingMetadata
  if (isRecord(grounding) && Array.isArray(grounding.groundingChunks)) {
    for (const chunk of grounding.groundingChunks) {
      // web이 아닌 청크(retrievedContext 등)는 웹 인용이 아니다.
      if (!isRecord(chunk) || !isRecord(chunk.web)) continue
      const url = typeof chunk.web.uri === 'string' ? chunk.web.uri : null
      // ★ 중복 제거. 근거 청크는 문장마다 반복되므로 같은 URL이 여러 번 온다.
      //   그대로 두면 "인용 12건" 같은 부풀려진 숫자가 대시보드에 올라간다.
      if (!url || seen.has(url)) continue
      seen.add(url)
      citations.push({
        url,
        title: typeof chunk.web.title === 'string' && chunk.web.title ? chunk.web.title : url,
      })
    }
  }

  return {
    text,
    citations,
    finishReason: typeof first.finishReason === 'string' ? first.finishReason : null,
  }
}

/**
 * 사용량 추출.
 *
 * ★ 세 가지를 빠뜨리기 쉽다.
 *   - `thoughtsTokenCount`(사고 토큰): **출력 단가로 청구된다.** 출력에 합치지
 *     말고 별도로 담아야 어느 쪽이 원가를 밀어올렸는지 사후에 가릴 수 있다.
 *   - `toolUsePromptTokenCount`: 입력 단가로 청구된다. 실측에서는 0이었지만
 *     0이 아닐 때 조용히 누락되면 원가가 틀린다.
 *   - grounding으로 **가져온 본문은 청구되지 않는다.** 그래서 여기에 더할
 *     항목이 없다. OpenAI는 반대이므로 같은 공식을 쓰면 안 된다.
 */
export function extractUsage(raw: unknown): EngineUsage {
  const meta = isRecord(raw) && isRecord(raw.usageMetadata) ? raw.usageMetadata : {}
  return {
    calls: 1,
    tokensIn: num(meta.promptTokenCount) + num(meta.toolUsePromptTokenCount),
    tokensOut: num(meta.candidatesTokenCount),
    tokensThinking: num(meta.thoughtsTokenCount),
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 빈 답변이 되돌아왔을 때 재시도할 가치가 있는가. */
function statusForEmptyAnswer(finishReason: string | null): number {
  // SAFETY·RECITATION·BLOCKLIST는 같은 질의에 대해 결정적이다. 재시도해봐야 같다.
  if (finishReason && /SAFETY|RECITATION|BLOCKLIST|PROHIBITED|SPII/.test(finishReason)) return 400
  // 그 외(STOP인데 본문이 비었다, MAX_TOKENS 등)는 일시적일 수 있다.
  return 502
}

export interface GeminiEngineOptions {
  /**
   * 모델 오버라이드.
   *
   * 무료 진단과 유료 측정이 **다른 모델**을 쓴다(설계 문서). Engine 인터페이스에
   * 모델 인자를 넣는 대신 인스턴스를 따로 만든다 — 다른 엔진은 모델 개념이
   * 아예 없으므로(SerpApi) 인터페이스를 오염시키지 않는다.
   */
  model?: string
}

export function createGeminiEngine(opts: GeminiEngineOptions = {}): Engine {
  const model = opts.model ?? GEMINI_MODEL
  let client: GoogleGenAI | null = null

  function getClient(): GoogleGenAI {
    if (!client) {
      if (!env.GEMINI_API_KEY) {
        throw new EngineError('GEMINI_API_KEY가 없습니다', { engineId: 'gemini', status: 401 })
      }
      client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
    }
    return client
  }

  return {
    id: 'gemini',
    tier: 'llm',

    isConfigured() {
      return Boolean(env.GEMINI_API_KEY)
    },

    async run(query: string, runOpts: RunOptions): Promise<EngineAnswer> {
      let raw: unknown
      try {
        raw = await getClient().models.generateContent({
          model,
          contents: query,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ googleSearch: {} }],
            ...(runOpts.signal ? { abortSignal: runOpts.signal } : {}),
          },
        })
      } catch (error) {
        // 취소는 EngineError로 감싸지 않는다. 감싸면 AbortError라는 사실이
        // 사라져 isRetryable이 재시도로 판정하고, 타임아웃으로 끊은 호출이
        // 백오프를 타고 되살아난다.
        if (error instanceof Error && error.name === 'AbortError') throw error
        if (error instanceof EngineError) throw error

        throw new EngineError(
          `Gemini 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
          { engineId: 'gemini', status: httpStatusOf(error), cause: error },
        )
      }

      const parsed = parseGeminiResponse(raw)

      // ★ 빈 답변을 그대로 흘려보내면 안 된다. 판정 단계가 "언급 없음"으로
      //   기록해 고객의 언급률을 **실제보다 낮게** 만든다. 측정 실패는
      //   측정 실패로 남아야 한다(설계 ③: 미노출과 언급 없음을 구분한다).
      if (!parsed.text.trim()) {
        throw new EngineError(
          `Gemini가 빈 답변을 돌려줬습니다 (finishReason=${parsed.finishReason ?? 'unknown'})`,
          { engineId: 'gemini', status: statusForEmptyAnswer(parsed.finishReason), cause: raw },
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

export const geminiEngine: Engine = createGeminiEngine()
