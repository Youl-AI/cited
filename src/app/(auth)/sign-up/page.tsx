'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signUp } from '@/lib/auth-client'

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
      setError(error.message ?? '가입에 실패했습니다.')
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
          minLength={10}
          placeholder="비밀번호 (10자 이상)"
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
