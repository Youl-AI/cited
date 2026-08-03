'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useReducedMotion } from 'motion/react'

gsap.registerPlugin(ScrollTrigger)

/** 기본 스크럽 길이(px). 장면 하나가 소비하는 스크롤 거리. */
export const PIN_SCENE_LENGTH = 1500

/**
 * 진행률 스크럽 핀 섹션 (tasteskill §5.B 골격의 일반화).
 *
 * §5.B는 트랙의 `x`를 스크럽한다. 여기서는 **스칼라 0→1 하나**를 같은 방식으로
 * 스크럽하고 그 값을 `onProgress`로 넘긴다 — 수평 팬은 그 값의 한 가지 용도일
 * 뿐이고, 스펙 §4.1의 "실측 재현" 장면(질의 타이핑 → 답변 스트리밍 → 언급
 * 하이라이트 → 언급률 정착)은 x 이동이 아니라 **하나의 진행률에 여러 연출을
 * 매다는** 구조라서다.
 *
 * 동기(Motion Motivated): 스토리텔링. 측정이 어떤 순서로 일어나는지를 스크롤
 * 속도에 바인딩해 사용자가 직접 되감아 볼 수 있게 한다.
 *
 * ★ **차트에는 쓰지 않는다** (design-language §6). 스크롤 위치가 계측값의
 *   표현을 결정하면 안 된다. 이 컴포넌트는 마케팅 스크롤텔링 전용이다.
 *
 * ★ **이 트리 안에서 Motion(`motion.div` 등)을 쓰지 않는다** — 혼용 금지.
 *   `useReducedMotion`은 애니메이션이 아니라 미디어 쿼리 훅이고 §5.A/5.B
 *   캐노니컬 골격이 직접 쓰는 형태라 예외다.
 *
 * ★ `onProgress`는 **GSAP 티커에서 초당 수십 번** 불린다. 받은 값을 `useState`로
 *   저장하면 그 빈도로 React 트리가 리렌더된다(스킬 §3.B 금지). ref/DOM에 직접
 *   쓰거나 `gsap.quickSetter`로 소비해라 — Motion의 `useMotionValue`는 여기서
 *   답이 아니다(같은 트리, 혼용 금지).
 */
export function PinScene({
  children,
  length = PIN_SCENE_LENGTH,
  onProgress,
}: {
  children: ReactNode
  length?: number
  onProgress?: (p: number) => void
}) {
  // ref가 둘인 이유 — **핀 대상이 컴포넌트의 루트 노드면 안 된다.**
  // ScrollTrigger는 핀할 요소를 `pin-spacer` div로 감싸면서 **원래 부모에서
  // 빼낸다**. 그 요소가 React가 직접 삽입한 루트면, 언마운트 때 React가
  // 기억하는 부모에 대고 `removeChild`를 불러 `NotFoundError: The node to be
  // removed is not a child of this node`로 터진다(실측 — 테스트가 이 형태로
  // 실패했다). `ctx.revert()`는 useEffect cleanup이라 DOM 제거보다 **늦게**
  // 돈다. 그래서 GSAP이 절대 건드리지 않는 바깥 div를 React 소유로 두고,
  // 그 안의 `<section>`만 핀한다 — pin-spacer는 바깥 div 안에서 생겼다
  // 사라지므로 React의 트리 인식이 깨지지 않는다.
  // (tasteskill §5.B 골격은 루트 `<section>`을 그대로 핀한다. 이 한 겹이
  //  골격과 다른 유일한 지점이고, 이유는 위와 같다.)
  const wrap = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  // 콜백을 ref에 담는다. 호출부가 인라인 화살표를 넘기는 게 정상인데
  // (`onProgress={(p) => setP(p)}`) 그걸 아래 effect의 deps에 넣으면 **매
  // 렌더마다 ScrollTrigger를 부수고 다시 만든다** — 핀이 풀렸다 걸리며 스크롤
  // 위치가 튄다. 값은 항상 최신, 구독은 한 번.
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onProgressRef.current = onProgress
  })

  useEffect(() => {
    const el = scene.current
    if (!el) return

    // `ctx.revert()`는 트윈을 **되감으며** 되돌린다 — 그 과정에서 트윈의
    // onUpdate가 몇 번 더 발화한다(실측: 언마운트 후 `onProgress(0)` 3회).
    // 호출부는 이미 사라진 뒤라 "언마운트된 컴포넌트에 setState" 부류의 사고가
    // 된다. 되감기 값은 되돌리는 과정일 뿐 사용자가 스크롤한 결과가 아니므로
    // 아예 내보내지 않는다.
    let disposed = false
    const emit = (p: number) => {
      if (disposed) return
      onProgressRef.current?.(p)
    }

    // reduced-motion: 핀도 스크럽도 걸지 않고 **완성 상태**를 알린다.
    // 0을 보내면 호출부가 "아직 시작 전" 화면(빈 답변·빈 숫자)에 멈춘다 —
    // 모션이 꺼진 환경에서 콘텐츠가 사라지는 것과 같다(design-language §6).
    //
    // ★ "마운트당 1회"가 아니라 **구독당 1회**다. 이 effect는 `[reduce, length]`로
    //   다시 도므로 `length`가 바뀌면 다시 한 번 나간다. 값이 항상 1이라 멱등이지만,
    //   호출부가 "1을 받았다"를 트리거로 쓰면(예: 1회성 로깅) 중복될 수 있다.
    if (reduce) {
      emit(1)
      return
    }

    const ctx = gsap.context(() => {
      // §5.B가 트랙의 x를 트윈하는 자리. 대상만 로컬 스칼라로 바뀌었고
      // ScrollTrigger 설정은 골격 그대로다.
      const scrubbed = { progress: 0 }
      gsap.to(scrubbed, {
        progress: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top', // 섹션 상단이 뷰포트 상단에 닿을 때 핀 시작
          end: () => `+=${length}`, // 스크럽 길이 = 이 장면이 먹는 스크롤 거리
          pin: true,
          scrub: 1, // 1초 랙 — 스크롤을 놓아도 값이 따라붙어 부드럽다
          invalidateOnRefresh: true,
        },
        // 스크럽된 값은 GSAP 티커가 굴린다. 여기서 흘려보내야 스크롤을 놓은
        // 뒤의 따라붙는 구간까지 호출부가 받는다.
        onUpdate: () => emit(scrubbed.progress),
      })
    }, wrap)
    return () => {
      disposed = true // ★ revert()보다 먼저 — 되감기 발화를 막는 게 목적이다
      ctx.revert()
    }
  }, [reduce, length])

  return (
    <div ref={wrap}>
      {/* `min-h-[100dvh]` — 핀되는 요소는 뷰포트 높이여야 한다. 더 짧으면 핀
          중에 아래가 비고, `h-screen`은 iOS 주소창에서 튄다(스킬 §3.E). */}
      <section ref={scene} className="relative min-h-[100dvh]">
        {children}
      </section>
    </div>
  )
}
