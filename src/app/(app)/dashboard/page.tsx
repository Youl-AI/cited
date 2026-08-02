import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandPicker } from '@/components/dashboard/brand-picker'
import { HeadlineCard } from '@/components/dashboard/headline-card'
import { QueryHeatmap } from '@/components/dashboard/query-heatmap'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { Button } from '@/components/ui/button'
import { loadDashboard } from '@/lib/dashboard/load'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { resolveDashboardEntry } from '@/lib/onboarding/state'

export const metadata = { title: '대시보드' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  // requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 규칙).
  const gate = await loadOnboardingGate()
  // ★ 강제 리다이렉트 판정은 순수 함수가 한다 (Task 4). 튕기는 것은 "측정 중인
  //   것이 하나도 없을 때"뿐이다 — 미동결 브랜드가 있어도 동결된 브랜드가 있으면
  //   대시보드를 그리고 배너로 안내한다 (state.ts `resolveDashboardEntry` 주석).
  const entry = resolveDashboardEntry({
    state: gate.state,
    pendingBrandId: gate.pendingBrandId,
    frozenBrandCount: gate.frozenBrandCount,
  })
  if (entry.kind === 'redirect') redirect(entry.to)

  if (gate.state === 'no-plan') {
    // 기존 빈 대시보드 유지 (스펙 ② — 플랜 없는 계정은 무료 진단 안내).
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground">
          {gate.user.name}님, 정기 측정은 구독 고객에게 열려 있습니다. 지금 바로 받을 수 있는
          것은 무료 진단입니다 — 계정과는 별개로 동작하며, 결과는 메일로 갑니다.
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

  const { brand } = await searchParams
  const data = await loadDashboard(gate.user.id, brand)
  if (!data.selected) redirect('/onboarding')
  const canAdd = gate.limits !== null && data.brands.length < gate.limits.maxBrands

  return (
    <div className="space-y-10">
      {entry.pendingBrandId && (
        // 튕기지 않고 알린다 (Task 4). 이미 측정 중인 브랜드가 있으므로 대시보드를
        // 막을 이유가 없고, 그렇다고 미동결 브랜드를 잊게 두면 그 브랜드는 영영
        // 측정되지 않는다 — 이어서 갈 링크를 항상 눈에 보이는 자리에 둔다.
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed">
          아직 질의를 확정하지 않은 브랜드가 있습니다. 확정 전까지 그 브랜드는 측정되지
          않습니다.{' '}
          <Link href={queriesStepPath(entry.pendingBrandId)} className="font-medium underline">
            이어서 확정하기
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            정기 측정
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{data.selected.name}</h1>
        </div>
        <BrandPicker brands={data.brands} selectedId={data.selected.id} canAdd={canAdd} />
      </div>

      <HeadlineCard points={data.points} />

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">언급률 추이</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          회차별 언급률과 95% 신뢰구간입니다. 엔진을 골라 따로 볼 수 있습니다.
        </p>
        <TrendChart points={data.points} />
      </section>

      {data.points.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">질문별 히트맵</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            어느 질문에서 비는가 — 여기가 가장 실행 가능한 정보입니다. 셀의 숫자는 언급된
            답변 수 / 전체 답변 수입니다.
          </p>
          <QueryHeatmap points={data.points} />
        </section>
      )}
      {/* 점유율·출처·회차 목록은 Task 10이 이 아래에 붙인다 */}
    </div>
  )
}
