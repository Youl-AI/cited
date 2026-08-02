import { buildHeatmap, type RunPoint } from '@/lib/dashboard/data'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 질의 × 회차 히트맵 (디자인 언어 §4.2). 채움은 --primary 단색 램프
 * (P = round(6 + 74 × point)) — 방향이 아니라 강도다. 셀 텍스트는 k/n —
 * 분모가 곧 오차의 크기라서 퍼센트 대신 쓴다.
 *
 * ★ 행 순서는 최신 회차의 `byQuery` 순서(언급률 낮은 질문이 위)다.
 *   `buildHeatmap`이 이 순서로 주므로 여기서 다시 정렬하지 않는다 (§4.2).
 */
export function QueryHeatmap({ points }: { points: RunPoint[] }) {
  const heat = buildHeatmap(points, 8)
  if (heat.runs.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
              질문 · 못 나오는 것부터
            </th>
            {heat.runs.map((r) => (
              <th key={r.runId} scope="col" className="px-2 py-2.5 text-center font-mono text-xs font-normal text-muted-foreground">
                {`${r.measuredAt.slice(5, 7)}.${r.measuredAt.slice(8, 10)}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.rows.map((row, rowIndex) => (
            // key에 인덱스를 섞는 이유: buildHeatmap의 행에는 id가 없고 질의
            // 텍스트가 중복될 수 있다 — 텍스트만 쓰면 key가 충돌한다.
            <tr key={`${rowIndex}-${row.queryText}`} className="border-b border-border last:border-b-0">
              <th scope="row" className="max-w-64 truncate px-4 py-2 text-left text-sm font-normal">
                {row.queryText}
              </th>
              {row.cells.map((cell, i) => {
                const run = heat.runs[i]!
                if (cell === null) {
                  return (
                    <td key={run.runId} aria-label="측정 없음" className="px-2 py-2 text-center font-mono text-xs text-muted-foreground">
                      —
                    </td>
                  )
                }
                const p = Math.round(6 + 74 * cell.point)
                return (
                  <td
                    key={run.runId}
                    className="px-2 py-2 text-center font-mono text-xs tabular-nums"
                    style={{
                      background: `color-mix(in oklab, var(--primary) ${p}%, transparent)`,
                      color: p >= 50 ? 'var(--primary-foreground)' : 'var(--foreground)',
                    }}
                    title={`${row.queryText} · ${run.measuredAt.slice(5, 7)}.${run.measuredAt.slice(8, 10)} · ${formatPercent(cell.point)} (${formatInterval(cell)})`}
                  >
                    {cell.k}/{cell.n}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
