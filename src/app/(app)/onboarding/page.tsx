import { redirect } from 'next/navigation'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { loadPrefill } from '@/lib/onboarding/prefill'
import { BrandStepForm } from './brand-step-form'

export const metadata = { title: '온보딩 — 브랜드' }

// requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 그룹 규칙 충족 —
// layout.tsx 주석 참고).
export default async function OnboardingPage() {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan') redirect('/dashboard')
  // ★ 브랜드 한도 검사보다 **먼저** 온다. 순서가 뒤집히면 브랜드를 만들고
  //   질의를 확정하지 않은 Starter 고객(한도 1개)이 여기서 `/dashboard`로
  //   튕기고, 대시보드는 다시 여기로 보내지 않으므로 온보딩을 끝낼 방법이
  //   사라진다 — 요금은 나가고 측정은 안 되는 상태다 (state.ts 주석).
  if (gate.state === 'needs-queries' && gate.pendingBrandId) {
    redirect(queriesStepPath(gate.pendingBrandId))
  }
  if (!gate.limits || gate.brandCount >= gate.limits.maxBrands) redirect('/dashboard')

  const prefill = await loadPrefill(gate.user.email, gate.subscription?.fromAuditId ?? null)

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 1 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정할 브랜드</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        여기 등록한 브랜드와 경쟁사가 측정의 분모가 됩니다. 경쟁사를 적게 등록하면 점유율이
        실제보다 높게 나옵니다 — 실제 경쟁 상대를 그대로 넣어 주세요.
      </p>
      {prefill && (
        <p className="mt-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          이전 진단 정보를 미리 채웠습니다. 바뀐 내용이 있으면 고쳐 주세요.
        </p>
      )}
      <div className="mt-8">
        <BrandStepForm
          maxCompetitors={gate.limits.maxCompetitors}
          prefill={
            prefill
              ? {
                  name: prefill.brandName,
                  category: prefill.category,
                  region: prefill.region ?? '',
                  competitors: prefill.competitors,
                  siteUrl: prefill.selfDomains[0] ?? '',
                }
              : null
          }
        />
      </div>
    </div>
  )
}
