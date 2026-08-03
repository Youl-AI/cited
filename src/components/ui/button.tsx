import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * 눌림 — soft-skill §5.B "Magnetic Button Hover Physics".
 *
 * ★ 왜 `translate-y-px`에서 `scale`로 갈아탔나: 1px 하강은 그림자가 없으면
 *   거의 보이지 않고(앱 버튼 대부분이 그렇다), 인접한 글자와 베이스라인이
 *   어긋나 보인다. 균일 축소는 "손끝이 표면을 눌렀다"로 읽히고 레이아웃
 *   기준선을 건드리지 않는다. 이징은 --ease-spring(살짝 오버슈트)이라
 *   놓았을 때 되돌아오는 맛이 있다 — **손끝 반응 전용**이라는 토큰 주석의
 *   용도와 정확히 일치한다(데이터가 움직이는 곳에는 쓰지 않는다).
 *
 * ★ `not-aria-[haspopup]` 가드는 원래 있던 것을 그대로 이어받는다. 팝오버·
 *   드롭다운 트리거가 눌린 동안 줄어들면 그 트리거에 앵커된 팝업이 함께
 *   흔들린다.
 * ★ `link`에는 붙이지 않는다. 본문 사이에 있는 글자 링크가 줄었다 커지면
 *   버튼 흉내를 내는 것으로 보인다.
 * ★ 이 전이의 이징은 `.motion-press`(globals.css)가 **속성별로** 나눠 준다 —
 *   색·그림자는 감속, 눌림만 스프링. 유틸리티 하나로는 표현할 수 없다.
 *   그리고 그쪽이 전이 목록에 `transform`이 아니라 `scale`을 적는 이유도
 *   같이 적어 뒀다(Tailwind v4는 독립 `scale` 속성을 낸다 — `transform`만
 *   적으면 눌림이 전이 없이 끊긴다).
 */
const PRESS = "active:not-aria-[haspopup]:scale-[0.98]"

const buttonVariants = cva(
  // `transition-all`이 아니다. all은 나중에 누가 붙이는 width·padding 같은
  // 레이아웃 속성까지 애니메이션해서 조용히 리플로를 매 프레임 돌린다
  // (soft-skill §6). 명시 목록·지속시간·속성별 이징은 `.motion-press`에 있다.
  "group/button motion-press inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // ★ `bg-primary/80`을 걷어냈다. 알파를 깎는 호버는 **버튼 뒤가 비쳐
        //   보이는** 호버다 — 카드 위와 페이지 배경 위에서 서로 다른 색이 되고,
        //   그림자가 붙은 순간 자기 그림자까지 비친다. color-mix는 불투명도를
        //   유지한 채 색만 옮기고, --foreground를 섞으므로 라이트에서는 짙어지고
        //   다크에서는 밝아진다(표면을 따라간다). secondary와 신청 폼의 제출
        //   버튼이 이미 쓰던 어휘라 여기서 통일한다.
        // ★ elevation은 1단이 기본, 호버에서 2단으로 뜬다. 앱은 계기판이라
        //   3단(모달급)까지 올리지 않는다.
        default: `${PRESS} bg-primary text-primary-foreground shadow-elevation-1 hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] hover:shadow-elevation-2 active:shadow-elevation-1`,
        // 테두리가 어포던스를 담당하므로 그림자를 얹지 않는다(테두리+그림자+흰
        // 배경 = redesign-skill이 지목하는 제네릭 카드 룩).
        // ★ 다크 짝이 따로 있는 이유는 입력과 같다. 다크 기본 테두리는
        //   `--input`(흰색 36%)인데 `hover:border-ring/25`가 그보다 **어두운**
        //   값이라, 마케팅 신청 폼의 "경쟁사 추가" 버튼에 손을 올리면 테두리가
        //   오히려 흐려졌다. 여기는 글자 라벨이 있어 1.4.11 대상은 아니지만
        //   (globals.css의 --border 주석 참고) 어포던스 방향이 뒤집힌 것은
        //   그것대로 결함이다. 라이트/다크 모두 "올리면 또렷해진다"로 맞춘다.
        outline: `${PRESS} border-border bg-background hover:border-ring/25 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:border-[oklch(1_0_0/50%)] dark:hover:bg-input/50`,
        // secondary(0.965)는 앱 배경(0.994)과 거의 같은 밝기다. 1단 elevation이
        // 없으면 버튼이 아니라 얼룩으로 보인다.
        secondary: `${PRESS} bg-secondary text-secondary-foreground shadow-elevation-1 hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] hover:shadow-elevation-2 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground`,
        ghost: `${PRESS} hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50`,
        destructive: `${PRESS} bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40`,
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        // h-9(36px) → h-10(40px). 이 앱의 주요 CTA는 전부 lg인데 호출부가
        // 하나같이 className으로 h-10을 다시 씌우고 있었다 — 기본값이 틀렸다는
        // 뜻이다. 터치 타깃 권장치(44px)에 가깝고, 한글 라벨은 라틴 문자보다
        // 글자 상자가 꽉 차서 같은 높이에서 더 답답하게 읽힌다.
        lg: "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
