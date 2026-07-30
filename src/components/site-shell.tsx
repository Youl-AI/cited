import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * 로그인 없이 볼 수 있는 공개 화면의 껍데기.
 *
 * ★ 레이아웃마다 같은 구조를 다시 적지 않는다. 푸터에는 전자상거래법 제10조가
 *   요구하는 사업자 표시가 들어 있으므로, 한쪽 레이아웃에만 붙어 있으면 다른
 *   경로에서 그 표시가 빠진다 — 표시를 빠뜨리는 것 자체가 위반이다.
 *
 * `id="main"`·`tabIndex={-1}`은 루트 레이아웃의 "본문으로 건너뛰기" 링크가 쓴다
 * (tabindex가 없으면 일부 브라우저가 포커스를 옮기지 않는다).
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
