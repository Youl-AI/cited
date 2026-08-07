import type { RunPoint } from '@/lib/dashboard/data'

/**
 * 브랜드 언급 순위 — 최신 회차의 `ranking`(우리 + 등록 경쟁사, 언급 수
 * 내림차순)을 표로 편다. 같은 카테고리 제품들(Peec의 competitors 테이블)에서
 * 대시보드의 오른쪽 기둥을 맡는 바로 그 표다.
 *
 * ## 정직성 규칙
 *
 * - **개수라서 색·방향 판정이 없다** (`kpi.ts` 머리말의 개수 규칙과 동일).
 *   Peec은 순위 변동에 초록/빨강 화살표를 칠하지만, 언급 수는 표본 개수라
 *   신뢰구간이 없다 — 화살표에 색을 주는 순간 오차 범위의 출렁임이 실적이
 *   된다. 여기는 수치와 막대만 적는다.
 * - **막대는 최신 회차 안에서의 비율**이다(최다 언급 = 가득). 회차끼리의
 *   비교가 아니라 "이번 판에서 누가 얼마나"의 그림이므로 판정이 필요 없다.
 * - 경쟁사 미등록이면 순위가 우리 하나뿐이다 — 그때는 표 대신 등록 안내
 *   한 줄을 낸다(한 줄짜리 순위표는 순위가 아니다).
 */
export function RankingCard({ points }: { points: RunPoint[] }) {
  const latest = points[points.length - 1]
  if (!latest) return null
  const ranking = latest.result.ranking
  if (ranking.length <= 1) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        경쟁사를 등록하면 같은 질문에서 누가 더 자주 언급되는지 순위로 보입니다.
      </p>
    )
  }
  const max = Math.max(...ranking.map((r) => r.mentions), 1)

  return (
    <ol className="space-y-2.5" data-testid="ranking-rows">
      {ranking.map((row, i) => (
        <li key={row.name}>
          <div className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <span className={row.isSelf ? 'text-sm font-semibold' : 'text-sm'}>
              {row.name}
              {row.isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">우리</span>}
            </span>
            <span className="ml-auto font-mono text-sm tabular-nums">
              {row.mentions}
              <span className="ml-0.5 text-xs text-muted-foreground">회</span>
            </span>
          </div>
          {/* 막대 — 이번 회차 최다 언급 대비 비율. 우리 행만 계열색이다
              (§2: 색은 정체를 말한다 — 여기서 색의 뜻은 "우리"뿐이다). */}
          <div className="mt-1 ml-6 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={row.isSelf ? 'h-full rounded-full bg-primary' : 'h-full rounded-full bg-foreground/25'}
              style={{ width: `${Math.max((row.mentions / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
