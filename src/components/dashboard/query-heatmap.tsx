import { Card } from '@/components/ui/card'
import { buildHeatmap, type RunPoint } from '@/lib/dashboard/data'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 질의 × 회차 히트맵 (디자인 언어 §4.2). 채움은 --primary 단색 램프
 * (P = round(6 + 74 × point)) — 방향이 아니라 강도다. 셀 텍스트는 k/n —
 * 분모가 곧 오차의 크기라서 퍼센트 대신 쓴다.
 *
 * ★ 행 순서는 최신 회차의 `byQuery` 순서(언급률 낮은 질문이 위)다.
 *   `buildHeatmap`이 이 순서로 주므로 여기서 다시 정렬하지 않는다 (§4.2).
 *
 * ★ Task 7의 변경은 표면뿐이다. **램프 공식·글자색 반전 문턱(P ≥ 50)·`—` 처리·
 *   `title` 문자열은 한 글자도 바뀌지 않았다.** 표를 `Card` 안으로 옮기고,
 *   셀 호버를 보더 하이라이트로 더했다.
 * ★ 호버는 **테두리만** 바꾼다. 셀을 키우거나 채움 농도를 흔들면 그 순간
 *   히트맵이 거짓말을 한다 — 셀의 크기와 농도는 값이지 상태가 아니다.
 * ★ 첫 열(질문)은 가로 스크롤에서 붙잡아 둔다. 회차가 8개까지 늘면 좁은
 *   화면에서 표가 옆으로 밀리는데, 그때 질문 텍스트가 같이 사라지면 남은
 *   숫자들이 무엇에 대한 값인지 알 수 없게 된다. 배경을 `bg-card`로 주는
 *   이유는 카드 내핵과 같은 색이어야 스크롤된 셀이 그 아래로 깨끗이 지나가기
 *   때문이다.
 */
export function QueryHeatmap({ points }: { points: RunPoint[] }) {
  const heat = buildHeatmap(points, 8)
  if (heat.runs.length === 0) return null

  return (
    // 껍질의 세로 여백을 베젤까지 줄인다 — 표는 내핵 가장자리에 붙어야
    // "트레이에 앉은 판"으로 읽힌다. `gap-0`은 자식이 하나뿐이라 형식적이지만,
    // 나중에 캡션이 붙었을 때 카드 기본 간격이 조용히 끼어드는 것을 막는다.
    <Card className="gap-0 py-(--card-bezel)">
      <div className="overflow-x-auto rounded-[var(--card-core-radius)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left text-xs font-medium text-muted-foreground"
              >
                질문 · 못 나오는 것부터
              </th>
              {heat.runs.map((r) => (
                <th
                  key={r.runId}
                  scope="col"
                  className="px-2 py-2.5 text-center font-mono text-xs font-normal tracking-[0.04em] text-muted-foreground"
                >
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
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-64 truncate bg-card px-4 py-2 text-left text-sm font-normal"
                >
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
                      className="px-2 py-2 text-center font-mono text-xs tabular-nums transition-[box-shadow] duration-[var(--motion-micro)] ease-instrument hover:ring-2 hover:ring-foreground/25 hover:ring-inset"
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
    </Card>
  )
}
