import { DeltaBadge } from '@/components/dashboard/delta-badge'
import { Sparkline } from '@/components/dashboard/sparkline'
import { Card, CardContent } from '@/components/ui/card'
import type { RunPoint } from '@/lib/dashboard/data'
import { buildKpis } from '@/lib/dashboard/kpi'
import { formatInterval } from '@/lib/stats/wilson'

/**
 * KPI 타일 행 — 헤드라인 아래 보조 수치 셋.
 *
 * ## 히어로는 하나뿐이다
 *
 * 이 행의 값은 `text-2xl`이고 헤드라인(`text-5xl~6xl`)의 절반이 안 된다.
 * dataviz 규칙: **한 화면에 히어로 숫자는 정확히 하나.** 넷을 같은 크기로
 * 늘어놓으면 "무엇이 이 화면의 주장인가"가 사라진다 — 이 제품의 주장은
 * 언급률이고, 나머지 셋은 그 숫자를 읽는 맥락이다.
 *
 * ## 숫자 조판
 *
 * 값은 **비례 숫자**다(`tabular-nums` 없음). 자릿수 정렬이 필요한 것은 세로로
 * 쌓인 열이지 가로로 놓인 타일이 아니고, 표시 크기에서 tabular는 `1`이 헐렁해
 * 보인다(dataviz "Proportional figures for big numbers"). 델타 배지 안의
 * 숫자만 mono·tabular인데, 그건 값이 아니라 계측 표시라서다.
 *
 * ## 값을 못 내는 타일은 사유를 적는다
 *
 * 경쟁사 미등록(점유율)·사이트 주소 미등록(우리 사이트 인용)은 0%가 아니라
 * **모름**이다. 0%로 그리면 "한 번도 인용되지 않았다"는 없는 사실이 된다
 * (`kpi.ts` 머리말). 이 자리는 그래서 안내 문구 + 무채색이다.
 */
export function KpiRow({
  points,
  direction = 'row',
}: {
  points: RunPoint[]
  /** 'row' = 가로 3열(전폭 자리), 'column' = 세로 스택(커맨드센터 오른쪽 기둥). */
  direction?: 'row' | 'column'
}) {
  const kpis = buildKpis(points)
  if (kpis.length === 0) return null

  return (
    <div className={direction === 'row' ? 'grid gap-4 sm:grid-cols-3' : 'grid gap-4'}>
      {kpis.map((kpi) => (
        <Card key={kpi.id}>
          <CardContent className="flex h-full flex-col">
            <p className="text-sm text-muted-foreground">{kpi.label}</p>

            {/* 값 줄과 델타 줄을 **구조로 가른다.** 예전에는 한 flex-wrap 줄에
                값·구간·델타를 다 넣었는데, 타일 폭에 따라 델타가 첫 줄에 남기도
                둘째 줄로 밀리기도 해서 세 타일의 베이스라인이 우연히 갈렸다
                (실측 — 셋 중 둘만 줄바꿈). 줄 수가 폭의 우연이 아니라 구조면
                어느 폭에서든 세 타일이 같은 모양이다. */}
            <div className="mt-2 flex items-baseline gap-x-2.5">
              <span
                className={
                  kpi.unavailable
                    ? 'text-2xl leading-none font-semibold text-muted-foreground'
                    : 'text-2xl leading-none font-semibold'
                }
              >
                {kpi.value}
              </span>
              {kpi.interval && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatInterval(kpi.interval)}
                </span>
              )}
            </div>
            {/* 델타 줄 — 없는 타일(첫 회차·값 없음)도 자리를 지켜 세 타일의
                스파크라인 시작 높이가 맞는다. */}
            <div className="mt-2 min-h-5">
              {kpi.delta && <DeltaBadge delta={kpi.delta} unit={kpi.interval ? '%p' : '개'} />}
            </div>

            {/* 추세 조각 — 값이 아니라 **모양**만 말한다(sparkline.tsx).
                값을 못 내는 타일에는 그리지 않는다: 그릴 계열 자체가 없다. */}
            {!kpi.unavailable && (
              <div className="mt-3">
                <Sparkline id={kpi.id} series={kpi.spark} max={kpi.sparkMax} />
              </div>
            )}

            {/* 아래 한 줄은 "이 숫자가 무엇을 센 것인가"다. 없으면 점유율이
                무엇 대비인지, 도메인이 어디서 나온 것인지 물어봐야 한다.
                `mt-auto`로 바닥에 붙여 타일 셋의 밑줄을 맞춘다. */}
            <p className="mt-auto pt-3 text-xs leading-relaxed text-muted-foreground">
              {kpi.unavailable ?? kpi.note}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
