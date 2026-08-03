import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 카드 — double-bezel (soft-skill §4.A Doppelrand).
 *
 * ## 구조
 *
 * 겉껍질(이 `div`)과 내핵(`::before`) 두 겹이다. 껍질은 아주 옅은 트레이색
 * (`bg-muted/60`)에 헤어라인 하나, 내핵은 카드색(흰색)에 자기 헤어라인 하나 —
 * 알루미늄 트레이에 유리판이 앉은 모양이다. 배경 위에 흰 판을 그냥 얹는
 * "테두리 + 그림자 + 흰 배경"은 redesign-skill이 제네릭 카드 룩으로 지목한
 * 바로 그 조합이다.
 *
 * ★ 내핵을 **DOM 자식이 아니라 `::before`로** 만든 이유: 호출부가 넘기는
 *   `className`(grid, flex-row, col-span…)과 `has-data-[slot=card-footer]`
 *   같은 선택자가 전부 이 요소 하나를 기준으로 쓰인다. 안쪽에 래퍼를 하나
 *   끼우면 그 계약이 통째로 어긋난다(그리고 조용히 어긋난다 — 화면은 뜨고
 *   레이아웃만 틀어진다). 의사요소는 레이아웃에 참여하지 않는다.
 * ★ 내핵을 콘텐츠 **아래**로 보내는 방법이 `isolate` + `before:-z-10`인 이유:
 *   `[&>*]:relative`로 자식을 끌어올리는 쪽이 짧지만, 그 선택자는 카드 안에
 *   `absolute`를 쓴 자식까지 `relative`로 덮어쓴다(둘 다 특이도 (0,1,0)이고
 *   변형이 붙은 쪽이 나중에 출력되므로 이긴다 — 배지 오버레이 하나가 조용히
 *   제자리로 돌아온다). `isolate`는 카드를 스태킹 컨텍스트로 만들고, 그 안에서
 *   음수 z-index는 **자기 배경 위·모든 콘텐츠 아래**에 칠해진다(CSS 페인팅
 *   순서 2단계). 자식은 손대지 않는다.
 *
 * ## 동심 반경
 *
 *   껍질 반경 = --radius × 1.4  (rounded-xl과 같은 값. 계산식을 드러내려고
 *                                이름을 붙였다)
 *   내핵 반경 = 껍질 반경 − 베젤(4px)
 *
 * 이 뺄셈이 없으면 두 곡선의 중심이 어긋나서, 모서리에서 베젤 폭이 넓어졌다
 * 좁아진다 — 값싸 보이는 이유가 대부분 여기다. 반경이 --radius에서 파생하므로
 * 마케팅 다크 표면(--radius: 1rem)에서도 동심이 유지된다.
 *
 * ## elevation은 1단이다
 *
 * 앱은 계기판이라 카드가 화면을 가득 채운다. 2단·3단을 기본값으로 두면
 * 그림자끼리 겹쳐서 데이터보다 그림자가 먼저 보인다. 뜨는 것은 상호작용하는
 * 것(버튼·팝오버·모달)뿐이다.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card relative isolate flex flex-col gap-(--card-spacing) overflow-hidden text-sm text-card-foreground",
        "[--card-bezel:--spacing(1)] [--card-radius:calc(var(--radius)*1.4)] [--card-spacing:--spacing(4)] [--card-core-radius:calc(var(--card-radius)-var(--card-bezel))] data-[size=sm]:[--card-spacing:--spacing(3)]",
        // 겉껍질
        "rounded-[var(--card-radius)] bg-muted/60 px-(--card-bezel) py-[calc(var(--card-bezel)+var(--card-spacing))] shadow-elevation-1 ring-1 ring-foreground/[0.07]",
        // 내핵
        "before:pointer-events-none before:absolute before:-z-10 before:inset-(--card-bezel) before:rounded-[var(--card-core-radius)] before:bg-card before:ring-1 before:ring-foreground/[0.05]",
        // 바닥글·머리 이미지는 내핵의 가장자리에 맞춰 붙는다(껍질이 아니라).
        // 그래서 남기는 여백은 베젤 폭뿐이다 — 예전 `pb-0`은 껍질이 없다는
        // 전제였다.
        "has-data-[slot=card-footer]:pb-(--card-bezel) has-[>img:first-child]:pt-(--card-bezel) *:[img:first-child]:rounded-t-[var(--card-core-radius)] *:[img:last-child]:rounded-b-[var(--card-core-radius)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        // 반경은 내핵과 같다(껍질이 아니라). 머리글에 배경을 얹는 호출부에서만
        // 눈에 보이지만, 그때 값이 틀어져 있으면 모서리에 흰 초승달이 남는다.
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-[var(--card-core-radius)] px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        // 바닥글은 내핵 안에서 트레이색으로 돌아간다 — 껍질이 카드 아래쪽으로
        // 비쳐 보이는 것처럼 읽히게. 경계선은 --border(회색 안료)가 아니라
        // --foreground 알파다: 라이트에서는 검정 7%, 다크에서는 흰색 7%로
        // 자동으로 뒤집혀서 유리 헤어라인 어휘와 같은 가족이 된다.
        "flex items-center rounded-b-[var(--card-core-radius)] border-t border-foreground/[0.07] bg-muted/60 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
