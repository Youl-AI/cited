'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        {/* ★ 로그인 상태에서도 `/`로 간다. 원래는 `/dashboard`였는데, 지금
            대시보드는 5단계 전까지 빈 스텁이라 **거기서 나갈 길이 없었다** —
            로고를 눌러도 제자리, 설정·결제는 "준비 중". 실제로 그렇게 갇혔다.
            대시보드가 내용을 갖게 되면 `user ? '/dashboard' : '/'`로 되돌린다. */}
        <Link
          href="/"
          className="group inline-flex items-baseline gap-px rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Cited
          {/* 각주 표식. 인용된 문장 뒤에 붙는 바로 그 기호이고, 이 제품이
              하는 일 자체다. 읽어 줄 내용은 없으므로 보조기기에는 숨긴다. */}
          <span
            aria-hidden="true"
            className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
          >
            [1]
          </span>
        </Link>

        {user ? (
          <nav className="flex items-center gap-1 text-sm">
            {APP_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              // 워드마크와 같은 포커스 링을 쓴다. 링크마다 초점 표시가 다르면
              // 키보드로 훑을 때 어디에 있는지 놓친다.
              const focus =
                'rounded-md px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? `${focus} font-medium text-foreground`
                      : `${focus} text-muted-foreground transition-colors hover:bg-accent hover:text-foreground`
                  }
                >
                  {item.label}
                </Link>
              )
            })}
            <span className="ml-3 hidden max-w-40 truncate text-muted-foreground sm:inline">
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
          <nav className="flex items-center gap-2 text-sm">
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
          className="border-t border-border bg-destructive/10 px-6 py-2 text-center text-sm text-destructive"
        >
          {signOutError}
        </p>
      ) : null}
    </header>
  )
}
