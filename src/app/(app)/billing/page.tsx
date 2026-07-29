import { requireUser } from '@/lib/session'

export const metadata = { title: '결제' }

// 머리글의 "결제" 링크가 가리키는 곳. 내용은 결제 연동과 함께 들어온다.
// 스텁을 두는 이유와 requireUser()를 여기서도 부르는 이유는
// (app)/settings/page.tsx·(app)/layout.tsx 주석과 같다.
export default async function BillingPage() {
  await requireUser()
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">결제</h1>
      <p className="text-muted-foreground">준비 중입니다.</p>
    </div>
  )
}
