import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PLANS, QUERY_PACK_PRICE_KRW, QUERY_PACK_SIZE, engineLabels } from '@/lib/plans'
import type { PlanId } from '@/lib/plans'

/**
 * 요금제.
 *
 * ★ 숫자를 하드코딩하지 않는다. 전부 `PLANS`에서 읽는다 — 화면과 제품이
 *   어긋나면 "질의 10개"라고 팔고 3개를 주는 일이 생긴다.
 *
 * ★ 무료의 한계가 **표에서 보여야** 한다. 무료를 매력적으로 그리는 것이 목표가
 *   아니다. 측정 횟수 1회와 이력 없음이 나란히 보이면, 유료로 가는 이유를
 *   우리가 설명하지 않아도 읽는 사람이 스스로 안다.
 */

export const metadata = { title: '요금제' }

const PLAN_META: Record<PlanId, { name: string; tagline: string; cta: { href: string; label: string } }> = {
  free: {
    name: '무료 진단',
    tagline: '지금 어디쯤인지 한 번 확인합니다.',
    cta: { href: '/audit/new', label: '무료로 신청하기' },
  },
  // ★ 유료 두 칸의 CTA가 `/sign-up`이었다. 결제가 열려 있지 않으므로 가입해도
  //   대시보드에 볼 것이 없다 — 요금제 화면 아래에서 스스로 "결제는 아직 열리지
  //   않았습니다"라고 말하면서 가입으로 보내고 있었다. 지금 실제로 받을 수 있는
  //   것으로 보낸다. 결제가 열리면 `/sign-up`으로 되돌린다.
  starter: {
    name: 'Starter',
    tagline: '변화를 판정할 수 있는 최소 구성입니다.',
    cta: { href: '/audit/new', label: '무료 진단부터 받기' },
  },
  business: {
    name: 'Business',
    tagline: '브랜드가 여럿이거나 질의를 넓게 봐야 할 때.',
    cta: { href: '/audit/new', label: '무료 진단부터 받기' },
  },
}

const ORDER: PlanId[] = ['free', 'starter', 'business']

/**
 * 숫자만 mono로 조판한다.
 *
 * ★ 셀 전체에 `font-mono`를 걸면 안 된다. mono에는 한글 글리프가 없어서
 *   "3개"의 `개`, "무제한", "네이버 AI 브리핑"이 시스템 서체로 떨어지고 한 셀
 *   안에서 서체가 갈린다(실제로 그렇게 보였다). 숫자만 감싸면 자릿수 정렬은
 *   그대로 얻으면서 그 이음선이 사라진다.
 */
function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>
}

function priceCell(krw: number): React.ReactNode {
  return krw === 0 ? (
    <>
      <Num>0</Num>원
    </>
  ) : (
    <>
      <Num>{krw.toLocaleString('ko-KR')}</Num>원
    </>
  )
}

function countCell(n: number, unit: string): React.ReactNode {
  return (
    <>
      <Num>{n}</Num>
      {unit}
    </>
  )
}

/** 주당 측정 횟수 — 무료는 1회뿐이므로 '주 n회'로 쓰면 거짓이 된다. */
function cadenceCell(id: PlanId): React.ReactNode {
  return id === 'free' ? (
    <>
      <Num>1</Num>회 <span className="text-muted-foreground">(단발)</span>
    </>
  ) : (
    <>
      주 <Num>{PLANS[id].samples.llm}</Num>회
    </>
  )
}

function historyCell(months: number | null): React.ReactNode {
  if (months === null) return '무제한'
  if (months === 0) return '없음'
  return countCell(months, '개월')
}

const ROWS: readonly { label: string; value: (id: PlanId) => React.ReactNode }[] = [
  { label: '월 요금', value: (id) => priceCell(PLANS[id].priceKrw) },
  // ★ 질의 한도는 계정 전체다 — 브랜드마다 주는 것이 아니다(`plans.ts` 참고).
  //   브랜드가 여럿인 플랜에서 그 사실을 여기 적지 않으면, 고객은 브랜드마다
  //   받는다고 읽는다. 나중에 "3개 등록했는데 왜 90개가 아니냐"가 된다.
  {
    label: '측정 질의',
    value: (id) =>
      PLANS[id].maxBrands > 1 ? (
        <>
          {countCell(PLANS[id].maxQueries, '개')}
          <span className="block text-xs text-muted-foreground">
            브랜드 <span className="font-mono tabular-nums">{PLANS[id].maxBrands}</span>개에 나눠
            사용
          </span>
        </>
      ) : (
        countCell(PLANS[id].maxQueries, '개')
      ),
  },
  { label: '측정 횟수', value: cadenceCell },
  { label: '엔진', value: (id) => engineLabels(PLANS[id].engines).join(', ') },
  { label: '경쟁사', value: (id) => countCell(PLANS[id].maxCompetitors, '개') },
  { label: '브랜드', value: (id) => countCell(PLANS[id].maxBrands, '개') },
  { label: '이력 보관', value: (id) => historyCell(PLANS[id].historyMonths) },
  { label: 'CSV 내보내기', value: (id) => (PLANS[id].csvExport ? '가능' : '—') },
]

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">요금제</p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        측정 횟수가 곧 신뢰구간의 넓이입니다
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        같은 질문을 여러 번 물어야 답이 흔들리는 폭을 알 수 있습니다. 요금제의 차이는 기능이
        아니라 <strong className="font-medium text-foreground">몇 번 재는지</strong>입니다.
      </p>

      {/* ── 카드 (모바일·태블릿) ─────────────────────────────── */}
      <div className="mt-14 grid gap-6 lg:hidden">
        {ORDER.map((id) => (
          <div key={id} className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight">{PLAN_META[id].name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{PLAN_META[id].tagline}</p>
            <p className="mt-4 text-3xl font-semibold tracking-tighter">
              {priceCell(PLANS[id].priceKrw)}
              {PLANS[id].priceKrw > 0 && (
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                  / 월
                </span>
              )}
            </p>
            <dl className="mt-5 space-y-2 text-sm">
              {ROWS.slice(1).map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right">{row.value(id)}</dd>
                </div>
              ))}
            </dl>
            <Button
              className="mt-6 w-full"
              variant={id === 'starter' ? 'default' : 'outline'}
              asChild
            >
              <Link href={PLAN_META[id].cta.href}>{PLAN_META[id].cta.label}</Link>
            </Button>
          </div>
        ))}
      </div>

      {/* ── 표 (데스크톱) ────────────────────────────────────
          나란히 놓는 것이 목적이다. 무료의 "1회 (단발)"과 "이력 없음"이
          유료 열 옆에 붙어 있어야 차이가 눈으로 보인다. */}
      <div className="mt-14 hidden lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">플랜별 측정 조건 비교</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] border-b border-border py-4 text-left" />
              {ORDER.map((id) => (
                <th
                  key={id}
                  scope="col"
                  className="border-b border-border px-5 py-4 text-left align-bottom"
                >
                  <span className="block text-base font-semibold tracking-tight">
                    {PLAN_META[id].name}
                  </span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {PLAN_META[id].tagline}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border/70">
                <th scope="row" className="py-3.5 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                {ORDER.map((id) => (
                  <td key={id} className="px-5 py-3.5">
                    {row.value(id)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {ORDER.map((id) => (
                <td key={id} className="px-5 pt-6">
                  <Button variant={id === 'starter' ? 'default' : 'outline'} asChild>
                    <Link href={PLAN_META[id].cta.href}>{PLAN_META[id].cta.label}</Link>
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── 질의 팩 ──────────────────────────────────────────── */}
      <section className="mt-16 rounded-lg border border-border bg-muted/30 p-6 sm:p-7">
        <h2 className="text-base font-semibold">질의를 더 넣고 싶으면</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          질의 <Num>{QUERY_PACK_SIZE}</Num>개 단위로 추가할 수 있습니다 — 월{' '}
          <Num>{QUERY_PACK_PRICE_KRW.toLocaleString('ko-KR')}</Num>원. 질의를 늘리면 측정 횟수가 그만큼 늘어나므로 원가가 그대로 따라옵니다.
        </p>
      </section>

      {/* ── 정직 블록 ────────────────────────────────────────── */}
      <section className="mt-10 max-w-3xl border-l-2 border-border pl-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          유료 플랜과 결제는 아직 열리지 않았습니다. 지금 신청할 수 있는 것은 무료 진단입니다.
          위 조건은 유료 오픈 시점에 그대로 적용됩니다.
        </p>
      </section>
    </div>
  )
}
