import { SiteHeader } from '@/components/site-header'
import { requireUser } from '@/lib/session'

/**
 * 로그인 필수 구간. 이 그룹 안의 모든 페이지는 여기서 한 번 걸러진다 —
 * 세션이 없으면 requireUser()가 /sign-in으로 보낸다.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader user={{ name: user.name, email: user.email }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  )
}
