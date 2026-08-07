import type { RunPoint } from './data'
import { sameConditions } from './data'
import { judgeChange, wilsonInterval, type ChangeVerdict, type Interval } from '@/lib/stats/wilson'

/**
 * KPI 타일 — 대시보드 상단의 보조 수치 셋. 순수 모듈(I/O 없음).
 *
 * ## 왜 타일을 따로 두는가
 *
 * 헤드라인(언급률)만으로는 "무엇이 달라졌는가"에 답하지 못한다. 점유율은
 * 경쟁 맥락, 출처 수는 AI가 읽는 판의 넓이, 우리 사이트 인용은 우리 콘텐츠가
 * 그 판에 들어갔는지다 — 셋 다 이미 스냅샷에 있는 값인데 회차 상세까지
 * 들어가야 보였다.
 *
 * ## 델타의 정직성 규칙 (이 파일의 존재 이유)
 *
 * **비율 값의 델타는 신뢰구간 판정을 통과해야 색을 얻는다.** 언급률과 점유율은
 * 표본 비율이라 회차마다 흔들린다 — 겹치는 구간을 "▲3%p 상승"으로 칠하면
 * 제품이 거짓말을 한다. `judgeChange`가 `unchanged`를 내면 델타 숫자는 그대로
 * 보여주되 **판정은 '오차 범위'**이고 색은 무채색이다(`--color-metric-flat`).
 *
 * **개수 값(도메인 수)은 신뢰구간이 없다.** 표본에서 관측된 서로 다른 도메인
 * 수는 비율이 아니라 계수라 Wilson 구간을 붙일 대상이 아니다. 그래서 이 타일의
 * 델타는 **언제나 무채색**이고 방향을 판정하지 않는다 — 늘었다/줄었다만 적는다.
 * 초록으로 칠하는 순간 "출처가 늘어난 것은 좋은 일"이라는 없는 주장이 생긴다.
 *
 * **조건이 다른 회차끼리는 비교하지 않는다.** `sameConditions`(엔진·질의 집합·
 * 판정기 버전)가 다르면 `incomparable`이고 델타 자체를 내지 않는다 —
 * `buildHeadline`과 같은 가드다.
 */

/** 델타에 색을 줄 수 있는가. 개수 값은 항상 `none`이다(위 머리말 참고). */
export type DeltaKind = 'judged' | 'none'

export interface KpiDelta {
  /** 이전 회차 대비 변화량. 비율이면 퍼센트포인트, 개수면 개수. */
  amount: number
  /** 비율 타일에만 붙는 판정. 개수 타일은 항상 null이다. */
  verdict: ChangeVerdict | null
  kind: DeltaKind
}

export interface Kpi {
  id: 'sov' | 'domains' | 'self-cited'
  label: string
  /** 표시 문자열. 비율이면 `%`, 개수면 `n개`. */
  value: string
  /** 비율 타일의 신뢰구간. 개수 타일은 null. */
  interval: Interval | null
  /** 값을 낼 수 없을 때의 사유 문구(그 경우 value는 '—'). */
  unavailable: string | null
  delta: KpiDelta | null
  /** 값 아래 한 줄. 무엇을 센 숫자인지 밝힌다. */
  note: string
}

/** 퍼센트포인트 차이. 표시 반올림과 같은 기준(정수 %)으로 계산한다 —
 *  화면이 77%와 74%를 보여주는데 델타가 2.6%p면 사용자가 산수를 의심한다. */
function pointDelta(prev: Interval, curr: Interval): number {
  return Math.round(curr.point * 100) - Math.round(prev.point * 100)
}

/** `pick`이 null을 내면(그 회차에 그 지표가 없으면) 델타도 없다. */
function judgedDelta(
  prev: RunPoint | null,
  curr: RunPoint,
  pick: (p: RunPoint) => Interval | null,
): KpiDelta | null {
  if (!prev) return null
  // 조건이 다르면 비교 자체를 하지 않는다(buildHeadline과 같은 가드).
  if (!sameConditions(prev, curr)) {
    return { amount: 0, verdict: 'incomparable', kind: 'judged' }
  }
  const a = pick(prev)
  const b = pick(curr)
  if (!a || !b || a.n === 0 || b.n === 0) return null
  return {
    amount: pointDelta(a, b),
    verdict: judgeChange(a, b, { prevEngines: prev.engines, currEngines: curr.engines }),
    kind: 'judged',
  }
}

/**
 * 우리 사이트가 인용된 비율.
 *
 * ★ `hasSelfDomains`가 false면 `selfAnswers === 0`은 "인용되지 않았다"가 아니라
 *   **"도메인을 몰라서 못 셌다"**이다(result.ts 주석). 0%로 그리면 근거 없는
 *   단정이 되므로 값을 내지 않고 사유를 돌려준다.
 */
function selfCited(point: RunPoint): Interval | null {
  const r = point.result
  if (!r.hasSelfDomains) return null
  return wilsonInterval(r.sourceSummary.selfAnswers, r.sourceSummary.totalAnswers)
}

export function buildKpis(points: readonly RunPoint[]): Kpi[] {
  const curr = points[points.length - 1]
  if (!curr) return []
  const prev = points[points.length - 2] ?? null
  const r = curr.result

  const sovDelta = judgedDelta(prev, curr, (p) => p.result.shareOfVoice)
  const currSelf = selfCited(curr)
  const prevSelf = prev ? selfCited(prev) : null

  const domainsNow = r.sourceSummary.distinctDomains
  const domainsPrev = prev?.result.sourceSummary.distinctDomains ?? null

  return [
    {
      id: 'sov',
      label: '언급 점유율',
      value: r.shareOfVoice.n > 0 ? `${Math.round(r.shareOfVoice.point * 100)}%` : '—',
      interval: r.shareOfVoice.n > 0 ? r.shareOfVoice : null,
      unavailable: r.shareOfVoice.n > 0 ? null : '경쟁사를 등록하면 계산됩니다',
      delta: r.shareOfVoice.n > 0 ? sovDelta : null,
      note: `등록 브랜드 ${r.competitors.length + 1}개 중 우리 몫`,
    },
    {
      id: 'domains',
      label: 'AI가 읽는 출처',
      value: `${domainsNow}개`,
      interval: null,
      unavailable: null,
      // ★ 개수라서 판정하지 않는다 — 이 파일 머리말의 두 번째 규칙.
      delta:
        domainsPrev === null
          ? null
          : { amount: domainsNow - domainsPrev, verdict: null, kind: 'none' },
      note: `답변 ${r.totalAnswers}개에서 나온 서로 다른 도메인`,
    },
    {
      id: 'self-cited',
      label: '우리 사이트 인용',
      value: currSelf ? `${Math.round(currSelf.point * 100)}%` : '—',
      interval: currSelf,
      unavailable: currSelf ? null : '사이트 주소를 등록하면 계산됩니다',
      delta: currSelf && prevSelf ? judgedDelta(prev, curr, selfCited) : null,
      note: currSelf
        ? `답변 ${r.sourceSummary.totalAnswers}개 중 ${r.sourceSummary.selfAnswers}개가 우리 사이트 인용`
        : '어느 도메인이 우리 것인지 알아야 셀 수 있습니다',
    },
  ]
}
