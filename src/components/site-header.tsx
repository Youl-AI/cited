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

type HeaderUser = { name: string; email: string }

/**
 * 앱과 마케팅이 같은 머리글을 쓴다. `user`가 있으면 로그인 영역용
 * 내비게이션과 로그아웃을, 없으면 로그인·시작하기를 보여준다.
 */
export function SiteHeader({ user }: { user?: HeaderUser }) {
  const router = useRouter()
  const pathname = usePathname()
  const [signingOut, setSigningOut] = useState(false)

  async function onSignOut() {
    setSigningOut(true)
    await signOut()
    // 세션 쿠키가 사라져도 서버 컴포넌트는 캐시된 트리를 다시 쓴다.
    // refresh()로 버려야 (app) 레이아웃의 requireUser()가 다시 돈다.
    router.refresh()
    router.push('/sign-in')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href={user ? '/dashboard' : '/'}
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
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'rounded-md px-3 py-1.5 font-medium text-foreground'
                      : 'rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
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
          <nav className="flex items-center gap-2 text-sm">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">로그인</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">시작하기</Link>
            </Button>
          </nav>
        )}
      </div>
    </header>
  )
}
