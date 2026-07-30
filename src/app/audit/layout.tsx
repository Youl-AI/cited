import { SiteShell } from '@/components/site-shell'

/**
 * 무료 진단의 안내·리포트 화면. 로그인 없이 본다.
 *
 * ★ `(marketing)`과 같은 껍데기를 쓴다. 리포트는 고객에게 배송되는 결과물이고,
 *   푸터의 사업자 표시가 여기서 빠지면 안 된다.
 */
export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
