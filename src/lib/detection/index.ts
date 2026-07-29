import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'
import { stage1Match } from './stage1'
import { runStage2 } from './stage2'
import type { BrandProfile, DetectionResult } from './types'

export * from './types'
export { stage1Match } from './stage1'
export { runStage2 } from './stage2'
export { normalizeKo } from './normalize'

/**
 * 판정 로직 버전.
 *
 * 1차 매칭 규칙, 2차 프롬프트, 판정 모델 중 하나라도 바뀌면 올린다.
 * 올리면 과거 답변을 재판정한다. 기존 detections를 삭제하지 않고 새 버전
 * 판정을 추가한다 (감사 추적).
 *
 * v1 (2026-07-30) — 최초. Claude Haiku 4.5, 별칭 정규화 매칭.
 */
export const DETECTOR_VERSION = 1

export interface DetectMentionsInput {
  answerId: string
  answerText: string
  self: BrandProfile
  competitors: BrandProfile[]
}

export interface DetectionStats {
  /** 1차를 시도한 (답변 × 주체) 수 */
  stage1Candidates: number
  /** 1차를 통과한 수 */
  stage1Passed: number
  /** 2차 LLM 판정을 실제로 부른 수 */
  stage2Called: number
  /** 2차 판정이 실패해 미판정으로 남은 수 */
  unresolved: number
}

export interface DetectMentionsOptions {
  batchSize?: number
  onStats?: (stats: DetectionStats) => void
  onBatchError?: (error: unknown, ids: string[]) => void
}

/** 2차 판정을 기다리는 자리. `slot`은 results 배열에서의 위치다. */
interface Pending {
  key: string
  slot: number
  subject: string
  answerId: string
}

/**
 * 2단계 판정 오케스트레이션.
 *
 *   답변 텍스트
 *      ↓
 *   1차 — 문자열/별칭 매칭        recall 우선 (놓치지 않기)
 *      ↓  통과분만
 *   2차 — LLM 구조화 판정          precision 확보 (맞는지 확인)
 *      ↓
 *   Detection
 *
 * 순수 함수다 — judge를 주입받으므로 외부 I/O가 없다.
 *
 * ★ 결과는 **입력 순서**를 유지한다(답변 순 → 주체 순: self, 경쟁사...).
 *   2차를 거친 항목만 뒤로 모으면 호출자가 zip으로 매핑할 때 조용히 어긋난다.
 */
export async function detectMentions(
  inputs: readonly DetectMentionsInput[],
  judge: JudgeFn,
  opts: DetectMentionsOptions = {},
): Promise<DetectionResult[]> {
  // 자리를 먼저 잡고 나중에 채운다 — 순서 보존의 핵심.
  const results: (DetectionResult | undefined)[] = []
  const pending: Pending[] = []
  const judgeRequests: JudgeRequest[] = []

  let stage1Candidates = 0
  let stage1Passed = 0

  for (const input of inputs) {
    const subjects: { subject: string; brand: BrandProfile }[] = [
      { subject: 'self', brand: input.self },
      ...input.competitors.map((c) => ({
        subject: `competitor:${c.canonical}`,
        brand: c,
      })),
    ]

    // 이 답변에 걸린 주체들을 한 번만 계산해 재사용한다. 다른 브랜드가
    // **실제로 이 답변에 나오면** 순서 판정이 필요하다 — 단순히 경쟁사가
    // 등록돼 있다는 사실만으로는 2차를 부르지 않는다.
    const hitsBySubject = subjects.map((s) => stage1Match(input.answerText, s.brand))
    const presentCount = hitsBySubject.filter((h) => h.length > 0).length
    const otherBrandsPresent = presentCount > 1

    for (const [i, { subject, brand }] of subjects.entries()) {
      stage1Candidates++
      const slot = results.length

      if (hitsBySubject[i]!.length === 0) {
        results.push({
          answerId: input.answerId,
          subject,
          mentioned: false,
          position: null,
          sentiment: null,
          context: null,
          unresolved: false,
        })
        continue
      }

      stage1Passed++
      // otherBrandsPresent가 needsStage2를 바꾸므로 여기서 다시 판정한다.
      const hit = stage1Match(input.answerText, brand, { otherBrandsPresent })[0]!

      if (!hit.needsStage2) {
        // 명백한 케이스는 2차를 건너뛴다 — 원가 절감의 핵심.
        results.push({
          answerId: input.answerId,
          subject,
          mentioned: true,
          position: null,
          sentiment: null,
          context: null,
          unresolved: false,
        })
        continue
      }

      // ★ 키에 슬롯 번호를 붙인다. `answerId:subject`만으로는 같은 answerId가
      //   두 번 들어올 때 두 입력이 키를 공유해 한쪽 판정이 다른 쪽에 조용히
      //   복사된다. 슬롯은 전역적으로 유일하다.
      const key = `${input.answerId}:${subject}#${slot}`
      results.push(undefined)
      pending.push({ key, slot, subject, answerId: input.answerId })
      judgeRequests.push({
        id: key,
        answerText: input.answerText,
        brand,
        matchedAlias: hit.alias,
      })
    }
  }

  const verdicts = await runStage2(judgeRequests, judge, {
    batchSize: opts.batchSize,
    onBatchError: opts.onBatchError,
  })

  let unresolved = 0
  for (const p of pending) {
    const v = verdicts.get(p.key)
    if (!v) {
      // 판정 실패 — 미판정으로 남긴다. 원본이 있으므로 나중에 재판정 가능.
      unresolved++
      results[p.slot] = {
        answerId: p.answerId,
        subject: p.subject,
        mentioned: true, // 1차 결과를 따른다
        position: null,
        sentiment: null,
        context: null,
        unresolved: true,
      }
      continue
    }
    results[p.slot] = {
      answerId: p.answerId,
      subject: p.subject,
      mentioned: v.isBrandReference,
      // 미언급으로 뒤집혔으면 순위·감성도 함께 지운다. 판정기가 둘을 어긋나게
      // 답할 수 있고, "언급 안 됨 · 1위 · 추천"이 리포트에 나가면 안 된다.
      position: v.isBrandReference ? v.position : null,
      sentiment: v.isBrandReference ? v.sentiment : null,
      context: v.context || null,
      unresolved: false,
    }
  }

  opts.onStats?.({
    stage1Candidates,
    stage1Passed,
    stage2Called: judgeRequests.length,
    unresolved,
  })

  return results as DetectionResult[]
}
