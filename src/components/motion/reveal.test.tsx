// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from './reveal'

// jsdom 29에는 IntersectionObserver가 없고, Motion 12의 `whileInView`는 폴백
// 없이 바로 `new IntersectionObserver(...)`를 부른다(framer-motion
// motion/features/viewport/observers.ts). 스텁이 없으면 렌더 자체가 던진다.
// 관측은 하지 않는다 — 여기서 잠그는 것은 "리빌이 걸려도 자식은 DOM에 있다"이지
// 교차 판정이 아니다(실동작은 브라우저 게이트 몫).
class InertIntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', InertIntersectionObserver)

// `useReducedMotion`은 모듈 싱글턴을 첫 호출 때 한 번만 초기화하므로 matchMedia를
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

describe('Reveal — Motion whileInView 리빌', () => {
  it('자식을 렌더하고 viewport-once 리빌 래퍼를 단다', () => {
    render(<Reveal index={2}>내용</Reveal>)
    expect(screen.getByText('내용')).toBeTruthy()
  })
  it('index 스태거 지연이 60ms 단위다 (계약: delay = index * 0.06s)', async () => {
    // 컴포넌트가 export하는 REVEAL_STAGGER_S 상수로 단언 (매직넘버 방지)
    const { REVEAL_STAGGER_S } = await import('./reveal')
    expect(REVEAL_STAGGER_S).toBeCloseTo(0.06)
  })

  it('모션이 켜져 있으면 초기 상태(투명)를 인라인으로 건다', () => {
    const { container } = render(<Reveal>움직임</Reveal>)
    expect(container.querySelector<HTMLElement>('div')?.style.opacity).toBe('0')
  })

  it('reduced-motion이면 initial을 걸지 않는다 — 첫 프레임부터 최종 상태', () => {
    motionState.reduce = true
    const { container } = render(<Reveal>정지</Reveal>)
    // 초기 상태가 남으면 모션이 죽은 환경에서 콘텐츠가 영영 안 보인다
    // (design-language §6). 인쇄 매체도 같은 이유.
    expect(container.querySelector<HTMLElement>('div')?.style.opacity).toBe('')
    expect(screen.getByText('정지')).toBeTruthy()
  })

  it('className을 그대로 전달한다', () => {
    const { container } = render(<Reveal className="mt-8">칸</Reveal>)
    expect(container.querySelector('div')?.className).toBe('mt-8')
  })
})
