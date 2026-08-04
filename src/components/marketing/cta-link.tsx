'use client'

import { ArrowUpRightIcon } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRef } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * 마케팅 표면의 행동 유도 링크.
 *
 * ## 왜 앱의 `Button`을 쓰지 않는가
 *
 * 앱 버튼은 계측기의 손잡이다 — 8~10px 반경, 촘촘한 높이, 정보 밀도 우선.
 * 마케팅 표면은 자기 모서리 규칙을 갖는다(아래). 두 규칙을 한 컴포넌트에
 * variant로 욱여넣으면 앱 화면에 마케팅 모서리가 새어 나온다.
 *
 * ## 모서리 규칙(Shape Consistency Lock)
 *
 * 원래는 알약(`rounded-full`)이었다. 표면을 각진 계측 시트로 정리한 뒤
 * (specimen-sheet.tsx), 알약 버튼만 혼자 둥글어 겉돌았다. 지금 규칙:
 * **마케팅 표면에서 시트도 컨트롤도 각(radius 0)이다** — 기계의 몸체와
 * 버튼이 같은 모서리를 갖는다. 라운드가 남는 곳은 유리 컨테이너
 * (`GlassPanel` — 요금제·진단 신청 껍데기)뿐이다.
 *
 * 화살표도 같은 이유로 자기 원(circle chip)을 벗었다 — 원은 알약의
 * 부속이었다. 지금은 맨 화살표가 라벨 옆에 서고, 호버에 가리키는 방향
 * (대각선 위)으로 민다.
 *
 * ## 자석 (tasteskill §5 Magnetic Micro-physics)
 *
 * 커서가 버튼 위에 있는 동안 버튼이 커서 쪽으로 몇 px 끌려온다(스프링
 * 복귀). 동기: **전환 버튼 하나에 손을 끌어당기는 피드백**이다 — 이
 * 페이지에서 누를 것은 사실상 이 버튼뿐이고, 그 하나가 반응하는 물체라는
 * 감각을 준다. 규칙 준수: `useMotionValue`+`useSpring`으로 React 렌더
 * 밖에서 움직인다(§3.B — useState로 연속값을 추적하면 프레임마다 트리가
 * 다시 그려진다). reduced-motion이면 끌림 자체를 만들지 않는다.
 * 이동은 Motion의 `x`/`y`(transform translate)이고 눌림은 CSS의 독립
 * `scale` 속성이라 서로를 덮지 않는다(Tailwind v4의 독립 속성 분리를
 * 그대로 이용).
 *
 * ## 클라이언트 컴포넌트가 된 비용
 *
 * 자석 물리는 포인터 추적이라 JS가 필요하다. 마케팅 라우트는 이미 Motion을
 * 싣고 있어 증분은 이 파일 분량이고, CTA는 LCP 요소가 아니다.
 *
 * ## 대비
 *
 * `--primary`(#79a6e9) 위의 `--primary-foreground`(#17202e)는 7.67:1로 AA를
 * 넘는다(globals.css의 다크 블록 주석 참고). 호버는 **밝히는** 쪽으로만 간다
 * — `bg-primary/80`처럼 투명도를 낮추면 어두운 배경이 비쳐 CTA가 눌릴수록
 * 흐려지고, 대비도 함께 떨어진다.
 */

const TONE = {
  /**
   * 무료 진단으로 보내는 길. **의도가 하나**라는 뜻이지 인스턴스가 하나라는
   * 뜻이 아니다 — tasteskill §4.5는 같은 의도에 라벨을 하나만 쓰라고 하지
   * 그 라벨을 한 번만 놓으라고 하지 않는다. 랜딩에서는 머리글·히어로·마감
   * 셋이 같은 문구("무료 진단 받기")를 쓴다. 새 문구를 만드는 순간이 위반이다.
   */
  primary:
    'bg-primary text-primary-foreground shadow-elevation-2 hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]',
  /** 보조. 시트 위의 헤어라인 사각. */
  ghost: 'border border-border bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08]',
} as const

const SIZE = {
  md: { root: 'h-12 gap-2.5 px-6 text-[0.9375rem]', icon: 16 },
  sm: { root: 'h-9 gap-2 px-4 text-sm', icon: 14 },
} as const

/** 자석 세기. 중심에서 벗어난 거리에 곱하고, 아래 한계로 자른다. */
const PULL = 0.18
/** 최대 끌림(px). 이보다 크면 버튼이 커서를 쫓아다니는 장난감이 된다. */
const MAX_PULL_X = 6
const MAX_PULL_Y = 4

const MotionLink = motion.create(Link)

export function CtaLink({
  href,
  children,
  tone = 'primary',
  size = 'md',
  icon = true,
  className,
}: {
  href: string
  children: React.ReactNode
  tone?: keyof typeof TONE
  size?: keyof typeof SIZE
  /** 트레일링 화살표. 보조 링크에서는 끄는 편이 조용하다 */
  icon?: boolean
  className?: string
}) {
  const s = SIZE[size]
  const reduce = useReducedMotion()
  const ref = useRef<HTMLAnchorElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  // 스프링이 복귀를 만든다 — 순간이동 복귀는 끌림이 아니라 버그로 읽힌다.
  const springX = useSpring(x, { stiffness: 320, damping: 24 })
  const springY = useSpring(y, { stiffness: 320, damping: 24 })

  const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v))

  return (
    <MotionLink
      ref={ref}
      href={href}
      style={reduce ? undefined : { x: springX, y: springY }}
      onPointerMove={(e: React.PointerEvent) => {
        if (reduce || !ref.current) return
        const r = ref.current.getBoundingClientRect()
        x.set(clamp((e.clientX - (r.left + r.width / 2)) * PULL, MAX_PULL_X))
        y.set(clamp((e.clientY - (r.top + r.height / 2)) * PULL, MAX_PULL_Y))
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      className={cn(
        'group/cta inline-flex shrink-0 items-center justify-center rounded-none font-semibold whitespace-nowrap',
        // 눌림. 이징은 --ease-spring(오버슈트 4% 이내) — 손끝 반응에만 쓰는 그 값이다.
        // ★ 전이 목록에 `transform`이 아니라 `scale`을 적는다. Tailwind v4는
        //   `active:scale-[0.98]`을 `transform: scale(...)`이 아니라 **독립
        //   `scale` 속성**으로 낸다 — `transform`만 적으면 스프링이 걸리지 않고
        //   눌림이 뚝 끊긴다. `.motion-press`(globals.css)가 같은 이유로 목록에
        //   `scale`을 명시해 둔 그 선례다.
        'transition-[scale,background-color,box-shadow] duration-[var(--motion-micro)] ease-spring',
        'active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        TONE[tone],
        s.root,
        className,
      )}
    >
      {children}
      {icon ? (
        <ArrowUpRightIcon
          aria-hidden="true"
          size={s.icon}
          weight="bold"
          // 대각선으로 밀린다 — 화살표가 가리키는 방향과 같아야 한다.
          className="shrink-0 transition-transform duration-[var(--motion-micro)] ease-spring group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
        />
      ) : null}
    </MotionLink>
  )
}
