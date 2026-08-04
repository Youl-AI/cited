'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * 스크롤 진입 리빌 (tasteskill §5.C 골격). **핀·스크럽이 아닌** 단순
 * "뷰포트에 들어오면 나타난다"는 전부 이걸 쓴다 — ScrollTrigger를 켜지 않으므로
 * 가볍고, 같은 트리에 GSAP이 없어 혼용 금지 규칙도 자동으로 지켜진다.
 * 핀·스크럽이 필요하면 `PinScene`(GSAP) 쪽이다.
 *
 * 동기(Motion Motivated): **순서**다. 한 화면에 여러 항목이 동시에 나타나면
 * 읽는 순서가 사라진다. `index`가 위에서 아래로 60ms씩 밀어 시선의 경로를 만든다.
 *
 * ★ `index`는 **같은 그룹 안의 순번**이다. 페이지 전역 순번을 넣으면
 *   (index 20 → 1.2초) 스크롤해서 도착한 뒤에도 한참 비어 있다. 그룹마다 0부터.
 */

/**
 * 스태거 단위(초). `--motion-stagger: 60ms`(globals.css)와 같은 값이다.
 * Motion의 `transition.delay`는 CSS 변수를 읽지 못하므로 JS 상수로 이중화하고,
 * 테스트가 이 상수를 단언한다 — 매직넘버를 컴포넌트 본문에 박지 않기 위해서다.
 */
export const REVEAL_STAGGER_S = 0.06

/** 리빌 지속시간(초). tasteskill §5.C 규격값. */
export const REVEAL_DURATION_S = 0.6

/**
 * expo-out 계열 이징. 빠르게 출발해 길게 눕는다 — 도착이 "멈춤"이 아니라
 * "정착"으로 읽힌다. tasteskill §5.C 규격값이며 `linear`·`ease-in-out`은 금지다.
 */
export const REVEAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode
  index?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      // ★ 초기 상태를 클래스(`opacity-0` 등)에 박지 않는다 — design-language §6.
      //   여기서도 reduced-motion이면 `initial={false}`로 **첫 프레임부터 최종
      //   상태**다. `initial`을 그대로 두고 duration만 0으로 만들면 여전히 한
      //   프레임 투명하게 지나가고, 인쇄 매체에서는 아예 안 보일 수 있다.
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      // `once: false` — 양방향이다. 내려가며 만나도, 올라오며 다시 만나도
      // 같은 등장을 한다(사용자 결정: 위로 스크롤할 때도 페이지가 살아 있어야
      // 한다). 문턱 떨림은 Motion의 교차 판정이 amount 기준으로 이력을
      // 가져서 실사용 스크롤에서는 나타나지 않는다. `amount: 0.3`은 요소가
      // 30% 보일 때 시작.
      // 트레이드오프: 화면 밖으로 나간 요소는 initial(투명)로 돌아가므로
      // 마케팅 페이지를 인쇄하면 뷰포트 밖 섹션이 비어 보일 수 있다. 이
      // 컴포넌트는 마케팅 라우트 전용이고 인쇄 표면(리포트/PDF)은 Reveal을
      // 쓰지 않으므로 납품물에는 영향이 없다.
      viewport={{ once: false, amount: 0.3 }}
      transition={{
        duration: REVEAL_DURATION_S,
        delay: index * REVEAL_STAGGER_S,
        ease: REVEAL_EASE,
      }}
    >
      {children}
    </motion.div>
  )
}
