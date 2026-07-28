'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signUp } from '@/lib/auth-client'
import { MIN_PASSWORD_LENGTH, authErrorMessage } from '@/lib/auth-errors'

export default function SignUpPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const { error } = await signUp.email({
      email: String(formData.get('email')),
      password: String(formData.get('password')),
      name: String(formData.get('name')),
    })
    setPending(false)
    if (error) {
      // error.message는 영어라 쓰지 않는다. 코드만 보고 한국어 문구를 고른다.
      setError(authErrorMessage(error, '가입에 실패했습니다. 잠시 후 다시 시도해 주세요.'))
      return
    }
    router.push('/verify-email')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cited 시작하기</h1>
      <form action={onSubmit} className="flex flex-col gap-3">
        <input name="name" required placeholder="이름" className="rounded-lg border px-3 py-2" />
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
          minLength={MIN_PASSWORD_LENGTH}
          placeholder={`비밀번호 (${String(MIN_PASSWORD_LENGTH)}자 이상)`}
          className="rounded-lg border px-3 py-2"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? '처리 중…' : '가입하기'}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        이미 계정이 있으신가요?{' '}
        <Link href="/sign-in" className="underline">
          로그인
        </Link>
      </p>
    </main>
  )
}
