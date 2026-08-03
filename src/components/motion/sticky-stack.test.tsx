// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StickyStack } from './sticky-stack'

/**
 * **렌더 스모크만 한다** — 이유는 `pin-scene.test.tsx` 머리말과 같다.
 * jsdom에는 레이아웃이 없어 핀·스택 동작을 검증할 수 없다.
 */

// jsdom에 없는 matchMedia. `gsap.registerPlugin(ScrollTrigger)`가 모듈 평가
// 시점에 부르므로 import보다 먼저 세운다 — 자세한 근거는 `pin-scene.test.tsx`.
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

const cards = [<p key="a">첫째</p>, <p key="b">둘째</p>, <p key="c">셋째</p>]

describe('StickyStack — 스티키 스택', () => {
  it('카드를 전부 렌더한다', () => {
    const { container } = render(<StickyStack cards={cards} />)
    expect(screen.getByText('첫째')).toBeTruthy()
    expect(screen.getByText('셋째')).toBeTruthy()
    expect(container.querySelectorAll('.stack-card')).toHaveLength(3)
  })

  it('reduced-motion이어도 카드가 전부 읽힌다 (모션만 꺼진다)', () => {
    motionState.reduce = true
    const { container } = render(<StickyStack cards={cards} />)
    expect(screen.getByText('둘째')).toBeTruthy()
    expect(container.querySelectorAll('.stack-card')).toHaveLength(3)
    // 모션이 꺼진 환경에서 요소가 투명하게 남으면 안 된다(design-language §6).
    for (const el of container.querySelectorAll<HTMLElement>('.stack-card')) {
      expect(el.style.opacity).toBe('')
    }
  })

  it('모션이 켜진 채로 언마운트해도 던지지 않는다', () => {
    // PinScene과 같은 계열의 위험(핀 → pin-spacer 재부모화 → React의
    // removeChild 실패)이다. 여기서는 핀 대상이 `.stack-card`이고 이들이 이미
    // ref div의 자식이라 안전하지만, 구조가 바뀌면 이 테스트가 잡는다.
    const { unmount } = render(<StickyStack cards={cards} />)
    expect(() => unmount()).not.toThrow()
  })

  it('빈 배열이어도 던지지 않는다', () => {
    const { container } = render(<StickyStack cards={[]} />)
    expect(container.querySelectorAll('.stack-card')).toHaveLength(0)
  })
})
