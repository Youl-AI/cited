'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authErrorMessage } from '@/lib/auth-errors'
import { signIn } from '@/lib/auth-client'

export default function SignInPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    // 연결이 끊기면(오프라인·DNS 실패) signIn.email은 { error }가 아니라
    // **던진다** — better-fetch가 fetch 예외를 잡지 않는다. 잡지 않으면
    // (auth) 그룹에는 error.tsx가 없어 global-error가 페이지를 통째로 갈아치우고,
    // 입력하던 값까지 사라진다. site-header.tsx의 onSignOut과 같은 방어다.
    let error: { code?: string | undefined } | null
    try {
      ;({ error } = await signIn.email({
        email: String(formData.get('email')),
        password: String(formData.get('password')),
      }))
    } catch {
      setError('요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
      setPending(false)
      return
    }
    setPending(false)
    if (error) {
      // 미인증 계정이면 서버가 확인 메일을 다시 보낸다 (auth.ts의 sendOnSignIn).
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        router.push('/verify-email')
        return
      }
      // error.message는 영어라 쓰지 않는다. 코드만 보고 한국어 문구를 고른다.
      // (매핑은 auth-errors.ts — 로그인 실패는 이메일/비밀번호를 구분하지 않는다.)
      setError(authErrorMessage(error, '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'))
      return
    }
    router.push('/dashboard')
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-16 outline-none">
      <div className="space-y-3">
        <Link
          href="/"
          className="group inline-flex items-baseline gap-px rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Cited
          <span
            aria-hidden="true"
            className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
          >
            [1]
          </span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
      </div>

      <form action={onSubmit} className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? '처리 중…' : '로그인'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        아직 계정이 없으신가요?{' '}
        <Link href="/sign-up" className="text-foreground underline underline-offset-4">
          가입하기
        </Link>
      </p>
    </main>
  )
}
