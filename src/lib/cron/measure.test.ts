import { afterEach, describe, expect, test, vi } from 'vitest'
import { logger } from '@/lib/logger'
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

  test('정확히 15분 된 running은 이미 죽은 실행이다 (경계는 >=)', () => {
    // ★ 경계를 `>`로 두면 딱 15분에 걸린 회차가 "진행 중"도 "실패"도 아닌
    //   상태가 되어, 그 브랜드가 잠기지도 재시도되지도 않는 틈이 생긴다.
    //   inFlight는 `<`(false), 실패 집계는 `>=`(true)로 갈라져야 한다.
    const exact = run('a', 'running', RUNNING_STALE_MS / 60000)
    expect(selectDueBrand([b('a')], [exact], NOW)?.attempt).toBe(2)
  })

  test('KST 어제의 회차는 오늘 판정에서 빠진다', () => {
    // NOW는 KST 08-03(월) 03:10이다. KST 08-02 23:50의 성공 회차는 어제 몫이라
    // 오늘의 due를 막으면 안 된다 — 막으면 새벽 측정이 통째로 하루 밀린다.
    // (todaysRuns는 SQL이 이미 걸러 주지만, 여기서도 걸러야 경계가 한 곳이 아니다.)
    const yesterday = run('a', 'succeeded', 200) // KST 08-02 23:50
    expect(yesterday.startedAt.toISOString()).toBe('2026-08-02T14:50:00.000Z')
    expect(selectDueBrand([b('a')], [yesterday], NOW)).toEqual({
      brandId: 'a',
      brandName: '브랜드a',
      attempt: 1,
    })
  })

  test('잠긴 브랜드는 건너뛰고 다음 브랜드로 간다 — 큐가 막히지 않는다', () => {
    // ★ 여기서 멈추면(continue가 아니라 return null) 진행 중인 브랜드 하나가
    //   뒤 브랜드 전부의 그 날 측정을 막는다.
    expect(selectDueBrand([b('a'), b('b')], [run('a', 'running', 3)], NOW)).toEqual({
      brandId: 'b',
      brandName: '브랜드b',
      attempt: 1,
    })
  })

  test('시도를 다 쓴 브랜드도 건너뛰고 다음 브랜드로 간다', () => {
    // ★ 같은 이유. 한도 초과로 매번 실패하는 브랜드 하나가 나머지 고객의
    //   측정을 하루 통째로 막는 것이 이 프로젝트에서 실제로 겪은 위험이다.
    const runs = [run('a', 'failed', 40), run('a', 'failed', 20)]
    expect(selectDueBrand([b('a'), b('b')], runs, NOW)).toEqual({
      brandId: 'b',
      brandName: '브랜드b',
      attempt: 1,
    })
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
  const req = (auth?: string, search = '') =>
    new Request(`https://x/api/cron/measure${search}`, {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    })

  test('시크릿 불일치 → 401, 아무 일도 하지 않는다', async () => {
    const loadDueContext = vi.fn()
    const res = await handleMeasure(req('Bearer wrong'), deps({ loadDueContext }))
    expect(res.status).toBe(401)
    expect(loadDueContext).not.toHaveBeenCalled()
  })

  test('authorization 헤더가 아예 없으면 → 401', async () => {
    // ★ 헤더 없음은 "틀린 시크릿"과 다른 경로다(startsWith 이전에 걸린다).
    //   여기가 열리면 공개 URL에 아무나 POST해 유료 측정을 일으킬 수 있다.
    const loadDueContext = vi.fn()
    const res = await handleMeasure(req(), deps({ loadDueContext }))
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
    // remaining이 실려야 Task 7 워크플로가 실패 후에도 소진을 이어갈지 안다.
    expect(await res.json()).toEqual({ ok: false, measured: 'a', remaining: 0 })
    expect(notifyFailure).toHaveBeenCalledWith({
      brandId: 'a', brandName: '브랜드a', reason: '수집이 전부 실패했습니다', attempt: 1,
    })
  })

  test('실패해도 남은 due 브랜드 수를 알려준다', async () => {
    const d = deps({
      loadDueContext: async () => ({ brands: [b('a'), b('b')], todaysRuns: [] }),
      measureBrand: async () => {
        throw new Error('boom')
      },
    })
    const res = await handleMeasure(req('Bearer s3cret'), d)
    expect(await res.json()).toEqual({ ok: false, measured: 'a', remaining: 1 })
  })

  // ★ 월·수·금 게이트. NOW는 KST 월요일이라 위 테스트들이 게이트를 통과한다.
  describe('월·수·금 게이트', () => {
    // KST 2026-08-04(화) 03:10 = UTC 2026-08-03 18:10
    const TUESDAY = new Date('2026-08-03T18:10:00Z')

    test('측정 요일이 아니면 아무것도 재지 않는다', async () => {
      // ★ due 판정은 KST 하루 단위라, 화요일 측정이 수요일 회차를 억제하지
      //   못한다 — 순수하게 더해지는 비용이다. 컨텍스트조차 읽지 않는다.
      const loadDueContext = vi.fn()
      const measureBrand = vi.fn()
      const res = await handleMeasure(
        req('Bearer s3cret'),
        deps({ now: () => TUESDAY, loadDueContext, measureBrand }),
      )
      expect(await res.json()).toEqual({
        ok: true,
        measured: null,
        remaining: 0,
        skipped: 'off_schedule',
      })
      expect(loadDueContext).not.toHaveBeenCalled()
      expect(measureBrand).not.toHaveBeenCalled()
    })

    test('측정 요일이면 그대로 잰다', async () => {
      // KST 2026-08-05(수) 03:10
      const wednesday = new Date('2026-08-04T18:10:00Z')
      const res = await handleMeasure(req('Bearer s3cret'), deps({ now: () => wednesday }))
      expect(await res.json()).toMatchObject({ ok: true, measured: 'a' })
    })

    test('?force=1이면 요일 게이트를 넘긴다 — 운영자 수동 실행', async () => {
      const res = await handleMeasure(
        req('Bearer s3cret', '?force=1'),
        deps({ now: () => TUESDAY }),
      )
      expect(await res.json()).toMatchObject({ ok: true, measured: 'a' })
    })

    describe('강제 실행은 로그에 흔적을 남긴다', () => {
      afterEach(() => {
        vi.restoreAllMocks()
      })

      test('비측정일을 force로 넘으면 forced: true로 남는다', async () => {
        // ★ 이 로그가 없으면 화요일의 수동 실행이 월·수·금 정규 회차와 로그상
        //   똑같이 보인다. 그 회차는 회당 약 2,400원의 실지출이라, "왜 이 요일에
        //   회차가 있나"를 되짚을 수 있어야 한다.
        const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
        await handleMeasure(req('Bearer s3cret', '?force=1'), deps({ now: () => TUESDAY }))
        expect(info).toHaveBeenCalledWith('cron.measure.off_schedule', {
          weekday: 2,
          forced: true,
        })
      })

      test('측정일의 force는 off_schedule을 남기지 않는다 — 게이트를 넘은 적이 없다', async () => {
        // 월요일(NOW)은 정규 측정일이다. 여기서도 남기면 "게이트를 넘었다"는
        // 신호가 의미를 잃는다.
        const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
        await handleMeasure(req('Bearer s3cret', '?force=1'), deps({}))
        expect(info).not.toHaveBeenCalledWith('cron.measure.off_schedule', expect.anything())
      })

      test('막힌 비측정일은 forced 필드 없이 남는다', async () => {
        const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
        await handleMeasure(req('Bearer s3cret'), deps({ now: () => TUESDAY }))
        expect(info).toHaveBeenCalledWith('cron.measure.off_schedule', { weekday: 2 })
      })
    })

    test('force=1이어도 인증이 먼저다', async () => {
      const res = await handleMeasure(req('Bearer wrong', '?force=1'), deps({ now: () => TUESDAY }))
      expect(res.status).toBe(401)
    })
  })

  test('선택한 시계를 loadDueContext에 그대로 넘긴다', async () => {
    // ★ 어댑터가 스스로 new Date()를 잡으면 SQL의 KST 하루 경계가 주입된
    //   시계와 갈라진다 — 자정 근처에서 "오늘"이 두 개가 된다.
    const loadDueContext = vi.fn(async () => ({ brands: [], todaysRuns: [] }))
    await handleMeasure(req('Bearer s3cret'), deps({ loadDueContext }))
    expect(loadDueContext).toHaveBeenCalledWith(NOW)
  })
})
