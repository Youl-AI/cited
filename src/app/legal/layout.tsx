import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

/**
 * 법적 문서(이용약관·개인정보처리방침) 전용 레이아웃.
 *
 * `id="main" tabIndex={-1}`은 장식이 아니다 — 루트 레이아웃(`src/app/layout.tsx`)의
 * "본문으로 건너뛰기" 링크가 `#main`을 대상으로 포커스를 옮긴다. 이게 없으면
 * 법적 페이지에서만 건너뛰기 링크가 조용히 아무 일도 하지 않는다.
 *
 * `prose` 유틸리티 클래스(Tailwind Typography 플러그인)는 쓰지 않는다 — 이
 * 프로젝트는 그 플러그인을 설치하지 않았고(다른 화면도 전부 수동 유틸리티로
 * 타이포그래피를 잡는다), 새 의존성 하나를 추가하는 대신 아래 자손 선택자로
 * 같은 결과를 낸다.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <article
          className="mx-auto w-full max-w-3xl px-6 py-14
            [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight
            [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground
            [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-foreground/90
            [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:leading-relaxed [&_ul]:text-foreground/90
            [&_li]:leading-relaxed
            [&_strong]:font-semibold [&_strong]:text-foreground
            [&_table]:mt-4 [&_table]:w-full
            first:[&>*]:mt-0"
        >
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
