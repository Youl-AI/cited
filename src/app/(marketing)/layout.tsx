import { SiteShell } from '@/components/site-shell'

/** 로그인 없이 볼 수 있는 공개 영역. 무료 진단 신청과 요금제가 여기 있다. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
