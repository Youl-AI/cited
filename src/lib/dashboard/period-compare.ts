import type { RunPoint } from './data'
import { sameConditions } from './data'
import { judgeChange, wilsonInterval, type ChangeVerdict, type Interval } from '@/lib/stats/wilson'

/**
 * 기간(묶음) 비교 — 최근 w회 묶음 vs 그 직전 w회 묶음. 순수 모듈(I/O 없음).
 *
 * ## 왜 묶는가
 *
 * 회차 하나의 표본(답변 60개 수준)으로는 웬만한 변화가 전부 '오차 범위'다 —
 * 정직한 판정이지만 고객은 영영 판정을 못 받는다. 회차 w개를 묶으면 표본이
 * w배가 되어 구간이 좁아지고, 실제 변화가 있을 때 유의미 판정이 나올 확률이
 * 올라간다. 분석 대시보드들의 "vs 이전 기간"과 같은 장치인데, 우리는 일수가
 * 아니라 **회차 수**로 묶는다(범위 선택기와 같은 이유 — 실패한 회차는 점이
 * 없어 날짜 묶음은 약속을 못 지킨다).
 *
 * ## 정직성 규칙
 *
 * - **풀링은 조건이 같을 때만 합법이다.** 두 묶음에 든 모든 회차가
 *   `sameConditions`(엔진·질의 집합·판정기 버전)로 같아야 한다. 하나라도
 *   다르면 분자·분모의 정의가 섞인 합계가 된다 — 그때는 계산 자체를 접고
 *   `incomparable`을 낸다(합쳐 놓고 "참고만 하세요"가 더 나쁘다).
 * - 판정은 개별 회차와 같은 `judgeChange`다 — 묶었다고 다른 잣대를 쓰면
 *   화면마다 '변화'의 뜻이 갈린다.
 * - 엔진 필터가 걸리면 그 엔진의 k/n만 묶는다. 어느 회차에 그 엔진 값이
 *   없으면(n=0) 묶음이 성립하지 않으므로 null — 빠진 회차를 0으로 채우는
 *   것도, 말없이 빼는 것도 없는 사실을 만든다.
 * - 묶음 크기는 `min(4, floor(회차 수 / 2))`, 최소 2다. 1회짜리 묶음 비교는
 *   헤드라인의 직전 회차 델타와 같은 그림이라 이 카드의 존재 이유가 없다.
 */
export interface PeriodWindow {
  /** 묶음의 첫·마지막 측정 시각 (ISO) — 화면이 날짜 범위를 적는 데 쓴다. */
  from: string
  to: string
  /** 묶음 전체를 합친 Wilson 구간 (k=Σk, n=Σn). */
  interval: Interval
}

export interface PeriodComparison {
  /** 묶음당 회차 수. */
  window: number
  prev: PeriodWindow
  curr: PeriodWindow
  verdict: ChangeVerdict
  /** 화면 표시(정수 %)와 같은 기준의 %p 차이 — kpi.ts pointDelta와 같은 이유. */
  deltaPoints: number
}

function pick(p: RunPoint, engine: string | null): Interval | null {
  if (!engine) return p.result.citedRate
  const interval = p.result.byEngine[engine]
  return interval && interval.n > 0 ? interval : null
}

function pool(runs: RunPoint[], engine: string | null): PeriodWindow | null {
  let k = 0
  let n = 0
  for (const run of runs) {
    const interval = pick(run, engine)
    if (!interval) return null
    k += interval.k
    n += interval.n
  }
  if (n === 0) return null
  return {
    from: runs[0]!.measuredAt,
    to: runs[runs.length - 1]!.measuredAt,
    interval: wilsonInterval(k, n),
  }
}

export function buildPeriodComparison(
  points: readonly RunPoint[],
  opts: { window?: number; engine?: string | null } = {},
): PeriodComparison | null {
  const engine = opts.engine && opts.engine !== 'all' ? opts.engine : null
  const w = Math.min(opts.window ?? 4, Math.floor(points.length / 2))
  if (w < 2) return null

  const curr = points.slice(-w)
  const prev = points.slice(-2 * w, -w)
  const all = [...prev, ...curr]

  // 조건 검사 — 첫 회차를 기준으로 전부 같아야 한다(sameConditions는 추이며,
  // 같음은 추이적이므로 기준 하나면 충분하다).
  const comparable = all.every((p) => sameConditions(all[0]!, p))

  const prevPool = pool(prev, engine)
  const currPool = pool(curr, engine)
  if (!prevPool || !currPool) return null

  const verdict: ChangeVerdict = comparable
    ? judgeChange(prevPool.interval, currPool.interval, {
        prevEngines: all[0]!.engines,
        currEngines: all[0]!.engines,
      })
    : 'incomparable'

  return {
    window: w,
    prev: prevPool,
    curr: currPool,
    verdict,
    deltaPoints:
      Math.round(currPool.interval.point * 100) - Math.round(prevPool.interval.point * 100),
  }
}
