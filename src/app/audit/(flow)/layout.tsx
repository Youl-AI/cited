import { MarketingShell } from '@/components/marketing/marketing-shell'

/**
 * 무료 진단 **신청 흐름** — `/audit/new`, `/audit/requested`. 로그인 없이 본다.
 *
 * ★ 여기는 마케팅 표면(다크)이다. 신청은 전환 행위지 제품 사용이 아니다.
 *   랜딩의 "무료 진단 받기"를 누른 사람이 밝은 앱 화면으로 떨어지면 그 순간
 *   다른 사이트가 된다(Task 3 인계 3번).
 *
 * ★ 리포트(`audit/(report)/[id]`)는 **여기 들어오면 안 된다.** 그쪽은 고객에게
 *   배송되는 문서이고 인쇄(PDF) 대상이라 라이트 표면이어야 한다. 그래서
 *   `audit/layout.tsx`를 두지 않고 라우트 그룹 둘로 갈랐다 — 공용 레이아웃이
 *   하나라도 있으면 리포트까지 그 표면에 물린다.
 */
export default function AuditFlowLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>
}
