// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEASURED, SPECIMEN } from './actuals'
import { ReplayScene } from './replay-scene'

/**
 * jsdom에는 레이아웃이 없어 핀·스크럽 자체는 검증할 수 없다(리프 테스트와 같은
 * 이유). 여기서 잠그는 것은 **콘텐츠 계약**이다: 실측 원문이 그대로 실리는가,
 * 모션이 꺼진 환경에서 장면이 완성 상태로 서는가, 스크롤 전에는 시작 상태인가.
 */

// `gsap.registerPlugin(ScrollTrigger)`가 모듈 평가 시점에 matchMedia를 부른다 —
// 자세한 근거는 `components/motion/pin-scene.test.tsx` 머리말.
vi.hoisted(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }))
  vi.stubGlobal('scrollTo', () => {})
})

const motionState = vi.hoisted(() => ({ reduce: false }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => motionState.reduce }
})

beforeEach(() => {
  motionState.reduce = false
})
afterEach(cleanup)

/**
 * 두 가리개의 인라인 `translate` 값.
 *
 * ★ `transform`이 아니라 `translate`를 본다. Tailwind v4의 `translate-x-full`이
 *   `translate` 프로퍼티로 컴파일되기 때문이고, 두 프로퍼티는 서로를 덮지 않고
 *   합성된다 — 인라인을 transform으로 쓰면 클래스의 100%가 그대로 남아 가리개가
 *   **한 번도 가리지 못한다**(실브라우저에서 잡힌 버그). 이 헬퍼가 그 회귀를 막는다.
 *
 * ★ `[aria-hidden]`으로 좁힌다. ScrollTrigger가 핀하면서 `<section>`에도
 *   `translate: none`과 `transform`을 직접 박기 때문에, 트리 전체를 훑으면
 *   GSAP이 관리하는 노드까지 딸려 들어와 단언이 흔들린다.
 */
function coverTranslates(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-hidden][style]')]
    .map((el) => el.style.translate)
    .filter((t) => t !== '' && t !== 'none')
}

describe('실측 재현 — 핀 스크럽 스크롤텔링', () => {
  it('실측 질의와 답변 원문을 그대로 싣는다', () => {
    const { container } = render(<ReplayScene />)
    expect(screen.getByText(SPECIMEN.query)).toBeTruthy()
    const quote = container.querySelector('blockquote')
    expect(quote?.textContent).toContain('좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.')
    // 표식 규칙은 히어로·리포트와 같은 것을 쓴다.
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      '무신사1',
      '29CM',
      '무탠다드1',
    ])
  })

  it('언급률은 점추정과 구간을 함께 정착시킨다', () => {
    render(<ReplayScene />)
    expect(screen.getByText('83%')).toBeTruthy()
    expect(screen.getByText('44% ~ 97%')).toBeTruthy()
    expect(MEASURED.cited.k).toBe(5)
  })

  it('파이프라인 단계 이름을 쓴다 (지어낸 "Step 1" 라벨이 아니다)', () => {
    const { container } = render(<ReplayScene />)
    const steps = [...container.querySelectorAll('ol > li')].map((el) => el.textContent)
    expect(steps).toEqual(['질의', '답변', '언급 판정', '언급률'])
  })

  it('스크롤 전에는 시작 상태다 — 가리개가 덮고 판독은 비어 있다', () => {
    const { container } = render(<ReplayScene />)
    // 진행률이 정하는 것은 "무엇이 보이는가"다. 마운트만으로 장면을 끝난
    // 상태로 그리면 스크롤이 되감을 것이 남지 않는다.
    const moved = coverTranslates(container)
    // 가리개 둘 다 인라인 값을 받았고(= 클래스의 100%를 실제로 되돌렸고),
    // 아직 어느 쪽도 비켜나지 않았다. GSAP이 refresh 때 0에 아주 가까운 값을
    // 한 번 흘리므로 정확히 "0%"를 단언하지 않는다.
    expect(moved).toHaveLength(2)
    expect(moved.some((t) => t.includes('100%'))).toBe(false)
    const hidden = [...container.querySelectorAll<HTMLElement>('[style]')].some(
      (el) => el.style.opacity === '0',
    )
    expect(hidden).toBe(true)
  })

  it('가리개는 transform이 아니라 translate로 움직인다 (합성 함정 회귀)', () => {
    // `translate-x-full`은 `translate` 프로퍼티다. 인라인을 transform으로 쓰면
    // 둘이 합성되어 가리개가 화면 밖에 붙박이가 된다.
    const { container } = render(<ReplayScene />)
    const withTransform = [...container.querySelectorAll<HTMLElement>('[aria-hidden][style]')]
      .filter((el) => el.style.transform !== '')
    expect(withTransform).toHaveLength(0)
  })

  it('JS가 없으면 답변이 그냥 보인다 — 프리렌더에는 덮는 상태가 없다', () => {
    // 가리개의 기본값이 "덮음"이면 JS가 죽은 브라우저에서 답변이 영영 가려진다.
    // 프리렌더 HTML을 직접 보고 그 계약을 잠근다.
    const html = renderToStaticMarkup(<ReplayScene />)
    expect(html).toContain('translate-x-full')
    expect(html).toContain('translate-y-full')
    expect(html).not.toContain('style="translate')
    expect(html).not.toContain('style="transform')
    expect(html).not.toContain('opacity:0')
  })

  it('reduced-motion이면 완성 상태로 선다 (가리개가 전부 비켜난다)', () => {
    motionState.reduce = true
    const { container } = render(<ReplayScene />)
    const moved = coverTranslates(container)
    expect(moved).toContain('100% 0')
    expect(moved).toContain('0 100%')
    // 판독 패널은 불투명하게 정착한다 — 모션이 꺼진 환경에서 숫자가 사라지면
    // 콘텐츠가 사라지는 것과 같다(design-language §6).
    const opaque = [...container.querySelectorAll<HTMLElement>('[style]')].some(
      (el) => el.style.opacity === '1',
    )
    expect(opaque).toBe(true)
  })
})
