/**
 * Wilson score interval과 구간 겹침 기반 변화 판정.
 *
 * 이 파일은 완전한 순수 함수다 (설계 ① 핵심 원칙, ESLint allow-list가 강제).
 * 외부 I/O를 import하지 마라.
 */

/** 95% 양측 신뢰구간의 z값 (표준정규 0.975 분위수) */
export const Z_95 = 1.959963984540054

export interface Interval {
  /** 표본 비율 k/n. n=0이면 0. */
  point: number
  lower: number
  upper: number
  n: number
  k: number
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

/**
 * Wilson score interval.
 *
 *   center    = (p̂ + z²/2n) / (1 + z²/n)
 *   halfwidth = z/(1+z²/n) × √( p̂(1-p̂)/n + z²/4n² )
 *
 * Wald(정규근사)를 쓰지 않는 이유: p̂=0 또는 1일 때 폭이 0이 되어
 * "확실히 0%"라는 거짓 확신을 만든다. 90회 시행에 0번과 10,000회에 0번은
 * 전혀 다른 정보인데 Wald는 구분하지 못한다.
 *
 * @param k 사건이 일어난 횟수 (예: 브랜드가 언급된 답변 수)
 * @param n 전체 시행 수 (예: 수집한 답변 수)
 * @param z 신뢰수준의 z값. 기본값은 95%.
 */
export function wilsonInterval(k: number, n: number, z: number = Z_95): Interval {
  if (!Number.isFinite(k) || !Number.isFinite(n)) {
    throw new Error(`wilsonInterval: 유한한 수가 필요합니다 (k=${k}, n=${n})`)
  }
  if (k < 0 || n < 0) {
    throw new Error(`wilsonInterval: 음수를 받을 수 없습니다 (k=${k}, n=${n})`)
  }
  if (k > n) {
    throw new Error(`wilsonInterval: k(${k})가 n(${n})보다 클 수 없습니다`)
  }
  if (n === 0) {
    // 측정이 없으면 아무것도 모른다. 전 범위를 돌려준다.
    // (여기서 빠져나가지 않으면 아래 p = k/n 이 0/0 = NaN이 된다.)
    return { point: 0, lower: 0, upper: 1, n: 0, k: 0 }
  }

  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))

  // k=0이면 하한은 해석적으로 정확히 0이고, k=n이면 상한은 정확히 1이다
  // (center와 half가 같은 값이 되기 때문). 부동소수점에서는 1e-18 수준의
  // 찌꺼기가 남아 "0%"가 "0.0000000000000001%"로 표시될 수 있으므로
  // 그 두 경우만 정확한 값으로 못박는다.
  const lower = k === 0 ? 0 : clamp01(center - half)
  const upper = k === n ? 1 : clamp01(center + half)

  return { point: p, lower, upper, n, k }
}

/** 두 구간이 조금이라도 겹치는가. 경계가 맞닿으면 겹친 것으로 본다(보수적). */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.lower <= b.upper && b.lower <= a.upper
}

export type ChangeVerdict = 'up' | 'down' | 'unchanged' | 'incomparable'

export interface ChangeOptions {
  /** 이전 수집의 엔진 구성. 현재와 다르면 비교하지 않는다. */
  prevEngines?: readonly string[]
  /** 현재 수집의 엔진 구성 */
  currEngines?: readonly string[]
}

/**
 * 설계 ③의 변화 판정 규칙.
 *
 *   두 주의 신뢰구간이 겹치지 않을 때만 유의미한 변화로 표시한다.
 *   겹치면 "변화 없음(측정 범위 내)"으로 쓴다.
 *
 * 노이즈를 변화로 보고하는 순간 신뢰를 잃는다. 화살표를 아끼는 게 제품을 지킨다.
 * 엔진 구성이 다른 주끼리는 아예 비교하지 않는다 — 숫자가 떨어진 이유가 실제
 * 하락인지 엔진 누락인지 알 수 없기 때문이다.
 */
export function judgeChange(
  prev: Interval | null,
  curr: Interval,
  opts: ChangeOptions = {},
): ChangeVerdict {
  if (prev === null) return 'incomparable'
  if (prev.n === 0 || curr.n === 0) return 'incomparable'

  if (opts.prevEngines && opts.currEngines) {
    const a = [...opts.prevEngines].sort().join(',')
    const b = [...opts.currEngines].sort().join(',')
    if (a !== b) return 'incomparable'
  }

  if (intervalsOverlap(prev, curr)) return 'unchanged'
  return curr.point > prev.point ? 'up' : 'down'
}

/** 화면 표시용 포맷. 소수점 없이 정수 퍼센트. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatInterval(ci: Interval): string {
  return `${formatPercent(ci.lower)} ~ ${formatPercent(ci.upper)}`
}
