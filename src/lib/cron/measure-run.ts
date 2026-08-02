import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm'
import { createAliasGenerator, toBrandProfiles } from '@/lib/audit/aliases'
import { createCostMeter } from '@/lib/audit/cost'
import { buildAuditResult } from '@/lib/audit/result'
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import {
  buildAnswerRow,
  buildRunMetrics,
  createRun,
  finishRun,
  recordSerpUsage,
  resolveRunStatus,
  saveAnswers,
  saveRunResult,
  validateRunStart,
} from '@/lib/collection/repository'
import { runCollection } from '@/lib/collection/run'
import { db, schema } from '@/lib/db'
import { DETECTOR_VERSION } from '@/lib/detection'
import { runDetection } from '@/lib/detection/pipeline'
import { implementedEngineIds } from '@/lib/engines'
import { createClaudeJudge } from '@/lib/judge/claude'
import { kstDayStart } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { loadEditorQuota } from '@/lib/onboarding/quota'
import { PLANS } from '@/lib/plans'
import type { DueContext, MeasureOutcome } from './measure'

/** 측정 대상과 오늘 회차를 읽는다. 순수 판정(selectDueBrand)의 입력이 된다. */
export async function loadMeasureContext(now = new Date()): Promise<DueContext> {
  const brandRows = await db
    .select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.brands.userId))
    .where(
      and(
        eq(schema.brands.isActive, true),
        isNotNull(schema.brands.queriesFrozenAt),
        inArray(schema.subscriptions.status, ['active', 'past_due']),
      ),
    )
    .orderBy(schema.brands.id)
  if (brandRows.length === 0) return { brands: [], todaysRuns: [] }

  const todaysRuns = await db
    .select({
      brandId: schema.collectionRuns.brandId,
      status: schema.collectionRuns.status,
      startedAt: schema.collectionRuns.startedAt,
    })
    .from(schema.collectionRuns)
    .where(
      and(
        inArray(
          schema.collectionRuns.brandId,
          brandRows.map((b) => b.id),
        ),
        gte(schema.collectionRuns.startedAt, kstDayStart(now)),
        eq(schema.collectionRuns.trigger, 'schedule'),
      ),
    )
  return { brands: brandRows, todaysRuns }
}

/**
 * 브랜드 1개 측정 — 기존 파이프라인의 조립이다 (스펙 ③: "기존 수집·판정
 * 파이프라인 + 계정 전체 한도 검증 그대로. 동결 질의 사용").
 *
 * 순서는 audit-run.mts와 같은 이유로 고정된다: 검증(공짜) → 수집(비쌈) →
 * 별칭(수집 실패 시 안 씀) → 판정 → 집계·저장.
 */
export async function measureBrand(brandId: string): Promise<MeasureOutcome> {
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) })
  if (!brand) throw new Error(`브랜드가 없습니다: ${brandId}`)
  if (!brand.queriesFrozenAt) throw new Error(`질의가 동결되지 않았습니다: ${brandId}`)
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, brand.userId),
  })
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'past_due')) {
    throw new Error(`활성 구독이 없습니다: ${brandId}`)
  }

  const queryRows = await db
    .select()
    .from(schema.queries)
    .where(and(eq(schema.queries.brandId, brandId), eq(schema.queries.isActive, true)))
    .orderBy(schema.queries.createdAt)
  const queries = queryRows.map((q) => ({ id: q.id, text: q.text }))

  // ★ 플랜 엔진 중 **구현된 것만** 잰다. SerpApi(네이버·Google AIO)는 이번
  //   단계의 명시적 보류다. 스냅샷에는 실제로 잰 엔진만 남긴다 — judgeChange가
  //   엔진 구성으로 비교 가능성을 판정하므로, 안 잰 엔진이 스냅샷에 남으면
  //   SerpApi가 켜지는 날 과거와의 비교가 조용히 거짓이 된다.
  const implemented = implementedEngineIds()
  const engines = PLANS[subscription.plan].engines.filter((e) => implemented.includes(e))
  const snapshot = {
    ...buildPlanSnapshot({
      plan: subscription.plan,
      queryPacks: subscription.queryPacks,
      queryIds: queries.map((q) => q.id),
      competitors: brand.competitors.map((c) => c.name),
      detectorVersion: DETECTOR_VERSION,
    }),
    engines: [...engines],
  }

  // ★ 회차 행을 **검증보다 먼저** 만든다. 행이 없는 상태로 던지면
  //   `selectDueBrand`가 세는 failedAttempts가 영원히 0이라 하루 상한(2회)이
  //   전혀 걸리지 않고, id 순 소진이라 그 브랜드가 큐 앞을 막아 **뒤 브랜드
  //   전부가 그 날 측정되지 않는다** (호출마다 운영자 메일 한 통은 덤이다).
  //   회차 행은 LLM 비용이 아니므로 이 순서 변경은 지출을 늘리지 않는다 —
  //   대신 실패가 failed 행으로 남아 상한이 걸리고 소진이 계속된다.
  const runId = await createRun({ brandId, planSnapshot: snapshot, trigger: 'schedule' })
  const meter = createCostMeter()
  const startedMs = Date.now()
  // ★ 성공으로 닫은 뒤(finishRun succeeded)에는 어떤 실패도 회차를 다시 열지
  //   못하게 하는 빗장이다. 아래 catch 설명 참고.
  let settled: MeasureOutcome | null = null

  try {
    // 계정 전체 한도 — 같은 계정의 다른 브랜드가 쓰는 질의 수.
    // ★ 같은 계산을 두 번 구현하지 않는다. 이 한도가 이 코드베이스가 선언한
    //   원가 방어선이라, 구현이 둘이면 한쪽만 고쳐진 날 다른 쪽이 조용히 뚫린다.
    const { queriesOnOtherBrands } = await loadEditorQuota(brand.userId, brandId, subscription)
    // ★ 돈을 쓰기 전에 검증한다. 한도를 넘은 수집이 돌면 원가가 새어나간다.
    validateRunStart({
      brandId,
      queries,
      plan: subscription.plan,
      queryPacks: subscription.queryPacks,
      queriesOnOtherBrands,
    })

    const items = buildFanout(snapshot, queries)
    const collected = await runCollection(items, {
      onProgress: (done, total) => logger.info('cron.measure.progress', { runId, done, total }),
    })
    meter.collection(collected.costMilliKrw)

    if (collected.answers.length === 0) {
      // 답변 0건으로 만든 스냅샷은 "언급 0%"처럼 보인다. 측정 실패를 측정
      // 결과로 저장하면 안 된다 (executeAudit과 같은 규칙).
      throw new Error(`수집이 전부 실패했습니다 (${collected.outcomes.length}회 시도)`)
    }

    await saveAnswers(runId, collected.answers)

    // 별칭 — 수집 뒤에 생성한다 (수집이 전부 실패하면 이 비용을 안 쓴다).
    // 자기 브랜드와 경쟁사를 한 번에 — 경쟁사 별칭이 없으면 SoV가 우리에게
    // 유리한 쪽으로 틀린다 (execute.ts 주석).
    const aliasFn = createAliasGenerator({
      onUsage: meter.alias,
      onError: (error) =>
        logger.warn('cron.measure.alias_failed', {
          runId,
          reason: error instanceof Error ? error.name : 'unknown',
        }),
    })
    const suggestions = await aliasFn(
      [brand.name, ...brand.competitors.map((c) => c.name)],
      brand.category,
    )
    const [self, ...competitors] = toBrandProfiles(suggestions)
    if (!self) throw new Error('별칭 생성이 자기 브랜드를 돌려주지 않았습니다')

    // 판정 — 답변 id는 DB 행 id를 쓴다. detections FK와 스냅샷 조인의 단일 키.
    const dbId = (a: (typeof collected.answers)[number]) => buildAnswerRow(runId, a).id
    const answersForDetection = collected.answers.map((a) => ({
      id: dbId(a),
      queryId: a.queryId,
      queryText: a.queryText,
      engineId: a.engineId,
      text: a.text,
    }))
    const judge = createClaudeJudge({ onUsage: meter.judge })
    const detection = await runDetection({ answers: answersForDetection, self, competitors }, judge, {
      onBatchError: (error, ids) =>
        logger.error('cron.measure.judge_batch_failed', {
          runId,
          count: ids.length,
          reason: error instanceof Error ? error.name : 'unknown',
        }),
    })

    // 판정 저장 — 재판정(detectorVersion) 이력을 위해 detections에도 남긴다.
    if (detection.detections.length > 0) {
      await db
        .insert(schema.detections)
        .values(
          detection.detections.map((d) => ({
            id: randomUUID(),
            answerId: d.answerId,
            subject: d.subject,
            mentioned: d.mentioned,
            position: d.position,
            sentiment: d.sentiment,
            context: d.context,
            detectorVersion: DETECTOR_VERSION,
            unresolved: d.unresolved,
          })),
        )
        .onConflictDoNothing()
    }

    const status = resolveRunStatus(collected.completeness)
    const metrics = {
      ...buildRunMetrics(collected.outcomes, collected.answers, meter.breakdown().totalMilliKrw),
      durationMs: Date.now() - startedMs,
      stage1PassRate: detection.stage1PassRate,
    }
    await finishRun({ runId, completeness: collected.completeness, metrics, status })
    // ★ 여기서부터 이 회차는 "성공으로 닫힌" 것이다. 순서는 바꾸지 않는다 —
    //   saveRunResult를 finishRun보다 앞에 두면 스냅샷은 있는데 회차가 running인
    //   창이 생기고, 그 창에서 다음 호출이 같은 브랜드를 다시 재는 이중 지출이 난다.
    settled = { runId, status }
    await recordSerpUsage(metrics.serpApiCalls)

    // 스냅샷 — 리포트와 같은 조립기, 같은 화면 문법 (스펙 ④).
    const result = buildAuditResult({
      brandName: brand.name,
      category: brand.category,
      competitors: brand.competitors.map((c) => c.name),
      engines: [...engines],
      aliases: self.aliases,
      measuredAt: new Date().toISOString(),
      metrics: detection.metrics,
      answers: collected.answers.map((a) => ({
        id: dbId(a),
        queryText: a.queryText,
        engineId: a.engineId,
        text: a.text,
        citations: a.citations,
      })),
      detections: detection.detections.map((d) => ({
        answerId: d.answerId,
        subject: d.subject,
        mentioned: d.mentioned,
        position: d.position,
        context: d.context,
        sentiment: d.sentiment,
        unresolved: d.unresolved,
      })),
      ...(brand.selfDomains.length > 0 ? { selfDomains: brand.selfDomains } : {}),
      evidenceMax: 6,
      unresolved: detection.unresolved,
    })
    await saveRunResult(runId, result)

    logger.info('cron.measure.run_done', {
      runId,
      status,
      costKrw: Math.round(meter.breakdown().totalMilliKrw / 1000),
    })
    return { runId, status }
  } catch (error) {
    // ★ 이미 성공으로 닫은 회차는 **절대 다시 열지 않는다.** 여기서 failed로
    //   덮으면 (1) completeness가 비고 metrics가 전부 0인 거짓 숫자가 남고,
    //   (2) 다음 호출이 이 실패를 시도 1회로 세어 **이미 성공적으로 측정된
    //   브랜드에 유료 파이프라인을 통째로 다시 돌린다**(회차당 약 2,400원).
    //   가장 현실적인 경로가 saveRunResult다 — 파이프라인에서 가장 큰 jsonb
    //   쓰기이고 stateless neon-http 연결 위에서 돈다.
    if (settled) {
      logger.error('cron.measure.snapshot_save_failed', {
        runId,
        brandId,
        reason: error instanceof Error ? error.message : String(error),
      })
      return settled
    }
    // ★ 실패해도 이미 쓴 돈과 저장된 답변은 남긴다. 회차를 failed로 닫아
    //   selectDueBrand의 재시도 판정이 이 행을 세게 한다.
    const metrics = {
      ...buildRunMetrics([], [], meter.breakdown().totalMilliKrw),
      durationMs: Date.now() - startedMs,
    }
    await finishRun({ runId, completeness: {}, metrics, status: 'failed' })
    throw error
  }
}
