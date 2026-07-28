import { describe, expect, it } from 'vitest'
import {
  PLANS,
  QUERY_PACK_PRICE_KRW,
  QUERY_PACK_SIZE,
  expectedCallsPerRun,
  expectedSerpCallsPerMonth,
  monthlyPriceKrw,
  resolveLimits,
} from '@/lib/plans'

describe('constants', () => {
  it('QUERY_PACK_SIZE는 10이다', () => {
    expect(QUERY_PACK_SIZE).toBe(10)
  })

  it('QUERY_PACK_PRICE_KRW는 90,000원이다', () => {
    expect(QUERY_PACK_PRICE_KRW).toBe(90_000)
  })
})

describe('PLANS', () => {
  describe('가격', () => {
    it('무료 진단은 0원이다', () => {
      expect(PLANS.free.priceKrw).toBe(0)
    })

    it('Starter는 99,000원이다', () => {
      expect(PLANS.starter.priceKrw).toBe(99_000)
    })

    it('Business는 290,000원이다', () => {
      expect(PLANS.business.priceKrw).toBe(290_000)
    })
  })

  describe('Free 플랜 필드', () => {
    it('maxBrands는 1이다', () => {
      expect(PLANS.free.maxBrands).toBe(1)
    })

    it('maxCompetitors는 3이다', () => {
      expect(PLANS.free.maxCompetitors).toBe(3)
    })

    it('samples.llm은 1이다', () => {
      expect(PLANS.free.samples.llm).toBe(1)
    })

    it('samples.serp은 0이다', () => {
      expect(PLANS.free.samples.serp).toBe(0)
    })

    it('historyMonths는 0이다', () => {
      expect(PLANS.free.historyMonths).toBe(0)
    })

    it('csvExport는 false다', () => {
      expect(PLANS.free.csvExport).toBe(false)
    })
  })

  describe('Starter 플랜 필드', () => {
    it('maxBrands는 1이다', () => {
      expect(PLANS.starter.maxBrands).toBe(1)
    })

    it('maxCompetitors는 3이다', () => {
      expect(PLANS.starter.maxCompetitors).toBe(3)
    })

    it('samples.llm은 3이다', () => {
      expect(PLANS.starter.samples.llm).toBe(3)
    })

    it('samples.serp은 2다', () => {
      expect(PLANS.starter.samples.serp).toBe(2)
    })

    it('historyMonths는 3이다', () => {
      expect(PLANS.starter.historyMonths).toBe(3)
    })
  })

  describe('Business 플랜 필드', () => {
    it('maxBrands는 3이다', () => {
      expect(PLANS.business.maxBrands).toBe(3)
    })

    it('maxCompetitors는 10이다', () => {
      expect(PLANS.business.maxCompetitors).toBe(10)
    })

    it('samples.llm은 3이다', () => {
      expect(PLANS.business.samples.llm).toBe(3)
    })

    it('samples.serp은 2다', () => {
      expect(PLANS.business.samples.serp).toBe(2)
    })

    it('historyMonths는 null이다', () => {
      expect(PLANS.business.historyMonths).toBeNull()
    })

    it('csvExport는 true다', () => {
      expect(PLANS.business.csvExport).toBe(true)
    })
  })

  describe('플랜 간 관계 (기존 테스트)', () => {
    it('무료 진단은 LLM 2종만 쓰고 SERP 샘플이 0이다', () => {
      expect(PLANS.free.engines).toEqual(['chatgpt', 'gemini'])
      expect(PLANS.free.samples.serp).toBe(0)
      expect(PLANS.free.maxQueries).toBe(3)
    })

    it('Starter에 네이버가 포함된다 (요금 구조의 핵심 결정)', () => {
      expect(PLANS.starter.engines).toContain('naver')
      expect(PLANS.starter.engines).toContain('google_aio')
    })

    it('Starter와 Business의 차이는 규모뿐이다', () => {
      expect(PLANS.starter.engines).toEqual(PLANS.business.engines)
      expect(PLANS.starter.samples).toEqual(PLANS.business.samples)
      expect(PLANS.business.maxBrands).toBeGreaterThan(PLANS.starter.maxBrands)
    })

    it('Business만 무제한 히스토리와 CSV를 가진다', () => {
      expect(PLANS.business.historyMonths).toBeNull()
      expect(PLANS.business.csvExport).toBe(true)
      expect(PLANS.starter.csvExport).toBe(false)
    })
  })
})

describe('resolveLimits', () => {
  it('질의 팩이 없으면 플랜 기본 한도', () => {
    expect(resolveLimits('starter', 0).maxQueries).toBe(10)
  })

  it('질의 팩 1개당 10질의가 더해진다', () => {
    expect(resolveLimits('business', 1).maxQueries).toBe(40)
    expect(resolveLimits('business', 3).maxQueries).toBe(60)
  })

  it('음수 팩은 0으로 취급한다', () => {
    expect(resolveLimits('starter', -5).maxQueries).toBe(10)
  })

  it('브랜드·경쟁사 한도는 팩과 무관하다', () => {
    const limits = resolveLimits('business', 5)
    expect(limits.maxBrands).toBe(3)
    expect(limits.maxCompetitors).toBe(10)
  })
})

describe('expectedCallsPerRun', () => {
  it('Starter 10질의 = 주 100회 (2 LLM x 3 + 2 SERP x 2 = 10/질의)', () => {
    expect(expectedCallsPerRun('starter', 10)).toBe(100)
  })

  it('Business 30질의 = 주 300회', () => {
    expect(expectedCallsPerRun('business', 30)).toBe(300)
  })

  it('무료 진단 3질의 = 6회 (2 LLM x 1샘플)', () => {
    expect(expectedCallsPerRun('free', 3)).toBe(6)
  })
})

describe('expectedSerpCallsPerMonth', () => {
  it('Starter 10질의 = 172건/월 (10 x 2엔진 x 2샘플 x 4.3주)', () => {
    expect(expectedSerpCallsPerMonth('starter', 10)).toBe(172)
  })

  it('Business 30질의 = 516건/월', () => {
    expect(expectedSerpCallsPerMonth('business', 30)).toBe(516)
  })

  it('무료 진단은 SERP를 쓰지 않으므로 0', () => {
    expect(expectedSerpCallsPerMonth('free', 3)).toBe(0)
  })

  it('소수 queryCount는 반올림된다', () => {
    // 11 x 2엔진 x 2샘플 x 4.3주 = 189.2 → 189
    expect(expectedSerpCallsPerMonth('starter', 11)).toBe(189)
  })
})

describe('monthlyPriceKrw', () => {
  it('팩 0개일 때는 기본 플랜 가격만 청구된다', () => {
    expect(monthlyPriceKrw('starter', 0)).toBe(99_000)
    expect(monthlyPriceKrw('business', 0)).toBe(290_000)
  })

  it('팩이 추가되면 개수만큼 가격이 더해진다', () => {
    expect(monthlyPriceKrw('starter', 1)).toBe(99_000 + 90_000)
    expect(monthlyPriceKrw('business', 2)).toBe(290_000 + 180_000)
  })

  it('음수 팩은 0으로 취급한다', () => {
    expect(monthlyPriceKrw('starter', -5)).toBe(99_000)
  })

  it('NaN 팩은 0으로 취급한다', () => {
    expect(monthlyPriceKrw('starter', NaN)).toBe(99_000)
  })

  it('Infinity 팩은 0으로 취급한다', () => {
    expect(monthlyPriceKrw('business', Infinity)).toBe(290_000)
  })
})
