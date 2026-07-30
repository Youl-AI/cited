import { describe, expect, it } from 'vitest'
import {
  comparableEngines,
  completenessRatio,
  failedEngines,
  isDegraded,
  summarizeCompleteness,
} from '@/lib/collection/completeness'

describe('summarizeCompleteness', () => {
  it('엔진별 시도/성공을 센다', () => {
    const c = summarizeCompleteness([
      { engineId: 'chatgpt', ok: true },
      { engineId: 'chatgpt', ok: true },
      { engineId: 'chatgpt', ok: false },
      { engineId: 'naver', ok: false },
    ])
    expect(c.chatgpt).toEqual({ attempted: 3, succeeded: 2 })
    expect(c.naver).toEqual({ attempted: 1, succeeded: 0 })
  })

  it('설계 문서의 예시를 재현한다', () => {
    const outcomes = [
      ...Array.from({ length: 90 }, () => ({ engineId: 'chatgpt' as const, ok: true })),
      ...Array.from({ length: 88 }, () => ({ engineId: 'gemini' as const, ok: true })),
      ...Array.from({ length: 2 }, () => ({ engineId: 'gemini' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'naver' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'google_aio' as const, ok: true })),
    ]
    const c = summarizeCompleteness(outcomes)
    expect(c.naver).toEqual({ attempted: 60, succeeded: 0 })
    expect(c.gemini).toEqual({ attempted: 90, succeeded: 88 })
  })

  it('시도하지 않은 엔진은 키 자체가 없다', () => {
    // ★ `{ attempted: 0, succeeded: 0 }`으로 채우면 "돌렸는데 다 실패"와
    //   "아예 안 돌렸다"가 같은 모양이 된다. 앞은 장애고 뒤는 플랜 설정이다.
    const c = summarizeCompleteness([{ engineId: 'chatgpt', ok: true }])
    expect(c.naver).toBeUndefined()
    expect(Object.keys(c)).toEqual(['chatgpt'])
  })

  it('결과가 없으면 빈 객체', () => {
    expect(summarizeCompleteness([])).toEqual({})
  })

  it('입력을 변형하지 않는다', () => {
    const outcomes = [{ engineId: 'chatgpt' as const, ok: true }]
    const before = JSON.stringify(outcomes)
    summarizeCompleteness(outcomes)
    expect(JSON.stringify(outcomes)).toBe(before)
  })
})

describe('completenessRatio · isDegraded', () => {
  it('전체 성공률을 계산한다', () => {
    const c = { chatgpt: { attempted: 10, succeeded: 10 }, naver: { attempted: 10, succeeded: 0 } }
    expect(completenessRatio(c)).toBeCloseTo(0.5, 6)
  })

  it('엔진별 평균이 아니라 전체 시도 기준이다', () => {
    // ★ 엔진별 비율을 평균하면 시도 수가 적은 엔진이 과대 대표된다.
    //   naver 1회 실패가 chatgpt 100회 성공과 같은 무게를 갖게 된다.
    const c = { chatgpt: { attempted: 100, succeeded: 100 }, naver: { attempted: 1, succeeded: 0 } }
    expect(completenessRatio(c)).toBeCloseTo(100 / 101, 6)
  })

  it('90% 미만이면 배지를 붙인다', () => {
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 8 } })).toBe(true)
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 10 } })).toBe(false)
    expect(isDegraded({ chatgpt: { attempted: 10, succeeded: 9 } })).toBe(false)
  })

  it('시도가 0이면 완전한 것으로 본다 (0으로 나누지 않는다)', () => {
    expect(completenessRatio({})).toBe(1)
    expect(isDegraded({})).toBe(false)
  })
})

describe('comparableEngines', () => {
  it('성공이 1건이라도 있는 엔진만 비교 대상이다', () => {
    const c = {
      chatgpt: { attempted: 10, succeeded: 10 },
      naver: { attempted: 10, succeeded: 0 },
    }
    expect(comparableEngines(c)).toEqual(['chatgpt'])
  })

  it('정렬된 결과를 돌려준다 (비교 시 순서 무관하게)', () => {
    const c = {
      naver: { attempted: 1, succeeded: 1 },
      chatgpt: { attempted: 1, succeeded: 1 },
    }
    expect(comparableEngines(c)).toEqual(['chatgpt', 'naver'])
  })

  it('아무것도 성공하지 않으면 빈 배열', () => {
    expect(comparableEngines({ naver: { attempted: 5, succeeded: 0 } })).toEqual([])
  })
})

describe('failedEngines', () => {
  it('통째로 실패한 엔진만 고른다', () => {
    const c = {
      chatgpt: { attempted: 10, succeeded: 10 },
      gemini: { attempted: 10, succeeded: 8 },
      naver: { attempted: 10, succeeded: 0 },
    }
    // gemini는 부분 실패다 — 배지 문구에 "네이버 장애"라고만 써야 한다.
    expect(failedEngines(c)).toEqual(['naver'])
  })

  it('시도하지 않은 엔진은 실패가 아니다', () => {
    // ★ 무료 플랜은 naver를 아예 안 돌린다. 그것을 "네이버 실패"로 표시하면
    //   장애가 없는데 장애 배지가 붙는다.
    expect(failedEngines({ naver: { attempted: 0, succeeded: 0 } })).toEqual([])
    expect(failedEngines({})).toEqual([])
  })

  it('정렬된 결과를 돌려준다', () => {
    const c = {
      naver: { attempted: 1, succeeded: 0 },
      google_aio: { attempted: 1, succeeded: 0 },
    }
    expect(failedEngines(c)).toEqual(['google_aio', 'naver'])
  })
})

describe('네이버 장애 시나리오 (설계 ⑤)', () => {
  it('네이버만 죽으면 배지 조건을 만족하고 비교 대상에서 빠진다', () => {
    const outcomes = [
      ...Array.from({ length: 90 }, () => ({ engineId: 'chatgpt' as const, ok: true })),
      ...Array.from({ length: 90 }, () => ({ engineId: 'gemini' as const, ok: true })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'naver' as const, ok: false })),
      ...Array.from({ length: 60 }, () => ({ engineId: 'google_aio' as const, ok: true })),
    ]
    const c = summarizeCompleteness(outcomes)
    expect(isDegraded(c)).toBe(true)
    // 변화 판정은 네이버를 뺀 3개 엔진 기준으로만 가능하다
    expect(comparableEngines(c)).toEqual(['chatgpt', 'gemini', 'google_aio'])
    expect(failedEngines(c)).toEqual(['naver'])
  })
})
