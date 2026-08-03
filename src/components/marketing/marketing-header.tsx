import Link from 'next/link'
import { CtaLink } from '@/components/marketing/cta-link'
import { Wordmark } from '@/components/wordmark'

/**
 * 마케팅 표면의 머리글 — 떠 있는 유리 알약.
 *
 * ## 왜 `SiteHeader`와 갈랐는가
 *
 * 두 머리글이 하는 일이 다르다. `SiteHeader`는 **로그인 영역의 도구 막대**다
 * (대시보드·설정·결제 이동, 로그아웃, 로그아웃 실패 알림). 이 머리글은
 * 로그인 상태를 전혀 모르고 링크 두 개만 갖는다. 표면 variant prop 하나로
 * 합칠 수도 있었지만 그러면:
 *
 * - 유리·모션·Phosphor 아이콘이 **앱 라우트의 번들에도 실린다.** 이 파일은
 *   마케팅 라우트에서만 import된다.
 * - 로그아웃 로직(`signOut` + 실패 처리)이 붙은 클라이언트 컴포넌트가 된다.
 *   지금 이 머리글은 **서버 컴포넌트라 JS를 한 바이트도 싣지 않는다** —
 *   랜딩의 LCP에 직접 이득이다.
 *
 * 대신 갈라지면 문구가 어긋날 수 있다. 그래서 워드마크는 공용
 * `<Wordmark/>`이고, 두 머리글의 라벨·목적지는 테스트가 함께 잠근다
 * (`marketing-header.test.tsx`).
 *
 * ## 규격 (tasteskill §4.7 · soft-skill §5.A)
 *
 * - **디태치드**: 상단에 붙지 않고 `pt-3~4`만큼 띄운다.
 * - **데스크톱 한 줄**, 알약 높이 56px(상단 여백 포함 72px) — 상한 80px 아래.
 * - **blur는 고정 요소에만**: 이 머리글은 `fixed`라 `.glass`를 쓸 자격이 있다.
 *   스크롤하는 콘텐츠에는 절대 붙이지 않는다.
 * - 항목이 둘뿐이라 햄버거를 만들지 않는다. 링크 두 개를 메뉴 뒤에 숨기는 것은
 *   장식이지 정보 구조가 아니다.
 *
 * ★ 로그인·회원가입을 한 링크로 둔다. 두 버튼으로 나누면 "나는 어느 쪽이지"를
 *   머리글에서 판단하게 만든다. 로그인 화면이 하단에서 회원가입으로 보낸다.
 * ★ 가장 강한 버튼은 `무료 진단 받기`다. `시작하기`(회원가입)가 아니다 —
 *   가입해도 볼 것이 없는 동안 그 버튼은 실제 제품과 경쟁하면서 사용자를
 *   빈 곳으로 보낸다. 유료가 열리면 되돌린다.
 */
export function MarketingHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="glass flex h-14 items-center justify-between gap-2 rounded-full border border-border bg-card/70 pr-1.5 pl-3.5 shadow-elevation-2 sm:gap-4 sm:pl-6">
          <Wordmark className="text-sm sm:text-lg" />

          <nav aria-label="주요" className="flex items-center gap-0.5 sm:gap-2">
            <Link
              href="/sign-in"
              className="rounded-full px-1.5 py-2 text-xs text-muted-foreground transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:text-sm"
            >
              로그인 · 회원가입
            </Link>
            <CtaLink href="/audit/new" size="sm">
              무료 진단 받기
            </CtaLink>
          </nav>
        </div>
      </div>
    </header>
  )
}
