import { formatInterval } from '@/lib/stats/wilson'
import type { Interval } from '@/lib/stats/wilson'

/**
 * 신뢰구간 띠. 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다.
 *
 * ★ 트랙은 표면 **안으로 파인 홈**이다(`--recess-1` — 입력 칸과 같은 토큰).
 *   버튼이 표면 위로 뜨는 것과 짝이고, 홈이 있어야 그 안의 띠가 "채워진
 *   구간"으로 읽힌다. 평평한 회색 막대 위에 다른 회색 막대를 얹으면 두 층이
 *   같은 깊이에 있어서 어느 쪽이 값인지가 형태로 드러나지 않는다.
 * ★ **치수도 색도 그대로다.** 화면 h-1.5(6px)·인쇄 h-2는 실측으로 정한 값이고
 *   (아래 print 주석), 이 컴포넌트는 대시보드 밖에서도 넷이 쓴다 —
 *   리포트 PDF(`result-view`)와 마케팅 셋(히어로·벤토·실측 재현). 그래서
 *   더한 것은 홈 하나뿐이다. 눈금에 테두리를 둘러 띠와 떼어 놓는 안도
 *   있었지만 접었다: --primary와 --ci-band는 명도가 크게 갈려서 지금도
 *   눈금이 묻히지 않는데, 그 테두리는 눈으로 확인하지 못한 표면 넷에
 *   한꺼번에 나가는 변경이 된다.
 */
export function IntervalBar({ interval }: { interval: Interval }) {
  const left = interval.lower * 100
  const width = Math.max((interval.upper - interval.lower) * 100, 0.75)
  const point = interval.point * 100
  return (
    <div
      // `print:h-2` — 화면의 1.5(6px)는 종이에서 4.5pt 남짓으로 얇아져
      // 띠 안의 점추정 눈금이 뭉개진다. 실측으로 한 단만 올린다.
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted shadow-(--recess-1) print:h-2"
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
