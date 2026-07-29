'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_PASSWORD_LENGTH, authErrorMessage } from '@/lib/auth-errors'
import { signUp } from '@/lib/auth-client'

export default function SignUpPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    // 연결이 끊기면 signUp.email은 { error }가 아니라 **던진다** — 잡지 않으면
    // global-error가 폼을 통째로 갈아치운다. 근거는 sign-in/page.tsx 참고.
    let error: { code?: string | undefined } | null
    try {
      ;({ error } = await signUp.email({
        email: String(formData.get('email')),
        password: String(formData.get('password')),
        name: String(formData.get('name')),
      }))
    } catch {
      setError('요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
      setPending(false)
      return
    }
    setPending(false)
    if (error) {
      // error.message는 영어라 쓰지 않는다. 코드만 보고 한국어 문구를 고른다.
      setError(authErrorMessage(error, '가입에 실패했습니다. 잠시 후 다시 시도해 주세요.'))
      return
    }
    router.push('/verify-email')
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
        <h1 className="text-2xl font-semibold tracking-tight">시작하기</h1>
      </div>

      <form action={onSubmit} className="flex flex-col gap-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
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
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            {String(MIN_PASSWORD_LENGTH)}자 이상
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? '처리 중…' : '가입하기'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        이미 계정이 있으신가요?{' '}
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          로그인
        </Link>
      </p>
    </main>
  )
}
