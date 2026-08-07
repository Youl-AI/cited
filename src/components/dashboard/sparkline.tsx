/**
 * 스파크라인 — KPI 타일의 추세 조각(dataviz 스탯 타일 계약: label · value ·
 * delta · **trend**).
 *
 * ## 바닥은 0, 천장은 데이터
 *
 * 스파크라인은 눈금도 라벨도 없다. 그래서 **자기 최소~최대로 스케일을 잡으면
 * 잡음이 추세로 보인다** — 45%와 47% 사이를 오간 계열이 화면 전체를 위아래로
 * 가로지르는 그림이 된다. 바닥은 0에 고정해 비율 관계를 지키고(두 배가 된 값은
 * 두 배로 보인다), 천장만 계열 최댓값에 맞춘다 — 천장까지 고정하면 실제 변화가
 * 납작한 선이 되어 아무것도 말하지 않는다. 천장 선정은 `kpi.ts`가 한다.
 *
 * ## 마지막 점만 강조한다
 *
 * 지난 구간은 연한 톤, 현재 값만 액센트 점 하나(dataviz: "current period in
 * the accent"). 점을 전부 찍으면 타일 안의 40px짜리 그림에서 서로 뭉개진다.
 *
 * ★ 값은 여기서 읽는 것이 아니다 — 타일의 큰 숫자와 델타 배지가 값을 말하고,
 *   이 그림은 **모양**만 말한다. 그래서 `aria-hidden`이다(보조기기에 축 없는
 *   폴리라인을 읽어 줘야 할 것이 없다).
 */
export function Sparkline({
  id,
  series,
  max,
}: {
  /**
   * 그라디언트 정의의 이름표. 한 페이지에 스파크라인이 셋이라 `<defs>` id가
   * 겹치면 **나중 것이 앞 것을 덮어쓴다** — 서버 컴포넌트라 `useId`를 쓸 수
   * 없으므로 호출부가 이미 유일한 값(`kpi.id`)을 넘긴다.
   */
  id: string
  /** 오래된 → 최신 순. 2개 미만이면 그리지 않는다(선이 될 수 없다). */
  series: readonly number[]
  /** y축 상한 — 계열 최댓값(`kpi.ts`가 정한다). 바닥은 언제나 0이다. */
  max: number
}) {
  if (series.length < 2) return null

  const W = 120
  const H = 44
  const PAD = 3
  // 천장에 15% 여유 — 최댓값 점이 상자 모서리에 붙으면 잘린 것처럼 보인다.
  const top = Math.max(max, 1e-6) * 1.15
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (series.length - 1)
  const y = (v: number) => H - PAD - (Math.min(v / top, 1) * (H - PAD * 2))

  const d = series.map((v, i) => `${x(i)},${y(v)}`).join(' L ')
  const lastX = x(series.length - 1)
  const lastY = y(series[series.length - 1]!)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-11 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* 채움은 선 아래를 아주 옅게 — 면적이 아니라 선의 무게추다.
          (dataviz: area fill은 계열 색의 ~10% wash)
          ★ 위(선)에서 아래로 **사라지는** 그라디언트다. 반대로 아래가 진하면
            면적이 값을 주장하는 그림이 되는데, 이 그림은 값을 말하지 않는다. */}
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`M ${d} L ${lastX},${H} L ${PAD},${H} Z`} fill={`url(#spark-${id})`} />
      {/* 드로우인은 큰 차트와 같은 클래스다 — 같은 화면의 선들이 같은 속도로
          그려져야 한다(§6). `pathLength={1}`이라 서버 컴포넌트에서도 CSS만으로 돈다. */}
      <path
        className="chart-draw"
        pathLength={1}
        d={`M ${d}`}
        fill="none"
        stroke="var(--primary)"
        strokeOpacity={0.65}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        className="chart-pop"
        style={{ animationDelay: 'var(--motion-draw)' }}
        cx={lastX}
        cy={lastY}
        r={2.5}
        fill="var(--primary)"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
