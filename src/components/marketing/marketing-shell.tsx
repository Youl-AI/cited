import { MarketingHeader } from '@/components/marketing/marketing-header'
import { SiteFooter } from '@/components/site-footer'

/**
 * 마케팅 다크 표면의 껍데기.
 *
 * ## 왜 컴포넌트로 뺐는가
 *
 * 이 껍데기를 쓰는 라우트가 둘이다 — `(marketing)`(랜딩·요금제)과
 * `audit/(flow)`(무료 진단 신청·완료). 레이아웃 파일마다 다시 적으면
 * 앰비언트 워시·`<noscript>` 완화·`overflow-x-clip` 같은 **조용히 깨지는
 * 것들**이 한쪽에서만 사라진다. `SiteShell`(앱·리포트)을 만든 이유와 같다.
 *
 * ★ 신청 흐름이 마케팅 표면인 이유: 신청은 전환 행위지 제품 사용이 아니다.
 *   랜딩에서 누른 사람이 밝은 앱 화면으로 떨어지면 그 순간 다른 사이트가 된다.
 *   **리포트(`audit/(report)/[id]`)는 반대다** — 고객에게 배송되는 문서이자
 *   인쇄 대상이라 라이트 표면(`SiteShell`)에 남는다. 그래서 `audit` 밑이
 *   라우트 그룹 둘로 갈라져 있고, `audit/layout.tsx`는 없다(있으면 둘 다
 *   감싸 버린다).
 *
 * ## 여기가 다크 표면을 여는 곳이다
 *
 * `.surface-dark`는 `.dark` 전역 토글이 아니라 **라우트 그룹 스코프**다
 * (globals.css 참고). 이 래퍼 안에서만 shadcn 토큰이 다크 값으로 바뀌고,
 * `dark:` 변형이 깨어난다. 앱(`(app)`)·리포트·약관(`legal`)은 라이트 그대로다
 * — 페이지 중간에서 테마가 뒤집히는 것이 아니라 **표면 단위로 갈린다**
 * (tasteskill §4.11 Page Theme Lock).
 *
 * ★ 래퍼는 `min-h-dvh`여야 한다. body는 여전히 라이트 배경이라 래퍼가 짧으면
 *   아래쪽에 흰 띠가 남는다.
 * ★ `overflow-x-clip`이지 `overflow-x-hidden`이 아니다. hidden은 이 요소를
 *   **스크롤 컨테이너로 만든다** — 그러면 ScrollTrigger 핀이 뷰포트가 아니라
 *   이 컨테이너를 기준으로 잡히고(핀이 어긋나는 대표적인 원인), sticky도 함께
 *   어긋난다. clip은 잘라내기만 하고 스크롤 컨테이너를 만들지 않는다.
 */
export function MarketingShell({
  children,
  /**
   * 머리글의 진단 CTA. **자기 자신을 가리키게 되는 표면에서는 끈다** —
   * 신청 흐름(`audit/(flow)`)이 그 경우다. 근거는 `MarketingHeader` 참고.
   */
  headerCta = true,
}: {
  children: React.ReactNode
  headerCta?: boolean
}) {
  return (
    <div className="surface-dark relative flex min-h-dvh w-full max-w-full flex-col overflow-x-clip">
      {/* 앰비언트 — 브랜드 색상각(258) 하나로만 만든 아주 옅은 라디얼 워시.
          AI-퍼플 금지(tasteskill §4.2 LILA RULE), 네온 글로우 금지(§9.A).
          ★ `fixed` + `pointer-events-none`이다(§6.E). 스크롤하는 컨테이너에
            그라데이션·필터를 붙이면 매 프레임 다시 칠한다. 블러 필터도 쓰지
            않는다 — 라디얼 그라데이션은 이미 부드럽고, 큰 면적의 blur()는
            모바일 GPU를 그대로 먹는다.
          ★ 위치상 첫 번째 **포지셔닝된** 형제다. 뒤따르는 main·footer가
            `relative`여야 그 위로 칠해진다(그래서 둘 다 relative를 단다). */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(72rem 46rem at 82% -14%, oklch(0.5 0.11 258 / 0.3), transparent 62%)',
            'radial-gradient(56rem 40rem at -6% 16%, oklch(0.45 0.08 258 / 0.16), transparent 66%)',
          ].join(','),
        }}
      />

      {/* JS가 꺼진 브라우저 대비 (Task 2 §7.1 인계 사항).
          `Reveal`은 Motion의 `whileInView`라 프리렌더 HTML에 **인라인**
          `style="opacity:0"`이 박힌다. JS가 없으면 그 판정이 영영 돌지 않아
          콘텐츠가 통째로 보이지 않는다. 인라인 스타일은 클래스로 못 이기므로
          `!important`가 유일한 수단이고, `<noscript>`라 JS가 있는 환경에서는
          파싱조차 되지 않는다.
          ★ `dangerouslySetInnerHTML`인 이유: `<noscript>` 안의 자식을 JSX로
            두면 하이드레이션에서 DOM 모양이 어긋난다(브라우저는 noscript
            내용을 텍스트 한 덩어리로 둔다). 문자열로 넘기면 그 불일치가 없다. */}
      <noscript
        dangerouslySetInnerHTML={{
          __html:
            '<style>.surface-dark [style*="opacity:0"]{opacity:1!important;transform:none!important}</style>',
        }}
      />

      {/* 인쇄(PDF 납품)에서는 머리글·바닥글을 숨긴다. 머리글은 `fixed`라
          레이아웃 자리를 차지하지 않으므로 `contents` 래퍼로 감싸도 안전하다. */}
      <div className="contents print:hidden">
        <MarketingHeader cta={headerCta} />
      </div>

      {/* `id="main"`·`tabIndex={-1}`은 루트 레이아웃의 "본문으로 건너뛰기"
          링크가 쓴다(tabindex가 없으면 일부 브라우저가 포커스를 옮기지 않는다). */}
      <main id="main" tabIndex={-1} className="relative flex-1 outline-none">
        {children}
      </main>

      <div className="relative print:hidden">
        <SiteFooter />
      </div>
    </div>
  )
}
