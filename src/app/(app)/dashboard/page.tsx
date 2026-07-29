import { requireUser } from '@/lib/session'

export const metadata = { title: '대시보드' }

// 5단계에서 통째로 교체된다. 지금 있는 이유는 하나 — 인증 가드가 실제로
// 동작하는지 확인할 대상이 필요해서다.
export default async function DashboardPage() {
  const user = await requireUser()
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
      <p className="text-muted-foreground">{user.name}님, 아직 등록된 브랜드가 없습니다.</p>
    </div>
  )
}
