export interface BrandProfile {
  /** "무신사" */
  canonical: string
  /** ["MUSINSA", "Musinsa", "무신사스탠다드", "무탠다드"] */
  aliases: string[]
  /** 일반어와 겹치는가. true면 2차 판정을 무조건 거친다. */
  ambiguous: boolean
}

export interface Stage1Hit {
  /** 매칭된 별칭 (원본 표기) */
  alias: string
  /** 원본 텍스트에서의 시작 인덱스 */
  index: number
  /** 2차 LLM 판정을 거쳐야 하는가 */
  needsStage2: boolean
}

export type Sentiment = 'recommended' | 'neutral' | 'negative'

export interface Stage2Verdict {
  /** 동음이의어 배제 — 진짜 그 브랜드를 가리키는가 */
  isBrandReference: boolean
  /** 답변에서 몇 번째로 언급된 브랜드인가 (1부터). 언급 아니면 null */
  position: number | null
  sentiment: Sentiment
  /** 한 줄 요약 — 고객에게 그대로 노출한다 */
  context: string
}

export interface DetectionResult {
  /**
   * 어느 답변에 대한 판정인가. 호출자가 결과를 원본 답변에 되붙이는 유일한
   * 수단이다 — 배열 순서에 기대면 판정 경로(2차를 거쳤는지)에 따라 조용히
   * 어긋난다.
   */
  answerId: string
  /** 'self' 또는 `competitor:${canonical}` */
  subject: string
  mentioned: boolean
  position: number | null
  sentiment: Sentiment | null
  context: string | null
  /** 2차 판정이 실패해 미판정으로 남았는가 */
  unresolved: boolean
}
