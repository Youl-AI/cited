'use server'

import { randomBytes } from 'node:crypto'
import { db, schema } from '@/lib/db'
import { kstWeekday } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { brandFormSchema } from '@/lib/onboarding/brand-schema'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

/**
 * 온보딩 서버 액션. 모든 액션이 `loadOnboardingGate()`로 시작한다 —
 * 세션·유료 게이트·소유 검증을 클라이언트에 맡기지 않는다.
 */

export type ActionResult<T> = { ok: true; value: T } | { ok: false; reason: string }

export async function createBrandAction(
  raw: unknown,
): Promise<ActionResult<{ brandId: string }>> {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.limits) {
    return { ok: false, reason: '활성 플랜이 없습니다. 운영자에게 문의해 주세요.' }
  }
  if (gate.brandCount >= gate.limits.maxBrands) {
    return {
      ok: false,
      reason: `플랜의 브랜드 한도(${gate.limits.maxBrands}개)를 다 썼습니다.`,
    }
  }
  const parsed = brandFormSchema(gate.limits.maxCompetitors).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' }
  }
  const v = parsed.data
  const brandId = `brd_${randomBytes(12).toString('base64url')}`
  await db.insert(schema.brands).values({
    id: brandId,
    userId: gate.user.id,
    name: v.name,
    category: v.category,
    region: v.region || null,
    selfDomains: v.selfDomains,
    // 별칭은 이번 단계에서 받지 않는다 — 측정이 회차마다 생성한다
    // (진단 경로 `audit-run.mts`와 동일. 편집 UI는 이후 단계).
    competitors: v.competitors.map((name) => ({ name, aliases: [] })),
    collectionWeekday: kstWeekday(new Date()),
  })
  logger.info('onboarding.brand_created', { brandId })
  return { ok: true, value: { brandId } }
}
