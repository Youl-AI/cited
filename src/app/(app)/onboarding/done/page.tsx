import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { nextMeasurement } from '@/lib/kst'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

export const metadata = { title: '온보딩 — 완료' }

/**
 * 온보딩 3단계 — 완료.
 *
 * ★ 이 화면의 일은 축하가 아니라 **예고**다. 확정 직후의 대시보드에는 아무것도
 *   없다(첫 수집이 아직 안 돌았다). 언제 무엇이 나타나는지 여기서 말하지 않으면
 *   고객은 "결제했는데 빈 화면"을 보고 환불 문의를 넣는다.
 *
 * ★ 점 하나로는 변화를 말할 수 없다는 것도 여기서 미리 말한다. 첫 회차 뒤에
 *   "왜 아직 아무 판정이 없냐"를 듣지 않으려면, 기대치를 먼저 맞춰야 한다
 *   (구간이 좁아지는 것은 회차가 쌓인 뒤다).
 *
 * requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 그룹 규칙 충족).
 */
export default async function OnboardingDonePage() {
  const gate = await loadOnboardingGate()
  // ★ 게이트 결과를 버리면 플랜 없는 계정이 "질의가 동결됐습니다"와 다음 측정
  //   시각을 읽는다 — 동결된 것이 없는데 예약된 것처럼 보인다. 형제 페이지
  //   (`onboarding/page.tsx`·`queries/page.tsx`)와 같은 판정·같은 목적지로 보낸다.
  if (gate.state === 'no-plan') redirect('/dashboard')
  const next = nextMeasurement(new Date())
  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 3 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정 예약이 끝났습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        질의가 동결됐습니다. 다음 측정은{' '}
        <span className="font-mono text-foreground">{next.weekdayLabel}요일 새벽</span>에 돕니다 —
        이후 월·수·금 새벽마다 같은 질의로 다시 잽니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        첫 회차가 끝나면 대시보드에 점이 하나 찍힙니다. 점 하나로는 변화를 말할 수 없습니다 —
        회차가 쌓일수록 구간이 좁아지고, 그때부터 변화가 실제인지 측정 오차인지 판정합니다.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/dashboard">대시보드로</Link>
        </Button>
      </div>
    </div>
  )
}
