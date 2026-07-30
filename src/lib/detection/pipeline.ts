import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, BrandMetrics, DetectionRecord } from '@/lib/stats/metrics'
import type { JudgeFn } from '@/lib/judge/types'
import { detectMentions } from './index'
import { SELF_SUBJECT, competitorSubject } from './subject'
import type { BrandProfile, DetectionResult } from './types'

/**
 * 판정·집계 코어 — 저장된 답변에서 지표까지.
 *
 *   답변 → 1차 매칭 → 2차 LLM 판정 → 지표 집계
 *
 * ★ 잡 프레임워크를 모른다. 3단계에서는 운영자 CLI가 부르고, 4단계에서
 *   Trigger.dev 잡이 감싸기만 한다.
 *
 * ★ 원래 계획은 `judgeRun`과 `aggregateRun` 두 잡으로 나뉘어 있었다. 나눈
 *   이유는 잡 재시도 경계였는데 그 경계가 사라졌으므로 한 함수다.
 *
 * ★ DB를 모른다. 답변을 인자로 받고 판정을 저장하지 않는다 — 무료 진단은
 *   `answers` 테이블에 아무것도 없고, 유료 경로의 저장은 호출자 몫이다.
 */

/**
 * 판정에 필요한 답변의 최소 형태.
 *
 * ★ `CollectedAnswer`를 직접 참조하지 않는다. `detection/`은 순수 경계 안에
 *   있어 `collection/`을 몰라야 하고, 구조적 타이핑 덕에 `CollectedAnswer`가
 *   그대로 들어맞는다.
 *
 * ★ `id`를 **호출자가 넘긴다.** 여기서 `queryId:engineId:sampleIndex`를 다시
 *   조립하면 그 형식이 두 곳에 생기고, 갈리는 순간 판정과 답변의 조인이
 *   조용히 깨진다. 키의 단일 출처는 `collection/run.ts`의 `answerKey`다.
 */
export interface AnswerInput {
  id: string
  queryId: string
  queryText: string
  engineId: string
  text: string
}

export interface DetectionInput {
  answers: readonly AnswerInput[]
  /** 고객 브랜드 */
  self: BrandProfile
  /** 경쟁사. 비어 있으면 Share of Voice는 n=0("측정 없음")이 된다 */
  competitors: readonly BrandProfile[]
}

export interface DetectionOutput {
  /** 답변 순 → 주체 순(self, 경쟁사…). 입력 순서를 유지한다 */
  detections: DetectionResult[]
  metrics: BrandMetrics
  /** 1차를 시도한 (답변 × 주체) 수 */
  stage1Candidates: number
  /** 1차를 통과한 수 */
  stage1Passed: number
  /**
   * 통과율. 후보가 없으면 **null**이다.
   *
   * ★ 0을 돌려주면 "1차가 전부 탈락시켰다"로 읽힌다. 후보가 없는 것(답변 0건)과
   *   전부 탈락한 것은 다른 사건이고, 원가 관측에서 정반대로 해석된다.
   */
  stage1PassRate: number | null
  /** 2차 LLM 판정을 실제로 부른 수 */
  stage2Called: number
  /** 2차가 실패해 미판정으로 남은 건수 */
  unresolved: number
}

export interface RunDetectionOptions {
  batchSize?: number
  onBatchError?: (error: unknown, ids: string[]) => void
}

/**
 * ★ `judge`를 주입받는다. 2단계가 `runStage2(items, judge)`로 판정기를 주입
 *   가능하게 만들어 둔 이유가 여기서 살아난다 — 골드 라벨 회귀와 통합 테스트를
 *   API 키 없이 돌릴 수 있다.
 *
 * ★ 판정 실패는 던지지 않고 `unresolved`로 센다. 2차 LLM 하나가 실패했다고
 *   진단 전체를 버리면 안 된다. 이미 돈을 쓴 수집 데이터다.
 *
 * ★ 판정 원가를 계산하지 않는다. `JudgeFn`은 사용량을 돌려주지 않고, 토큰은
 *   `createClaudeJudge({ onUsage })`로 나가며 그 콜백은 호출자가 붙인다.
 *   여기서 원가를 흉내내면 두 곳에서 따로 계산해 언젠가 갈린다.
 */
export async function runDetection(
  input: DetectionInput,
  judge: JudgeFn,
  opts: RunDetectionOptions = {},
): Promise<DetectionOutput> {
  let stage1Candidates = 0
  let stage1Passed = 0
  let stage2Called = 0
  let unresolved = 0

  const detections = await detectMentions(
    input.answers.map((a) => ({
      answerId: a.id,
      answerText: a.text,
      self: input.self,
      competitors: [...input.competitors],
    })),
    judge,
    {
      ...(opts.batchSize === undefined ? {} : { batchSize: opts.batchSize }),
      ...(opts.onBatchError ? { onBatchError: opts.onBatchError } : {}),
      onStats: (s) => {
        stage1Candidates = s.stage1Candidates
        stage1Passed = s.stage1Passed
        stage2Called = s.stage2Called
        unresolved = s.unresolved
      },
    },
  )

  const answerRecords: AnswerRecord[] = input.answers.map((a) => ({
    id: a.id,
    queryId: a.queryId,
    queryText: a.queryText,
    engineId: a.engineId,
  }))

  // ★ queryId·engineId는 비정규화된 편의 필드다. 집계는 answerId로 답변을
  //   찾으므로, 여기서 답변 쪽 값을 그대로 복사해 두 값이 어긋날 여지를 없앤다.
  const byId = new Map(input.answers.map((a) => [a.id, a]))
  const detectionRecords: DetectionRecord[] = []
  for (const d of detections) {
    const a = byId.get(d.answerId)
    // 답변을 못 찾는 판정은 버린다. computeMetrics도 같은 판단을 하지만,
    // 여기서 걸러야 queryId를 빈 문자열로 지어내지 않는다.
    if (!a) continue
    detectionRecords.push({
      answerId: d.answerId,
      queryId: a.queryId,
      engineId: a.engineId,
      subject: d.subject,
      mentioned: d.mentioned,
      position: d.position,
    })
  }

  const metrics = computeMetrics(answerRecords, detectionRecords, {
    self: SELF_SUBJECT,
    competitors: input.competitors.map((c) => competitorSubject(c.canonical)),
  })

  return {
    detections,
    metrics,
    stage1Candidates,
    stage1Passed,
    stage1PassRate: stage1Candidates === 0 ? null : stage1Passed / stage1Candidates,
    stage2Called,
    unresolved,
  }
}
