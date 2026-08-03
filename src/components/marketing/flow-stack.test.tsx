// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUDIT_FLOW } from '@/components/audit/flow'
import { ClosingCta } from './closing-cta'
import { FlowStack } from './flow-stack'

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

describe('신청하면 — 스티키 스택', () => {
  it('세 단계가 순서대로, 한 벌의 문구로 나온다', () => {
    const { container } = render(<FlowStack />)
    expect(container.querySelectorAll('.stack-card')).toHaveLength(AUDIT_FLOW.length)
    // 문구는 `components/audit/flow.tsx` 한 곳에서 온다. 여기 문자열을 다시
    // 적으면 폼 안의 압축판과 갈려서 "영업일 1일"이 한쪽에서만 사라진다.
    for (const step of AUDIT_FLOW) {
      expect(screen.getByRole('heading', { name: step.label })).toBeTruthy()
      expect(screen.getByText(step.body)).toBeTruthy()
    }
  })

  it('순서가 시맨틱에 있다 — 눈에 보이는 01/02/03만으로는 부족하다', () => {
    const { container } = render(<FlowStack />)
    expect(container.querySelector('ol')).not.toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(AUDIT_FLOW.length)
  })

  it('reduced-motion이어도 세 단계가 전부 읽힌다', () => {
    motionState.reduce = true
    render(<FlowStack />)
    for (const step of AUDIT_FLOW) {
      expect(screen.getByText(step.body)).toBeTruthy()
    }
  })
})

describe('마감 CTA', () => {
  it('주 CTA는 라벨도 목적지도 히어로와 같다 (한 의도에 한 라벨)', () => {
    render(<ClosingCta />)
    const cta = screen.getByRole('link', { name: '무료 진단 받기' })
    expect(cta.getAttribute('href')).toBe('#request')
  })

  it('마감에는 링크가 하나뿐이다 — 마지막 화면은 한 곳만 가리킨다', () => {
    render(<ClosingCta />)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('필요한 입력을 신청 순서와 같은 문구로 말한다', () => {
    render(<ClosingCta />)
    expect(screen.getByText(new RegExp(AUDIT_FLOW[0].short))).toBeTruthy()
  })
})
