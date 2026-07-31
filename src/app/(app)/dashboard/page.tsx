import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { resolveDashboardEntry } from '@/lib/onboarding/state'

export const metadata = { title: '대시보드' }

// 5단계에서 통째로 교체된다. 지금 있는 이유는 하나 — 인증 가드가 실제로
// 동작하는지 확인할 대상이 필요해서다.
//
// ★ 원래는 "아직 등록된 브랜드가 없습니다" 한 줄이었다. 그게 **막다른 골목**을
//   만들었다 — 브랜드를 등록할 방법이 없고, 설정·결제는 "준비 중"이고,
//   로고를 눌러도 제자리였다(로고 href가 /dashboard였다). 가입한 사람이
//   여기 도착해서 아무것도 못 하고 나가지도 못했다.
//
//   빈 화면은 방향을 주는 자리다. 지금 실제로 받을 수 있는 것이 무료 진단이므로
//   거기로 보낸다. 정기 측정이 열리면 이 파일이 통째로 바뀐다.
//
// ★ Task 3부터 이 화면이 온보딩 게이트를 겸한다. 활성 플랜이 있는데 브랜드가
//   없는 계정은 여기 머물면 안 된다 — 등록 경로가 없어 다시 막다른 골목이 된다.
//   requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 그룹 규칙 충족).
export default async function DashboardPage() {
  const gate = await loadOnboardingGate()
  // ★ 강제 리다이렉트 판정은 순수 함수가 한다 — 조건이 두 갈래(측정 중인 것이
  //   하나도 없으면 튕기고, 있으면 배너)라 여기 인라인으로 두면 테스트가 안 된다.
  //   근거는 state.ts `resolveDashboardEntry` 주석에 있다.
  const entry = resolveDashboardEntry({
    state: gate.state,
    pendingBrandId: gate.pendingBrandId,
    frozenBrandCount: gate.frozenBrandCount,
  })
  if (entry.kind === 'redirect') redirect(entry.to)
  const user = gate.user
  // 아래 JSX는 기존 스텁 그대로다 — 이 태스크는 게이트만 단다. Task 9가 교체한다.
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
      {entry.pendingBrandId && (
        // 튕기지 않고 알린다. 이미 측정 중인 브랜드가 있으므로 대시보드를 막을
        // 이유가 없고, 그렇다고 미동결 브랜드를 잊게 두면 그 브랜드는 영영
        // 측정되지 않는다 — 이어서 갈 링크를 항상 눈에 보이는 자리에 둔다.
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed">
          아직 질의를 확정하지 않은 브랜드가 있습니다. 확정 전까지 그 브랜드는 측정되지
          않습니다.{' '}
          <Link href={queriesStepPath(entry.pendingBrandId)} className="font-medium underline">
            이어서 확정하기
          </Link>
        </p>
      )}
      <p className="text-muted-foreground">
        {user.name}님, 정기 측정은 아직 준비 중입니다. 결제가 열리면 브랜드를 등록하고 주{' '}
        <span className="font-mono tabular-nums">3</span>회 측정한 추이를 여기서 보게 됩니다.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        지금 바로 받을 수 있는 것은 무료 진단입니다. 계정과는 별개로 동작하며, 결과는 메일로
        갑니다.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild>
          <Link href="/audit/new">무료 진단 받기</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/pricing">요금제 보기</Link>
        </Button>
      </div>
    </div>
  )
}
