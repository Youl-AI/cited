import Link from 'next/link'
import { AnswerSpecimen } from '@/components/audit/answer-specimen'
import type { SpecimenMark } from '@/components/audit/answer-specimen'
import { Button } from '@/components/ui/button'
import type { AuditResult } from '@/lib/audit/result'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'
import type { Interval } from '@/lib/stats/wilson'

/**
 * 무료 진단 리포트 화면. 서버 컴포넌트다 — 상태가 없다.
 *
 * 메일 템플릿(`auditReportEmail`)과 **같은 데이터를 같은 순서로** 그린다.
 * 순서가 다르면 메일을 보고 링크를 누른 사람이 다른 문서를 만난다.
 *
 * ## 조판 규칙
 *
 * **sans는 말, mono는 계측값.** 언급률·구간·엔진 이름·도메인·표기는 전부 mono다.
 * 우리가 잰 것과 사람이 쓴 말을 서체로 갈라 두면, 화면 어디서든 "이건 우리가
 * 측정한 숫자"임이 읽기 전에 보인다. 이 규칙을 섞으면 그 신호가 사라진다.
 */

/** 계측값 조판 — 이 파일 안에서 숫자는 반드시 이걸 통과한다. */
function Metric({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">{children}</h2>
  )
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 text-sm text-muted-foreground">{children}</p>
}

/** 신뢰구간 띠. 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다. */
function IntervalBar({ interval }: { interval: Interval }) {
  const left = interval.lower * 100
  const width = Math.max((interval.upper - interval.lower) * 100, 0.75)
  const point = interval.point * 100
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
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

export function ResultView({ result }: { result: AuditResult }) {
  const rate = formatPercent(result.citedRate.point)
  const measuredOn = result.measuredAt.slice(0, 10)

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-14 sm:py-20">
      {/* ── 표제 ─────────────────────────────────────────────── */}
      <header className="mb-10">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          무료 진단 리포트
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
        className="mb-10 rounded-lg border border-border bg-card p-6 sm:p-7"
      >
        <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-5xl font-semibold tracking-tighter tabular-nums">
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

      {/* ── 이 숫자를 어떻게 읽어야 하는가 ───────────────────── */}
      <section className="mb-10 border-l-2 border-border pl-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          무료 진단은 질의 <Metric>3</Metric>개를 <Metric>1</Metric>회 측정합니다. 그래서
          구간이 <Metric>{formatInterval(result.citedRate)}</Metric>로 넓습니다 — 실제 값은 이
          범위 안 어디든 될 수 있다는 뜻입니다. 1회 측정으로는 변화를 알 수 없습니다.
        </p>
      </section>

      {result.shareOfVoice.n > 0 && (
        /* ★ n=0이면 이 블록이 아예 없다. 0%도 '측정 없음'도 아니다 —
           "우리만 등록했으니 점유율 100%"는 거짓말이고, 없는 것을 설명하려 들면
           혼란만 준다. 경쟁사 목록을 항상 옆에 붙이는 것도 같은 이유다:
           경쟁사를 적게 등록하면 이 값이 높아지므로 분모를 감추면 오해가 된다. */
        <section className="mb-10">
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
      <section className="mb-10">
        <SectionHeading>브랜드별 언급 횟수</SectionHeading>
        <SectionNote>같은 답변 안에서 어떤 브랜드가 몇 번 등장했는지입니다.</SectionNote>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {result.ranking.map((item) => (
            <li
              key={item.name}
              data-testid="ranking-row"
              className="flex items-baseline justify-between gap-4 px-5 py-3"
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
      <section className="mb-10">
        <SectionHeading>질문별 결과</SectionHeading>
        {/* metrics가 이미 언급률 낮은 순으로 준다. 여기서 다시 정렬하지 않는다 —
            "이 질문에서 안 나온다"가 위로 와야 행동으로 이어진다. */}
        <SectionNote>못 나오는 질문이 위에 옵니다. 손볼 곳이 거기입니다.</SectionNote>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {result.byQuery.map((q) => (
            <li key={q.queryText} data-testid="query-row" className="px-5 py-3.5">
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
      <section className="mb-10">
        <SectionHeading>실제 AI 답변</SectionHeading>
        <SectionNote>
          같은 질문을 직접 물어보시면 비슷한 답을 확인하실 수 있습니다. 밑줄은 우리가 센
          브랜드이고, 표시가 없는 브랜드는 등록되지 않아 세지 않은 것입니다.
        </SectionNote>
        <div className="space-y-4">
          {result.evidence.map((item, index) => (
            <AnswerSpecimen
              key={`${item.query}-${item.engineId}-${index}`}
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
          ))}
        </div>
      </section>

      {result.sources.length > 0 && (
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
                className="flex items-baseline justify-between gap-4 px-5 py-3"
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

      {/* ── 측정 조건 ────────────────────────────────────────── */}
      <section className="mb-10 rounded-lg bg-muted/40 px-5 py-4">
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

      {/* ── 유료 전환 ────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-6 sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight">
          이 리포트는 <Metric>1</Metric>회 측정입니다
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          그래서 구간이 <Metric>{formatInterval(result.citedRate)}</Metric>로 넓습니다. 주{' '}
          <Metric>3</Metric>회 측정하면 이 구간이 좁아지고, 지난주와 비교해 변화가 실제인지
          측정 오차인지 판정할 수 있습니다.
        </p>
        <Button asChild className="mt-5">
          <Link href="/pricing">요금제 보기</Link>
        </Button>
      </section>
    </div>
  )
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
  if (!result.hasSelfDomains) {
    return (
      <p className="mb-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        사이트 주소를 알려주시면 다음 측정에서 {result.brandName} 사이트가 인용되는지 함께
        확인해 드립니다.
      </p>
    )
  }
  if (result.sourceSummary.selfAnswers > 0) {
    return (
      <p className="mb-4 rounded-lg border border-metric-up/30 bg-metric-up/5 px-4 py-3 text-sm text-metric-up-fg">
        {result.brandName} 사이트는 <Metric>{result.sourceSummary.selfAnswers}</Metric>개
        답변에서 인용됐습니다.
      </p>
    )
  }
  return (
    <p className="mb-4 rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm text-incomplete-fg">
      <strong className="font-semibold">
        {result.brandName} 사이트는 한 번도 인용되지 않았습니다.
      </strong>{' '}
      AI는 아래 사이트들을 읽고 답을 만들고 있습니다.
    </p>
  )
}
