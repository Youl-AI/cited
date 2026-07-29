import Link from 'next/link'

/**
 * 저작권 표시 연도.
 *
 * `new Date().getFullYear()`를 쓰면 안 된다 — 이 바닥글은 정적으로 프리렌더되므로
 * 빌드 시각의 연도가 HTML에 그대로 굳는다. 배포가 없는 채로 해가 바뀌면 사이트가
 * 지난해를 계속 보여준다. 저작권 표시는 "이 저작물이 처음 공개된 해"로 충분하다
 * (범위 표기가 필요해지면 `2026–{올해}`로 바꾸되, 그때도 서버 시각이 아니라
 * 명시적인 상수로 둔다).
 */
const COPYRIGHT_YEAR = 2026

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
          © {COPYRIGHT_YEAR} Cited
        </p>
      </div>
    </footer>
  )
}
