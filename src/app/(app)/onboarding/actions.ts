'use server'

import { randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import {
  createCustomQueryGenerator,
  type CustomQueryGeneratorOptions,
} from '@/lib/audit/custom-queries'
import { generateAuditQueries } from '@/lib/audit/queries'
import {
  checkCustomQueries,
  normalizeQueryKey,
  type CustomQueryContext,
} from '@/lib/audit/query-rules'
import { db, schema } from '@/lib/db'
import type { Brand, QuerySource } from '@/lib/db/schema'
import { kstWeekday } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { brandFormSchema } from '@/lib/onboarding/brand-schema'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import {
  QUERY_GENERATION_LIMIT,
  refundGenerationCredit,
  takeGenerationCredit,
} from '@/lib/onboarding/generation'
import { loadEditorQuota } from '@/lib/onboarding/quota'

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
  // ★ 질의를 확정하지 않은 브랜드가 이미 있으면 새 브랜드를 만들지 않는다.
  //   `/onboarding`이 그 브랜드의 질의 단계로 리다이렉트하므로(page.tsx) 화면은
  //   이미 이 규칙대로 동작한다 — 액션이 더 헐거우면 뒤로가기·새로고침으로
  //   폼을 다시 제출한 고객이 **한도를 한 칸 잃은 유령 브랜드**를 남긴다.
  //   (완전한 원자성은 아니다: 두 요청이 동시에 여기를 통과할 수 있다.
  //    neon-http에는 트랜잭션이 없어 조건부 INSERT가 필요한데, 그 검증은
  //    라이브 DB 없이는 못 한다 — task-4-report.md의 "추가 B" 참고.)
  if (gate.pendingBrandId) {
    return {
      ok: false,
      reason: '먼저 등록한 브랜드의 질의를 확정해 주세요.',
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

async function ownEditableBrand(userId: string, brandId: string): Promise<Brand | null> {
  const brand = await db.query.brands.findFirst({
    // ★ `isActive`까지 건다(브리프에서 추가). brandId는 클라이언트가 주는 값이라
    //   해지한 브랜드로도 부를 수 있는데, `loadEditorQuota`는 비활성 브랜드의
    //   질의를 다른 브랜드 사용분에서 빼고 센다 — 비활성 브랜드에 질의를 동결하면
    //   그 질의는 한도 계산에서 사라졌다가 재활성 시 되살아나 한도를 넘긴다.
    where: and(
      eq(schema.brands.id, brandId),
      eq(schema.brands.userId, userId),
      eq(schema.brands.isActive, true),
    ),
  })
  return brand ?? null
}

/**
 * E2E 전용 가짜 생성기. `next dev`에서 `E2E_FAKE_QUERY_GENERATOR=1`일 때만
 * 켜진다 — 프로덕션 빌드에서는 절대 켜지지 않는다. **한도 차감은 이 분기보다
 * 앞에서 이미 끝난다** — 가짜 여부와 무관하게 남용 방어는 동작한다.
 */
function e2eFakeGenerator(): CustomQueryGeneratorOptions | undefined {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_FAKE_QUERY_GENERATOR !== '1') {
    return undefined
  }
  return {
    parse: async (prompt) => {
      const req = JSON.parse(prompt) as { count: number; region: string | null }
      const where = req.region ?? '요즘'
      return {
        queries: Array.from(
          { length: req.count },
          (_, i) => `${where} 초보한테 괜찮은 곳 ${i + 1}번째로 뭐가 있어?`,
        ),
      }
    },
  }
}

export async function generateQueriesAction(input: {
  brandId: string
  count: number
}): Promise<ActionResult<{ queries: string[]; used: number; limit: number }>> {
  const gate = await loadOnboardingGate()
  // ★ 유료 게이트 — AI 생성은 돈이 드는 기능이다 (회당 ~3원 + 남용 리스크).
  if (gate.state === 'no-plan' || !gate.subscription) {
    return { ok: false, reason: '활성 플랜이 없습니다.' }
  }
  const brand = await ownEditableBrand(gate.user.id, input.brandId)
  if (!brand) return { ok: false, reason: '브랜드를 찾을 수 없습니다.' }
  if (brand.queriesFrozenAt) {
    return {
      ok: false,
      reason: '이미 확정된 질의입니다. 수정이 필요하면 운영자에게 문의해 주세요.',
    }
  }
  const count = Math.min(Math.max(1, Math.floor(input.count)), 10)

  const credit = await takeGenerationCredit(brand.id, gate.user.id)
  if (!credit.ok) {
    return {
      ok: false,
      reason: `AI 생성은 브랜드당 ${QUERY_GENERATION_LIMIT}회까지입니다. 남은 질의는 직접 수정해 주세요.`,
    }
  }
  const generate = createCustomQueryGenerator(e2eFakeGenerator() ?? {})
  try {
    // 프롬프트에 브랜드명·경쟁사명을 넣지 않는 것은 생성기 자신의 규칙이다
    // (custom-queries.ts 주석) — 여기서는 재료만 넘긴다.
    const queries = await generate({
      brandName: brand.name,
      category: brand.category,
      ...(brand.region ? { region: brand.region } : {}),
      competitors: brand.competitors.map((c) => c.name),
      count,
    })
    return { ok: true, value: { queries, used: credit.used, limit: QUERY_GENERATION_LIMIT } }
  } catch (error) {
    await refundGenerationCredit(brand.id)
    logger.error('onboarding.generate_failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: '질의 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }
}

export async function freezeQueriesAction(input: {
  brandId: string
  queries: string[]
}): Promise<ActionResult<{ frozen: number }>> {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.subscription) {
    return { ok: false, reason: '활성 플랜이 없습니다.' }
  }
  const brand = await ownEditableBrand(gate.user.id, input.brandId)
  if (!brand) return { ok: false, reason: '브랜드를 찾을 수 없습니다.' }
  if (brand.queriesFrozenAt) return { ok: false, reason: '이미 확정된 질의입니다.' }

  const quota = await loadEditorQuota(gate.user.id, brand.id, gate.subscription)
  const ctx: CustomQueryContext = {
    brandName: brand.name,
    competitors: brand.competitors.map((c) => c.name),
    category: brand.category,
    ...(brand.region ? { region: brand.region } : {}),
    requiredCount: quota.quota,
  }
  // ★ 검증은 서버가 최종 책임진다 — 화면의 실시간 검증과 같은 함수, 같은 규칙.
  const verdict = checkCustomQueries(input.queries, ctx)
  if (!verdict.ok) return { ok: false, reason: verdict.reason }
  // 계정 전체 한도 재확인 (수집 시 validateRunStart가 한 번 더 검증한다).
  if (quota.queriesOnOtherBrands + verdict.queries.length > quota.maxQueries) {
    return {
      ok: false,
      reason: `계정 전체 질의 한도(${quota.maxQueries}개)를 넘습니다 — 다른 브랜드가 ${quota.queriesOnOtherBrands}개를 쓰고 있습니다.`,
    }
  }

  const templates = new Set(
    generateAuditQueries(brand.category, brand.name, brand.region ?? undefined).map(
      normalizeQueryKey,
    ),
  )
  // 동결 전 임시 상태가 남아 있을 수 있으므로 브랜드의 질의를 전부 갈아끼운다.
  // (neon-http는 트랜잭션이 없다 — 부분 실패 시 아래 동결 UPDATE가 실행되지
  //  않으므로 브랜드는 미동결로 남고, 재시도가 다시 갈아끼운다.)
  await db.delete(schema.queries).where(eq(schema.queries.brandId, brand.id))
  await db.insert(schema.queries).values(
    verdict.queries.map((text) => ({
      id: `qry_${randomBytes(12).toString('base64url')}`,
      brandId: brand.id,
      text,
      source: (templates.has(normalizeQueryKey(text)) ? 'generated' : 'custom') as QuerySource,
    })),
  )
  const frozen = await db
    .update(schema.brands)
    .set({
      queriesFrozenAt: new Date(),
      queryQuota: verdict.queries.length,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.brands.id, brand.id), isNull(schema.brands.queriesFrozenAt)))
    .returning({ id: schema.brands.id })
  if (frozen.length === 0) return { ok: false, reason: '이미 확정된 질의입니다.' }

  logger.info('onboarding.queries_frozen', { brandId: brand.id, count: verdict.queries.length })
  return { ok: true, value: { frozen: verdict.queries.length } }
}
