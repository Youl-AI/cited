'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signIn } from '@/lib/auth-client'
import { authErrorMessage } from '@/lib/auth-errors'

export default function SignInPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const { error } = await signIn.email({
      email: String(formData.get('email')),
      password: String(formData.get('password')),
    })
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cited 로그인</h1>
      <form action={onSubmit} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="이메일"
          className="rounded-lg border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="비밀번호"
          className="rounded-lg border px-3 py-2"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? '처리 중…' : '로그인'}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        아직 계정이 없으신가요?{' '}
        <Link href="/sign-up" className="underline">
          가입하기
        </Link>
      </p>
    </main>
  )
}
