import type { KpiDelta } from '@/lib/dashboard/kpi'
import { cn } from '@/lib/utils'

/**
 * 전 회차 대비 변화 배지.
 *
 * ## 색은 판정이 준다, 부호가 아니라
 *
 * "▲"만 보고 초록으로 칠하는 것이 이 배지의 유일한 실패 모드다. 우리 숫자는
 * 표본 비율이라 회차마다 흔들리고, 신뢰구간이 겹치는 차이는 **변화가 아니다**
 * (설계 ③). 그래서 색은 `verdict`에서만 온다:
 *
 * | verdict | 색 | 꼬리말 |
 * |---|---|---|
 * | up / down | metric-up-fg / metric-down-fg | (없음 — 부호가 말한다) |
 * | unchanged | metric-flat-fg (무채색) | 오차 범위 |
 * | incomparable | metric-flat-fg | 비교 불가 (숫자 자체를 감춘다) |
 * | null (개수 값) | metric-flat-fg | (없음 — 방향을 판정하지 않는다) |
 *
 * ★ **색만으로 뜻을 싣지 않는다**(dataviz: status는 아이콘+라벨과 함께).
 *   방향은 삼각형 글리프가, 판정은 꼬리말이 함께 말한다. 색맹·흑백 출력에서도
 *   같은 정보가 남는다.
 * ★ 삼각형은 `aria-hidden`이고 뜻은 `sr-only` 텍스트가 읽는다 — "▲"가
 *   스크린리더에서 "검은 위쪽 삼각형"으로 읽히면 아무 뜻도 전달되지 않는다.
 */
export function DeltaBadge({ delta, unit }: { delta: KpiDelta; unit: string }) {
  if (delta.verdict === 'incomparable') {
    return (
      <span className="text-xs text-metric-flat-fg">
        비교 불가
        <span className="sr-only"> — 측정 조건이 달라 전 회차와 비교할 수 없습니다</span>
      </span>
    )
  }

  const up = delta.amount > 0
  const flat = delta.amount === 0
  // 판정이 없는 값(개수)은 방향을 색으로 말하지 않는다 — kpi.ts 머리말.
  const tone =
    delta.verdict === 'up'
      ? 'text-metric-up-fg'
      : delta.verdict === 'down'
        ? 'text-metric-down-fg'
        : 'text-metric-flat-fg'

  return (
    <span className={cn('inline-flex items-baseline gap-1 text-xs', tone)}>
      {!flat && (
        <>
          <span aria-hidden>{up ? '▲' : '▼'}</span>
          <span className="sr-only">{up ? '증가' : '감소'}</span>
        </>
      )}
      <span className="font-mono tabular-nums">
        {flat ? '변화 없음' : `${Math.abs(delta.amount)}${unit}`}
      </span>
      {delta.verdict === 'unchanged' && !flat && (
        <span className="text-muted-foreground">오차 범위</span>
      )}
      <span className="sr-only">전 회차 대비</span>
    </span>
  )
}
