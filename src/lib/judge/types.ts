import type { BrandProfile, Stage2Verdict } from '@/lib/detection/types'

export interface JudgeRequest {
  /** 이 판정을 식별하는 키 (보통 `${answerId}:${subject}`) */
  id: string
  answerText: string
  brand: BrandProfile
  /** 1차에서 걸린 별칭 — 판정기에 힌트로 준다 */
  matchedAlias: string
}

export interface JudgeResponse {
  id: string
  verdict: Stage2Verdict
}

export interface JudgeUsage {
  tokensIn: number
  tokensOut: number
}

/**
 * 2차 판정기의 계약.
 *
 * detection/stage2.ts는 이 타입만 알고 구현은 주입받는다. 덕분에
 * 골드 라벨 회귀 테스트를 API 키 없이 돌릴 수 있고, 판정 로직 자체는
 * 순수 함수로 남는다.
 */
export type JudgeFn = (batch: readonly JudgeRequest[]) => Promise<JudgeResponse[]>
