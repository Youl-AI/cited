import Link from 'next/link'
import type { RunListItem } from '@/lib/dashboard/data'
import type { RunStatus } from '@/lib/db/schema'

const STATUS_LABEL: Record<RunStatus, string> = {
  running: '진행 중',
  succeeded: '완료',
  partial: '부분 완료 · 수집 90% 미만',
  failed: '실패',
}

/**
 * 회차 목록 — 실패 회차도 감추지 않는다. 스냅샷 있는 회차만 상세로 간다.
 *
 * ★ `succeeded`인데 `hasResult === false`인 회차가 실제로 존재한다 — 측정은
 *   끝났는데 스냅샷 저장만 실패한 경우다 (`parseRunResult` 주석). 이 회차는
 *   "스냅샷 없음"으로 쓴다. 0%로 그리거나 목록에서 감추면 돈 낸 고객에게
 *   없는 측정을 보여주게 된다 (`RunListItem.hasResult` 주석이 못 박는 계약).
 */
function statusLabel(item: RunListItem): string {
  if (item.status === 'succeeded' && !item.hasResult) return '완료 · 스냅샷 없음'
  return STATUS_LABEL[item.status]
}

export function RunListSection({ items }: { items: RunListItem[] }) {
  // ★ §3 — 빈 상태는 방향을 준다. 동결 직후 첫 cron이 돌기 전의 브랜드가
  //   실제로 이 상태다. 제목 아래를 그냥 비워 두면 고장으로 읽힌다 — 무엇을
  //   기다리는지·언제 오는지를 쓴다 (온보딩 완료 화면의 약속과 같은 말).
  if (items.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-border px-5 py-6 text-sm leading-relaxed text-muted-foreground">
        첫 측정이 끝나면 여기에 회차가 쌓입니다 — 측정은 월·수·금 새벽에 돕니다.
      </p>
    )
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {items.map((item) => {
        const date = item.startedAt.slice(0, 10)
        const inner = (
          <span className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span className="font-mono text-sm tabular-nums">{date}</span>
            <span
              className={`text-sm ${
                item.status === 'failed'
                  ? 'text-metric-down-fg'
                  : item.status === 'partial'
                    ? 'text-incomplete-fg'
                    : 'text-muted-foreground'
              }`}
            >
              {statusLabel(item)}
            </span>
          </span>
        )
        return (
          <li key={item.runId} data-testid="run-row">
            {item.hasResult ? (
              <Link href={`/dashboard/runs/${item.runId}`} className="block transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted/40">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ul>
  )
}
