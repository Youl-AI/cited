import type { AuditResult } from '@/lib/audit/result'
import type { AuditTier } from '@/lib/audit/tiers'
import { AUDIT_TIERS } from '@/lib/audit/tiers'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * PDF 표지. 화면에는 없다 — 웹은 링크로 들어와 바로 내용을 보는 매체고,
 * PDF는 파일로 전달되는 문서라 "이게 무엇인가"가 첫 장이어야 한다.
 *
 * ## 구성 — 계측기 데이터시트의 첫 장
 *
 * 위에서부터: 발행처 띠(굵은 규칙선 + 워드마크) → 표제부(대표 계측값 포함)
 * → 계측 조건 명세 띠. 장식 없이 규칙선과 조판 위계만으로 "비싼 장비의
 * 성적서" 인상을 만든다. 색은 본문과 같은 팔레트다 — 표지만 다른 옷을
 * 입으면 문서의 일부가 아니라 껍데기처럼 보인다.
 *
 * 대표 계측값(인용률)을 표지에 싣는 이유: 데이터시트가 핵심 스펙을 첫 장에
 * 두는 것과 같다. 단, 구간 없이 싣지 않는다 — 본문 요약 카드와 같은 규칙.
 *
 * `h-[26cm]`는 A4(29.7cm)에서 인쇄 여백(위 14mm + 아래 18mm — 푸터 자리,
 * `scripts/audit-pdf.mts` 참고)을 뺀 26.5cm 안에 들어가는 값이다 —
 * 표지가 한 장을 거의 채우되 넘치지 않고, `break-after-page`가 본문을
 * 둘째 장으로 민다.
 *
 * 엔진 이름은 `engineLabel`로 하나씩 매핑한다(`engineLabels`는
 * `readonly EngineId[]`를 요구하는데 저장된 결과의 `engines`는 `string[]`이다).
 * 본문(`ResultView`)과 같은 규칙 — 모르는 엔진 값도 지우지 않고 그대로 남긴다.
 */

/** 계측 조건 한 줄. 라벨은 말(sans), 값은 호출부가 정한다 — mono는 계측값만. */
function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-6 border-b border-border py-2.5">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function ReportCover({ result, tier }: { result: AuditResult; tier: AuditTier }) {
  return (
    <section className="hidden print:flex h-[26cm] flex-col break-after-page">
      {/* ── 발행처 띠 ─────────────────────────────────────────
          굵은 상단 규칙선이 "문서의 시작"을 선언한다. 워드마크는 사이트
          머리글과 같은 조판(각주 표식 [1] 포함) — 받은 문서와 본 사이트가
          같은 물건이어야 한다. */}
      <div className="flex items-baseline justify-between border-t-[3px] border-foreground pt-3">
        <span className="inline-flex items-baseline gap-px text-lg font-semibold tracking-tight">
          Cited
          <span aria-hidden="true" className="font-mono text-[0.6em] leading-none text-muted-foreground">
            [1]
          </span>
        </span>
        <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
          cited.co.kr
        </span>
      </div>

      {/* ── 표제부 ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col justify-center">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          AI 언급 진단 리포트
        </p>
        <h1 className="mt-4 text-6xl font-semibold tracking-tighter">{result.brandName}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{AUDIT_TIERS[tier].label}</p>

        {/* 대표 계측값. 왼쪽 띠는 브랜드색 = 불확실성의 색 — 본문 신뢰구간
            규칙과 같은 색이 같은 뜻으로 온다. 큰 숫자 옆에 구간을 반드시
            붙인다(본문 요약 카드와 같은 규칙 — 점추정 단독 노출은 거짓말이다). */}
        <div className="mt-12 border-l-2 border-primary pl-5">
          <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">
              {formatPercent(result.citedRate.point)}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatInterval(result.citedRate)}
            </span>
          </p>
        </div>
      </div>

      {/* ── 계측 조건 명세 띠 ─────────────────────────────────
          2px 규칙선 아래 얇은 행 구분선 — 표의 인상을 만들되 표는 아니다.
          값 중 계측값(날짜·개수·엔진 식별자·판정 표기)만 mono다. */}
      <dl className="border-t-2 border-foreground">
        <SpecRow label="측정일">
          <span className="font-mono tabular-nums">{result.measuredAt.slice(0, 10)}</span>
        </SpecRow>
        <SpecRow label="엔진">
          <span className="font-mono">{result.engines.map(engineLabel).join(' · ')}</span>
        </SpecRow>
        <SpecRow label="표본">
          질의 <span className="font-mono tabular-nums">{result.byQuery.length}</span>개 · 답변{' '}
          <span className="font-mono tabular-nums">{result.totalAnswers}</span>개
        </SpecRow>
        <SpecRow label="판정 별칭">
          <span className="font-mono">{result.aliases.join(', ')}</span>
        </SpecRow>
      </dl>
    </section>
  )
}
