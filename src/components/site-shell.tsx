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
 *
 * ## 인쇄(PDF 납품)에서는 머리글·푸터를 숨긴다
 *
 * 리포트 PDF는 파일로 전달되는 문서다 — 화면용 내비게이션·로그인 버튼이
 * 매 인쇄물 첫 장에 찍히면 문서가 아니라 웹페이지 캡처처럼 보인다.
 *
 * ★ 래퍼는 `contents`다. 평범한 div로 감싸면 머리글의 `sticky top-0`이
 *   뷰포트가 아니라 그 div(머리글 높이짜리)에 붙어 화면 스크롤에서 고정이
 *   풀린다. `display: contents`는 박스를 만들지 않아 화면 동작이 그대로고,
 *   인쇄에서는 `print:hidden`(display: none)이 하위 전체를 숨긴다.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="contents print:hidden">
        <SiteHeader />
      </div>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <div className="contents print:hidden">
        <SiteFooter />
      </div>
    </div>
  )
}
