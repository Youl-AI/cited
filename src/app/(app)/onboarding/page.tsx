import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { loadPrefill } from '@/lib/onboarding/prefill'
import { BrandStepForm } from './brand-step-form'
import { StepRail } from './step-rail'

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
    // 등장 순번은 문자열 리터럴이어야 한다 — 조립한 클래스는 Tailwind의 평문
    // 스캐너가 못 보고 **조용히** 사라진다(지연만 없어지고 화면은 멀쩡하다).
    <div className="mx-auto max-w-2xl">
      <StepRail step={1} />
      <div className="instrument-enter [--enter-delay:calc(var(--motion-stagger)*1)]">
        <h1 className="mt-6 font-heading text-2xl font-semibold tracking-tight">측정할 브랜드</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          여기 등록한 브랜드와 경쟁사가 측정의 분모가 됩니다. 경쟁사를 적게 등록하면 점유율이
          실제보다 높게 나옵니다 — 실제 경쟁 상대를 그대로 넣어 주세요.
        </p>
        {prefill && (
          // 반경·헤어라인을 카드 가족으로 맞춘다. 경계선이 --border(회색 안료)가
          // 아니라 --foreground 알파인 것도 카드와 같은 이유다(표면을 따라간다).
          <p className="mt-4 rounded-xl border border-foreground/[0.07] bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            이전 진단 정보를 미리 채웠습니다. 바뀐 내용이 있으면 고쳐 주세요.
          </p>
        )}
      </div>
      {/* ★ 폼을 카드에 앉힌다. 위쪽 설명(사람의 말)과 아래쪽 입력(고객이 확정하는
          값)이 같은 배경 위에 흐르면 "어디부터가 내가 채우는 것인가"가 간격으로만
          구분된다. 트레이+유리판은 그 경계를 표면으로 말한다.
          --card-spacing을 20/24px로 올린 이유는 대시보드 헤드라인 카드와 같다:
          필요한 것은 트레이 두께가 아니라 안쪽 여백이다. **--card-bezel은 손대지
          않는다** — 그건 모든 카드가 공유하는 값이라, 여기서 키우면 대시보드의
          히트맵·회차 목록 트레이까지 같이 두꺼워진다(Task 7 §1). */}
      <Card className="mt-8 instrument-enter [--card-spacing:--spacing(5)] [--enter-delay:calc(var(--motion-stagger)*2)] sm:[--card-spacing:--spacing(6)]">
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
