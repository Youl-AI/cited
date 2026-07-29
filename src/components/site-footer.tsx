import Link from 'next/link'

/** 공개 영역의 바닥글. 서버 컴포넌트라 클라이언트 번들에 실리지 않는다. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Link
            href="/"
            className="group inline-flex items-baseline gap-px rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Cited
            <span
              aria-hidden="true"
              className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
            >
              [1]
            </span>
          </Link>
          <p className="max-w-md text-sm text-muted-foreground">
            ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews에서 브랜드 언급을 매주 자동
            추적하는 한국어 GEO 모니터링 도구.
          </p>
        </div>
        <p className="font-mono text-xs tracking-wide text-muted-foreground">
          © {new Date().getFullYear()} Cited
        </p>
      </div>
    </footer>
  )
}
