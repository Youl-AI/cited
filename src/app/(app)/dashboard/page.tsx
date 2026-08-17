import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BrandPicker } from '@/components/dashboard/brand-picker'
import {
  DashboardNav,
  resolveView,
  type DashboardView,
} from '@/components/dashboard/dashboard-nav'
import { ExportCsvButton } from '@/components/dashboard/export-csv-button'
import { HeadlineCard } from '@/components/dashboard/headline-card'
import { KpiRow } from '@/components/dashboard/kpi-row'
import { MeasurementStatus } from '@/components/dashboard/measurement-status'
import { PeriodCompareCard } from '@/components/dashboard/period-compare-card'
import { QueryHeatmap } from '@/components/dashboard/query-heatmap'
import {
  DEFAULT_RANGE,
  RangePicker,
  resolveRange,
  sliceToRange,
} from '@/components/dashboard/range-picker'
import { RankingCard } from '@/components/dashboard/ranking-card'
import { RunListSection } from '@/components/dashboard/run-list'
import { SourceChanges } from '@/components/dashboard/source-changes'
import { SovTrend } from '@/components/dashboard/sov-trend'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { WeakQueriesCard } from '@/components/dashboard/weak-queries-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildDashboardCsv, csvFilename } from '@/lib/dashboard/export-csv'
import { loadDashboard } from '@/lib/dashboard/load'
import { nextMeasurementAfter } from '@/lib/dashboard/next-measurement'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { resolveDashboardEntry } from '@/lib/onboarding/state'

export const metadata = { title: '대시보드' }

/**
 * 커맨드센터 셸 — 왼쪽 레일(보기 전환) + 오른쪽 그리드.
 *
 * 예전에는 여섯 블록을 세로로 쌓았다. 지금은 같은 카테고리 제품들(Peec·
 * Otterly)의 문법을 따른다: **개요는 한 그리드**(중앙 큰 차트 + 오른쪽
 * 지표 기둥), 나머지(히트맵·출처·회차)는 왼쪽 레일로 가른다. 보기 상태는
 * `?view=` — 브랜드·범위와 같은 URL 상태라 서버 컴포넌트가 해당 보기만
 * 그리고, 링크를 공유하면 같은 화면이 열린다.
 */

/**
 * 등장 순번 → 지연. **문자열 리터럴 배열이어야 한다** — Tailwind의 소스
 * 스캐너는 평문 스캐너라 조립한 클래스는 산출물에 나오지 않는다(조용히).
 * ★ 길이는 실제로 쌓이는 블록 수 이상 — 짧으면 `?? ''`로 지연 0이 되어
 *   마지막 블록만 다른 박자로 튀어나온다. 지금 최대: 머리글 + 그리드 셀 4 = 5.
 */
const ENTER_DELAY = [
  '',
  '[--enter-delay:calc(var(--motion-stagger)*1)]',
  '[--enter-delay:calc(var(--motion-stagger)*2)]',
  '[--enter-delay:calc(var(--motion-stagger)*3)]',
  '[--enter-delay:calc(var(--motion-stagger)*4)]',
  '[--enter-delay:calc(var(--motion-stagger)*5)]',
  '[--enter-delay:calc(var(--motion-stagger)*6)]',
  // ★ 길이는 실제로 쌓이는 블록 수 이상 — 짧으면 `?? ''`로 지연 0이 되어
  //   마지막 블록만 다른 박자로 튀어나온다. 지금 최대: 머리글 + 셸 + 개요
  //   블록 6(추이·헤드라인·순위·KPI·기간·약한 질문) = 8.
  '[--enter-delay:calc(var(--motion-stagger)*7)]',
] as const

/**
 * 그리드 셀 하나 — 제목·리드가 카드 **안에** 들어간다. 예전 `Section`(페이지
 * 바닥 + 헤어라인)과 달리 커맨드센터의 블록은 전부 카드다: 그리드에 서로
 * 다른 표면이 섞이면 어느 칸이 어느 칸의 배경인지 흔들린다.
 */
function Panel({
  title,
  lede,
  index,
  fill = false,
  children,
}: {
  title: string
  lede?: string
  index: number
  /** 부모 flex 기둥의 남는 높이를 채운다 — 기둥 바닥을 이웃 기둥과 맞출 때. */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <Card className={`instrument-enter ${fill ? 'h-full' : ''} ${ENTER_DELAY[index] ?? ''}`}>
      <CardContent className="flex h-full flex-col">
        {/* 제목은 모노 아이브로우다 — 머리글의 "정기 측정"과 같은 어휘.
            일반 헤딩체면 잘 정리된 제네릭 SaaS로 읽히고, 이 제품의 계기판
            정체성은 이 조판이 만든다. 위계는 크기가 아니라 카드 안의 자리
            (맨 위 한 줄)가 만든다. */}
        <h2 className="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        {lede && <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted-foreground/80">{lede}</p>}
        <div className="mt-4 flex-1">{children}</div>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; range?: string; view?: string }>
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

  if (gate.state === 'no-plan' && gate.frozenBrandCount === 0) {
    // 기존 빈 대시보드 유지 (스펙 ② — 플랜 없는 계정은 무료 진단 안내).
    // ★ `no-plan`만으로 가르지 않는다. 해지(status='canceled')도 `no-plan`으로
    //   판정되는데, 해지한 고객은 돈 내고 받은 측정 이력을 그대로 본다는 것이
    //   데이터 계층의 못 박힌 정책이다 (`load.ts` — status 필터 없음,
    //   `load.test.ts`가 지킨다). 동결 브랜드가 하나라도 있으면 보여 줄 이력이
    //   있다는 뜻이므로 아래 대시보드로 내려간다 — 이 분기는 "보여 줄 것이
    //   아무것도 없는" 계정 전용이다.
    return (
      // ★ 여기에는 "정기 측정" 아이브로우를 달지 않는다. 바로 아래 문장이
      //   "정기 측정은 구독 고객에게 열려 있습니다"인데, 그 위에 같은 말을
      //   현재 화면의 이름표로 붙이면 **없는 것을 있다고 말하는 셈**이다.
      //   아이브로우는 실제로 정기 측정을 보고 있는 화면에만 붙는다.
      <div className="instrument-enter max-w-2xl space-y-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          대시보드
        </h1>
        <p className="max-w-prose leading-relaxed text-muted-foreground">
          {gate.user.name}님, 정기 측정은 구독 고객에게 열려 있습니다. 지금 바로 받을 수 있는
          것은 무료 진단입니다 — 계정과는 별개로 동작하며, 결과는 메일로 갑니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="lg" asChild>
            <Link href="/audit/new">무료 진단 받기</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">요금제 보기</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { brand, range, view: viewParam } = await searchParams
  const data = await loadDashboard(gate.user.id, brand)
  if (!data.selected) redirect('/onboarding')
  const canAdd = gate.limits !== null && data.brands.length < gate.limits.maxBrands
  // 보기 범위 — 그리는 점만 자른다. 회차 목록(`runList`)은 자르지 않는다:
  // 그건 "무엇을 측정했는가"의 기록이지 추세 그림이 아니다.
  const selectedRange = range ?? DEFAULT_RANGE
  const points = sliceToRange(data.points, resolveRange(selectedRange))
  const hasPoints = points.length > 0
  const view: DashboardView = resolveView(viewParam)

  return (
    <div className="space-y-6">
      {gate.state === 'no-plan' && (
        // 해지 계정 안내 — 새 측정이 왜 안 도는지 정직하게 말한다. 이력을
        // 감추지 않는 것과 짝이다 (`load.ts` 해지 정책 주석). 경고 색이 아니라
        // 중립 톤을 쓴다 — 잘못된 상태가 아니라 계약이 끝난 상태다. 그래서
        // 상태 점도 회색이다(호박·빨강은 판정 어휘 — 여기는 판정이 아니다).
        // 문구는 상태 서술("측정이 멈춰 있습니다")로 시작한다 — 2026-08-18
        // UI 점검: 원인("구독이 해지되어")부터 말하면 시스템 상태 줄이 아니라
        // 사과문처럼 읽혔다. 재시작 동선(요금제)은 이 줄의 소관이므로 여기 둔다.
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-foreground/30" />
          <span className="min-w-0 flex-1">
            측정이 멈춰 있습니다 — 결제하신 기간의 측정 이력은 그대로 볼 수 있습니다.
          </span>
          <Link
            href="/pricing"
            className="shrink-0 font-medium text-foreground underline underline-offset-4 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-primary"
          >
            다시 시작하기
          </Link>
        </p>
      )}
      {entry.pendingBrandId && (
        // 튕기지 않고 알린다 (Task 4). 이미 측정 중인 브랜드가 있으므로 대시보드를
        // 막을 이유가 없고, 그렇다고 미동결 브랜드를 잊게 두면 그 브랜드는 영영
        // 측정되지 않는다 — 이어서 갈 링크를 항상 눈에 보이는 자리에 둔다.
        <p className="max-w-prose rounded-xl border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm leading-relaxed text-incomplete-fg">
          아직 질의를 확정하지 않은 브랜드가 있습니다. 확정 전까지 그 브랜드는 측정되지
          않습니다.{' '}
          <Link href={queriesStepPath(entry.pendingBrandId)} className="font-medium underline">
            이어서 확정하기
          </Link>
        </p>
      )}

      {/* 머리글 — 브랜드 이름이 이 화면의 주어다. 컨트롤들은 같은 트레이
          어휘로 같은 줄에 선다("무엇을 보는가" · "얼마나 보는가" · 내보내기). */}
      <div className="instrument-enter flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            정기 측정
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {data.selected.name}
          </h1>
          {/* 신선도 — 이 화면 전체의 시제. 해지 계정(no-plan)은 스케줄 계산을
              하지 않고 '다음 측정 없음'을 명시한다(measurement-status.tsx). */}
          <div className="mt-2">
            <MeasurementStatus
              last={data.points[data.points.length - 1]?.measuredAt ?? null}
              next={gate.state === 'no-plan' ? null : nextMeasurementAfter(new Date().toISOString())}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker
            selected={selectedRange}
            brandId={data.selected.id}
            totalRuns={data.points.length}
            view={view}
          />
          <BrandPicker brands={data.brands} selectedId={data.selected.id} canAdd={canAdd} />
          {/* 내보내기 — 플랜 게이트(PLANS.csvExport, 현재 Business 전용).
              보고 있는 범위 그대로 나간다 — 화면과 파일이 같은 회차 집합. */}
          {gate.limits?.csvExport && hasPoints && (
            <ExportCsvButton
              csv={buildDashboardCsv(points)}
              filename={csvFilename(data.selected.name, points)}
            />
          )}
        </div>
      </div>

      {/* 커맨드센터 본체 — 왼쪽 레일 + 보기 그리드 */}
      <div className={`instrument-enter flex flex-col gap-5 lg:flex-row lg:gap-8 ${ENTER_DELAY[1]}`}>
        <DashboardNav active={view} brandId={data.selected.id} range={selectedRange} />

        <div className="min-w-0 flex-1">
          {view === 'overview' &&
            (hasPoints ? (
              // ★ 개요는 한 화면 두 기둥이다. 왼쪽 = 무대(언급률 차트 + KPI
              //   타일 줄), 오른쪽 = 지표(히어로·순위). 점유율 추이는 자기
              //   탭(sov)으로 갔다 — 개요의 주장은 언급률 하나다(nav 주석).
              //   `items-stretch`(기본값) + 오른쪽 순위 카드 `fill`로 두 기둥의
              //   바닥을 맞춘다 — 짧은 쪽 옆에 빈 마당이 남지 않게(실측 피드백).
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="flex flex-col gap-4 xl:col-span-8">
                  <Panel
                    title="언급률 추이"
                    lede="회차별 언급률과 95% 신뢰구간입니다. 엔진을 골라 따로 볼 수 있습니다."
                    index={2}
                  >
                    <TrendChart points={points} />
                  </Panel>
                  {/* 보조 수치 셋 — 가로 한 줄. 세로 스택은 위계가 목록으로
                      읽힌다(사용자 피드백). */}
                  <div className={`instrument-enter ${ENTER_DELAY[5]}`}>
                    <KpiRow points={points} />
                  </div>
                  <Panel
                    title="기간 비교"
                    lede="최근 회차 묶음과 그 직전 묶음을 합쳐 비교합니다 — 회차 하나의 출렁임을 줄입니다."
                    index={6}
                  >
                    <PeriodCompareCard points={points} />
                  </Panel>
                </div>
                <div className="flex flex-col gap-4 xl:col-span-4">
                  <div className={`instrument-enter ${ENTER_DELAY[3]}`}>
                    <HeadlineCard points={points} compact />
                  </div>
                  <Panel title="언급 순위" lede="최신 회차에서 브랜드별 언급 수입니다." index={4}>
                    <RankingCard points={points} />
                  </Panel>
                  {/* 실행 카드가 남는 높이를 채운다 — "무엇을 고칠까"가 개요의
                      마지막 문장이 되게, 왼쪽 기둥과 바닥을 맞춘다. */}
                  <div className="min-h-0 flex-1">
                    <Panel
                      title="언급이 약한 질문"
                      lede="최신 회차에서 언급률이 가장 낮은 질문 셋 — 콘텐츠를 실을 자리입니다."
                      index={7}
                      fill
                    >
                      <WeakQueriesCard
                        points={points}
                        queriesHref={`/dashboard?brand=${data.selected.id}&range=${selectedRange}&view=queries`}
                      />
                    </Panel>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <TrendChart points={points} />
                <Panel title="측정 회차" index={2}>
                  <RunListSection items={data.runList} />
                </Panel>
              </div>
            ))}

          {view === 'sov' && (
            <Panel
              title="언급 점유율 추이"
              lede="브랜드별 언급 몫의 추이입니다. 경쟁사를 더 등록하면 분모가 달라집니다."
              index={2}
            >
              {hasPoints ? (
                <SovTrend points={points} />
              ) : (
                <p className="text-sm text-muted-foreground">아직 표시할 회차가 없습니다.</p>
              )}
            </Panel>
          )}

          {view === 'queries' && (
            <Panel
              title="질문별 히트맵"
              lede="어느 질문에서 비는가 — 여기가 가장 실행 가능한 정보입니다. 셀의 숫자는 언급된 답변 수 / 전체 답변 수입니다."
              index={2}
            >
              {hasPoints ? (
                <QueryHeatmap points={points} />
              ) : (
                <p className="text-sm text-muted-foreground">아직 표시할 회차가 없습니다.</p>
              )}
            </Panel>
          )}

          {view === 'sources' && (
            <Panel
              title="AI가 읽는 출처"
              lede="최신 회차에서 인용된 도메인과 직전 회차 대비 변화입니다 — 여기가 콘텐츠를 실을 곳입니다."
              index={2}
            >
              {hasPoints ? (
                <SourceChanges points={points} />
              ) : (
                <p className="text-sm text-muted-foreground">아직 표시할 회차가 없습니다.</p>
              )}
            </Panel>
          )}

          {view === 'runs' && (
            <Panel
              title="측정 회차"
              lede="회차를 누르면 진단 리포트와 같은 화면 문법의 상세를 봅니다."
              index={2}
            >
              <RunListSection items={data.runList} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
