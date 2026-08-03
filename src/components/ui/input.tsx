import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 입력 — 새겨 넣은 칸(recessed).
 *
 * ★ 버튼이 표면 **위로** 뜬다면(elevation), 입력은 표면 **안으로** 들어가야
 *   한다. 둘 다 평평하면 "누르는 것"과 "쓰는 것"이 같은 깊이에 놓여서 폼이
 *   읽히지 않는다. 여기서는 위쪽 안쪽 그림자 1px + 아주 옅은 바닥색으로
 *   판다 — 빛은 위에서 하나뿐이라는 elevation 토큰의 규칙과 같은 방향이다.
 *   그림자 색은 --elev-*와 같은 색조(258)로 틴트했다(순수 검정 금지).
 * ★ 초점 링(`focus-visible:border-ring` + `ring-3 ring-ring/50`)은 손대지
 *   않았다. 링과 안쪽 그림자는 box-shadow 레이어가 다르므로 함께 그려진다.
 * ★ 호버가 없었다 — 커서를 올려도 아무 반응이 없으면 읽기 전용처럼 보인다.
 *   테두리만 살짝 조인다(배경은 그대로 — 글자 대비를 건드리지 않는다).
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
        "shadow-[inset_0_1px_2px_oklch(0.2_0.015_258/0.05)] dark:shadow-none",
        "transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-instrument",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground",
        "hover:border-ring/35 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
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
