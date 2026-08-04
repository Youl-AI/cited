'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'
import { signOut } from '@/lib/auth-client'

/** 로그인 영역의 상단 내비게이션. 순서는 쓰는 빈도 순이다. */
const APP_NAV = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/settings', label: '설정' },
  { href: '/billing', label: '결제' },
] as const

const SIGN_OUT_FAILED =
  '로그아웃하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'

type HeaderUser = { name: string; email: string }

/**
 * 앱과 마케팅이 같은 머리글을 쓴다. `user`가 있으면 로그인 영역용
 * 내비게이션과 로그아웃을, 없으면 로그인·시작하기를 보여준다.
 */
export function SiteHeader({ user }: { user?: HeaderUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function onSignOut() {
    setSigningOut(true)
    setSignOutError(null)

    // ★ 결과를 버리고 무조건 이동하면 안 된다. 요청이 실패해도 화면만
    //   /sign-in으로 넘어가고 **세션 쿠키는 살아 있다** — 공용 PC에서
    //   "로그아웃했다"고 믿은 사용자의 세션이 그대로 남는다.
    //   실패는 두 모양으로 온다: 서버가 4xx·5xx를 돌려주면 { error }가 오고,
    //   연결 자체가 끊기면(오프라인·DNS 실패) fetch가 **던진다**. 둘 다 잡지
    //   않으면 예외 경로에서 버튼이 "나가는 중…"으로 영구히 잠긴다
    //   (실제로 요청을 끊어서 확인했다).
    // authErrorMessage의 매핑표는 로그인·가입·인증 문맥용이다. 로그아웃 응답에
    // USER_NOT_FOUND가 실려 오면 "이메일 또는 비밀번호가 올바르지 않습니다"가,
    // SESSION_EXPIRED면 "다시 로그인해 주세요"가 뜬다 — 로그아웃 중에 둘 다
    // 말이 안 된다. 여기서는 코드와 무관하게 한 문구로 간다.
    let failed: string | null = null
    try {
      const { error } = await signOut()
      if (error) failed = SIGN_OUT_FAILED
    } catch {
      failed = SIGN_OUT_FAILED
    }

    if (failed !== null) {
      setSignOutError(failed)
      setSigningOut(false)
      return
    }

    // 여기부터는 서버가 세션을 지웠다는 뜻이다.
    // 세션 쿠키가 사라져도 서버 컴포넌트는 캐시된 트리를 다시 쓴다.
    // refresh()로 버려야 (app) 레이아웃의 requireUser()가 다시 돈다.
    router.refresh()
    router.push('/sign-in')
  }

  return (
    // 앱 머리글은 **스티키 도구 막대**다. 마케팅처럼 떠 있는 알약으로 만들지
    // 않는다 — 대시보드는 스크롤하면서 계속 돌아오는 화면이고, 떠 있는 알약은
    // 그 아래 데이터를 가린다. 대신 가족 언어는 두 가지로 잇는다:
    //   1) 높이 56px(h-14) — 마케팅 알약과 같은 값.
    //   2) 유리(`.glass`) — 스크롤하는 콘텐츠가 아래로 흐릿하게 비친다.
    // ★ `.glass`를 쓸 자격이 있는가: soft-skill §6은 backdrop-filter를 **고정·
    //   스티키 요소에만** 허용한다. 이 머리글은 sticky다. 스크롤 컨테이너에
    //   붙이는 것이 금지된 것이지 스티키 크롬은 정확히 그 용도다.
    // ★ 투명도를 줄여 달라는 사용자에게는 globals.css의 언레이어 규칙이
    //   `background-color: var(--card)`로 되돌린다 — 그때도 대비는 그대로다.
    // ★ `print:hidden` — 인쇄물에 화면 내비게이션을 찍지 않는다. 공개 화면은
    //   `SiteShell`이 `contents print:hidden` 래퍼로 이미 숨기고 있었는데,
    //   로그인 구간(`(app)/layout.tsx`)에는 그 래퍼가 없어서 **회차 상세를
    //   브라우저에서 인쇄하면 머리글(워드마크·대시보드/설정/결제·로그아웃)이
    //   첫 장에 찍혔다.** 방어를 머리글 자신에게 옮기면 껍데기가 무엇이든
    //   같은 결과가 나온다(SiteShell의 래퍼는 푸터도 함께 맡으므로 그대로 둔다 —
    //   인쇄 규칙은 지우지 않는다).
    //   `/audit/[id]` PDF 납품물에는 변화가 없다: 거기서는 이미 숨겨져 있었다.
    <header className="glass sticky top-0 z-40 border-b border-foreground/[0.07] bg-background/85 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        {/* ★ 로그인 상태에서도 `/`로 간다. 원래는 `/dashboard`였는데, 지금
            대시보드는 5단계 전까지 빈 스텁이라 **거기서 나갈 길이 없었다** —
            로고를 눌러도 제자리, 설정·결제는 "준비 중". 실제로 그렇게 갇혔다.
            대시보드가 내용을 갖게 되면 `user ? '/dashboard' : '/'`로 되돌린다.
            마케팅 머리글·바닥글과 같은 워드마크를 쓴다(`components/wordmark.tsx`) —
            세 곳에 따로 적어 두면 각주 표식이 한 곳에서만 사라진다. */}
        <Wordmark className="text-base sm:text-lg" />

        {user ? (
          <nav aria-label="주요" className="flex items-center gap-1 text-sm sm:gap-2">
            {/* 세그먼트 트레이 — 현재 위치를 **글자 굵기가 아니라 판**으로
                말한다. 굵기만으로 표시하면 세 항목을 나란히 놓았을 때 어느
                쪽이 굵은지 비교해야 알 수 있다(redesign-skill: "no indication
                of current page"). 트레이 안에서 활성 항목만 카드색으로 1단
                떠오르면 훑는 눈이 바로 잡는다.
                반경은 카드·탭과 같은 동심 뺄셈이다: 껍질 --radius×1.4,
                베젤 4px(p-1), 항목 = 껍질 − 베젤. */}
            <div className="flex items-center gap-0.5 rounded-[calc(var(--radius)*1.4)] bg-muted/70 p-1 ring-1 ring-foreground/[0.06]">
              {APP_NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                // 워드마크와 같은 포커스 링을 쓴다. 링크마다 초점 표시가 다르면
                // 키보드로 훑을 때 어디에 있는지 놓친다.
                const base =
                  'rounded-[calc(var(--radius)*1.4-0.25rem)] px-2.5 py-1.5 text-xs transition-[color,background-color,box-shadow] duration-[var(--motion-micro)] ease-instrument focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:text-sm'
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? `${base} bg-card font-medium text-foreground shadow-elevation-1`
                        : `${base} text-muted-foreground hover:bg-card/60 hover:text-foreground`
                    }
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
            <span className="ml-1 hidden max-w-40 truncate text-muted-foreground sm:inline">
              {user.name}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void onSignOut()} disabled={signingOut}>
              {signingOut ? '나가는 중…' : '로그아웃'}
            </Button>
          </nav>
        ) : (
          // ★ 기본 버튼이 `시작하기`(회원가입)였다. 그게 화면에서 가장 강한
          //   CTA인데, 가입해도 볼 것이 없고(대시보드는 5단계) 결제는 열려
          //   있지도 않다. 즉 **실제 제품인 무료 진단과 경쟁하면서 빈 곳으로
          //   보내고 있었다.** 게다가 진단 신청 뒤 "메일함을 확인해 주세요"
          //   화면 위에 `시작하기`가 떠 있어서, 신청이 회원가입인지 아닌지
          //   헷갈리게 만들었다.
          //
          //   유료가 열리면 되돌린다 — 그때는 `시작하기`가 진짜 시작이 된다.
          <nav aria-label="주요" className="flex items-center gap-1.5 text-sm sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              {/* 로그인 화면이 하단에서 회원가입으로 보낸다. 두 버튼으로 나누면
                  "나는 어느 쪽이지"를 머리글에서 판단하게 만든다. */}
              <Link href="/sign-in">로그인 · 회원가입</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/audit/new">무료 진단 받기</Link>
            </Button>
          </nav>
        )}
      </div>

      {/* 로그아웃 실패는 조용히 넘어가면 안 되는 종류의 실패다. 머리글 안쪽
          한 줄로 띄워서, 여전히 로그인 상태라는 사실을 분명히 알린다. */}
      {signOutError ? (
        <p
          role="alert"
          className="border-t border-foreground/[0.07] bg-destructive/10 px-4 py-2 text-center text-sm font-medium text-destructive sm:px-6"
        >
          {signOutError}
        </p>
      ) : null}
    </header>
  )
}
