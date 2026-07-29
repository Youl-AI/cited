import type { EngineId, EngineTier } from '@/lib/plans'

export interface Citation {
  url: string
  title: string
}

export interface EngineUsage {
  /** API 호출 횟수 (보통 1) */
  calls: number
  tokensIn?: number
  tokensOut?: number
  /**
   * 사고(reasoning/thinking) 토큰. **출력 단가로 청구된다.**
   *
   * 별도 필드로 두는 이유는 관측 때문이다. `tokensOut`에 합쳐버리면 모델이
   * 사고를 얼마나 태우는지 사후에 알 수 없다. 2026-07-29 실측에서
   * `flash-lite`는 0, `flash`는 한 번에 2,404 토큰이었고 그 차이만으로
   * 호출당 원가가 13배 벌어졌다. 원가가 튀었을 때 원인을 짚으려면 나뉘어 있어야 한다.
   */
  tokensThinking?: number
  /** SerpApi 응답 헤더가 알려주는 잔여 건수 */
  quotaRemaining?: number
}

export interface EngineAnswer {
  text: string
  citations: Citation[]
  /** 원본 응답. 절대 버리지 않는다 — 판정 로직 개선 후 재판정에 쓴다. */
  raw: unknown
  usage: EngineUsage
}

export interface RunOptions {
  /**
   * SERP 2샘플을 시간대로 나누기 위한 힌트.
   * SerpApi는 결과를 1시간 캐시하고 캐시 조회는 무료다. 두 샘플을 연속으로
   * 호출하면 같은 캐시가 두 번 나와 샘플 2회의 의미가 사라진다.
   */
  sampleIndex: number
  /** 취소 신호 (잡 타임아웃 등) */
  signal?: AbortSignal
}

export interface Engine {
  id: EngineId
  /** 샘플 수 차등의 근거 */
  tier: EngineTier
  /** 이 엔진이 쓸 수 있는 상태인가 (API 키가 있는가) */
  isConfigured(): boolean
  run(query: string, opts: RunOptions): Promise<EngineAnswer>
}

export type BackoffHint = 'none' | 'normal' | 'long'

export class EngineError extends Error {
  readonly engineId: EngineId
  readonly status: number | undefined
  readonly retryable: boolean
  readonly backoffHint: BackoffHint

  constructor(message: string, params: { engineId: EngineId; status?: number; cause?: unknown }) {
    super(message, { cause: params.cause })
    this.name = 'EngineError'
    this.engineId = params.engineId
    this.status = params.status

    const status = params.status
    if (status === undefined) {
      // 네트워크 계층 실패 — 재시도할 가치가 있다.
      this.retryable = true
      this.backoffHint = 'normal'
    } else if (status === 429) {
      this.retryable = true
      this.backoffHint = 'long'
    } else if (status >= 500) {
      this.retryable = true
      this.backoffHint = 'normal'
    } else {
      // 400류: 요청 자체가 잘못됐다. 재시도해도 같은 결과다.
      this.retryable = false
      this.backoffHint = 'none'
    }
  }
}

/** 취소인가. AbortController가 던지는 형태가 런타임마다 달라 이름으로 본다. */
function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function isRetryable(error: unknown): boolean {
  // 취소는 실패가 아니다. 재시도하면 취소의 의미가 사라지고,
  // 잡 타임아웃으로 끊은 호출이 백오프를 타고 되살아난다.
  if (isAbort(error)) return false
  if (error instanceof EngineError) return error.retryable
  // 정체를 모르는 에러는 일단 재시도한다. 수집 데이터를 잃는 것이 더 비싸다.
  return true
}
