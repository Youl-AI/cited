'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { CtaLink } from '@/components/marketing/cta-link'
import { Wordmark } from '@/components/wordmark'
import { cn } from '@/lib/utils'

/**
 * 마케팅 표면의 머리글 — 스마트 헤어라인 바.
 *
 * ## 왜 알약이 아니라 바인가
 *
 * 처음에는 항상 떠 있는 유리 알약이었다. "언제나 화면 위에 떠서 따라오는
 * 위젯"은 콘텐츠와 경쟁하고, 계측 시트·헤어라인으로 정리한 새 표면 어휘와도
 * 겉돌았다. 지금은 **전폭 헤어라인 바**다:
 *
 * - **페이지 최상단**: 투명. 배경도 선도 없이 히어로에 녹아 있다.
 * - **스크롤 후**: 유리 + 아래 헤어라인. 콘텐츠 위에 서는 자격은 blur가
 *   고정 요소에만 허용되는 규칙(soft-skill §6) 그대로다.
 *
 * ## 내릴 때 사라지고, 올릴 때 돌아온다
 *
 * 아래로 스크롤 = 읽는 중이다. 머리글은 화면을 양보하고 위로 빠진다.
 * 위로 스크롤 = 무언가를 찾는 신호다. 그 순간 슬라이드로 돌아온다.
 * 모션의 동기(§5 Motion Motivated)는 **피드백**이다: 방향 전환이라는 사용자
 * 행동에 대한 즉답. reduced-motion이면 숨김 자체를 하지 않는다 — 항상 떠
 * 있는 정적 바로 격하된다(사라지는 UI는 모션이 아니라 상태 변화라서, 모션을
 * 끈 사람에게는 아예 일어나지 않아야 한다).
 *
 * ## 클라이언트 컴포넌트가 된 비용
 *
 * 이전 버전은 서버 컴포넌트(JS 0바이트)였다. 스크롤 방향 감지는 JS 없이는
 * 불가능하고, 원시 scroll 리스너는 금지라(§5.D) Motion `useScroll`을 쓴다.
 * 마케팅 라우트는 이미 Motion을 싣고 있어 증분은 이 파일 하나 분량이다.
 * LCP 요소는 히어로이지 머리글이 아니다.
 *
 * ## 왜 `SiteHeader`와 갈랐는가 (변함없음)
 *
 * `SiteHeader`는 로그인 영역의 도구 막대다. 이 머리글은 로그인 상태를 모르고
 * 링크 두 개만 갖는다. 워드마크는 공용 `<Wordmark/>`, 라벨·목적지는
 * `marketing-header.test.tsx`가 잠근다.
 *
 * ★ 로그인·회원가입을 한 링크로 둔다. 두 버튼으로 나누면 "나는 어느 쪽이지"를
 *   머리글에서 판단하게 만든다. 로그인 화면이 하단에서 회원가입으로 보낸다.
 * ★ 가장 강한 버튼은 `무료 진단 받기`다. `시작하기`(회원가입)가 아니다 —
 *   가입해도 볼 것이 없는 동안 그 버튼은 실제 제품과 경쟁한다. 유료가 열리면
 *   되돌린다.
 */
export function MarketingHeader({
  /**
   * 진단 CTA를 세울지. **신청 흐름 안에서는 끈다**(`audit/(flow)`).
   * `/audit/new`에서는 자기 페이지를 가리키는 no-op이고, `/audit/requested`는
   * 이미 신청한 사람에게 중복 신청을 권하게 된다.
   */
  cta = true,
}: { cta?: boolean } = {}) {
  const { scrollY } = useScroll()
  const reduce = useReducedMotion()
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? y
    setScrolled(y > 16)
    // 최상단 근처에서는 절대 숨기지 않는다 — 히어로에서 머리글이 도망가면
    // 첫 화면이 미완성으로 읽힌다. reduced-motion이면 항상 보인다(머리말).
    if (reduce || y < 96) {
      setHidden(false)
      return
    }
    // 트랙패드 미세 진동(±1px)으로 상태가 떨리는 것을 막는다.
    if (Math.abs(y - prev) < 2) return
    setHidden(y > prev)
  })

  return (
    // z-40이다. 루트 레이아웃의 "본문으로 건너뛰기" 링크가 `focus:z-50`으로
    // 뜨는데(app/layout.tsx), 머리글이 z-50이면 같은 층에서 나중에 그려지는
    // 쪽이 이기므로 포커스된 skip 링크가 머리글 뒤에 숨는다. 앱 머리글과
    // 같은 규칙: 머리글 40 < skip 링크 50.
    <motion.header
      className="fixed inset-x-0 top-0 z-40"
      initial={false}
      animate={hidden ? 'hidden' : 'shown'}
      variants={{ hidden: { y: '-100%' }, shown: { y: 0 } }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={cn(
          'border-b transition-[background-color,border-color] duration-[var(--motion-state)] ease-instrument',
          scrolled ? 'glass border-border bg-background/70' : 'border-transparent bg-transparent',
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-4 sm:px-6">
          <Wordmark className="text-sm sm:text-lg" />

          <nav aria-label="주요" className="flex items-center gap-0.5 sm:gap-2">
            <Link
              href="/sign-in"
              className="rounded-full px-1.5 py-2 text-xs text-muted-foreground transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:text-sm"
            >
              로그인 · 회원가입
            </Link>
            {cta && (
              <CtaLink href="/audit/new" size="sm">
                무료 진단 받기
              </CtaLink>
            )}
          </nav>
        </div>
      </div>
    </motion.header>
  )
}
