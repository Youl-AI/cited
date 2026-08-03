import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 입력 — 새겨 넣은 칸(recessed).
 *
 * ★ 버튼이 표면 **위로** 뜬다면(elevation), 입력은 표면 **안으로** 들어가야
 *   한다. 둘 다 평평하면 "누르는 것"과 "쓰는 것"이 같은 깊이에 놓여서 폼이
 *   읽히지 않는다. 파는 값은 `--recess-1` 토큰이다(globals.css) — 라이트는
 *   위쪽 안쪽 그림자, 다크는 투명(다크 입력은 채움이 이미 칸을 만든다).
 *   리터럴을 여기 적어 두면 select 트리거와 두 벌이 되고, 곧 갈라진다.
 * ★ 초점 링(`focus-visible:border-ring` + `ring-3 ring-ring/50`)은 손대지
 *   않았다. 링과 안쪽 그림자는 box-shadow 레이어가 다르므로 함께 그려진다.
 * ★ 호버가 없었다 — 커서를 올려도 아무 반응이 없으면 읽기 전용처럼 보인다.
 *   테두리만 살짝 조인다(배경은 그대로 — 글자 대비를 건드리지 않는다).
 * ★ **다크 호버는 반드시 따로 잡는다.** `hover:border-ring/35`를 그대로 두면
 *   마케팅 신청 폼(다크)에서 빈 입력에 커서를 올리는 순간 테두리가
 *   1.96:1로 **떨어진다** — WCAG 1.4.11이 요구하는 3:1 아래다. 다크 기본
 *   테두리는 `--input`(= `--border-interactive`, 흰색 36% · 3.35:1)인데
 *   호버가 그보다 어두운 값으로 덮어써서, 손을 올릴수록 칸이 사라지는
 *   방향이었다. 흰색 45%는 기본값보다 **밝으므로** 대비가 올라가고
 *   어포던스 방향도 맞는다(globals.css의 36% 계약도 그대로 지킨다).
 *   이 짝은 tests/design-tokens.test.ts가 잠근다.
 * ★ 높이는 h-8 그대로다. 버튼 기본(h-8)과 짝이고, 이 앱의 폼은 전부 이
 *   스케일 위에 앉아 있다. 여기서 키우면 온보딩·인증의 모든 행이 어긋난다.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-base outline-none",
        "shadow-(--recess-1)",
        "transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-instrument",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground",
        "hover:border-ring/35 dark:hover:border-[oklch(1_0_0/45%)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 disabled:shadow-none",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
