import { SiteShell } from '@/components/site-shell'

/**
 * 무료 진단 **리포트** — `/audit/[id]`. 로그인 없이 본다.
 *
 * ★ 라이트 표면이다. 리포트는 고객에게 배송되는 결과물이고 `pnpm audit:pdf`가
 *   그대로 인쇄한다 — 다크로 넘기면 잉크와 대비가 무너지고, 유료 납품물이
 *   화면 캡처처럼 보인다. 신청 흐름(`audit/(flow)`)이 마케팅 다크로 넘어갈 때
 *   이 라우트가 따라가지 않도록 라우트 그룹을 갈랐다.
 *
 * ★ `SiteShell`을 쓰는 이유는 껍데기가 앱과 같아서만이 아니다. 푸터의 사업자
 *   표시(전자상거래법 제10조)가 여기서 빠지면 안 된다.
 */
export default function AuditReportLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
