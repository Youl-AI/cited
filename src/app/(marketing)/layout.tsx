import { MarketingShell } from '@/components/marketing/marketing-shell'

/**
 * 로그인 없이 볼 수 있는 공개 영역 — 랜딩과 요금제.
 *
 * 껍데기(다크 표면·앰비언트 워시·스마트 헤어라인 머리글·푸터)는 `MarketingShell`
 * 한 곳에 있다. 무료 진단 신청 흐름(`audit/(flow)`)이 같은 껍데기를 쓴다.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>
}
