// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { RunPoint } from '@/lib/dashboard/data'
import { wilsonInterval } from '@/lib/stats/wilson'
import { TrendChart } from './trend-chart'

// `globals: true`가 아니므로 RTL이 자동 정리를 걸지 못한다. 명시적으로 건다 —
// 안 걸면 이전 테스트의 DOM이 남아 `getByText`가 중복으로 던진다.
afterEach(cleanup)

function point(
  runId: string,
  k: number,
  overrides: Partial<Omit<RunPoint, 'result'>> = {},
  n = 60,
): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt', 'gemini'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: n, citedRate: wilsonInterval(k, n), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [],
    byEngine: { chatgpt: wilsonInterval(Math.min(k, n / 2), n / 2), gemini: wilsonInterval(Math.min(k, n / 2), n / 2) },
    byQuery: [], sources: [],
    sourceSummary: { totalAnswers: n, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId,
    measuredAt: result.measuredAt,
    engines: result.engines,
    competitors: [],
    queryIds: ['q1'],
    detectorVersion: 1,
    skippedBefore: 0,
    result,
    ...overrides,
  }
}

describe('TrendChart', () => {
  test('빈 상태는 방향을 준다', () => {
    render(<TrendChart points={[]} />)
    expect(screen.getByText(/첫 측정이 끝나면/)).toBeInTheDocument()
  })

  test('점과 오차 밴드를 함께 그린다 — 밴드 없는 점은 없다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="trend-band"]')).not.toBeNull()
  })

  // ★ 끊는 규칙의 반대 방향 — 조건이 같은 멀쩡한 선을 괜히 끊으면 "매주 재고
  //   있다"는 참인 사실이 화면에서 사라진다. 과잉 끊김(모든 세그먼트 분리)도
  //   과소 끊김만큼 거짓이다. (브리프 Step 3의 테스트 그대로.)
  test('조건이 같으면 선을 잇는다 — 멀쩡한 선을 괜히 끊지 않는다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(1)
    expect(screen.queryByText(/비교하지 않습니다/)).toBeNull()
  })

  test('엔진 토글이 있고 계측값 요약이 aria로 노출된다', () => {
    render(<TrendChart points={[point('r1', 20)]} />)
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT' }))
    expect(screen.getByRole('img')).toHaveAccessibleName(/ChatGPT/)
  })

  test('구간은 ± 가 아니라 밴드로 그린다 — 점 하나여도 세로 띠가 있다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20)]} />)
    expect(container.querySelectorAll('[data-testid="trend-band"]')).toHaveLength(1)
  })

  test('조건이 바뀐 구간은 선·밴드를 끊고 이유를 쓴다', () => {
    const { container } = render(
      <TrendChart points={[point('r1', 20), point('r2', 25, { queryIds: ['q1', 'q2'] })]} />,
    )
    // 점 2개가 각각 단독 세그먼트다 — 이어붙인 선이 없고, 밴드는 세로 띠 2개로 갈라진다.
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="trend-band"]')).toHaveLength(2)
    expect(screen.getByText(/측정 조건.*바뀐/)).toBeInTheDocument()
  })

  test('빠진 회차가 있는 구간도 잇지 않고 이유를 쓴다', () => {
    const { container } = render(
      <TrendChart points={[point('r1', 20), point('r2', 25, { skippedBefore: 1 })]} />,
    )
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0)
    expect(screen.getByText(/측정이 없던/)).toBeInTheDocument()
  })

  test('n=0 회차는 0% 점으로 그리지 않는다 — 측정 없음이지 0%가 아니다', () => {
    const { container } = render(
      <TrendChart points={[point('r1', 20), point('r2', 0, {}, 0), point('r3', 25)]} />,
    )
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(2)
  })

  /**
   * ★ 툴팁은 **`<title>`의 승격**이지 새 정보가 아니다. 둘이 갈라지면 마우스로
   *   본 값과 스크린리더로 읽은 값이 달라진다 — 여기서 같은 문자열임을 못박는다.
   *   (`<title>`은 보조기기용으로 그대로 남아야 하므로 그것도 함께 확인한다.)
   */
  test('점을 짚으면 <title>과 같은 세 항목을 툴팁으로 올린다 — <title>은 그대로 남는다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent)
    expect(titles).toHaveLength(2)

    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeNull()
    const hits = container.querySelectorAll('[data-testid="trend-hit"]')
    expect(hits).toHaveLength(2)
    fireEvent.mouseOver(hits[1]!)

    const tip = container.querySelector('[data-testid="trend-tooltip"]')
    expect(tip).not.toBeNull()
    // 툴팁이 담은 문자열이 그 점의 <title>과 같은 세 항목인지 — 날짜 · 점추정
    // (구간) · k/n. 공백·구분자만 다르므로 항목별로 확인한다.
    const title = titles[1]!
    for (const part of title.split(' · ')) {
      expect(tip!.textContent).toContain(part.replace(/^\((.*)\)$/, '$1'))
    }
    // 보조기기에는 <title>이 이미 읽어 준다 — 툴팁이 또 읽히면 중복이다.
    expect(tip).toHaveAttribute('aria-hidden', 'true')
  })

  test('크로스헤어는 짚은 회차에만 서고, 차트를 벗어나면 툴팁이 사라진다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelector('[data-testid="trend-crosshair"]')).toBeNull()

    fireEvent.mouseOver(container.querySelectorAll('[data-testid="trend-hit"]')[0]!)
    expect(container.querySelectorAll('[data-testid="trend-crosshair"]')).toHaveLength(1)

    fireEvent.mouseLeave(container.querySelector('svg')!)
    expect(container.querySelector('[data-testid="trend-crosshair"]')).toBeNull()
    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeNull()
  })

  /**
   * ★ 엔진을 갈아타면 계열 길이가 달라진다. 짚어 둔 인덱스를 그대로 들고 있으면
   *   **다른 회차의 값**을 짚은 채로 남거나 범위를 벗어난다 — 어느 쪽이든 화면이
   *   거짓을 말한다.
   */
  test('엔진을 갈아타면 짚어 둔 회차를 놓는다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    fireEvent.mouseOver(container.querySelectorAll('[data-testid="trend-hit"]')[1]!)
    expect(container.querySelector('[data-testid="trend-tooltip"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT' }))
    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeNull()
  })

  /**
   * ★ 드로우인은 **연결선에만** 붙는다 (design-language §6: 오차 밴드는 점보다
   *   먼저 또는 같이 나타난다 — 점을 먼저 보여 주고 밴드를 나중에 붙이는 연출은
   *   "확정값처럼 보였다가 흐려지는" 인상을 준다).
   */
  test('드로우인은 연결선에만 걸린다 — 밴드·점은 첫 프레임부터 제자리다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelector('[data-testid="trend-line"]')).toHaveClass('chart-draw')
    // SVG 요소의 `className`은 문자열이 아니라 SVGAnimatedString이다 —
    // 속성으로 직접 읽는다.
    for (const el of container.querySelectorAll('[data-testid="trend-band"]')) {
      expect(el.getAttribute('class') ?? '').not.toContain('chart-draw')
    }
    for (const el of container.querySelectorAll('[data-testid="trend-point"]')) {
      expect(el.getAttribute('class') ?? '').not.toContain('chart-draw')
    }
  })
})

/**
 * 엔진 비교 — 엔진별 선을 한 축에 겹쳐 그린다.
 *
 * ★ 이 모드가 지켜야 하는 것은 **밴드를 그리지 않는 것**이다. 반투명 신뢰구간
 *   띠 둘이 겹치면 겹친 자리의 농도가 세 번째 값처럼 읽힌다 — 없는 값이다.
 *   구간이 필요하면 엔진 하나를 고르는 경로가 그대로 남아 있다.
 */
describe('TrendChart — 엔진 비교', () => {
  test('엔진이 둘 이상이면 비교 조각이 생긴다', () => {
    render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(screen.getByRole('button', { name: /엔진 비교/ })).toBeInTheDocument()
  })

  test('엔진이 하나뿐이면 비교 조각을 만들지 않는다 — 전체와 같은 화면이다', () => {
    const single = point('r1', 20)
    single.result.byEngine = { chatgpt: single.result.byEngine.chatgpt! }
    render(<TrendChart points={[single]} />)
    expect(screen.queryByRole('button', { name: /엔진 비교/ })).toBeNull()
  })

  test('비교 모드는 밴드를 그리지 않는다 — 겹친 반투명은 없는 값을 만든다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelector('[data-testid="trend-band"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /엔진 비교/ }))
    expect(container.querySelector('[data-testid="trend-band"]')).toBeNull()
    // 대신 계열마다 선이 하나씩 — 엔진 2개니까 선도 2개다.
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(2)
    expect(screen.getByText(/신뢰구간을 그리지 않습니다/)).toBeInTheDocument()
  })

  // 계열 정체는 트레이 조각의 색점 + 이름과 툴팁 글자가 진다. 값(최신 %)은
  // 어디에도 상시 표시하지 않는다 — 오른쪽 헤드라인 카드의 엔진별 목록이 이미
  // 그 값을 들고 있어, 차트 쪽 상시 표기는 같은 숫자의 세 번째 사본이었다
  // (사용자 피드백 — 과한 정보). 끝 라벨도 겹치므로 이 모드에선 없다.
  test('비교 모드는 값을 상시 표기하지 않는다 — 조각·끝 라벨 모두', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    fireEvent.click(screen.getByRole('button', { name: /엔진 비교/ }))
    expect(screen.getByRole('button', { name: /ChatGPT/ }).textContent).not.toMatch(/%/)
    expect(container.querySelector('[data-testid="trend-end-label"]')).toBeNull()
  })

  // 활성 조각의 흰 판은 색 전환이 아니라 layoutId로 미끄러지는 별도 요소다 —
  // 판이 항상 정확히 하나(활성 조각 안)여야 한다. 둘이면 미끄러질 목적지가
  // 모호해지고, 영이면 활성 표시가 사라진다.
  test('활성 조각에만 슬라이드 판이 있다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    const thumbIn = (name: RegExp) =>
      screen.getByRole('button', { name }).querySelector('[data-testid="mode-thumb"]')

    expect(container.querySelectorAll('[data-testid="mode-thumb"]')).toHaveLength(1)
    expect(thumbIn(/전체/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /엔진 비교/ }))
    expect(container.querySelectorAll('[data-testid="mode-thumb"]')).toHaveLength(1)
    expect(thumbIn(/엔진 비교/)).not.toBeNull()
    expect(thumbIn(/전체/)).toBeNull()
  })

  test('짚은 회차의 엔진별 값을 한 툴팁에 모은다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    fireEvent.click(screen.getByRole('button', { name: /엔진 비교/ }))
    fireEvent.mouseOver(container.querySelectorAll('[data-testid="trend-hit"]')[1]!)

    const tip = container.querySelector('[data-testid="trend-tooltip"]')
    expect(tip).not.toBeNull()
    expect(tip!.textContent).toContain('ChatGPT')
    expect(tip!.textContent).toContain('Gemini')
    expect(tip).toHaveAttribute('aria-hidden', 'true')
  })
})
