import Link from 'next/link'
import { Card } from '@/components/ui/card'
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
  // ★ 빈 상태는 `Card`가 아니라 점선 상자로 남긴다. 카드(트레이+유리판)는
  //   "여기 내용이 있다"는 뜻이고, 점선은 "여기에 채워질 자리다"라는 뜻이다.
  //   반경만 카드와 같은 --radius-xl 가족으로 맞춘다.
  if (items.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-border px-5 py-7 text-sm leading-relaxed text-muted-foreground">
        첫 측정이 끝나면 여기에 회차가 쌓입니다 — 측정은 월·수·금 새벽에 돕니다.
      </p>
    )
  return (
    <Card className="gap-0 py-(--card-bezel)">
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--card-core-radius)]">
        {items.map((item) => {
          const date = item.startedAt.slice(0, 10)
          const inner = (
            <span className="flex items-baseline justify-between gap-4 px-5 py-3">
              <span className="font-mono text-sm tabular-nums">{date}</span>
              {/* ★ 상태 라벨은 **자기 요소 안에 자기 글자만** 담는다. 아래
                  쐐기를 같은 span에 넣으면 그 요소의 텍스트가 "완료›"가 되어,
                  라벨을 정확히 집는 단언(그리고 화면 낭독)이 같이 어긋난다. */}
              <span className="flex items-baseline gap-2">
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
                {/* 어느 행이 눌리는 행인지 커서를 올리기 **전에는** 알 수 없었다
                    (배경이 바뀌는 것이 유일한 신호였다). 스냅샷이 있는 행에만
                    쐐기를 두고, 호버에서 진해지며 한 칸 나아간다.
                    aria-hidden — 링크라는 사실은 이미 역할이 말한다. */}
                {item.hasResult && (
                  <span
                    aria-hidden="true"
                    className="text-sm text-muted-foreground/50 transition-[color,translate] duration-[var(--motion-micro)] ease-instrument group-hover/run:translate-x-0.5 group-hover/run:text-foreground"
                  >
                    ›
                  </span>
                )}
              </span>
            </span>
          )
          return (
            <li key={item.runId} data-testid="run-row">
              {item.hasResult ? (
                <Link
                  href={`/dashboard/runs/${item.runId}`}
                  className="group/run block transition-colors duration-[var(--motion-micro)] ease-instrument hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
