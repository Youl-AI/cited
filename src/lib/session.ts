import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/** 서버 컴포넌트·Route Handler·Server Action에서 현재 세션을 얻는다. 없으면 null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/** 로그인 필수 구간에서 쓴다. 세션이 없으면 사인인으로 보낸다. */
export async function requireUser() {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')
  return session.user
}

/** 관리자 전용 구간. `role`은 DB의 user_role_check로 'user' | 'admin'만 들어온다. */
export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/dashboard')
  return user
}
