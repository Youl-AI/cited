import { createHash, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { completenessRatio } from '@/lib/collection/completeness'
import type { QueryInput } from '@/lib/collection/fanout'
import { answerKey, type CollectedAnswer } from '@/lib/collection/run'
import { db, schema } from '@/lib/db'
import type { Completeness, PlanSnapshot, RunMetrics, RunStatus, RunTrigger } from '@/lib/db/schema'
import { ENGINE_TIER, resolveLimits, type EngineId, type PlanId } from '@/lib/plans'

/**
 * 수집 결과 저장 계층 — **유료 경로 전용.**
 *
 * ★ 무료 진단은 이 계층을 부르지 않는다. 무료 플랜은 `historyMonths: 0`이라
 *   이력이 제품에 없고, 저장하려면 `collection_runs.brand_id`를 채우려고 가짜
 *   브랜드 행을 만들어야 한다. 무료 결과는 `free_audits.result` 하나에 담는다.
 *
 * 순수하게 검증·조립만 하는 부분(`validateRunStart`·`buildAnswerRow`·
 * `buildRunMetrics`·`resolveRunStatus`)을 DB 접근과 분리한다 — DB 없이 테스트할
 * 수 있는 것이 이쪽이고, 실제로 틀리는 것도 이쪽이다.
 */

export interface RunStartArgs {
  brandId: string
  queries: readonly QueryInput[]
  plan: PlanId
  queryPacks: number
  /**
   * **같은 계정의 다른 브랜드**가 이미 등록한 질의 수.
   *
   * ★ 질의 한도는 계정 전체의 것이지 브랜드마다 주는 것이 아니다. 이 필드가
   *   없으면(브랜드별 한도) Business 고객이 3브랜드 × 30질의 = 90질의를 돌린다.
   *   2026-07-30 실측 단가(질의 1개당 월 1,642원)로 계산하면 월 원가 147,800원,
   *   **원가율 51%**다. 게다가 Starter와 질의 팩은 질의당 9,000~9,900원인데
   *   그 방식의 Business만 3,222원이라 가격 체계 자체가 어긋난다.
   *
   * ★ 선택 필드로 두지 않는다. 기본값 0을 주면 호출자가 빼먹었을 때 한도가
   *   조용히 브랜드별로 되돌아간다 — 그게 지금 고치는 바로 그 버그다.
   *   타입이 강제하게 둔다.
   */
  queriesOnOtherBrands: number
}

/** 수집을 시작하기 전에 검증한다. 한도를 넘은 수집이 돌면 원가가 새어나간다. */
export function validateRunStart(args: RunStartArgs): void {
  if (args.queries.length === 0) {
    throw new Error(`수집할 질의가 없습니다 (brandId=${args.brandId})`)
  }

  // ★ 중복 id는 answerKey를 충돌시켜 저장이 덮어써진다 — 돈은 두 번 쓰고
  //   데이터는 한 번분만 남는다. buildFanout이 걸러내지만 여기서 먼저 잡으면
  //   원인이 분명해진다("왜 20회 돌렸는데 answers가 18행인가").
  const ids = new Set(args.queries.map((q) => q.id))
  if (ids.size !== args.queries.length) {
    throw new Error(`중복된 질의 id가 있습니다 (brandId=${args.brandId})`)
  }

  const limits = resolveLimits(args.plan, args.queryPacks)
  // ★ 음수를 그대로 더하면 한도가 조용히 늘어난다. 호출자가 뺄셈을 잘못한
  //   경우인데, 그 실수가 원가로 새어나가면 안 된다.
  const others = Math.max(0, args.queriesOnOtherBrands)
  const total = others + args.queries.length
  if (total > limits.maxQueries) {
    throw new Error(
      `계정 전체 질의 수(${total})가 한도(${limits.maxQueries})를 넘습니다 — ` +
        `이 브랜드 ${args.queries.length}개 + 다른 브랜드 ${others}개 (brandId=${args.brandId})`,
    )
  }
}

/**
 * 답변 행을 만든다.
 *
 * ★ id를 **결정적으로** 만든다. `randomUUID()`를 쓰면 재시도로 같은 답변이
 *   두 번 저장될 때 `onConflictDoNothing`이 막지 못하고 두 행이 된다.
 *   그러면 언급률의 분모가 늘어나 지표가 내려간다. unique 인덱스가
 *   (run, query, engine, sample)이므로 id도 같은 것에서 파생한다.
 */
export function buildAnswerRow(runId: string, answer: CollectedAnswer) {
  const key = `${runId}:${answerKey(answer)}`
  return {
    id: `ans_${createHash('sha256').update(key).digest('base64url').slice(0, 22)}`,
    runId,
    queryId: answer.queryId,
    queryText: answer.queryText,
    engineId: answer.engineId,
    sampleIndex: answer.sampleIndex,
    text: answer.text,
    citations: answer.citations,
    // 원본을 절대 버리지 않는다.
    raw: answer.raw,
  }
}

export interface MetricsOutcome {
  engineId: EngineId
  ok: boolean
  attempts: number
}

/**
 * 실측 원가·성능 지표를 만든다. 6단계 관리자 화면이 소비한다.
 *
 * ★ `callsByEngine`은 **시도 기준**이다. 성공만 세면 실패에 쓴 돈이 원가에서
 *   빠진다 — 500류나 타임아웃은 이미 토큰을 태웠을 수 있다.
 */
export function buildRunMetrics(
  outcomes: readonly MetricsOutcome[],
  answers: readonly CollectedAnswer[],
  costMilliKrw: number,
): RunMetrics & { estimatedCostMilliKrw: number } {
  const callsByEngine: Partial<Record<EngineId, number>> = {}
  for (const o of outcomes) {
    callsByEngine[o.engineId] = (callsByEngine[o.engineId] ?? 0) + 1
  }

  let tokensIn = 0
  let tokensOut = 0
  let serpApiCalls = 0
  for (const a of answers) {
    tokensIn += a.usage.tokensIn ?? 0
    tokensOut += a.usage.tokensOut ?? 0
    // ★ SERP 엔진만 센다. LLM 호출을 SerpApi 쿼터에 넣으면 월 1,000건 경고가
    //   엉뚱한 시점에 뜨고, 진짜 소진을 놓친다.
    if (ENGINE_TIER[a.engineId] === 'serp') serpApiCalls += a.usage.calls
  }

  return {
    callsByEngine,
    tokensIn,
    tokensOut,
    estimatedCostMilliKrw: costMilliKrw,
    estimatedCostKrw: Math.round(costMilliKrw / 1000),
    serpApiCalls,
    durationMs: 0,
    // 판정 단계(runDetection)가 채운다. 여기서 0으로 두면 "1차가 아무것도
    // 통과시키지 않았다"로 읽힌다.
    stage1PassRate: null,
  }
}

/**
 * 수집 상태를 정한다.
 *
 * ★ 경계는 `isDegraded`와 **같은 90%**다. 다르면 대시보드 배지는 없는데
 *   상태는 partial인 행이 생기고, 운영자가 없는 장애를 찾으러 나선다.
 */
export function resolveRunStatus(completeness: Completeness): RunStatus {
  const tallies = Object.values(completeness).filter((v) => v !== undefined)
  const succeeded = tallies.reduce((sum, v) => sum + v.succeeded, 0)
  // 시도가 아예 없으면 completenessRatio는 1(완전)을 돌려주지만, 답변 0건은
  // 성공이 아니다.
  if (succeeded === 0) return 'failed'
  return completenessRatio(completeness) < 0.9 ? 'partial' : 'succeeded'
}

// ─────────────────────────────────────────────────────────────
// DB 접근
// ─────────────────────────────────────────────────────────────

export async function createRun(args: {
  brandId: string
  planSnapshot: PlanSnapshot
  trigger: RunTrigger
}): Promise<string> {
  const id = randomUUID()
  await db.insert(schema.collectionRuns).values({
    id,
    brandId: args.brandId,
    planSnapshot: args.planSnapshot,
    trigger: args.trigger,
    status: 'running',
  })
  return id
}

/** 답변 하나를 저장한다. 재시도로 두 번 와도 같은 id라 무시된다. */
export async function saveAnswer(runId: string, answer: CollectedAnswer): Promise<string> {
  const row = buildAnswerRow(runId, answer)
  await db.insert(schema.answers).values(row).onConflictDoNothing()
  return row.id
}

export async function saveAnswers(
  runId: string,
  answers: readonly CollectedAnswer[],
): Promise<string[]> {
  if (answers.length === 0) return []
  const rows = answers.map((a) => buildAnswerRow(runId, a))
  await db.insert(schema.answers).values(rows).onConflictDoNothing()
  return rows.map((r) => r.id)
}

export async function finishRun(args: {
  runId: string
  completeness: Completeness
  metrics: RunMetrics
  status: RunStatus
}): Promise<void> {
  await db
    .update(schema.collectionRuns)
    .set({
      completeness: args.completeness,
      metrics: args.metrics,
      status: args.status,
      finishedAt: new Date(),
    })
    .where(eq(schema.collectionRuns.id, args.runId))
}

/**
 * 회차 결과 스냅샷 저장 (스펙 ④). 추이·히트맵·점유율이 이 스냅샷에서 계산되고,
 * 회차 상세는 ResultView가 그대로 그린다 — 재집계하지 않는다.
 */
export async function saveRunResult(runId: string, result: unknown): Promise<void> {
  await db
    .update(schema.collectionRuns)
    .set({ result })
    .where(eq(schema.collectionRuns.id, runId))
}

export async function loadRunAnswers(runId: string) {
  return db
    .select({
      id: schema.answers.id,
      queryId: schema.answers.queryId,
      queryText: schema.answers.queryText,
      engineId: schema.answers.engineId,
      text: schema.answers.text,
      citations: schema.answers.citations,
    })
    .from(schema.answers)
    .where(eq(schema.answers.runId, runId))
}

/**
 * 이번 달 SerpApi 사용량을 누적한다 (6단계 쿼터 추적기가 읽는다).
 *
 * ★ `period`는 KST 기준 달이다. UTC로 계산하면 매월 1일 오전 9시 이전 수집이
 *   지난달로 잡혀 쿼터 경고가 한 달 늦게 뜬다.
 */
export async function recordSerpUsage(calls: number, now = new Date()): Promise<void> {
  if (calls <= 0) return
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const period = kst.toISOString().slice(0, 7)
  await db.execute(sql`
    insert into serpapi_usage (period, plan_limit, used)
    values (${period}, 1000, ${calls})
    on conflict (period) do update set used = serpapi_usage.used + ${calls},
                                       updated_at = now()
  `)
}
