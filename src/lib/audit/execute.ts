import { generateAliases, toBrandProfiles } from '@/lib/audit/aliases'
import type { AliasFn } from '@/lib/audit/aliases'
import { generateAuditQueries } from '@/lib/audit/queries'
import { buildAuditResult } from '@/lib/audit/result'
import type { AuditResult } from '@/lib/audit/result'
import { buildFanout } from '@/lib/collection/fanout'
import type { FanoutItem } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import { runCollection } from '@/lib/collection/run'
import type { CollectedAnswer, RunCollectionDeps } from '@/lib/collection/run'
import { DETECTOR_VERSION } from '@/lib/detection'
import { runDetection } from '@/lib/detection/pipeline'
import type { JudgeFn } from '@/lib/judge/types'
import { PLANS } from '@/lib/plans'

export interface AuditSubject {
  id: string
  brandName: string
  category: string
  competitors: string[]
  /**
   * 고객 사이트 호스트명. 없으면 인용 출처의 소유 판정을 하지 않는다.
   * ★ 브랜드명에서 추측하지 않는다 — 틀린 추측이 "당신 사이트는 한 번도
   *   인용되지 않았습니다"라는 가장 강한 문장을 근거 없이 만든다.
   */
  selfDomains?: string[]
}

/** 실행 통계. 운영자가 원가와 완전성을 봐야 한다. */
export interface AuditStats {
  /** 밀리원. 원 단위로 반올림하면 호출당 0.2원씩 사라진다 */
  costMilliKrw: number
  durationMs: number
  /** 리포트에 실제로 들어간 답변 수 */
  answers: number
  /** 시도한 팬아웃 항목 수. answers보다 크면 일부 엔진이 실패했다 */
  attempted: number
}

export interface ExecuteAuditDeps {
  runOne?: RunCollectionDeps['runOne']
  onProgress?: RunCollectionDeps['onProgress']
  sleep?: RunCollectionDeps['sleep']
  signal?: RunCollectionDeps['signal']
  judge: JudgeFn
  /** 기본값은 `generateAliases`. 테스트가 가짜를 주입한다 */
  aliasFn?: AliasFn
  /** 원가·완전성 통지. CLI가 콘솔에 찍는다 */
  onStats?: (stats: AuditStats) => void
  /**
   * 2차 판정 배치 실패 통지.
   *
   * ★ `unresolved` 숫자만 남기면 운영자는 **원인을 모른다.** 미판정이 rate
   *   limit인지 스키마 오류인지에 따라 "재실행하면 된다"와 "코드를 고쳐야 한다"가
   *   갈린다.
   */
  onJudgeError?: (error: unknown, ids: string[]) => void
  /** 테스트가 시각을 고정한다 */
  now?: () => Date
}

/**
 * 무료 진단 1건을 처음부터 끝까지 실행한다.
 *
 * ★ DB에 쓰지 않는다. 저장은 호출자(CLI) 책임이고, 이 함수는 순수하게
 *   "신청 → 리포트"만 한다. 그래야 실제 API 없이 테스트할 수 있다.
 *
 * ★ `collection_runs`/`answers`에도 쓰지 않는다. 무료 플랜은 이력이 없고
 *   (`historyMonths: 0`), 저장하려면 가짜 브랜드 행을 만들어야 한다.
 */
export async function executeAudit(
  subject: AuditSubject,
  deps: ExecuteAuditDeps,
): Promise<AuditResult> {
  const now = deps.now ?? (() => new Date())

  // 1. 질의 생성 — 브랜드명은 넣지 않는다 (queries.ts 주석 참고)
  const texts = generateAuditQueries(subject.category, subject.brandName)
  const queries = texts.map((text, i) => ({ id: `q${i + 1}`, text }))

  // 2. 무료 플랜 설정 그대로 팬아웃. 수동이라고 늘리지 않는다.
  //    질의 3개 × 엔진 2개 × 샘플 1개 = 6회. 이 수가 곧 원가다.
  //
  // ★ `competitors`는 여기서 **관측되지 않는다.** `buildFanout`이 쓰지 않고,
  //   무료 진단은 스냅샷을 저장하지 않기 때문이다(`historyMonths: 0`).
  //   그래도 올바른 값을 넣는다 — 4단계가 이 스냅샷을 저장하기 시작하면
  //   그때부터 SoV 비교 가능성이 이 필드에 달린다. 변이 테스트로 확인했고,
  //   이 값을 `[]`로 바꿔도 지금은 아무 테스트가 실패하지 않는다.
  const snapshot = buildPlanSnapshot({
    plan: 'free',
    queryPacks: 0,
    queryIds: queries.map((q) => q.id),
    competitors: subject.competitors,
    detectorVersion: DETECTOR_VERSION,
  })
  const items = buildFanout(snapshot, queries)

  // 3. 수집
  const collected = await runCollection(items, {
    ...(deps.runOne ? { runOne: deps.runOne } : {}),
    ...(deps.onProgress ? { onProgress: deps.onProgress } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.signal ? { signal: deps.signal } : {}),
  })

  deps.onStats?.({
    costMilliKrw: collected.costMilliKrw,
    durationMs: collected.durationMs,
    answers: collected.answers.length,
    attempted: collected.outcomes.length,
  })

  if (collected.answers.length === 0) {
    // 답변 0건으로 만든 리포트는 "언급 0%"처럼 보인다.
    // 측정 실패를 측정 결과로 배송하면 안 된다.
    throw new Error(
      `수집이 전부 실패했습니다 (${collected.outcomes.length}회 시도). 재실행하세요.`,
    )
  }

  // ★ 답변 식별자가 겹치면 조용히 숫자가 틀린다. `computeMetrics`는 분모를
  //   `answers.length`로 잡고 분자는 answerId 집합으로 세므로, 두 엔진의
  //   답변이 같은 id를 받으면 **언급률이 정확히 절반으로 나온다.** 리포트는
  //   정상처럼 보이고 숫자만 틀린 채로 고객에게 간다. 여기서 멈춘다.
  const answers = collected.answers.map(toResultAnswer)
  const distinct = new Set(answers.map((a) => a.id))
  if (distinct.size !== answers.length) {
    throw new Error(
      `답변 식별자가 겹칩니다 (${answers.length}건 중 ${distinct.size}건만 유일). ` +
        '엔진 어댑터가 queryId·engineId·sampleIndex를 그대로 돌려주지 않았습니다.',
    )
  }

  // 4. 별칭 생성 — 자기 브랜드와 경쟁사를 **한 번에** 넘긴다.
  //
  // ★ 이 단계를 빼면 ChatGPT 언급률이 구조적으로 0%가 된다(2026-07-30 실측).
  //   경쟁사를 함께 넘기는 것도 필수다 — 경쟁사 별칭이 없으면 경쟁사가 과소
  //   계상되고 Share of Voice가 우리에게 유리한 쪽으로 틀린다.
  //
  // ★ 수집 **뒤에** 생성한다. 순서를 바꾸면 수집이 전부 실패했을 때
  //   별칭 생성 비용을 이미 쓴 뒤에 던지게 된다.
  const aliasFn = deps.aliasFn ?? generateAliases
  const suggestions = await aliasFn([subject.brandName, ...subject.competitors], subject.category)
  const [self, ...competitors] = toBrandProfiles(suggestions)
  if (!self) throw new Error('별칭 생성이 자기 브랜드를 돌려주지 않았습니다')

  // 5. 판정·집계. 2차가 실패해도 리포트는 만든다 — 이미 돈을 쓴 데이터다.
  const detection = await runDetection({ answers, self, competitors }, deps.judge, {
    ...(deps.onJudgeError ? { onBatchError: deps.onJudgeError } : {}),
  })

  return buildAuditResult({
    brandName: subject.brandName,
    category: subject.category,
    competitors: subject.competitors,
    engines: [...PLANS.free.engines],
    aliases: self.aliases,
    // 조건부 전달과 `selfDomains: subject.selfDomains ?? []`는 **동등하다** —
    // `buildAuditResult`가 빈 배열도 "모른다"로 취급한다(그쪽 테스트가 그것을
    // 못박는다). 조건부로 두는 것은 `exactOptionalPropertyTypes` 관례를 따르는
    // 것이고 동작 차이는 없다.
    ...(subject.selfDomains ? { selfDomains: subject.selfDomains } : {}),
    measuredAt: now().toISOString(),
    metrics: detection.metrics,
    answers,
    // `detections`는 평평한 배열이다(입력 순서 유지). 각 항목이 answerId를 들고
    // 있으므로 Map으로 묶을 필요가 없다.
    detections: detection.detections.map((d) => ({
      answerId: d.answerId,
      subject: d.subject,
      mentioned: d.mentioned,
      position: d.position,
      context: d.context,
      sentiment: d.sentiment,
      unresolved: d.unresolved,
    })),
    unresolved: detection.unresolved,
  })
}

/**
 * 답변 식별자는 질의·엔진·샘플의 조합이다 (무료 진단은 DB id가 없다).
 *
 * `collection/run.ts`의 `answerKey`와 같은 형식이다 — 무료 진단은 답변을
 * 저장하지 않으므로 그 함수를 쓰지 않지만, 형식을 갈라 두면 나중에 저장으로
 * 넘어갈 때 판정 결과를 되붙일 수 없다.
 */
export function answerId(a: Pick<FanoutItem, 'queryId' | 'engineId' | 'sampleIndex'>): string {
  return `${a.queryId}:${a.engineId}:${a.sampleIndex}`
}

function toResultAnswer(a: CollectedAnswer) {
  return {
    id: answerId(a),
    queryId: a.queryId,
    queryText: a.queryText,
    engineId: a.engineId,
    text: a.text,
    // 인용 출처 집계에 쓴다. 이미 수집한 값이므로 API 호출이 늘지 않는다.
    citations: a.citations,
  }
}
