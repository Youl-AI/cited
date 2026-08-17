import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { nextMeasurement } from '@/lib/kst'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { StepRail } from '../step-rail'

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
      <StepRail step={3} />
      {/* 성공 마크 — 온보딩 전체에서 유일하게 delight 예산을 쓰는 지점(계정당
          1회 화면). 기법은 차트와 같은 `.chart-draw`(pathLength 정규화 +
          dashoffset 드로우, 600ms instrument)다 — 새 커브를 만들지 않고 이
          제품의 "선이 그어진다" 어휘를 재사용한다. 축하 연출이 아니라 체크
          하나가 그어지는 **상태 확정**이므로, 링은 정지시키고 체크만 긋는다.
          ★ 인쇄·reduced-motion은 chart-draw의 기존 가드가 그대로 처리한다. */}
      <svg viewBox="0 0 52 52" aria-hidden="true" className="mt-6 size-12">
        <circle cx="26" cy="26" r="24" fill="none" strokeWidth="2" className="stroke-foreground/15" />
        <path
          pathLength="1"
          d="M15 27 l8 8 l15 -17"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-draw stroke-primary"
        />
      </svg>
      <h1 className="instrument-enter mt-4 font-heading text-2xl font-semibold tracking-tight [--enter-delay:calc(var(--motion-stagger)*2)]">
        측정 예약이 끝났습니다
      </h1>
      {/* ★ 이 카드가 이 화면의 유일한 물건이다. 아래 문단은 기대치를 맞추는 말이고,
          여기 담긴 것은 **예약된 사실**이다(언제 무엇이 도는가) — 둘을 같은 회색
          문단으로 쌓으면 화면을 닫은 뒤 남는 것이 없다. 문구는 그대로다. */}
      <Card className="instrument-enter mt-5 [--card-spacing:--spacing(5)] [--enter-delay:calc(var(--motion-stagger)*3)]">
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            질의가 동결됐습니다. 다음 측정은{' '}
            <span className="font-mono text-foreground">{next.weekdayLabel}요일 새벽</span>에
            돕니다 — 이후 월·수·금 새벽마다 같은 질의로 다시 잽니다.
          </p>
        </CardContent>
      </Card>
      <p className="instrument-enter mt-5 text-sm leading-relaxed text-muted-foreground [--enter-delay:calc(var(--motion-stagger)*4)]">
        첫 회차가 끝나면 대시보드에 점이 하나 찍힙니다. 점 하나로는 변화를 말할 수 없습니다 —
        회차가 쌓일수록 구간이 좁아지고, 그때부터 변화가 실제인지 측정 오차인지 판정합니다.
      </p>
      <div className="instrument-enter mt-8 [--enter-delay:calc(var(--motion-stagger)*5)]">
        <Button asChild size="lg">
          <Link href="/dashboard">대시보드로</Link>
        </Button>
      </div>
    </div>
  )
}
