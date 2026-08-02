import { formatInterval } from '@/lib/stats/wilson'
import type { Interval } from '@/lib/stats/wilson'

/** 신뢰구간 띠. 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다. */
export function IntervalBar({ interval }: { interval: Interval }) {
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
