import { describe, expect, test, vi } from 'vitest'
import {
  MAX_ATTEMPTS_PER_WINDOW,
  RUNNING_STALE_MS,
  handleMeasure,
  selectDueBrand,
  type MeasureDeps,
} from './measure'

// KST 2026-08-03(월) 03:10 = UTC 2026-08-02 18:10
const NOW = new Date('2026-08-02T18:10:00Z')
const b = (id: string) => ({ id, name: `브랜드${id}` })
const run = (brandId: string, status: 'running' | 'succeeded' | 'partial' | 'failed', minAgo: number) => ({
  brandId,
  status,
  startedAt: new Date(NOW.getTime() - minAgo * 60 * 1000),
})

describe('selectDueBrand — 큐 없는 소진 방식', () => {
  test('오늘 회차가 없는 첫 브랜드를 고른다 (id 순 안정)', () => {
    expect(selectDueBrand([b('a'), b('b')], [], NOW)).toEqual({
      brandId: 'a', brandName: '브랜드a', attempt: 1,
    })
  })

  test('성공·부분 회차가 있으면 그 브랜드는 끝 — 다음 브랜드로', () => {
    expect(selectDueBrand([b('a'), b('b')], [run('a', 'succeeded', 5)], NOW)?.brandId).toBe('b')
    expect(selectDueBrand([b('a')], [run('a', 'partial', 5)], NOW)).toBeNull()
  })

  test('진행 중(15분 미만) 회차는 잠금 — 건너뛴다', () => {
    expect(selectDueBrand([b('a')], [run('a', 'running', 3)], NOW)).toBeNull()
  })

  test('실패 1회면 재시도 대상 (attempt=2)', () => {
    expect(selectDueBrand([b('a')], [run('a', 'failed', 20)], NOW)).toEqual({
      brandId: 'a', brandName: '브랜드a', attempt: 2,
    })
  })

  test('실패 2회면 이번 회차 건너뜀 — 공백 1회가 잘못된 데이터보다 낫다', () => {
    // 상한은 스펙 ③의 값이다(1회 재시도 후 건너뜀). 이 수를 올리면 실패한
    // 브랜드가 같은 회차에서 수집 비용을 계속 태운다 — 여기에 못 박는다.
    expect(MAX_ATTEMPTS_PER_WINDOW).toBe(2)
    const runs = [run('a', 'failed', 40), run('a', 'failed', 20)]
    expect(selectDueBrand([b('a')], runs, NOW)).toBeNull()
  })

  test('15분 넘은 running은 죽은 실행 — 실패로 세고 재시도를 허용한다', () => {
    const stale = run('a', 'running', RUNNING_STALE_MS / 60000 + 1)
    expect(selectDueBrand([b('a')], [stale], NOW)?.attempt).toBe(2)
  })
})

describe('handleMeasure', () => {
  const deps = (over: Partial<MeasureDeps>): MeasureDeps => ({
    secret: 's3cret',
    loadDueContext: async () => ({ brands: [b('a')], todaysRuns: [] }),
    measureBrand: async () => ({ runId: 'run1', status: 'succeeded' }),
    notifyFailure: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  })
  const req = (auth?: string) =>
    new Request('https://x/api/cron/measure', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    })

  test('시크릿 불일치 → 401, 아무 일도 하지 않는다', async () => {
    const loadDueContext = vi.fn()
    const res = await handleMeasure(req('Bearer wrong'), deps({ loadDueContext }))
    expect(res.status).toBe(401)
    expect(loadDueContext).not.toHaveBeenCalled()
  })

  test('due 브랜드가 없으면 measured: null', async () => {
    const d = deps({ loadDueContext: async () => ({ brands: [], todaysRuns: [] }) })
    const res = await handleMeasure(req('Bearer s3cret'), d)
    expect(await res.json()).toEqual({ ok: true, measured: null, remaining: 0 })
  })

  test('측정 성공 → measured에 브랜드 id', async () => {
    const res = await handleMeasure(req('Bearer s3cret'), deps({}))
    expect(await res.json()).toEqual({
      ok: true, measured: 'a', runId: 'run1', status: 'succeeded', remaining: 0,
    })
  })

  test('측정 실패 → notifyFailure(attempt 포함) 호출, 200 ok:false', async () => {
    const notifyFailure = vi.fn(async () => {})
    const d = deps({
      measureBrand: async () => { throw new Error('수집이 전부 실패했습니다') },
      notifyFailure,
    })
    const res = await handleMeasure(req('Bearer s3cret'), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, measured: 'a' })
    expect(notifyFailure).toHaveBeenCalledWith({
      brandId: 'a', brandName: '브랜드a', reason: '수집이 전부 실패했습니다', attempt: 1,
    })
  })
})
