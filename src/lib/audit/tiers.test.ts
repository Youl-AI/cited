import { describe, expect, it } from 'vitest'
import { AUDIT_TIERS, PAID_TIERS, isPaidTier } from '@/lib/audit/tiers'
import { AUDIT_QUERY_COUNT } from '@/lib/audit/queries'
import { PLANS } from '@/lib/plans'

describe('AUDIT_TIERS', () => {
  it('free는 기존 무료 진단과 정확히 같다 — 바꾸면 무료 상품이 조용히 바뀐다', () => {
    expect(AUDIT_TIERS.free.queryCount).toBe(AUDIT_QUERY_COUNT)
    expect(AUDIT_TIERS.free.samplesPerEngine).toBe(PLANS.free.samples.llm)
  })

  it('유료 3티어는 전부 10질의 × 3회다 (크몽 상품 약속)', () => {
    for (const tier of PAID_TIERS) {
      expect(AUDIT_TIERS[tier].queryCount, tier).toBe(10)
      expect(AUDIT_TIERS[tier].samplesPerEngine, tier).toBe(3)
    }
  })

  it('유료 판별이 정확하다', () => {
    expect(isPaidTier('free')).toBe(false)
    expect(isPaidTier('standard')).toBe(true)
    expect(isPaidTier('deluxe')).toBe(true)
    expect(isPaidTier('premium')).toBe(true)
  })

  it('티어마다 사람이 읽는 라벨이 있다 (CLI·리포트 표기용)', () => {
    for (const cfg of Object.values(AUDIT_TIERS)) {
      expect(cfg.label.length).toBeGreaterThan(0)
    }
  })
})
