import { cn } from '@/lib/utils'

/**
 * 온보딩 진행 표시 — 세 화면이 공유한다.
 *
 * ★ **글자를 추가하지 않는다.** 원래 있던 아이브로우(`온보딩 N / 3`)가 그대로
 *   유일한 문구이고, 칸은 `aria-hidden`이다. 보조기기에 같은 사실을 두 번
 *   말하면(칸 셋 + 문장) 매 화면 머리에서 중복 낭독이 된다.
 * ★ 칸이 하는 일은 문장이 못 하는 것 하나다: **방향.** "2 / 3"은 위치를
 *   말하지만 어느 쪽으로 가고 있는지는 말하지 않는다. 지나온 칸은 정지 상태로
 *   차 있고 지금 칸만 왼쪽에서 펴지므로(`.step-advance`, globals.css),
 *   화면이 바뀔 때마다 한 칸 전진한 것이 보인다.
 * ★ 색은 `--primary`다. design-language §3에서 브랜드색의 자리는 "UI 크롬과
 *   강조"이고 지표 방향에는 쓰지 않는다 — 진행 표시는 계측값이 아니라 크롬이다.
 * ★ 빈 칸의 색이 `--border`(회색 안료)가 아니라 `--foreground` 알파인 이유는
 *   카드 헤어라인과 같다: 표면이 뒤집히면 같이 뒤집힌다.
 */
export function StepRail({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="instrument-enter">
      <div aria-hidden="true" className="flex items-center gap-1.5">
        {([1, 2, 3] as const).map((n) => (
          <span
            key={n}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/[0.08]"
          >
            {n <= step && (
              <span
                className={cn(
                  'block h-full w-full rounded-full bg-primary',
                  // 지나온 칸은 애니메이션하지 않는다 — 그쪽은 이미 지난 화면에서
                  // 벌어진 일이고, 다시 자라면 "또 통과했다"는 거짓말이 된다.
                  n === step && 'step-advance',
                )}
              />
            )}
          </span>
        ))}
      </div>
      <p className="mt-3 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 {step} / 3
      </p>
    </div>
  )
}
