import type { AuditResult } from '@/lib/audit/result'
import type { CollectionRun, RunStatus } from '@/lib/db/schema'
import type { SourceOwner } from '@/lib/stats/sources'
import { judgeChange, type ChangeVerdict, type Interval } from '@/lib/stats/wilson'

/**
 * 대시보드 데이터 조립 — 순수 모듈. I/O 없음.
 *
 * 입력은 회차 스냅샷(`collection_runs.result`의 AuditResult)이다. 추이·히트맵·
 * SoV·출처는 전부 스냅샷에서 계산한다 (스펙 ④ — answers를 재집계하지 않는다).
 *
 * ★ n=0은 "측정 없음"이다 (metrics.ts 상단 주석). 이 모듈의 모든 빌더가
 *   n=0을 걸러내거나 null로 표시한다 — 0%로 그리는 순간 거짓말이 된다.
 */

/**
 * 스냅샷 파서. 모양이 아니면 null — 실패 회차(result null)와 알 수 없는 구조를
 * 화면이 삼키지 않게 한다. 버전 필드가 있는 한 관대하게 읽는다(과거 스냅샷
 * 호환 — `AuditResult.version` 주석).
 *
 * ★ **`result IS NULL`인 `succeeded` 회차가 실제로 존재한다.** 측정은 끝났는데
 *   스냅샷 저장(`saveRunResult`)만 실패한 경우로, 3단계 cron은 이미 성공으로
 *   닫은 회차를 다시 실패로 덮지 않는다(덮으면 이미 측정한 브랜드에 유료
 *   파이프라인이 한 번 더 돈다). 남는 신호는 `cron.measure.snapshot_save_failed`
 *   로그 한 줄뿐이다. 그러니 상태가 아니라 **스냅샷 유무**로 판단해야 한다 —
 *   status만 보고 0%로 그리면 돈 낸 고객에게 없는 측정을 보여주게 된다.
 */
export function parseRunResult(value: unknown): AuditResult | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<AuditResult>
  if (typeof v.version !== 'number') return null
  if (!v.citedRate || typeof v.citedRate !== 'object') return null
  if (!Array.isArray(v.byQuery) || !Array.isArray(v.sources)) return null
  return value as AuditResult
}

export interface RunPoint {
  runId: string
  /** run.startedAt ISO — 축과 정렬의 기준 시각 */
  measuredAt: string
  /** planSnapshot.engines — 실제로 잰 엔진 (비교 가능성 판정에 쓴다) */
  engines: string[]
  /** planSnapshot.competitors — SoV 분모의 정의 (정렬돼 저장된다) */
  competitors: string[]
  result: AuditResult
}

export function toRunPoint(
  run: Pick<CollectionRun, 'id' | 'startedAt' | 'planSnapshot' | 'result'>,
): RunPoint | null {
  const result = parseRunResult(run.result)
  if (!result) return null
  return {
    runId: run.id,
    measuredAt: run.startedAt.toISOString(),
    engines: [...run.planSnapshot.engines],
    competitors: [...run.planSnapshot.competitors],
    result,
  }
}

export interface TrendPoint {
  runId: string
  measuredAt: string
  interval: Interval
}

/** 추이 계열. 'all' = citedRate, 엔진 id = byEngine — 없는 회차는 뺀다. */
export function buildTrend(
  points: readonly RunPoint[],
  engineId: string | 'all',
): TrendPoint[] {
  const out: TrendPoint[] = []
  for (const p of points) {
    const interval = engineId === 'all' ? p.result.citedRate : p.result.byEngine[engineId]
    if (!interval || interval.n === 0) continue
    out.push({ runId: p.runId, measuredAt: p.measuredAt, interval })
  }
  return out
}

/** 스냅샷들에 등장한 엔진 id (등장 순서 유지) — 토글 목록의 근거 */
export function engineIdsIn(points: readonly RunPoint[]): string[] {
  const seen = new Set<string>()
  for (const p of points) for (const id of Object.keys(p.result.byEngine)) seen.add(id)
  return [...seen]
}

export interface HeatmapView {
  runs: { runId: string; measuredAt: string }[]
  rows: { queryText: string; cells: (Interval | null)[] }[]
}

/**
 * 질의 × 회차 히트맵 (스펙 ⑤ — "어느 질문에서 비는가"). 행 순서는 **최신
 * 회차의 byQuery 순서**(못 나오는 질문이 위)다. 과거 회차에 없던 질의는
 * null 셀 — "측정 없음"이지 0%가 아니다.
 */
export function buildHeatmap(points: readonly RunPoint[], maxRuns = 8): HeatmapView {
  const recent = points.slice(-maxRuns)
  const latest = recent[recent.length - 1]
  if (!latest) return { runs: [], rows: [] }
  const queryTexts = latest.result.byQuery.map((q) => q.queryText)
  return {
    runs: recent.map((p) => ({ runId: p.runId, measuredAt: p.measuredAt })),
    rows: queryTexts.map((queryText) => ({
      queryText,
      cells: recent.map((p) => {
        const hit = p.result.byQuery.find((q) => q.queryText === queryText)
        return hit && hit.interval.n > 0 ? hit.interval : null
      }),
    })),
  }
}

export interface SovPoint {
  runId: string
  measuredAt: string
  interval: Interval
  /** 직전 SoV 점과 경쟁사 집합이 같은가 — 다르면 잇지도 비교하지도 않는다 */
  comparableWithPrev: boolean
}

/**
 * 점유율 추이. SoV는 분모가 등록 경쟁사에 의존하는 유일한 지표라
 * (`PlanSnapshot.competitors` 주석), 집합이 바뀐 구간에는 비교를 걸지 않는다.
 * competitors는 스냅샷이 정렬해 저장하므로 배열 동등 비교로 충분하다.
 */
export function buildSovTrend(points: readonly RunPoint[]): SovPoint[] {
  const withSov = points.filter((p) => p.result.shareOfVoice.n > 0)
  return withSov.map((p, i) => {
    const prev = withSov[i - 1]
    return {
      runId: p.runId,
      measuredAt: p.measuredAt,
      interval: p.result.shareOfVoice,
      comparableWithPrev:
        i === 0 ? true : JSON.stringify(prev?.competitors) === JSON.stringify(p.competitors),
    }
  })
}

export interface SourceChangeRow {
  domain: string
  /**
   * `SourceStat.owner`를 그대로 통과시킨다.
   *
   * ★ `'self' | 'competitor' | null`이 **아니다.** 2단계 `aggregateSources`는
   *   소유를 모르는 도메인에 null이 아니라 `'third-party'`를 넣는다. 여기서
   *   null로 좁히면 남의 사이트와 판정 불가가 한 값으로 뭉개져, "AI가 읽는
   *   출처" 표에서 자사·경쟁사·제3자를 갈라 보여줄 수 없게 된다.
   */
  owner: SourceOwner
  /** 최신 회차에서 이 도메인이 인용된 답변 수 */
  answers: number
  /** 직전 회차의 값. 그 회차에 없던 도메인이면 null */
  prevAnswers: number | null
}

/** 출처 상위 변화 (스펙 ⑤ — 도메인별 인용 수). 최신 회차 상위 topN 기준. */
export function buildSourceChanges(points: readonly RunPoint[], topN = 8): SourceChangeRow[] {
  const latest = points[points.length - 1]
  if (!latest) return []
  const prev = points[points.length - 2]
  const prevByDomain = new Map((prev?.result.sources ?? []).map((s) => [s.domain, s.answers]))
  return latest.result.sources.slice(0, topN).map((s) => ({
    domain: s.domain,
    owner: s.owner,
    answers: s.answers,
    prevAnswers: prevByDomain.get(s.domain) ?? null,
  }))
}

export interface Headline {
  latest: RunPoint | null
  prev: RunPoint | null
  verdict: ChangeVerdict
}

/** 최신 언급률 + 직전 회차 대비 판정. 판정은 judgeChange 하나로만 한다. */
export function buildHeadline(points: readonly RunPoint[]): Headline {
  const latest = points[points.length - 1] ?? null
  const prev = points[points.length - 2] ?? null
  if (!latest) return { latest: null, prev: null, verdict: 'incomparable' }
  const verdict = judgeChange(prev?.result.citedRate ?? null, latest.result.citedRate, {
    ...(prev ? { prevEngines: prev.engines } : {}),
    currEngines: latest.engines,
  })
  return { latest, prev, verdict }
}

export interface RunListItem {
  runId: string
  startedAt: string
  status: RunStatus
  /**
   * 스냅샷이 있는가. ★ `status === 'succeeded'`인데 false일 수 있다 —
   * `parseRunResult` 주석 참고. 화면은 이 회차를 "스냅샷 없음"으로 써야 하고,
   * 0%로 그리거나 목록에서 감춰선 안 된다.
   */
  hasResult: boolean
}
