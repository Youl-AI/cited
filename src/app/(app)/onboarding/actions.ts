'use server'

import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
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
import { claimQueryFreeze, releaseQueryFreeze } from '@/lib/onboarding/freeze'
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
    // ★ 원인을 구분해서 말한다. 예전에는 실패 하나를 전부 "5회까지입니다"로
    //   번역해서, 한 번도 생성한 적 없는 고객이 "크레딧 소진" 안내를 받았다
    //   (generation.ts `CreditFailure` 주석).
    return {
      ok: false,
      reason:
        credit.reason === 'limit'
          ? `AI 생성은 브랜드당 ${QUERY_GENERATION_LIMIT}회까지입니다. 남은 질의는 직접 수정해 주세요.`
          : '브랜드를 찾을 수 없거나 이미 질의가 확정됐습니다. 새로고침 후 다시 시도해 주세요.',
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
    // ★ 환불 자체가 던질 수 있다(DB 순단). 그걸 밖으로 흘리면 Next의 일반
    //   오류 화면이 뜨면서 아래 친절한 안내가 사라지고, 환불도 못 한 채
    //   원인이 로그에 남지 않는다 — 두 손실이 겹친다. 삼켜서 기록만 한다.
    try {
      await refundGenerationCredit(brand.id, gate.user.id)
    } catch (refundError) {
      logger.error('onboarding.generate_refund_failed', {
        brandId: brand.id,
        reason: refundError instanceof Error ? refundError.name : 'unknown',
      })
    }
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
  const templateTexts = generateAuditQueries(brand.category, brand.name, brand.region ?? undefined)
  // ★ **quota는 상한이지 "정확히 이만큼"이 아니다.**
  //   예전에는 `requiredCount: quota.quota`를 그대로 넘겨 정확히 그 개수를
  //   요구했다. 그러면 Business(30) 고객이 첫 브랜드에 30개를 다 쓴 순간
  //   두 번째 브랜드의 quota가 0이 되어 **어떤 입력으로도 동결이 불가능**해지고,
  //   `needs-queries`가 영구히 남아 `/dashboard`·`/onboarding`이 둘 다 질의
  //   단계로 리다이렉트한다 — 이미 측정 중인 첫 브랜드의 대시보드까지 잠긴다.
  //   플랜 설명("Business는 브랜드에 나눠 쓴다", plans.ts)이 말하는 것도
  //   "나눠 쓴다"이지 "한 브랜드가 다 쓴다"가 아니다.
  //
  //   빈 칸은 여기서 걸러 낸다. 에디터가 quota만큼 빈 문자열로 패딩하므로
  //   (editor.ts `buildInitialQueries`) 그대로 넘기면 "비어 있는 질의가 있습니다"로
  //   막힌다 — 화면이 아니라 여기가 최종 책임이다.
  const cleaned = input.queries.map((q) => q.trim()).filter((q) => q.length > 0)
  // 하한은 템플릿 수다 — `validateCustomQueries`가 템플릿 전부 포함을 요구하므로
  // 그보다 적을 수 있는 방법이 없다(상품 약속: 무료 샘플과 같은 질문 3개).
  const minCount = templateTexts.length
  if (quota.quota < minCount) {
    // ★ 이 경우 진짜 이유는 개수가 아니다. "템플릿이 빠졌습니다"로 번역되면
    //   고객은 영영 엉뚱한 곳을 고친다.
    return {
      ok: false,
      reason: `계정 전체 질의 한도(${quota.maxQueries}개)가 남지 않았습니다 — 다른 브랜드가 ${quota.queriesOnOtherBrands}개를 쓰고 있습니다. 다른 브랜드의 질의를 줄이거나 질의 팩을 추가해 주세요.`,
    }
  }
  if (cleaned.length < minCount || cleaned.length > quota.quota) {
    return {
      ok: false,
      reason: `질의는 ${minCount}개 이상 ${quota.quota}개 이하여야 합니다 (지금 ${cleaned.length}개). 계정 한도 ${quota.maxQueries}개 중 다른 브랜드가 ${quota.queriesOnOtherBrands}개를 쓰고 있습니다.`,
    }
  }
  const ctx: CustomQueryContext = {
    brandName: brand.name,
    competitors: brand.competitors.map((c) => c.name),
    category: brand.category,
    ...(brand.region ? { region: brand.region } : {}),
    // 범위 검사는 위에서 끝났다. 여기서는 "제출한 개수 그대로"를 넘겨 나머지
    // 규칙(중복·브랜드명·템플릿 포함)만 `validateCustomQueries`에 맡긴다 —
    // 검증 로직을 여기서 다시 구현하지 않는다.
    requiredCount: cleaned.length,
  }
  // ★ 검증은 서버가 최종 책임진다 — 화면의 실시간 검증과 같은 함수, 같은 규칙.
  const verdict = checkCustomQueries(cleaned, ctx)
  if (!verdict.ok) return { ok: false, reason: verdict.reason }
  // ★ 계정 전체 한도 재확인. quota가 상한이 된 지금 이 검사는 **살아 있는 방어**다
  //   (개수를 quota로 고정하던 시절에는 도달할 수 없는 죽은 코드였다).
  //   `loadEditorQuota` 조회와 여기 사이에 다른 브랜드가 동결되면 합계가 한도를
  //   넘을 수 있다 — 그 창은 아직 열려 있다(리포트 "리뷰 수정" 참고).
  if (quota.queriesOnOtherBrands + verdict.queries.length > quota.maxQueries) {
    return {
      ok: false,
      reason: `계정 전체 질의 한도(${quota.maxQueries}개)를 넘습니다 — 다른 브랜드가 ${quota.queriesOnOtherBrands}개를 쓰고 있습니다.`,
    }
  }

  const templates = new Set(templateTexts.map(normalizeQueryKey))
  // ★ **동결 자리를 먼저 잡는다.** 질의를 먼저 갈아끼우면 동시 제출 두 건 중
  //   진 쪽이 이긴 쪽의 동결 질의를 지운 뒤 "이미 확정됐습니다"를 돌려준다 —
  //   화면은 실패인데 DB는 이미 바뀐 상태다 (freeze.ts `claimQueryFreeze` 주석).
  const frozenAt = new Date()
  const claimed = await claimQueryFreeze({
    brandId: brand.id,
    userId: gate.user.id,
    frozenAt,
    queryQuota: verdict.queries.length,
  })
  if (!claimed) return { ok: false, reason: '이미 확정된 질의입니다.' }

  try {
    // 동결 전 임시 상태가 남아 있을 수 있으므로 브랜드의 질의를 전부 갈아끼운다.
    await db.delete(schema.queries).where(eq(schema.queries.brandId, brand.id))
    await db.insert(schema.queries).values(
      verdict.queries.map((text) => ({
        id: `qry_${randomBytes(12).toString('base64url')}`,
        brandId: brand.id,
        text,
        source: (templates.has(normalizeQueryKey(text)) ? 'generated' : 'custom') as QuerySource,
      })),
    )
  } catch (error) {
    // neon-http에는 트랜잭션이 없다 — 선점을 손으로 되돌린다. 되돌리기까지
    // 실패하면 브랜드는 "동결됐는데 질의가 없는" 상태로 남으므로 반드시 남긴다
    // (cron이 이 브랜드를 고르게 된다 — 운영자 개입이 필요한 유일한 경우다).
    try {
      await releaseQueryFreeze({ brandId: brand.id, userId: gate.user.id, frozenAt })
    } catch (releaseError) {
      logger.error('onboarding.freeze_release_failed', {
        brandId: brand.id,
        reason: releaseError instanceof Error ? releaseError.name : 'unknown',
      })
    }
    logger.error('onboarding.freeze_failed', {
      brandId: brand.id,
      reason: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: '질의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  logger.info('onboarding.queries_frozen', { brandId: brand.id, count: verdict.queries.length })
  return { ok: true, value: { frozen: verdict.queries.length } }
}
