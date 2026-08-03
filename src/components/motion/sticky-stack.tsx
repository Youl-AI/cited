'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from 'motion/react'

gsap.registerPlugin(ScrollTrigger)

/**
 * 스티키 스택 (tasteskill §5.A 캐노니컬 골격 그대로).
 *
 * 카드가 뷰포트 상단에 **핀된 채 쌓이고**, 다음 카드가 올라오는 만큼 이전
 * 카드가 뒤로 물러난다(축소 + 감광). "순서대로 나타나는 리스트"가 아니다 —
 * 그건 `Reveal`이고, 이 컴포넌트는 카드가 물리적으로 겹쳐 쌓이는 쪽이다.
 *
 * 동기(Motion Motivated): 위계. 단계가 서로를 **대체**한다는 걸 공간으로
 * 보여 준다(스펙 §4.1의 "신청하면" 3단계). 나열이면 이걸 쓰면 안 된다.
 *
 * ★ **이 트리 안에서 Motion(`motion.div` 등)을 쓰지 않는다** — 혼용 금지.
 *   `useReducedMotion`은 §5.A 골격이 직접 쓰는 미디어 쿼리 훅이라 예외다.
 *
 * ## `ordered`
 *
 * 이 컴포넌트가 카드를 `<div>`로 감싸면 **호출부가 세운 목록 시맨틱이 사라진다**
 * (실제로 그랬다 — 랜딩의 "신청하면" 3단계가 `<ol>`을 잃고 그냥 div 셋이 됐다).
 * 순서가 정보인 목록이면 `ordered`를 켠다. 그러면 뿌리가 `<ol>`, 카드가 `<li>`가
 * 되어 스크린리더가 "목록, 항목 3개 중 1"을 읽는다 — 눈에 보이는 01/02/03이
 * 장식이 아니라 실제 순서라는 주장이 그 시맨틱 위에 선다.
 * 순서 없는 카드 더미면 기본값(`div`) 그대로 둔다.
 */
export function StickyStack({
  cards,
  ordered = false,
}: {
  cards: ReactNode[]
  ordered?: boolean
}) {
  // 뿌리 요소가 `div`일 수도 `ol`일 수도 있어서 콜백 ref로 받는다. `useRef`에
  // 구체 타입을 박으면 두 분기 중 하나에서 반드시 캐스팅이 필요해진다.
  const ref = useRef<HTMLElement | null>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    // reduced-motion이면 GSAP을 아예 켜지 않는다. 아래 `sticky top-0`은
    // CSS라 남지만, 그건 모션이 아니라 레이아웃이고 카드는 전부 읽을 수 있다.
    if (reduce || !ref.current) return
    const ctx = gsap.context(() => {
      // 선택자 문자열은 context가 `ref` 안으로 스코프한다 — 페이지에 스택이
      // 둘 있어도 서로의 카드를 잡지 않는다.
      const cardEls = gsap.utils.toArray<HTMLElement>('.stack-card')
      cardEls.forEach((card, i) => {
        // 마지막 카드는 핀하지 않는다 — 핀할 대상(다음 카드)이 없다.
        if (i === cardEls.length - 1) return
        ScrollTrigger.create({
          trigger: card,
          start: 'top top', // ★ 뷰포트 상단에서 핀. "top center"·"top 80%"로
          //    두면 스크롤 도중에 트리거가 걸려 스택이 어긋난다(스킬 §5 실패 사례).
          endTrigger: cardEls[cardEls.length - 1]!,
          end: 'top top',
          pin: true,
          // 핀 간격을 만들지 않는다 — 만들면 카드 수만큼 빈 화면이 생긴다.
          pinSpacing: false,
        })
        // 물러나는 연출은 **다음 카드의** 스크롤에 매단다. 그래야 "다음이
        // 올라오는 만큼 이전이 물러난다"가 된다.
        gsap.to(card, {
          scale: 0.92,
          opacity: 0.55,
          ease: 'none',
          scrollTrigger: {
            trigger: cardEls[i + 1]!,
            start: 'top bottom',
            end: 'top top',
            scrub: true,
          },
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [reduce])

  const setRoot = (el: HTMLElement | null) => {
    ref.current = el
  }
  const cardClass = 'stack-card sticky top-0 flex min-h-[100dvh] items-center justify-center'
  // 카드는 ReactNode라 안정적인 키가 없다. 순서가 곧 정체성인
  // (재정렬되지 않는) 목록이므로 인덱스 키가 맞는 선택이다.
  const items = cards.map((card, i) =>
    ordered ? (
      <li key={i} className={cardClass}>
        {card}
      </li>
    ) : (
      <div key={i} className={cardClass}>
        {card}
      </div>
    ),
  )

  return ordered ? (
    <ol ref={setRoot} className="relative">
      {items}
    </ol>
  ) : (
    <div ref={setRoot} className="relative">
      {items}
    </div>
  )
}
