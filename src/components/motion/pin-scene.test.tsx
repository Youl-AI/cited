// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PIN_SCENE_LENGTH, PinScene } from './pin-scene'

/**
 * **렌더 스모크만 한다.** jsdom에는 레이아웃이 없어서(모든 rect가 0) ScrollTrigger의
 * 핀·스크럽 동작을 검증하는 건 무의미하다 — 실동작은 브라우저 게이트 몫이다.
 * 여기서 잠그는 것은 둘뿐이다: 자식이 DOM에 남는가, reduced-motion 분기가 계약대로
 * `onProgress(1)` 한 번인가.
 */

// 이 jsdom 빌드에는 matchMedia·IntersectionObserver·ResizeObserver가 전부 없다
// (실측). `gsap.registerPlugin(ScrollTrigger)`는 **모듈 평가 시점에**
// `window.matchMedia`를 부르므로(gsap-core MatchMedia.add → ScrollTrigger.enable)
// import보다 먼저 세워야 한다 — 그래서 `vi.hoisted`다. 브라우저에는 항상 있는
// API라 컴포넌트 쪽에서 가드할 일은 아니다.
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
  // ScrollTrigger는 refresh 때 스크롤 위치를 복원하려고 window.scrollTo를
  // 부른다. jsdom의 구현은 "Not implemented" 를 가상 콘솔로 뱉을 뿐이라
  // 테스트가 깨지진 않지만, 출력이 시끄러워 진짜 경고를 덮는다.
  vi.stubGlobal('scrollTo', () => {})
})

// `useReducedMotion`은 모듈 싱글턴(`prefersReducedMotion.current`)을 첫 호출 때
// 한 번만 초기화한다(motion-dom render/utils/reduced-motion). 그래서 matchMedia를
// 갈아 끼워도 파일 안에서 분기를 되돌릴 수 없다. 훅 자체를 대체한다.
const motionState = vi.hoisted(() => ({ reduce: false }))
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  return { ...actual, useReducedMotion: () => motionState.reduce }
})

beforeEach(() => {
  motionState.reduce = false
})
afterEach(cleanup)

describe('PinScene — 진행률 스크럽 핀 섹션', () => {
  it('자식을 렌더한다', () => {
    render(<PinScene>장면</PinScene>)
    expect(screen.getByText('장면')).toBeTruthy()
  })

  it('reduced-motion이면 핀 없이 완성 상태를 1회 알린다 (0이 아니라 1)', () => {
    motionState.reduce = true
    const onProgress = vi.fn()
    render(<PinScene onProgress={onProgress}>장면</PinScene>)
    expect(screen.getByText('장면')).toBeTruthy()
    expect(onProgress.mock.calls).toEqual([[1]])
  })

  it('reduced-motion이 아니면 마운트만으로 완성 상태를 단정하지 않는다', () => {
    const onProgress = vi.fn()
    render(<PinScene onProgress={onProgress}>장면</PinScene>)
    // 진행률은 스크롤이 정한다. 마운트 시점에 1을 흘리면 호출부가 스크롤도
    // 하기 전에 장면을 끝난 상태로 그린다.
    expect(onProgress).not.toHaveBeenCalledWith(1)
  })

  it('기본 스크럽 길이가 1500px다', () => {
    expect(PIN_SCENE_LENGTH).toBe(1500)
  })
})
