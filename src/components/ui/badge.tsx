import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * 배지 — 알약이 아니라 **납작한 라벨**이다.
 *
 * ★ `rounded-4xl`(= --radius × 2.6 ≈ 31px, 높이 20px짜리에서는 완전한 알약)을
 *   걷어냈다. redesign-skill Component Patterns가 "New/Beta 알약 배지"를 AI
 *   기본값으로 지목한 그 모양이고, 이 제품에서 배지가 실제로 담는 것은
 *   장식 문구가 아니라 **상태와 수치**다(수집 완료 · 회차 3 · 엔진 4). 계기판의
 *   라벨은 각이 살아 있어야 옆의 숫자와 같은 격자에 앉는다.
 *   반경은 --radius에서 파생하되 6px 상한을 둔다. 지금은 --radius가 0이라
 *   상한이 무동작이지만(각 배지), 반경이 되살아나도 알약으로 돌아가지 않게
 *   막는 안전장치로 남긴다.
 * ★ `tabular-nums` — 배지 안의 숫자가 바뀔 때 폭이 흔들리면 그 옆의 모든 것이
 *   1px씩 밀린다. 표에만 걸어 둔 규칙(globals.css)을 여기서도 지킨다.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[min(var(--radius-sm),6px)] border border-transparent px-2 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-instrument focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // 버튼과 같은 이유로 알파 호버를 쓰지 않는다(button.tsx 주석 참고) —
        // 배지는 카드 위·표 안·페이지 배경 위 어디에나 올라가므로 뒤가 비치면
        // 같은 상태가 자리마다 다른 색이 된다.
        default:
          "bg-primary text-primary-foreground [a]:hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
