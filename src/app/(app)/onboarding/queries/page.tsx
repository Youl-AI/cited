import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { generateAuditQueries } from '@/lib/audit/queries'
import type { CustomQueryContext } from '@/lib/audit/query-rules'
import { db, schema } from '@/lib/db'
import { buildInitialQueries, quotaBlockedReason } from '@/lib/onboarding/editor'
import { QUERY_GENERATION_LIMIT } from '@/lib/onboarding/generation'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { loadPrefill } from '@/lib/onboarding/prefill'
import { loadEditorQuota } from '@/lib/onboarding/quota'
import { StepRail } from '../step-rail'
import { QueryEditor } from './query-editor'

export const metadata = { title: '온보딩 — 질의' }

/**
 * 온보딩 2단계 — 질의 에디터. **온보딩의 본체다.**
 *
 * 여기서 확정한 질의는 구독 내내 동결된다(회차 비교의 불변식). 그래서 이 화면의
 * 책임은 "예쁘게 보여주기"가 아니라 **고객이 무엇을 확정하는지 알게 하는 것**이다.
 *
 * ★ 소유 검증은 `brandId !== gate.pendingBrandId` 한 줄이 전부 맡는다.
 *   `pendingBrandId`는 이 사용자의 **활성·미동결** 브랜드 중 가장 오래된 것이므로
 *   (gate.ts), 이 비교가 소유·활성·미동결을 한 번에 건다. 이 줄을 빼면 이 라우트에
 *   남는 소유 검증이 없다.
 *   requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 그룹 규칙 충족).
 */
export default async function QueriesStepPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.subscription) redirect('/dashboard')
  const { brand: brandId } = await searchParams
  // 자기 브랜드가 아니거나 이미 확정한 브랜드면 여기 머물 이유가 없다.
  if (!brandId || brandId !== gate.pendingBrandId) redirect('/dashboard')

  const brand = await db.query.brands.findFirst({
    where: and(eq(schema.brands.id, brandId), eq(schema.brands.userId, gate.user.id)),
  })
  if (!brand) redirect('/dashboard')

  const quota = await loadEditorQuota(gate.user.id, brand.id, gate.subscription)
  const templates = generateAuditQueries(brand.category, brand.name, brand.region ?? undefined)
  const prefill = await loadPrefill(gate.user.email, gate.subscription.fromAuditId ?? null)
  const initial = buildInitialQueries({
    frozen: prefill?.frozenQueries ?? null,
    templates,
    quota: quota.quota,
  })
  const ctx: Omit<CustomQueryContext, 'requiredCount'> = {
    brandName: brand.name,
    competitors: brand.competitors.map((c) => c.name),
    category: brand.category,
    ...(brand.region ? { region: brand.region } : {}),
  }
  // ★ 남은 몫이 템플릿 수보다 적으면 **어떤 입력으로도** 동결이 안 된다.
  //   에디터를 그려 주고 [확정]에서야 막으면, 고객은 될 리 없는 질의를 30분
  //   다듬은 뒤에 거절당한다. 이유는 서버와 같은 문장을 쓴다(editor.ts).
  const blocked = quotaBlockedReason({ ...quota, minCount: templates.length })

  // ★ "나중에 하기"는 **이미 측정 중인 브랜드가 있을 때만** 낸다. 동결된 브랜드가
  //   0개인 계정은 `/dashboard`가 다시 이 화면으로 튕기므로(state.ts
  //   `resolveDashboardEntry`), 링크를 내면 왕복만 시키는 셈이다.
  const canDefer = gate.frozenBrandCount > 0

  return (
    <div className="mx-auto max-w-2xl">
      <StepRail step={2} />
      <h1 className="instrument-enter mt-6 font-heading text-2xl font-semibold tracking-tight [--enter-delay:calc(var(--motion-stagger)*1)]">
        측정할 질문
      </h1>

      {blocked ? (
        <div className="instrument-enter [--enter-delay:calc(var(--motion-stagger)*2)]">
          <p className="mt-6 rounded-xl border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm leading-relaxed text-incomplete-fg">
            {blocked}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            질의 팩 추가는 운영자에게 문의해 주세요.
          </p>
          {/* ★ 이 상태에서 `/dashboard`는 안전하다: 다른 브랜드가 질의를 쓰고 있다는 것은
              동결된 브랜드가 이미 있다는 뜻이라(질의 행은 동결 때 생긴다)
              `resolveDashboardEntry`가 여기로 되돌리지 않는다. */}
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/dashboard">대시보드로</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="instrument-enter [--enter-delay:calc(var(--motion-stagger)*2)]">
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {initial.source === 'frozen'
                ? '진단에 썼던 질의를 그대로 가져왔습니다. 같은 질의로 재야 진단 리포트와 비교할 수 있습니다.'
                : `앞의 ${templates.length}개는 업종 공통 질문입니다 — 무료 진단과 같은 질문이라 반드시 포함됩니다. 나머지는 AI 후보로 채우거나 직접 쓰세요.`}
            </p>
            {/* ★ 아래 두 문장은 나머지 설명과 종류가 다르다 — "이 화면이 무엇인가"가
                아니라 **확정 전에 반드시 읽어야 하는 두 가지 제약**이다. 셋을 같은
                회색 문단으로 쌓아 두면 훑는 눈에는 길이만 남는다. 왼쪽 규칙선은
                리포트의 "이 숫자를 어떻게 읽어야 하는가"(result-view.tsx)와 같은
                어휘다 — 같은 뜻은 화면이 달라도 같은 모양으로 온다. */}
            <div className="mt-5 space-y-2 border-l-2 border-border pl-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                질의에는 브랜드명·경쟁사명을 넣지 않습니다 — 이름을 대면 측정이 무효입니다.
                우리가 재는 것은 이름을 대지 않은 소비자 질문에 AI가 브랜드를 스스로
                꺼내는가입니다.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                확정하면 질의가 동결됩니다. 회차끼리 비교하려면 질의가 같아야 하기 때문입니다 —
                지금 정한 질문이 구독 내내 측정 대상이 됩니다.
              </p>
            </div>
          </div>
          <div className="instrument-enter mt-8 [--enter-delay:calc(var(--motion-stagger)*3)]">
            <QueryEditor
              brandId={brand.id}
              initial={initial.queries}
              quota={quota.quota}
              templates={templates}
              generationsUsed={brand.queryGenerations}
              generationLimit={QUERY_GENERATION_LIMIT}
              ctx={ctx}
            />
          </div>
          {canDefer && (
            <p className="instrument-enter mt-6 border-t border-foreground/[0.07] pt-5 text-xs leading-relaxed text-muted-foreground [--enter-delay:calc(var(--motion-stagger)*4)]">
              지금 정하기 어렵다면{' '}
              <Link
                href="/dashboard"
                className="rounded-sm font-medium text-foreground underline underline-offset-2 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                나중에 하기
              </Link>
              . 확정 전까지 이 브랜드는 측정되지 않습니다.
            </p>
          )}
        </>
      )}
    </div>
  )
}
