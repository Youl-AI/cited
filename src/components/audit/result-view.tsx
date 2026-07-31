import Link from 'next/link'
import Markdown from 'react-markdown'
import { AnswerSpecimen } from '@/components/audit/answer-specimen'
import type { SpecimenMark } from '@/components/audit/answer-specimen'
import { ReportCover } from '@/components/audit/report-cover'
import { Button } from '@/components/ui/button'
import type { AuditResult } from '@/lib/audit/result'
import { isPaidTier } from '@/lib/audit/tiers'
import type { AuditTier } from '@/lib/audit/tiers'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent, judgeChange } from '@/lib/stats/wilson'
import type { ChangeVerdict, Interval } from '@/lib/stats/wilson'

/**
 * 진단 리포트 화면. 서버 컴포넌트다 — 상태가 없다.
 *
 * 메일 템플릿(`auditReportEmail`)과 **같은 데이터를 같은 순서로** 그린다.
 * 순서가 다르면 메일을 보고 링크를 누른 사람이 다른 문서를 만난다.
 *
 * 유료 확장(가이드·전후 비교)은 데이터가 있을 때만 그린다 — 빈 섹션으로
 * 약속을 보여주지 않는다.
 *
 * ## 조판 규칙
 *
 * **sans는 말, mono는 계측값.** 언급률·구간·엔진 이름·도메인·표기는 전부 mono다.
 * 우리가 잰 것과 사람이 쓴 말을 서체로 갈라 두면, 화면 어디서든 "이건 우리가
 * 측정한 숫자"임이 읽기 전에 보인다. 이 규칙을 섞으면 그 신호가 사라진다.
 * 개선 가이드가 sans인 것도 같은 규칙이다 — 그건 계측이 아니라 사람의 말이다.
 */

/** 계측값 조판 — 이 파일 안에서 숫자는 반드시 이걸 통과한다. */
function Metric({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  // ★ `print:break-after-avoid` — 한 장에 다 안 들어가 섹션이 쪼개질 때도
  //   제목만 앞 장 끝에 홀로 남지 않게 한다(제목·본문 고아 방지).
  // ★ `print:text-2xl` — 종이는 화면보다 멀리서 읽힌다(px→pt 축소 포함).
  //   화면 크기(lg/xl) 그대로 찍으면 본문(sm)과의 위계 차가 종이에서 약해진다.
  return (
    <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl print:break-after-avoid print:text-2xl">
      {children}
    </h2>
  )
}

function SectionNote({ children }: { children: React.ReactNode }) {
  // `print:break-after-avoid` — 제목과 같은 이유. 설명 문장이 앞 장 끝에
  // 남고 내용물이 다음 장으로 가면 문장이 가리키는 대상이 사라진다.
  // `print:break-inside-avoid` — 실측: 두 줄짜리 설명이 장 경계에서 문장
  // 중간에 갈라졌다. 두 줄을 반으로 쪼갤 바에야 통째로 다음 장으로 보낸다.
  return (
    <p className="mb-5 text-sm text-muted-foreground print:break-after-avoid print:break-inside-avoid">
      {children}
    </p>
  )
}

/** 신뢰구간 띠. 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다. */
function IntervalBar({ interval }: { interval: Interval }) {
  const left = interval.lower * 100
  const width = Math.max((interval.upper - interval.lower) * 100, 0.75)
  const point = interval.point * 100
  return (
    <div
      // `print:h-2` — 화면의 1.5(6px)는 종이에서 4.5pt 남짓으로 얇아져
      // 띠 안의 점추정 눈금이 뭉개진다. 실측으로 한 단만 올린다.
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted print:h-2"
      role="img"
      aria-label={`신뢰구간 ${formatInterval(interval)}`}
    >
      <div
        className="absolute inset-y-0 rounded-full bg-ci-band"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <div
        className="absolute inset-y-0 w-[2px] rounded-full bg-primary"
        style={{ left: `calc(${point}% - 1px)` }}
      />
    </div>
  )
}

export function ResultView({
  result,
  tier = 'free',
  guide,
  compare,
}: {
  result: AuditResult
  tier?: AuditTier
  /** 운영자가 쓴 개선 가이드(마크다운). DELUXE부터. */
  guide?: string
  /** PREMIUM 재측정의 원본. 있으면 전후 비교를 그린다. */
  compare?: { before: AuditResult; beforeDate: string }
}) {
  const rate = formatPercent(result.citedRate.point)
  const measuredOn = result.measuredAt.slice(0, 10)

  return (
    // `print:[orphans:3] print:[widows:3]` — 상속되는 속성이라 여기 한 번만
    // 건다. 문단이 장 사이에서 쪼개질 때 한두 줄만 떨어져 남지 않게 한다.
    <div className="mx-auto w-full max-w-3xl px-6 py-14 sm:py-20 print:py-0 print:[orphans:3] print:[widows:3]">
      {/* ── PDF 표지 (유료 전용) ─────────────────────────────── */}
      {/* 화면에는 없다(`hidden print:flex`). 무료는 표지 없이 바로 본문 —
          공짜 PDF에 납품 문서의 옷을 입히지 않는다. */}
      {isPaidTier(tier) && <ReportCover result={result} tier={tier} />}

      {/* ── 표제 ─────────────────────────────────────────────── */}
      <header className="mb-10">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          {/* ★ 유료 리포트에 "무료 진단"이 찍히면 산 것과 받은 것이 다르다. */}
          {isPaidTier(tier) ? '정밀 진단 리포트' : '무료 진단 리포트'}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {result.brandName}
        </h1>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {result.category} · {result.engines.map(engineLabel).join(' · ')} · {measuredOn}
        </p>
      </header>

      {/* ── 대표 지표 ────────────────────────────────────────── */}
      <section
        data-testid="headline"
        className="mb-10 rounded-lg border border-border bg-card p-6 sm:p-7 print:break-inside-avoid"
      >
        <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          {/* `print:text-6xl` — 이 숫자가 문서 전체의 대표 계측값이다.
              종이에서는 화면의 5xl이 36pt 남짓으로 줄어 존재감이 빠진다. */}
          <span className="font-mono text-5xl font-semibold tracking-tighter tabular-nums print:text-6xl">
            {rate}
          </span>
          {/* ★ 큰 숫자 옆에 구간을 반드시 붙인다. 33% 단독 노출은 거짓말이다 —
              3회 측정 1건의 구간은 2%~87%다. */}
          <span className="font-mono text-sm text-muted-foreground">
            {formatInterval(result.citedRate)}
          </span>
        </div>
        <div className="mt-4">
          <IntervalBar interval={result.citedRate} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          답변 <Metric>{result.totalAnswers}</Metric>개 중{' '}
          <Metric>{result.citedRate.k}</Metric>개에서 언급됐습니다.
        </p>
      </section>

      {/* ── 전후 비교 (PREMIUM) ──────────────────────────────── */}
      {/* 요약 바로 다음이다 — PREMIUM 구매자가 산 것이 바로 이 비교다. */}
      {compare && (
        <CompareSection before={compare.before} beforeDate={compare.beforeDate} result={result} />
      )}

      {/* ── 이 숫자를 어떻게 읽어야 하는가 ───────────────────── */}
      <section className="mb-10 border-l-2 border-border pl-5 print:break-inside-avoid">
        {tier === 'free' ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            무료 진단은 질의 <Metric>3</Metric>개를 <Metric>1</Metric>회 측정합니다. 그래서
            구간이 <Metric>{formatInterval(result.citedRate)}</Metric>로 넓습니다 — 실제 값은 이
            범위 안 어디든 될 수 있다는 뜻입니다. 1회 측정으로는 변화를 알 수 없습니다.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            이 진단은 질의 <Metric>{result.byQuery.length}</Metric>개로 답변{' '}
            <Metric>{result.totalAnswers}</Metric>개를 측정했습니다. 실제 값은 구간{' '}
            <Metric>{formatInterval(result.citedRate)}</Metric> 안 어디든 될 수 있습니다 — 점
            하나가 아니라 구간으로 읽어 주세요.
          </p>
        )}
      </section>

      {result.shareOfVoice.n > 0 && (
        /* ★ n=0이면 이 블록이 아예 없다. 0%도 '측정 없음'도 아니다 —
           "우리만 등록했으니 점유율 100%"는 거짓말이고, 없는 것을 설명하려 들면
           혼란만 준다. 경쟁사 목록을 항상 옆에 붙이는 것도 같은 이유다:
           경쟁사를 적게 등록하면 이 값이 높아지므로 분모를 감추면 오해가 된다. */
        <section className="mb-10 print:break-inside-avoid">
          <SectionHeading>언급 점유율</SectionHeading>
          <SectionNote>
            등록한 경쟁사({result.competitors.join(', ')}) 대비 언급 비중입니다. 경쟁사를 더
            등록하면 이 값은 달라집니다.
          </SectionNote>
          <div className="flex flex-wrap items-baseline gap-x-3 rounded-lg border border-border bg-card px-5 py-4">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatPercent(result.shareOfVoice.point)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatInterval(result.shareOfVoice)}
            </span>
          </div>
        </section>
      )}

      {result.unresolved > 0 && (
        <p className="mb-10 rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm text-incomplete-fg">
          <Metric>{result.unresolved}</Metric>건은 판정하지 못해 결과에서 제외했습니다.
        </p>
      )}

      {/* ── 브랜드별 언급 ────────────────────────────────────── */}
      <section className="mb-10 print:break-inside-avoid">
        <SectionHeading>브랜드별 언급 횟수</SectionHeading>
        <SectionNote>같은 답변 안에서 어떤 브랜드가 몇 번 등장했는지입니다.</SectionNote>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {result.ranking.map((item) => (
            <li
              key={item.name}
              data-testid="ranking-row"
              className="flex items-baseline justify-between gap-4 px-5 py-3 print:break-inside-avoid"
            >
              <span
                className={
                  item.isSelf ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }
              >
                {item.name}
                {item.isSelf && (
                  <span className="ml-2 font-mono text-[0.625rem] tracking-[0.08em] text-primary uppercase">
                    우리
                  </span>
                )}
              </span>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {item.mentions} / {result.totalAnswers}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 질의별 ───────────────────────────────────────────── */}
      {/* ★ 섹션 자체에는 break-inside-avoid를 걸지 않는다. 유료는 질의가
          10개라 섹션이 한 장 가까이 되고, 통째로 다음 장에 밀면 앞 장의
          반이 빈다(실측 — 리본요가 PDF에서 3~4쪽 하단 30~45%가 비었다).
          행 단위 avoid + 제목의 break-after-avoid로 충분하다. */}
      <section className="mb-10">
        <SectionHeading>질문별 결과</SectionHeading>
        {/* metrics가 이미 언급률 낮은 순으로 준다. 여기서 다시 정렬하지 않는다 —
            "이 질문에서 안 나온다"가 위로 와야 행동으로 이어진다. */}
        <SectionNote>못 나오는 질문이 위에 옵니다. 손볼 곳이 거기입니다.</SectionNote>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {result.byQuery.map((q) => (
            <li
              key={q.queryText}
              data-testid="query-row"
              className="px-5 py-3.5 print:break-inside-avoid"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm">{q.queryText}</span>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {formatPercent(q.interval.point)}
                </span>
              </div>
              <div className="mt-2">
                <IntervalBar interval={q.interval} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 증거 ─────────────────────────────────────────────── */}
      {/* 섹션 avoid 없음 — 질의별과 같은 이유(표본 6개면 여러 장이다).
          표본 하나하나가 아래에서 avoid를 건다. */}
      <section className="mb-10">
        <SectionHeading>실제 AI 답변</SectionHeading>
        <SectionNote>
          같은 질문을 직접 물어보시면 비슷한 답을 확인하실 수 있습니다. 밑줄은 우리가 센
          브랜드이고, 표시가 없는 브랜드는 등록되지 않아 세지 않은 것입니다.
        </SectionNote>
        <div className="space-y-4">
          {/* ★ 표본 하나가 장 사이에서 쪼개지면 질문과 답이 다른 장에 놓인다.
              한 장을 넘는 표본은 브라우저가 avoid를 무시하고 자연스럽게 자른다. */}
          {result.evidence.map((item, index) => (
            <div
              key={`${item.query}-${item.engineId}-${index}`}
              className="print:break-inside-avoid"
            >
              <AnswerSpecimen
                engineId={engineLabel(item.engineId)}
                query={item.query}
                text={item.text}
                marks={evidenceMarks(result, item.mentioned, item.position)}
                footer={
                  item.mentioned ? (
                    <span className="text-metric-up-fg">언급됨{item.context ? ` · ${item.context}` : ''}</span>
                  ) : (
                    '언급 없음'
                  )
                }
              />
            </div>
          ))}
        </div>
      </section>

      {result.sources.length > 0 && (
        /* 섹션 avoid 없음 — 도메인 8행 + 요약이면 장 하단에서 시작해도
           행 단위로 자연스럽게 넘어간다. 통째로 밀면 앞 장이 빈다. */
        <section className="mb-10">
          <SectionHeading>AI가 읽는 출처</SectionHeading>
          <SectionNote>
            답변 <Metric>{result.sourceSummary.totalAnswers}</Metric>개 중{' '}
            <Metric>{result.sourceSummary.answersWithCitations}</Metric>개에 인용이 있었고,
            도메인 <Metric>{result.sourceSummary.distinctDomains}</Metric>개가 나왔습니다.
          </SectionNote>

          <SelfCitationLine result={result} />

          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {result.sources.slice(0, 8).map((source) => (
              <li
                key={source.domain}
                className="flex items-baseline justify-between gap-4 px-5 py-3 print:break-inside-avoid"
              >
                <span className="flex items-baseline gap-2 font-mono text-sm">
                  {source.domain}
                  {source.owner === 'self' && (
                    <span className="text-[0.625rem] tracking-[0.08em] text-primary uppercase">
                      우리
                    </span>
                  )}
                  {source.owner === 'competitor' && (
                    <span className="text-[0.625rem] tracking-[0.08em] text-incomplete-fg uppercase">
                      경쟁사
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {source.answers}개 · {formatPercent(source.share.point)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 개선 가이드 (DELUXE·PREMIUM) ─────────────────────── */}
      {/* 출처 다음이다 — 위 데이터(출처·순위)가 가이드의 근거라 순서가 논증이다. */}
      {guide && (
        /* 섹션 avoid 없음 — 가이드는 한 장을 넘는 것이 보통이다. 대신 아래
           컨테이너가 마크다운 요소 단위로 끊김을 제어한다. */
        <section className="mb-10">
          <SectionHeading>개선 가이드</SectionHeading>
          <SectionNote>
            여기부터는 계측이 아니라 해설입니다 — 위 측정 결과를 근거로 운영자가 직접
            썼습니다.
          </SectionNote>
          {/* react-markdown은 rehype-raw 없이는 raw HTML을 렌더하지 않는다 —
              스크립트 주입이 안 된다. `prose`는 여기서 죽은 클래스다(typography
              플러그인 미설치). 마크다운 요소를 직접 조판한다.
              ★ 인쇄 끊김 규칙 — 소제목은 다음 문단과 붙이고(h2·h3 뒤 금지),
                목록 항목·문단은 반으로 쪼개지 않는다. 실측: 가이드가 장 경계에서
                갈리며 마지막 불릿 하나가 다음 장에 홀로 남았다. */}
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-[0.9375rem] leading-relaxed sm:p-7 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:font-mono [&_code]:text-[0.8125rem] [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2:first-child]:mt-0 [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 print:[&_h2]:break-after-avoid print:[&_h3]:break-after-avoid print:[&_li]:break-inside-avoid print:[&_p]:break-inside-avoid">
            <Markdown>{guide}</Markdown>
          </div>
        </section>
      )}

      {/* ── 측정 조건 ────────────────────────────────────────── */}
      <section className="mb-10 rounded-lg bg-muted/40 px-5 py-4 print:break-inside-avoid">
        <p className="text-xs text-muted-foreground">
          측정 표기{' '}
          <span className="font-mono text-foreground">
            {[result.brandName, ...result.aliases].join(', ')}
          </span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          빠진 표기가 있으면 알려주세요. 표기가 빠지면 언급률이 실제보다 낮게 나옵니다.
        </p>
      </section>

      {/* ── 유료 전환 ──────────────────────────────────────────
          ★ 인쇄(PDF)에서는 숨긴다. PDF는 크몽 납품물이고, 납품 문서에 실린
            자사 요금제 유도는 크몽 직거래 유도 정책 위반 소지가 있다 —
            계정 제재 리스크. 화면(웹)에서는 유지한다. */}
      <section className="rounded-lg border border-border bg-card p-6 sm:p-7 print:hidden">
        <h2 className="text-lg font-semibold tracking-tight">
          이 리포트는 <Metric>1</Metric>회 측정입니다
        </h2>
        {tier === 'free' ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            그래서 구간이 <Metric>{formatInterval(result.citedRate)}</Metric>로 넓습니다. 주{' '}
            <Metric>3</Metric>회 측정하면 이 구간이 좁아지고, 지난주와 비교해 변화가 실제인지
            측정 오차인지 판정할 수 있습니다.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            AI 답변은 계속 바뀝니다. 주 <Metric>3</Metric>회 구독 측정은 매주 구간을 다시
            그리고, 변화가 실제인지 측정 오차인지 판정합니다.
          </p>
        )}
        <Button asChild className="mt-5">
          <Link href="/pricing">요금제 보기</Link>
        </Button>
      </section>
    </div>
  )
}

/**
 * PREMIUM 전후 비교.
 *
 * 숫자 두 개를 나란히 놓고, 그 아래 **같은 0~100% 축** 위에 두 구간 띠를
 * 겹쳐 보여준다 — "구간이 겹치는가"가 판정 규칙이므로, 겹침 자체가 눈에
 * 보여야 아래 판정 문장이 그림으로 검증된다.
 *
 * ★ 판정은 `judgeChange` 하나로 한다. 화면이 점추정끼리 따로 비교해서
 *   화살표를 그리면, 대시보드와 리포트가 서로 다른 말을 하게 된다.
 *   엔진 구성도 함께 넘긴다 — 구성이 다른 측정끼리 비교하면 숫자가 떨어진
 *   이유가 실제 하락인지 엔진 누락인지 알 수 없다.
 */
function CompareSection({
  before,
  beforeDate,
  result,
}: {
  before: AuditResult
  beforeDate: string
  result: AuditResult
}) {
  const verdict = judgeChange(before.citedRate, result.citedRate, {
    prevEngines: before.engines,
    currEngines: result.engines,
  })
  return (
    <section className="mb-10 rounded-lg border border-border bg-card p-6 sm:p-7 print:break-inside-avoid">
      <SectionHeading>전후 비교</SectionHeading>
      <SectionNote>
        <Metric>{beforeDate}</Metric> 측정과 같은 질의 <Metric>{result.byQuery.length}</Metric>
        개를 다시 던졌습니다.
      </SectionNote>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-muted-foreground">이전</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {formatPercent(before.citedRate.point)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatInterval(before.citedRate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">이번</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {formatPercent(result.citedRate.point)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {formatInterval(result.citedRate)}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="w-8 shrink-0 text-xs text-muted-foreground">이전</span>
          <IntervalBar interval={before.citedRate} />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 shrink-0 text-xs text-muted-foreground">이번</span>
          <IntervalBar interval={result.citedRate} />
        </div>
      </div>
      {/* ★ 구간이 겹치면 상승처럼 보여도 상승이라고 말하지 않는다. 이 정직함이
          제품의 정체성이다 — 재측정을 판 이유가 바로 "1회 측정으로는 변화를
          모른다"였다. */}
      <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed">
        {changeSentence(verdict)}
      </p>
    </section>
  )
}

function changeSentence(verdict: ChangeVerdict): string {
  switch (verdict) {
    case 'unchanged':
      return '두 측정의 신뢰구간이 겹칩니다 — 차이가 측정 오차 범위 안에 있어, 실제 변화라고 판정할 수 없습니다.'
    case 'up':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 상승입니다.'
    case 'down':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 하락입니다.'
    case 'incomparable':
      return '두 측정의 조건(엔진 구성)이 달라 변화를 비교할 수 없습니다.'
  }
}

/**
 * 증거 원문에 붙일 표시.
 *
 * ★ **등록한 브랜드만** 넘긴다. 답변에 나온 다른 브랜드는 평문으로 남는다 —
 *   우리는 고객이 등록하지 않은 브랜드를 셀 수 없고, 그 사실을 화면이 감추면
 *   Share of Voice를 오해하게 된다.
 *
 * ★ 미언급 답변에는 자기 브랜드 표시를 붙이지 않는다. 판정이 "언급 아님"인데
 *   원문에 표기가 우연히 있으면(동명이의어) 표시가 판정과 어긋난다.
 *
 * ★ 순서 번호는 **자기 브랜드에만** 붙인다. 경쟁사의 답변별 순서는 리포트에
 *   담지 않으므로, 없는 값을 지어내지 않고 밑줄만 긋는다.
 */
function evidenceMarks(
  result: AuditResult,
  mentioned: boolean,
  position: number | null,
): SpecimenMark[] {
  const marks: SpecimenMark[] = result.competitors.map((name) => ({ text: name, isSelf: false }))
  if (mentioned) {
    const self = (text: string): SpecimenMark =>
      position === null ? { text, isSelf: true } : { text, position, isSelf: true }
    marks.push(self(result.brandName))
    for (const alias of result.aliases) marks.push(self(alias))
  }
  return marks
}

/**
 * "우리 사이트가 인용됐는가" 한 줄.
 *
 * ★ `hasSelfDomains`가 false면 `selfAnswers === 0`은 **"모른다"**는 뜻이다.
 *   그것을 "한 번도 인용되지 않았습니다"로 쓰면 리포트의 가장 강한 문장을
 *   근거 없이 만드는 것이 된다. 침묵하지도 않는다 — 왜 그 줄이 없는지 알 수
 *   없으므로 요청으로 바꾼다.
 */
function SelfCitationLine({ result }: { result: AuditResult }) {
  // 세 갈래 모두 `print:break-inside-avoid` — 한두 줄짜리 판정 문장이 장
  // 경계에서 갈라지면 리포트의 가장 강한 문장이 반 토막으로 읽힌다.
  if (!result.hasSelfDomains) {
    return (
      <p className="mb-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground print:break-inside-avoid">
        사이트 주소를 알려주시면 다음 측정에서 {result.brandName} 사이트가 인용되는지 함께
        확인해 드립니다.
      </p>
    )
  }
  if (result.sourceSummary.selfAnswers > 0) {
    return (
      <p className="mb-4 rounded-lg border border-metric-up/30 bg-metric-up/5 px-4 py-3 text-sm text-metric-up-fg print:break-inside-avoid">
        {result.brandName} 사이트는 <Metric>{result.sourceSummary.selfAnswers}</Metric>개
        답변에서 인용됐습니다.
      </p>
    )
  }
  return (
    <p className="mb-4 rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm text-incomplete-fg print:break-inside-avoid">
      <strong className="font-semibold">
        {result.brandName} 사이트는 한 번도 인용되지 않았습니다.
      </strong>{' '}
      AI는 아래 사이트들을 읽고 답을 만들고 있습니다.
    </p>
  )
}
