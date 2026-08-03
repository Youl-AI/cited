import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 대시보드 로딩 뼈대.
 *
 * 이 화면은 세 번의 DB 왕복(게이트 → 대시보드 로드 → 회차 목록) 뒤에야
 * 그려진다. 그때까지 `(app)` 셸만 서 있으면 본문 자리가 통째로 비어서
 * "로그인은 됐는데 아무것도 없다"로 읽힌다 (redesign-skill: "No loading states").
 *
 * ★ **모양이 곧 약속이다.** 같은 크기 회색 박스를 늘어놓는 것은 스켈레톤이
 *   아니라 스피너를 네모나게 그린 것이다(`skeleton.tsx` JSDoc). 여기 있는
 *   상자들은 실제로 올 것과 같은 치수·같은 순서다 — 머리(브랜드명+트레이),
 *   헤드라인 카드(5xl 수치 + 구간 띠), 추이 차트(SVG 판), 히트맵(표),
 *   회차 목록(행). 도착했을 때 레이아웃이 튀지 않는 것이 목적이다.
 * ★ **수치는 한 글자도 흉내 내지 않는다.** 회색 상자만 둔다 — 자리 채우기용
 *   가짜 퍼센트가 한 프레임이라도 보이면 그건 측정된 적 없는 숫자다 (§6의
 *   count-up 금지와 같은 규칙).
 * ★ 접근성: 스켈레톤 상자 자체에는 읽어 줄 내용이 없다. 상태는 이 영역이
 *   `role="status"` + `aria-busy`로 말하고, 그림 부분은 통째로 `aria-hidden`이다.
 *   `.skeleton` 셔머는 reduced-motion에서 globals.css 킬 스위치가 정지시킨다.
 * ★ 등장 모션(`.instrument-enter`)은 걸지 않는다. 로딩 뼈대가 페이드인하면
 *   기다리는 시간에 애니메이션이 하나 더 얹힐 뿐이고, 실제 콘텐츠로 교체될
 *   때 두 번째 등장과 겹쳐 화면이 두 번 흔들린다.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-9">
      <span className="sr-only">대시보드를 불러오는 중입니다.</span>

      <div aria-hidden="true" className="space-y-9">
        {/* 머리 — 아이브로우 + 브랜드명 + 브랜드 트레이 */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-8 w-44" />
          </div>
          <Skeleton className="h-10 w-52 rounded-xl" />
        </div>

        {/* 헤드라인 카드 — 껍질은 진짜 카드를 쓴다. 트레이·헤어라인·반경이
            도착 후와 같아야 교체 순간에 상자가 다시 그려지지 않는다. */}
        <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(7)]">
          <CardContent>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-3 h-14 w-40 sm:h-16" />
            <Skeleton className="mt-5 h-1.5 w-full rounded-full" />
            <Skeleton className="mt-4 h-4 w-full max-w-md" />
          </CardContent>
        </Card>

        {/* 추이 차트 — 제목·리드·엔진 트레이·SVG 판 */}
        <section className="border-t border-foreground/[0.07] pt-8">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="mt-2.5 h-4 w-full max-w-md" />
          <Skeleton className="mt-5 h-8 w-64 rounded-xl" />
          {/* 차트의 종횡비는 viewBox 640×220이다 — 같은 비율로 잡아야 도착할 때
              아래 섹션들이 위아래로 밀리지 않는다. */}
          <Skeleton className="mt-4 aspect-[640/220] w-full rounded-xl" />
        </section>

        {/* 히트맵 — 표 머리 한 줄 + 행 다섯 */}
        <section className="border-t border-foreground/[0.07] pt-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2.5 h-4 w-full max-w-lg" />
          <Card className="mt-5 gap-0 py-(--card-bezel)">
            <div className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-full" />
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-7 w-full" />
              ))}
            </div>
          </Card>
        </section>

        {/* 회차 목록 — 행 넷 */}
        <section className="border-t border-foreground/[0.07] pt-8">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2.5 h-4 w-full max-w-sm" />
          <Card className="mt-5 gap-0 py-(--card-bezel)">
            <div className="divide-y divide-border">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
