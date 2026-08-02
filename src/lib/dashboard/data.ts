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
 * 화면이 삼키지 않게 한다.
 *
 * ★ 관대함의 범위는 **이 모듈이 건드리지 않는 필드까지**다. 버전이 올라가며
 *   `ranking`·`evidence` 같은 필드가 사라지거나 늘어나는 것은 통과시키되,
 *   **이 모듈이 실제로 파고드는 필드는 전부 여기서 확인한다.** `engineIdsIn`은
 *   `Object.keys(result.byEngine)`를, `buildSovTrend`는 `result.shareOfVoice.n`을
 *   가드 없이 읽는다 — 여기서 안 보면 통과한 스냅샷이 화면에서 터진다.
 *   (검사하는 것: `version`·`citedRate`·`byQuery`·`sources`·`byEngine`·
 *   `shareOfVoice`. 그 외 필드는 보지 않는다.)
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
  // byEngine은 엔진 id → Interval 맵이다. 배열이면 Object.keys가 인덱스를
  // 엔진 id로 내놓는다 — 토글 목록에 '0'·'1'이 뜨는 대신 여기서 거른다.
  if (!v.byEngine || typeof v.byEngine !== 'object' || Array.isArray(v.byEngine)) return null
  if (!v.shareOfVoice || typeof v.shareOfVoice !== 'object') return null
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
  /**
   * planSnapshot.queryIds — 이 회차가 실제로 물어본 질의 집합.
   *
   * ★ **비교 가능성 필드다.** `citedRate`의 분모는 "모든 질의에 대한 모든 답변"
   *   이므로, 질의 하나만 바뀌어도 숫자가 움직인다 — 브랜드가 한 일이 없어도.
   *   동결 후 질의 수정은 운영자 CLI로 **지원되는 경로**이므로(스펙 ②) 실제로
   *   일어난다. 집합이 다른 회차끼리 ▲▼를 붙이면 설정 변경을 실적으로 보고하게
   *   된다 — `engines`가 다른 주끼리 비교하지 않는 것과 정확히 같은 이유다.
   */
  queryIds: string[]
  /**
   * planSnapshot.detectorVersion — **무엇을 "언급"으로 셌는가**.
   *
   * ★ 이것도 비교 가능성 필드다. 판정기가 바뀌면 같은 원본 답변에서 나오는
   *   언급 수가 달라진다. 분자가 정의째로 바뀌는 것이라 `queryIds`와 똑같이
   *   다루지 않으면 판정기 개선이 고객 화면에서 "유의미한 상승"이 된다.
   */
  detectorVersion: number
  /**
   * 이 회차 **직전에 스냅샷이 없어 버려진 회차 수** (`toRunPoints`가 센다).
   *
   * ★ 시간 간격은 조건 비교로 보이지 않는다. 6/01 측정 → 6/08 스냅샷 저장 실패
   *   → 6/15 측정이면 `sameConditions`는 셋 다 같으니 "비교 가능"이 맞다.
   *   그런데 두 점 사이에는 **측정이 없던 한 주**가 있다. 서수 축(점을 등간격으로
   *   찍는 축)은 그 주를 통째로 감춘다 — 6/01과 6/15가 옆칸에 나란히 앉는다.
   *   여기서 세어 두지 않으면 화면이 그 사실을 알 방법이 없다.
   *   `toRunPoint` 하나만 쓰면 언제나 0이다 (앞뒤 맥락이 없다).
   */
  skippedBefore: number
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
    queryIds: [...run.planSnapshot.queryIds],
    detectorVersion: run.planSnapshot.detectorVersion,
    // 회차 하나만 보면 앞에 무엇이 버려졌는지 알 수 없다 — `toRunPoints`가 채운다.
    skippedBefore: 0,
    result,
  }
}

/**
 * 회차 목록(오래된 → 최신) → 추이 입력. `runs.map(toRunPoint).filter(...)`와
 * 다른 점은 **버려진 회차를 세어 남긴다**는 것 하나다.
 *
 * ★ 스냅샷이 없는 회차(`succeeded` + `result IS NULL`, `failed`)는 여기서
 *   사라진다. 사라진 자리를 `skippedBefore`로 남기지 않으면, 화면은 일주일
 *   떨어진 두 점을 붙어 있는 두 점으로 그린다 — 각 점은 참인데 그 사이의
 *   "매주 재고 있다"는 인상이 거짓이 된다.
 */
export function toRunPoints(
  runs: readonly Pick<CollectionRun, 'id' | 'startedAt' | 'planSnapshot' | 'result'>[],
): RunPoint[] {
  const out: RunPoint[] = []
  let skipped = 0
  for (const run of runs) {
    const point = toRunPoint(run)
    if (!point) {
      skipped += 1
      continue
    }
    out.push({ ...point, skippedBefore: skipped })
    skipped = 0
  }
  return out
}

/** 순서 무관 문자열 집합 비교. 스냅샷이 정렬을 보장하지 않는 필드가 있다. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((v, i) => v === y[i])
}

/**
 * 두 회차가 **같은 조건에서 측정됐는가**. 여기 있는 셋 중 하나라도 다르면
 * 두 숫자의 차이는 브랜드의 변화가 아니라 설정의 변화다.
 *
 *   - `engines` — 잰 엔진이 다르면 분모가 다르다 (설계 ③, `judgeChange`와 동일)
 *   - `queryIds` — 물어본 질문이 다르면 분모가 다르다
 *   - `detectorVersion` — 무엇을 언급으로 세는지가 다르면 분자가 다르다
 *
 * ★ 이 판정은 **보수적**이다. 엔진이 하나 늘어난 경우 개별 엔진 계열의 분모는
 *   실제로 그대로지만, 그래도 끊는다. 잘못 이어 붙인 선(없는 상승)의 대가가
 *   한 번 끊긴 선의 대가보다 비교할 수 없이 크다 — 이 제품이 파는 것이
 *   정직한 측정이라서다.
 *
 * ★ 이 과잉 발화는 **의도된 것이고 테스트가 못 박는다**
 *   (`buildTrend(points, 'chatgpt')` 계열도 엔진 집합이 바뀌면 끊긴다).
 *   완화하고 싶으면 **이 함수 본문을 고치지 말고** 호출부가 넘기는 옵션
 *   (예: `sameConditions(prev, curr, { ignoreEngines: true })`)으로 하라 —
 *   그래야 어느 화면이 무엇을 포기했는지가 코드에 남는다. 본문에
 *   `engineId !== 'all'` 같은 특수 케이스를 넣으면 그 결정이 사라진다.
 */
function sameConditions(prev: RunPoint, curr: RunPoint): boolean {
  return (
    sameSet(prev.engines, curr.engines) &&
    sameSet(prev.queryIds, curr.queryIds) &&
    prev.detectorVersion === curr.detectorVersion
  )
}

export interface TrendPoint {
  runId: string
  measuredAt: string
  interval: Interval
  /**
   * 직전 추이 점과 같은 조건에서 측정됐는가 (`sameConditions`).
   *
   * ★ false면 화면은 **선을 끊어야 한다.** 점은 둘 다 참이지만 그 사이를 잇는
   *   선분은 거짓이다 — Starter→Business 업그레이드로 엔진이 늘거나(플랜의
   *   `engines`가 바뀐다), 운영자가 동결 질의를 고치거나, 판정기 버전이 오르면
   *   숫자는 브랜드와 무관하게 움직인다. 첫 점은 이을 대상이 없으므로 true다.
   */
  comparableWithPrev: boolean
  /**
   * 직전 추이 점과 이 점 **사이에서 통째로 빠진 회차 수**. 0이면 두 점은
   * 실제로 연속한 두 회차다. 첫 점은 이을 대상이 없으므로 0이다.
   *
   * ★ `comparableWithPrev`와 **다른 종류의 거짓말**을 막는다. 조건은 같은데
   *   (그래서 comparable=true) 그 사이 회차가 스냅샷 없이 죽었거나(n=0,
   *   `result IS NULL`, 실패) 하면, 두 점은 2주 떨어져 있는데 서수 축은
   *   나란히 붙여 그린다. "매주 재고 있다"는 인상이 거짓이 되는 자리다.
   *   화면은 이 값이 0이 아닌 구간에 연속성을 암시해선 안 된다 — 시간 축을
   *   쓰거나(간격이 저절로 벌어진다), 끊거나, 최소한 표시해야 한다.
   */
  runsSkippedBefore: number
}

/** 추이 계열. 'all' = citedRate, 엔진 id = byEngine — 없는 회차는 뺀다. */
export function buildTrend(
  points: readonly RunPoint[],
  engineId: string | 'all',
): TrendPoint[] {
  const out: TrendPoint[] = []
  // 비교 대상은 "직전 회차"가 아니라 **직전에 실제로 찍힌 점**이다. 빠진 회차
  // 너머로 조건 비교를 하지 않으면 끊어야 할 구간을 이어 버린다.
  let prev: RunPoint | null = null
  // 빠진 회차 수. 원인이 둘이다 — 스냅샷이 아예 없어 `points`에 못 들어온 회차
  // (`RunPoint.skippedBefore`가 실어 온다)와, 이 계열에서 n=0이라 빠지는 회차.
  // 화면에서는 구분되지 않는다: 둘 다 "그 주에는 잰 값이 없다"이다.
  let skipped = 0
  for (const p of points) {
    skipped += p.skippedBefore
    const interval = engineId === 'all' ? p.result.citedRate : p.result.byEngine[engineId]
    if (!interval || interval.n === 0) {
      skipped += 1
      continue
    }
    out.push({
      runId: p.runId,
      measuredAt: p.measuredAt,
      interval,
      comparableWithPrev: prev === null ? true : sameConditions(prev, p),
      runsSkippedBefore: prev === null ? 0 : skipped,
    })
    prev = p
    skipped = 0
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
  /**
   * 직전 SoV 점과 조건이 같은가 — 다르면 잇지도 비교하지도 않는다.
   * 추이(`sameConditions`)가 보는 셋 **위에 경쟁사 집합까지** 같아야 한다.
   */
  comparableWithPrev: boolean
}

/**
 * 점유율 추이. SoV는 분모가 등록 경쟁사에 의존하는 유일한 지표라
 * (`PlanSnapshot.competitors` 주석), 집합이 바뀐 구간에는 비교를 걸지 않는다.
 * 경쟁사 집합만 보는 게 아니다 — 엔진·질의·판정기가 바뀌어도 SoV는 움직인다.
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
        prev === undefined
          ? true
          : sameConditions(prev, p) && sameSet(prev.competitors, p.competitors),
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
  /**
   * 이 회차가 **자사 도메인을 알고 있었는가** (`AuditResult.hasSelfDomains`).
   *
   * ★ false면 `owner: 'third-party'`를 "남의 사이트"로 읽으면 안 된다.
   *   `aggregateSources`는 `'third-party'`를 순수한 fallthrough로 넣는다 —
   *   `selfDomains`가 비어 있으면 **고객 본인 사이트까지 전부** 'third-party'다.
   *   `hasSelfDomains`가 존재하는 이유가 정확히 이것이고("인용되지 않았다" vs
   *   "도메인을 몰라서 못 셌다"), 그 주석은 "화면이 이 둘을 반드시 갈라야
   *   한다"고 못 박는다. 이 값이 false인데 표가 "제3자"라고 단정하면
   *   고객 자기 사이트를 남의 것이라고 말하는 화면이 된다.
   */
  selfDomainsKnown: boolean
  /** 최신 회차에서 이 도메인이 인용된 답변 수 */
  answers: number
  /** 직전 회차의 값. 그 회차에 없던 도메인이면 null */
  prevAnswers: number | null
  /**
   * 최신 회차와 직전 회차가 **같은 조건에서 측정됐는가** (`sameConditions`).
   *
   * ★ false면 화면은 `prevAnswers → answers` 화살표(증가/감소)를 그려선 안
   *   된다. 질의를 셋 더 넣은 다음 회차는 출처 인용 수가 당연히 늘고, 판정기가
   *   바뀌면 무엇을 인용으로 셌는지가 바뀐다 — "2 → 5"는 브랜드가 한 일이
   *   아니라 설정 변경이다. 언급률 추이는 `comparableWithPrev`로 선을 끊는데
   *   출처 표만 화살표를 그리면, 같은 거짓말이 표 모양으로 나갈 뿐이다.
   *
   * ★ 직전 회차가 아예 없으면 false다 — 비교 자체가 없다. (이 경우
   *   `prevAnswers`는 전부 null이라 화면은 어차피 "새로 등장"을 쓴다.)
   *   `prevAnswers`를 null로 뭉개지 **않는** 이유가 이것이다: "직전에 없던
   *   도메인"과 "비교할 수 없는 회차"는 다른 사실이고, null 하나로 합치면
   *   화면이 멀쩡히 있던 도메인을 "새로 등장"이라고 말하게 된다.
   */
  comparableWithPrev: boolean
}

/** 출처 상위 변화 (스펙 ⑤ — 도메인별 인용 수). 최신 회차 상위 topN 기준. */
export function buildSourceChanges(points: readonly RunPoint[], topN = 8): SourceChangeRow[] {
  const latest = points[points.length - 1]
  if (!latest) return []
  const prev = points[points.length - 2]
  const prevByDomain = new Map((prev?.result.sources ?? []).map((s) => [s.domain, s.answers]))
  const selfDomainsKnown = latest.result.hasSelfDomains === true
  const comparableWithPrev = prev !== undefined && sameConditions(prev, latest)
  return latest.result.sources.slice(0, topN).map((s) => ({
    domain: s.domain,
    owner: s.owner,
    selfDomainsKnown,
    answers: s.answers,
    prevAnswers: prevByDomain.get(s.domain) ?? null,
    comparableWithPrev,
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
  // ★ 질의 집합·판정기 버전은 `judgeChange`가 모르는 조건이다 (그 함수는 엔진만
  //   본다). 여기서 먼저 끊지 않으면 운영자의 질의 수정 한 번이 고객 화면에
  //   "통계적으로 유의미한 상승입니다"로 나간다 — 브랜드는 아무것도 하지 않았는데.
  if (prev && !sameConditions(prev, latest)) {
    return { latest, prev, verdict: 'incomparable' }
  }
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
