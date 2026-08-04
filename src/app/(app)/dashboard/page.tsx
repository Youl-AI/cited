import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BrandPicker } from '@/components/dashboard/brand-picker'
import { HeadlineCard } from '@/components/dashboard/headline-card'
import { QueryHeatmap } from '@/components/dashboard/query-heatmap'
import { RunListSection } from '@/components/dashboard/run-list'
import { SourceChanges } from '@/components/dashboard/source-changes'
import { SovTrend } from '@/components/dashboard/sov-trend'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { Button } from '@/components/ui/button'
import { loadDashboard } from '@/lib/dashboard/load'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { resolveDashboardEntry } from '@/lib/onboarding/state'

export const metadata = { title: '대시보드' }

/**
 * 등장 순번 → 지연. **문자열 리터럴 배열이어야 한다** — Tailwind의 소스
 * 스캐너는 평문 스캐너라 `[--enter-delay:calc(…*${i})]`처럼 조립한 클래스는
 * 산출물에 나오지 않는다(그리고 조용히 안 나온다 — 지연만 사라지고 화면은
 * 멀쩡하다). 인라인 style 대신 이 배열을 쓰는 이유는 값이 전부 컴파일 타임
 * 상수이기 때문이다 — 데이터에서 오는 값이 아니면 스타일 시스템 밖으로
 * 내보내지 않는다.
 */
const ENTER_DELAY = [
  '',
  '[--enter-delay:calc(var(--motion-stagger)*1)]',
  '[--enter-delay:calc(var(--motion-stagger)*2)]',
  '[--enter-delay:calc(var(--motion-stagger)*3)]',
  '[--enter-delay:calc(var(--motion-stagger)*4)]',
  '[--enter-delay:calc(var(--motion-stagger)*5)]',
  '[--enter-delay:calc(var(--motion-stagger)*6)]',
] as const

/**
 * 계기판 섹션 하나 — 제목·리드·본문의 리듬을 한 곳에서 정한다.
 *
 * ★ 위쪽 헤어라인이 섹션의 경계다. 예전에는 간격만으로 갈랐는데, 대시보드처럼
 *   블록이 여섯 개 쌓이는 화면에서는 간격만으로는 "제목이 위 블록의 캡션인지
 *   아래 블록의 머리인지"가 흔들린다. 선 하나가 그 모호함을 없앤다.
 *   색은 --border(회색 안료)가 아니라 --foreground 알파다 — 카드 헤어라인과
 *   같은 가족이라 표면이 뒤집혀도 같이 뒤집힌다.
 * ★ 리드는 `max-w-prose`로 묶는다. 대시보드는 최대 폭이 6xl(1152px)이라
 *   설명 문장이 그대로 늘어나면 한 줄이 100자를 넘어 읽히지 않는다.
 * ★ 등장은 CSS `.instrument-enter` — 순번만 `--enter-delay`로 준다.
 *   Motion `Reveal`을 쓰지 않은 이유는 globals.css 그쪽 주석에 있다(요약:
 *   서버에서 수치까지 다 그려 보내는 화면에 하이드레이션 게이트를 달지 않는다).
 */
function Section({
  title,
  lede,
  index,
  children,
}: {
  title: string
  lede: string
  index: number
  children: ReactNode
}) {
  return (
    <section
      className={`instrument-enter border-t border-foreground/[0.07] pt-8 ${ENTER_DELAY[index] ?? ''}`}
    >
      <h2 className="font-heading text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      <p className="mt-1.5 mb-5 max-w-prose text-sm text-muted-foreground">{lede}</p>
      {children}
    </section>
  )
}

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

  const { brand } = await searchParams
  const data = await loadDashboard(gate.user.id, brand)
  if (!data.selected) redirect('/onboarding')
  const canAdd = gate.limits !== null && data.brands.length < gate.limits.maxBrands
  // 회차가 하나도 없으면 히트맵·SoV·출처는 그릴 것이 없다(각 컴포넌트도
  // 스스로 null을 내지만, 제목과 리드까지 남으면 빈 제목 셋이 늘어선다).
  const hasPoints = data.points.length > 0
  const sections = [
    {
      title: '언급률 추이',
      lede: '회차별 언급률과 95% 신뢰구간입니다. 엔진을 골라 따로 볼 수 있습니다.',
      body: <TrendChart points={data.points} />,
    },
    ...(hasPoints
      ? [
          {
            title: '질문별 히트맵',
            lede: '어느 질문에서 비는가 — 여기가 가장 실행 가능한 정보입니다. 셀의 숫자는 언급된 답변 수 / 전체 답변 수입니다.',
            body: <QueryHeatmap points={data.points} />,
          },
          {
            title: '언급 점유율 추이',
            lede: '등록한 경쟁사 대비 언급 비중입니다. 경쟁사를 더 등록하면 이 값은 달라집니다.',
            body: <SovTrend points={data.points} />,
          },
          {
            title: 'AI가 읽는 출처',
            lede: '최신 회차에서 인용된 도메인과 직전 회차 대비 변화입니다 — 여기가 콘텐츠를 실을 곳입니다.',
            body: <SourceChanges points={data.points} />,
          },
        ]
      : []),
    {
      title: '측정 회차',
      lede: '회차를 누르면 진단 리포트와 같은 화면 문법의 상세를 봅니다.',
      body: <RunListSection items={data.runList} />,
    },
  ]

  return (
    <div className="space-y-9">
      {gate.state === 'no-plan' && (
        // 해지 계정 안내 — 새 측정이 왜 안 도는지 정직하게 말한다. 이력을
        // 감추지 않는 것과 짝이다 (`load.ts` 해지 정책 주석). 경고 색이 아니라
        // 중립 톤을 쓴다 — 잘못된 상태가 아니라 계약이 끝난 상태다.
        <p className="max-w-prose rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          구독이 해지되어 새 측정은 돌지 않지만, 결제하신 기간의 측정 이력은 그대로 볼 수
          있습니다.
        </p>
      )}
      {entry.pendingBrandId && (
        // 튕기지 않고 알린다 (Task 4). 이미 측정 중인 브랜드가 있으므로 대시보드를
        // 막을 이유가 없고, 그렇다고 미동결 브랜드를 잊게 두면 그 브랜드는 영영
        // 측정되지 않는다 — 이어서 갈 링크를 항상 눈에 보이는 자리에 둔다.
        // ★ 색은 토큰으로 쓴다 — 미확정 브랜드 경고는 온보딩 에디터의 경고 상자
        //   (`queries/page.tsx`)와 같은 `incomplete` 짝이다. 원색 팔레트(amber-500)를
        //   직접 쓰면 같은 뜻이 화면마다 다른 색이 된다 (§2).
        <p className="max-w-prose rounded-xl border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm leading-relaxed text-incomplete-fg">
          아직 질의를 확정하지 않은 브랜드가 있습니다. 확정 전까지 그 브랜드는 측정되지
          않습니다.{' '}
          <Link href={queriesStepPath(entry.pendingBrandId)} className="font-medium underline">
            이어서 확정하기
          </Link>
        </p>
      )}

      {/* 브랜드 이름은 이 화면의 주어다 — 아래 모든 수치가 이 브랜드에 대한
          것이라는 사실이 한눈에 잡혀야 한다. 트레이(브랜드 전환)를 같은 줄
          끝에 두어 "무엇을 보고 있고, 무엇으로 갈아탈 수 있는가"를 한 덩어리로
          읽게 한다. */}
      <div className="instrument-enter flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            정기 측정
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {data.selected.name}
          </h1>
        </div>
        <BrandPicker brands={data.brands} selectedId={data.selected.id} canAdd={canAdd} />
      </div>

      {/* 조건을 래퍼에 건다 — `HeadlineCard`는 회차가 없으면 스스로 null을
          내지만, 그때도 래퍼가 남으면 `space-y-9`가 빈 자리에 간격을 하나 더
          만든다(아래 섹션들이 이미 같은 모양으로 조건을 걸고 있다). */}
      {hasPoints && (
        <div className={`instrument-enter ${ENTER_DELAY[1]}`}>
          <HeadlineCard points={data.points} />
        </div>
      )}

      {/* ★ 순번은 **실제로 그려지는 순서**에서 나와야 한다. 섹션마다 상수를
          박아 두면 회차가 없는 계정(히트맵·SoV·출처 셋이 통째로 빠진다)에서
          번호에 구멍이 생겨, 마지막 섹션이 아무것도 없는 360ms를 기다렸다가
          등장한다. 배열로 만들어 map의 인덱스를 쓰면 구멍이 생길 수 없다. */}
      {sections.map((section, i) => (
        <Section
          key={section.title}
          title={section.title}
          lede={section.lede}
          // 앞서 그려진 블록 수만큼 뒤에서 시작한다 — 머리글(0)은 항상 있고,
          // 헤드라인 카드(1)는 회차가 있을 때만 있다.
          index={(hasPoints ? 2 : 1) + i}
        >
          {section.body}
        </Section>
      ))}
    </div>
  )
}
