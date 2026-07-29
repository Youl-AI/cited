import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/** 로그인 없이 볼 수 있는 공개 영역. 3단계의 무료 진단 화면이 여기 들어온다. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
