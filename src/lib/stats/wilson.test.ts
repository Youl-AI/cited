import { describe, expect, it } from 'vitest'
import {
  formatInterval,
  formatPercent,
  intervalsOverlap,
  judgeChange,
  wilsonInterval,
  Z_95,
} from '@/lib/stats/wilson'

describe('wilsonInterval — 설계 ⑤가 지정한 경계값', () => {
  it('n=90, k=0 → 0% ~ 4.1% (0%가 아니다)', () => {
    const ci = wilsonInterval(0, 90)
    expect(ci.point).toBe(0)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBeCloseTo(0.040936, 5)
    // Wald였다면 upper도 0이 되어 "확실히 0%"라는 거짓말이 된다
    expect(ci.upper).toBeGreaterThan(0)
  })

  it('n=90, k=90 → 95.9% ~ 100%', () => {
    const ci = wilsonInterval(90, 90)
    expect(ci.point).toBe(1)
    expect(ci.lower).toBeCloseTo(0.959064, 5)
    expect(ci.upper).toBe(1)
  })

  it('n=1 → 구간이 거의 전 범위', () => {
    const ci = wilsonInterval(0, 1)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBeGreaterThan(0.7)
    expect(ci.upper).toBeCloseTo(0.793451, 5)
  })

  it('n=1, k=1 → n=0,k=1의 거울상', () => {
    const ci = wilsonInterval(1, 1)
    expect(ci.point).toBe(1)
    expect(ci.lower).toBeCloseTo(0.206549, 5)
    expect(ci.upper).toBe(1)
  })

  it('n=300, k=102 → 34% 근처, 구간이 좁다', () => {
    const ci = wilsonInterval(102, 300)
    expect(ci.point).toBeCloseTo(0.34, 4)
    expect(ci.lower).toBeCloseTo(0.288720, 5)
    expect(ci.upper).toBeCloseTo(0.395326, 5)
    expect(ci.upper - ci.lower).toBeLessThan(0.12)
  })

  it('무료 진단 표본(n=6)에서도 정상 동작한다', () => {
    // 3/6 = 50%이지만 표본이 6개뿐이면 구간이 19%~81%로 벌어진다.
    // 이 폭이 "무료 진단은 참고용"이라는 제품 문구의 근거다.
    const ci = wilsonInterval(3, 6)
    expect(ci.point).toBeCloseTo(0.5, 10)
    expect(ci.lower).toBeCloseTo(0.187616, 5)
    expect(ci.upper).toBeCloseTo(0.812384, 5)
  })

  it('n=2, k=1 → 알려진 참조값 [0.0945, 0.9055]', () => {
    const ci = wilsonInterval(1, 2)
    expect(ci.lower).toBeCloseTo(0.094531, 5)
    expect(ci.upper).toBeCloseTo(0.905469, 5)
  })

  it('매우 큰 n에서 0회 관측이면 상한이 아주 작아진다', () => {
    // 90회에 0번과 10,000회에 0번은 전혀 다른 정보다. Wald는 둘 다 0%±0%로
    // 뭉갠다. Wilson은 4.1% vs 0.038%로 구분한다.
    const few = wilsonInterval(0, 90)
    const many = wilsonInterval(0, 10_000)
    expect(many.upper).toBeCloseTo(0.000384, 6)
    expect(many.upper).toBeGreaterThan(0)
    expect(many.upper).toBeLessThan(few.upper / 100)
  })

  it('n이 커질수록 구간이 좁아진다', () => {
    const small = wilsonInterval(5, 10)
    const large = wilsonInterval(500, 1000)
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower)
  })

  it('구간은 항상 [0,1] 안에 있고 point를 포함한다', () => {
    for (const [k, n] of [
      [0, 1],
      [1, 1],
      [0, 3],
      [3, 3],
      [1, 2],
      [7, 1000],
      [1, 6],
      [999, 1000],
    ] as const) {
      const ci = wilsonInterval(k, n)
      expect(ci.lower).toBeGreaterThanOrEqual(0)
      expect(ci.upper).toBeLessThanOrEqual(1)
      expect(ci.lower).toBeLessThanOrEqual(ci.upper)
      // 표본비율은 반드시 구간 안에 있어야 한다
      expect(ci.point).toBeGreaterThanOrEqual(ci.lower)
      expect(ci.point).toBeLessThanOrEqual(ci.upper)
    }
  })

  it('k와 n-k는 서로 거울상이다 (lower ↔ 1-upper)', () => {
    for (const [k, n] of [
      [1, 10],
      [3, 7],
      [102, 300],
      [0, 90],
    ] as const) {
      const a = wilsonInterval(k, n)
      const b = wilsonInterval(n - k, n)
      expect(a.lower).toBeCloseTo(1 - b.upper, 12)
      expect(a.upper).toBeCloseTo(1 - b.lower, 12)
    }
  })

  it('경계는 Wilson을 정의하는 방정식 (p̂-x)² = z²x(1-x)/n 을 만족한다', () => {
    // 구현 공식을 그대로 베끼지 않는 독립 검증이다. Wilson 구간의 두 끝은
    // "|p̂ - x| = z·√(x(1-x)/n)" 의 두 근이다. 이 항등식이 성립하지 않으면
    // 계수 하나가 어긋난 것이다 (z²/4n² 항 누락이 대표적).
    for (const [k, n] of [
      [102, 300],
      [3, 6],
      [1, 2],
      [30, 100],
      [7, 1000],
    ] as const) {
      const ci = wilsonInterval(k, n)
      const p = k / n
      for (const x of [ci.lower, ci.upper]) {
        const lhs = (p - x) ** 2
        const rhs = (Z_95 * Z_95 * x * (1 - x)) / n
        expect(lhs).toBeCloseTo(rhs, 12)
      }
    }
  })

  it('z를 키우면 구간이 넓어진다', () => {
    const ci90 = wilsonInterval(102, 300, 1.6448536269514722)
    const ci95 = wilsonInterval(102, 300)
    expect(ci90.upper - ci90.lower).toBeLessThan(ci95.upper - ci95.lower)
    expect(ci90.lower).toBeGreaterThan(ci95.lower)
    expect(ci90.upper).toBeLessThan(ci95.upper)
  })

  it('n, k를 그대로 되돌려준다', () => {
    const ci = wilsonInterval(17, 42)
    expect(ci.n).toBe(42)
    expect(ci.k).toBe(17)
    expect(ci.point).toBeCloseTo(17 / 42, 12)
  })

  it('n=0이면 전 범위를 돌려준다 (측정 없음, 0으로 나누지 않는다)', () => {
    const ci = wilsonInterval(0, 0)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBe(1)
    expect(ci.point).toBe(0)
    expect(ci.n).toBe(0)
    // 0/0 = NaN이 새어 나오지 않는지 확인한다
    expect(Number.isNaN(ci.point)).toBe(false)
    expect(Number.isNaN(ci.lower)).toBe(false)
    expect(Number.isNaN(ci.upper)).toBe(false)
  })

  it('k > n 이면 던진다', () => {
    expect(() => wilsonInterval(5, 3)).toThrowError(/k.*n/)
  })

  it('음수 입력을 거부한다', () => {
    expect(() => wilsonInterval(-1, 10)).toThrowError()
    expect(() => wilsonInterval(1, -10)).toThrowError()
  })

  it('NaN·Infinity를 거부한다', () => {
    expect(() => wilsonInterval(Number.NaN, 10)).toThrowError()
    expect(() => wilsonInterval(1, Number.NaN)).toThrowError()
    expect(() => wilsonInterval(1, Number.POSITIVE_INFINITY)).toThrowError()
  })

  it('Z_95는 표준정규 양측 95% 임계값이다', () => {
    // 정규 CDF를 erf 근사 없이 확인하기는 어려우므로, 널리 인용되는 1.96과
    // 일치하는지 그리고 소수 12자리까지 고정되어 있는지만 못박는다.
    expect(Z_95).toBeCloseTo(1.96, 4)
    expect(Z_95).toBeCloseTo(1.959963984540054, 12)
  })
})

describe('intervalsOverlap', () => {
  it('겹치면 true', () => {
    expect(intervalsOverlap(wilsonInterval(30, 100), wilsonInterval(35, 100))).toBe(true)
  })

  it('완전히 떨어져 있으면 false', () => {
    expect(intervalsOverlap(wilsonInterval(10, 300), wilsonInterval(200, 300))).toBe(false)
  })

  it('경계가 정확히 맞닿으면 겹친 것으로 본다 (보수적)', () => {
    const a = { point: 0.1, lower: 0.0, upper: 0.2, n: 10, k: 1 }
    const b = { point: 0.3, lower: 0.2, upper: 0.4, n: 10, k: 3 }
    expect(intervalsOverlap(a, b)).toBe(true)
  })

  it('순서를 바꿔도 결과가 같다', () => {
    const a = wilsonInterval(10, 300)
    const b = wilsonInterval(200, 300)
    const c = wilsonInterval(30, 100)
    expect(intervalsOverlap(b, a)).toBe(false)
    expect(intervalsOverlap(c, a)).toBe(intervalsOverlap(a, c))
  })

  it('한쪽이 다른 쪽을 완전히 포함해도 겹친 것이다', () => {
    const wide = wilsonInterval(3, 6)
    const narrow = wilsonInterval(150, 300)
    expect(intervalsOverlap(wide, narrow)).toBe(true)
    expect(intervalsOverlap(narrow, wide)).toBe(true)
  })
})

describe('judgeChange — 설계 ③ 화살표 규칙', () => {
  it('구간이 겹치면 변화 없음 (노이즈를 변화로 보고하지 않는다)', () => {
    expect(judgeChange(wilsonInterval(30, 100), wilsonInterval(36, 100))).toBe('unchanged')
  })

  it('구간이 겹치지 않고 올랐으면 up', () => {
    expect(judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300))).toBe('up')
  })

  it('구간이 겹치지 않고 내렸으면 down', () => {
    expect(judgeChange(wilsonInterval(150, 300), wilsonInterval(20, 300))).toBe('down')
  })

  it('n=6짜리 표본은 50%p가 움직여도 변화로 부르지 않는다', () => {
    // 무료 진단(n=6)에서 1/6 → 4/6은 눈에는 큰 변화지만 구간이 겹친다.
    expect(judgeChange(wilsonInterval(1, 6), wilsonInterval(4, 6))).toBe('unchanged')
  })

  it('엔진 구성이 다르면 비교하지 않는다', () => {
    const verdict = judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300), {
      prevEngines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
      currEngines: ['chatgpt', 'gemini', 'google_aio'],
    })
    expect(verdict).toBe('incomparable')
  })

  it('엔진 구성이 순서만 다르면 비교 가능하다', () => {
    const verdict = judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300), {
      prevEngines: ['gemini', 'chatgpt'],
      currEngines: ['chatgpt', 'gemini'],
    })
    expect(verdict).toBe('up')
  })

  it('한쪽 엔진 목록만 주면 구성 비교를 건너뛴다', () => {
    expect(
      judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300), {
        currEngines: ['chatgpt'],
      }),
    ).toBe('up')
  })

  it('비교할 지난주가 없으면 incomparable (첫날 대시보드)', () => {
    expect(judgeChange(null, wilsonInterval(100, 300))).toBe('incomparable')
  })

  it('측정이 0회인 주는 비교하지 않는다', () => {
    expect(judgeChange(wilsonInterval(0, 0), wilsonInterval(100, 300))).toBe('incomparable')
    expect(judgeChange(wilsonInterval(100, 300), wilsonInterval(0, 0))).toBe('incomparable')
  })

  it('같은 값이면 unchanged', () => {
    expect(judgeChange(wilsonInterval(100, 300), wilsonInterval(100, 300))).toBe('unchanged')
  })

  it('0%에서 명확히 오르면 up으로 잡힌다', () => {
    // 0/300 [0, 0.0126] vs 60/300 [0.158, 0.248] — 겹치지 않는다
    expect(judgeChange(wilsonInterval(0, 300), wilsonInterval(60, 300))).toBe('up')
  })
})

describe('표시용 포맷', () => {
  it('formatPercent는 정수 퍼센트로 반올림한다', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0.34)).toBe('34%')
    expect(formatPercent(0.045)).toBe('5%')
    expect(formatPercent(0.0409)).toBe('4%')
  })

  it('formatInterval은 하한 ~ 상한으로 쓴다', () => {
    expect(formatInterval(wilsonInterval(0, 90))).toBe('0% ~ 4%')
    expect(formatInterval(wilsonInterval(102, 300))).toBe('29% ~ 40%')
  })
})
