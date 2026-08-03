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

/** 인라인 transform이 붙은 노드들의 값. 가리개와 판독 패널이 여기 잡힌다. */
function transforms(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[style]')]
    .map((el) => el.style.transform)
    .filter((t) => t !== '')
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
    expect(transforms(container).some((t) => t.includes('100%'))).toBe(false)
    const hidden = [...container.querySelectorAll<HTMLElement>('[style]')].some(
      (el) => el.style.opacity === '0',
    )
    expect(hidden).toBe(true)
  })

  it('JS가 없으면 답변이 그냥 보인다 — 프리렌더에는 덮는 상태가 없다', () => {
    // 가리개의 기본값이 "덮음"이면 JS가 죽은 브라우저에서 답변이 영영 가려진다.
    // 프리렌더 HTML을 직접 보고 그 계약을 잠근다.
    const html = renderToStaticMarkup(<ReplayScene />)
    expect(html).toContain('translate-x-full')
    expect(html).toContain('translate-y-full')
    expect(html).not.toContain('style="transform')
    expect(html).not.toContain('opacity:0')
  })

  it('reduced-motion이면 완성 상태로 선다 (가리개가 전부 비켜난다)', () => {
    motionState.reduce = true
    const { container } = render(<ReplayScene />)
    const moved = transforms(container)
    expect(moved).toContain('translateX(100%)')
    expect(moved).toContain('translateY(100%)')
    // 판독 패널은 불투명하게 정착한다 — 모션이 꺼진 환경에서 숫자가 사라지면
    // 콘텐츠가 사라지는 것과 같다(design-language §6).
    const opaque = [...container.querySelectorAll<HTMLElement>('[style]')].some(
      (el) => el.style.opacity === '1',
    )
    expect(opaque).toBe(true)
  })
})
