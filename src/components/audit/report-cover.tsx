import type { AuditResult } from '@/lib/audit/result'
import type { AuditTier } from '@/lib/audit/tiers'
import { AUDIT_TIERS } from '@/lib/audit/tiers'
import { engineLabel } from '@/lib/plans'

/**
 * PDF 표지. 화면에는 없다 — 웹은 링크로 들어와 바로 내용을 보는 매체고,
 * PDF는 파일로 전달되는 문서라 "이게 무엇인가"가 첫 장이어야 한다.
 *
 * `h-[26cm]`는 A4(29.7cm)에서 인쇄 여백(위아래 14mm씩)을 뺀 높이 안에
 * 들어가는 값이다 — 표지가 한 장을 꽉 채우되 넘치지 않고,
 * `break-after-page`가 본문을 둘째 장으로 민다.
 *
 * 엔진 이름은 `engineLabel`로 하나씩 매핑한다(`engineLabels`는
 * `readonly EngineId[]`를 요구하는데 저장된 결과의 `engines`는 `string[]`이다).
 * 본문(`ResultView`)과 같은 규칙 — 모르는 엔진 값도 지우지 않고 그대로 남긴다.
 */
export function ReportCover({ result, tier }: { result: AuditResult; tier: AuditTier }) {
  return (
    <section className="hidden print:flex h-[26cm] flex-col justify-between break-after-page">
      <div className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
        cited.co.kr
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">AI 언급 진단 리포트</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight">{result.brandName}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{AUDIT_TIERS[tier].label}</p>
      </div>
      <dl className="grid grid-cols-2 gap-y-2 border-t border-border pt-4 text-sm">
        <dt className="text-muted-foreground">측정일</dt>
        <dd className="font-mono">{result.measuredAt.slice(0, 10)}</dd>
        <dt className="text-muted-foreground">엔진</dt>
        <dd>{result.engines.map(engineLabel).join(' · ')}</dd>
        <dt className="text-muted-foreground">표본</dt>
        <dd>
          질의 <span className="font-mono">{result.byQuery.length}</span>개 · 답변{' '}
          <span className="font-mono">{result.totalAnswers}</span>개
        </dd>
        <dt className="text-muted-foreground">판정 별칭</dt>
        <dd>{result.aliases.join(', ')}</dd>
      </dl>
    </section>
  )
}
