import { CtaLink } from '@/components/marketing/cta-link'
import { SpecimenSheet } from '@/components/marketing/specimen-sheet'
import { Reveal } from '@/components/motion/reveal'
import { PLANS, QUERY_PACK_PRICE_KRW, QUERY_PACK_SIZE, engineLabels } from '@/lib/plans'
import type { PlanId } from '@/lib/plans'
import { cn } from '@/lib/utils'

/**
 * 요금제.
 *
 * ★ 숫자를 하드코딩하지 않는다. 전부 `PLANS`에서 읽는다 — 화면과 제품이
 *   어긋나면 "질의 10개"라고 팔고 3개를 주는 일이 생긴다.
 *
 * ★ 무료의 한계가 **표에서 보여야** 한다. 무료를 매력적으로 그리는 것이 목표가
 *   아니다. 측정 횟수 1회와 이력 없음이 나란히 보이면, 유료로 가는 이유를
 *   우리가 설명하지 않아도 읽는 사람이 스스로 안다.
 *
 * ## 3-타워를 세우지 않는다 (redesign-skill "Pricing table with 3 towers")
 *
 * 권장 티어를 **더 높은 카드**로 표시하는 것이 그 클리셰다. 여기서 Starter를
 * 가리키는 것은 높이가 아니라 **색**이다 — 열 전체에 브랜드색을 아주 옅게 깐
 * 띠 하나와 "권장" 표시. 세 열의 높이·굵기·여백은 완전히 같다.
 *
 * ## 행을 세 무리로 묶었다
 *
 * 여덟 행에 헤어라인을 하나씩 그으면 그게 tasteskill §4.9가 말하는 스펙 시트다.
 * 월 요금은 열 머리로 올리고(원래 모바일 카드가 이미 그렇게 하고 있었다),
 * 남은 일곱 행을 측정 · 범위 · 기록 세 무리로 묶어 **무리마다 선 하나**만
 * 긋는다(§9.F: 위아래로 두르지 않는다, 선은 아껴 쓴다).
 *
 * ## 행동은 하나뿐이다
 *
 * 열마다 버튼을 다는 것은 세 열이 전부 같은 곳(`/audit/new`)으로 가는 지금
 * 상황에서 §4.5 "한 의도에 한 라벨"의 정면 위반이다. 결제가 열려 있지 않으므로
 * **지금 할 수 있는 일은 무료 진단 하나**이고, 그 사실을 말하는 정직 블록
 * 바로 밑에 버튼 하나를 둔다. 라벨은 머리글·랜딩과 같은 "무료 진단 받기"다.
 */

export const metadata = { title: '요금제' }

const PLAN_META: Record<PlanId, { name: string; tagline: string }> = {
  free: {
    name: '무료 진단',
    tagline: '지금 어디쯤인지 한 번 확인합니다.',
  },
  starter: {
    name: 'Starter',
    tagline: '변화를 판정할 수 있는 최소 구성입니다.',
  },
  business: {
    name: 'Business',
    tagline: '브랜드가 여럿이거나 질의를 넓게 봐야 할 때.',
  },
}

const ORDER: PlanId[] = ['free', 'starter', 'business']

/**
 * 권장 티어.
 *
 * ★ 마케팅 판단이 아니라 이 페이지의 주장에서 나온다 — H1이 "측정 횟수가 곧
 *   신뢰구간의 넓이"라고 말하고, 같은 질문을 여러 번 재는 첫 플랜이 Starter다.
 *   무료는 1회뿐이라 구간이 벌어지고, Business의 차이는 측정 횟수가 아니라
 *   범위(브랜드·질의 수)다.
 */
const RECOMMENDED: PlanId = 'starter'

/**
 * 권장 열의 바닥.
 *
 * ★ 알파가 아니라 **미리 섞은 불투명색**이다. `bg-primary/[0.09]`로 두면 밑에
 *   깔린 유리 패널의 반투명 껍데기가 그대로 비쳐서 틴트가 의도보다 밝아진다
 *   (Task 4에서 벤토 셀이 정확히 그렇게 무너졌다). 토큰을 참조하므로 표면이
 *   바뀌면 따라 바뀐다.
 *   대비 실측: 카드 대비 1.11:1(띠로만 읽힌다) · 그 위 본문 15.16:1 ·
 *   보조 텍스트 6.67:1 · 브랜드색 6.66:1로 전부 AA를 넘는다.
 */
const RECOMMENDED_TINT = 'bg-[color-mix(in_oklch,var(--card),var(--primary)_9%)]'

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

interface Row {
  label: string
  value: (id: PlanId) => React.ReactNode
}

/**
 * 비교 항목. 월 요금은 여기 없다 — 열 머리에서 큰 조판으로 보여준다.
 *
 * 무리 이름은 지어낸 단계 이름이 아니라 항목이 실제로 무엇을 정하는지다
 * (§9.F: "Stage 1 / Step 2" 꼴 금지).
 */
const GROUPS: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: '측정',
    rows: [
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
                브랜드 <Num>{PLANS[id].maxBrands}</Num>개에 나눠 사용
              </span>
            </>
          ) : (
            countCell(PLANS[id].maxQueries, '개')
          ),
      },
      { label: '측정 횟수', value: cadenceCell },
      { label: '엔진', value: (id) => engineLabels(PLANS[id].engines).join(', ') },
    ],
  },
  {
    title: '범위',
    rows: [
      { label: '경쟁사', value: (id) => countCell(PLANS[id].maxCompetitors, '개') },
      { label: '브랜드', value: (id) => countCell(PLANS[id].maxBrands, '개') },
    ],
  },
  {
    title: '기록',
    rows: [
      { label: '이력 보관', value: (id) => historyCell(PLANS[id].historyMonths) },
      // '없음'이지 대시가 아니다. 마케팅 화면에서 em-dash는 쓰지 않고(tasteskill §9.G),
      // 표 안의 대시는 "값이 없다"인지 "해당 없음"인지도 읽는 사람이 추측하게 만든다.
      { label: 'CSV 내보내기', value: (id) => (PLANS[id].csvExport ? '가능' : '없음') },
    ],
  },
]

/** 권장 표시. 열 머리와 모바일 블록이 같은 것을 쓴다. */
function RecommendedMark() {
  return <p className="text-xs font-medium tracking-wide text-primary">권장</p>
}

/** 열 머리·모바일 블록의 요금 조판. */
function PlanPrice({ id }: { id: PlanId }) {
  return (
    <p className="mt-4 text-2xl font-semibold tracking-tighter">
      {priceCell(PLANS[id].priceKrw)}
      {PLANS[id].priceKrw > 0 && (
        <span className="ml-1 text-sm font-normal text-muted-foreground">/ 월</span>
      )}
    </p>
  )
}

export default function PricingPage() {
  return (
    // `pt-24`는 여백 취향이 아니라 **떠 있는 머리글의 자리**다. 마케팅 머리글은
    // `fixed`(높이 72px)라 문서 흐름을 차지하지 않는다. 이보다 줄이면 첫 줄이
    // 유리 알약 밑으로 들어간다.
    <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-28 md:pb-40">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">요금제</p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        측정 횟수가 곧 신뢰구간의 넓이입니다
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        같은 질문을 여러 번 물어야 답이 흔들리는 폭을 알 수 있습니다. 요금제의 차이는 기능이
        아니라 <strong className="font-medium text-foreground">몇 번 재는지</strong>입니다.
      </p>

      {/* ── 비교 원장 ────────────────────────────────────────
          한 표면 안에서 조판만 갈린다. 좁은 화면은 플랜별 블록, 넓은 화면은
          표다. 나란히 놓는 것이 목적이므로 넓은 화면에서는 표를 쓴다 —
          무료의 "1회 (단발)"과 "이력 없음"이 유료 열 옆에 붙어 있어야
          차이가 눈으로 보인다. */}
      <Reveal index={0} className="mt-16">
        <SpecimenSheet>
          {/* 좁은 화면: 플랜마다 한 블록. 카드를 세 개 겹쳐 놓지 않는다 —
              패널 안에 또 카드를 넣으면 테두리가 두 겹이 된다. */}
          <div className="divide-y divide-border lg:hidden">
            {ORDER.map((id) => (
              <div
                key={id}
                className={cn('p-6 sm:p-8', id === RECOMMENDED && RECOMMENDED_TINT)}
              >
                {id === RECOMMENDED && <RecommendedMark />}
                <h2 className="mt-1 text-lg font-semibold tracking-tight">
                  {PLAN_META[id].name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{PLAN_META[id].tagline}</p>
                <PlanPrice id={id} />

                {/* 무리 제목이 목록과 실제로 이어져 있어야 한다. 넓은 화면의
                    `<th scope="rowgroup">`이 하는 일을 여기서는 `aria-labelledby`가
                    한다 — 제목을 `<h3>`로 올리면 플랜 셋 × 무리 셋 = 아홉 개
                    제목이 문서 개요에 얹혀서, 화면에서 훑는 사람과 개요로 훑는
                    사람이 서로 다른 페이지를 보게 된다. */}
                {GROUPS.map((group, groupIndex) => {
                  const titleId = `plan-${id}-group-${groupIndex}`
                  return (
                    <div key={group.title} className="mt-6">
                      <p
                        id={titleId}
                        className="text-xs font-medium tracking-wide text-muted-foreground"
                      >
                        {group.title}
                      </p>
                      <dl aria-labelledby={titleId} className="mt-2 space-y-2 text-sm">
                        {group.rows.map((row) => (
                          <div key={row.label} className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">{row.label}</dt>
                            <dd className="text-right">{row.value(id)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* 넓은 화면: 표 */}
          <div className="hidden p-8 lg:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">플랜별 측정 조건 비교</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[26%] border-b border-border pb-5 text-left" />
                  {ORDER.map((id) => (
                    <th
                      key={id}
                      scope="col"
                      className={cn(
                        'border-b border-border px-5 pb-5 text-left align-bottom',
                        id === RECOMMENDED && RECOMMENDED_TINT,
                      )}
                    >
                      {id === RECOMMENDED && <RecommendedMark />}
                      <span className="mt-1 block text-base font-semibold tracking-tight">
                        {PLAN_META[id].name}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {PLAN_META[id].tagline}
                      </span>
                      <PlanPrice id={id} />
                    </th>
                  ))}
                </tr>
              </thead>
              {GROUPS.map((group) => (
                <tbody key={group.title}>
                  {/* 무리 머리. 선은 여기 한 줄뿐이고 행마다 긋지 않는다.
                      뒤따르는 빈 칸들은 선과 틴트 띠를 잇기 위한 것뿐이라
                      보조기술에서 숨긴다 — 안 숨기면 무리마다 "빈 셀" 셋을
                      읽고 지나간다. */}
                  <tr>
                    <th
                      scope="rowgroup"
                      className="border-t border-border pt-7 pb-2 text-left text-xs font-medium tracking-wide text-muted-foreground"
                    >
                      {group.title}
                    </th>
                    {ORDER.map((id) => (
                      <td
                        key={id}
                        aria-hidden="true"
                        className={cn(
                          'border-t border-border',
                          id === RECOMMENDED && RECOMMENDED_TINT,
                        )}
                      />
                    ))}
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="py-2.5 text-left font-normal text-muted-foreground">
                        {row.label}
                      </th>
                      {ORDER.map((id) => (
                        <td
                          key={id}
                          className={cn(
                            'px-5 py-2.5 align-top',
                            id === RECOMMENDED && RECOMMENDED_TINT,
                          )}
                        >
                          {row.value(id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
              {/* 틴트 띠가 마지막 행의 글자 밑줄에서 뚝 끊기지 않게 받치는 줄.
                  무리 사이에서는 다음 무리 머리의 `pt-7`이 같은 몫을 하므로
                  띠는 표 전체에 끊기지 않고 이어진다.
                  내용이 없는 순수 여백이라 행 전체를 보조기술에서 숨긴다. */}
              <tbody aria-hidden="true">
                <tr>
                  <td className="h-5" />
                  {ORDER.map((id) => (
                    <td key={id} className={cn(id === RECOMMENDED && RECOMMENDED_TINT)} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </SpecimenSheet>
      </Reveal>

      {/* ── 질의 팩 ──────────────────────────────────────────
          카드를 만들지 않는다. 두 문장이고, 위아래 여백이 이미 챕터를 가른다
          (§14 "Cards omitted in favor of spacing"). */}
      <Reveal index={0} className="mt-20 max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">질의를 더 넣고 싶으면</h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          질의 <Num>{QUERY_PACK_SIZE}</Num>개 단위로 추가할 수 있습니다. 월{' '}
          <Num>{QUERY_PACK_PRICE_KRW.toLocaleString('ko-KR')}</Num>원입니다. 질의를 늘리면 측정
          횟수가 그만큼 늘어나므로 원가가 그대로 따라옵니다.
        </p>
      </Reveal>

      {/* ── 정직 블록 + 유일한 행동 ──────────────────────────
          마감은 랜딩과 같은 어휘다: 상자 없이 위아래 헤어라인 사이에 문장과
          버튼 하나(landing closing-cta.tsx). 색면을 반전시키지 않는다 — 다크
          페이지 한가운데가 라이트로 뒤집히면 Page Theme Lock(§4.11) 위반이다. */}
      <Reveal index={0} className="mt-14">
        <div className="border-y border-border py-12 sm:py-14">
          <p className="max-w-[46em] text-base leading-relaxed text-muted-foreground">
            유료 플랜과 결제는 아직 열리지 않았습니다. 지금 신청할 수 있는 것은 무료 진단입니다.
            위 조건은 유료 오픈 시점에 그대로 적용됩니다.
          </p>
          <div className="mt-8">
            <CtaLink href="/audit/new">무료 진단 받기</CtaLink>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
