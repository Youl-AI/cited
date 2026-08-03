import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

// 본문 서체. 지금까지 한글은 시스템 서체(기기마다 다른 것)에 맡겨 두었는데,
// 그러면 같은 화면이 맥·윈도우에서 다른 리듬으로 읽힌다. SUIT는 가변 서체
// 하나로 100–900을 덮으므로 웨이트별 파일을 따로 싣지 않아도 되고, woff2
// 압축 후 610KB라 한글 웹폰트치고 가볍다(웨이트 3개짜리 정적 한글 서체보다
// 작다). --font-sans 체인 맨 앞이므로 라틴·한글 모두 여기서 잡힌다 —
// 순서와 폴백은 globals.css의 --font-sans 주석 참고.
const suit = localFont({
  src: './fonts/SUIT-Variable.woff2',
  variable: '--font-suit',
  weight: '100 900',
  display: 'swap',
})

// SUIT 뒤의 라틴 폴백. SUIT가 뜨기 전(swap 구간)이나 실패했을 때 라틴·숫자를
// 받는다.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

// 측정값·시각·식별자 전용. 고정폭이라 자릿수가 흔들리지 않는다.
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Cited — AI 답변에 우리 브랜드가 얼마나 인용되는지',
    template: '%s · Cited',
  },
  description:
    'ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews에서 브랜드 언급을 매주 자동 추적하는 한국어 GEO 모니터링 도구.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${suit.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      {/* Radix Tooltip은 Provider 없이는 던진다. 수치 옆의 "이 숫자는 어떻게
          나왔나" 설명이 앱 전역에서 쓰이므로 루트에서 한 번만 감싼다.
          Provider는 클라이언트 컴포넌트지만 children은 props로 들어오므로
          서버 렌더링 경계는 유지된다. */}
      {/* `print:bg-white` — 인쇄(PDF 납품)에서는 종이를 종이색으로 둔다.
          --background(oklch 0.994)는 화면용 "계측 장비의 흰색"인데, PDF의
          여백은 칠해지지 않은 순백이라 본문 영역 가장자리에 옅은 이음선이
          생긴다(실측 — 리포트 PDF 전 장의 여백 경계에 회색 띠가 보였다).
          문서가 아니라 웹페이지 캡처처럼 보이는 주범. 화면에는 영향이 없다.
          ★ globals.css의 base 규칙로는 안 된다 — 여기 utilities 레이어의
            bg-background가 base를 이기므로, 같은 레이어의 print 변형이어야 한다. */}
      <body className="min-h-dvh bg-background text-foreground antialiased print:bg-white">
        {/* 본문 건너뛰기. 앱 영역은 sticky 머리글에 내비 링크가 셋이고 마케팅
            영역도 워드마크·로그인·시작하기를 지나야 본문에 닿는다. 키보드·
            스크린리더 사용자가 페이지마다 그걸 반복해서 통과할 이유는 없다.
            평소에는 sr-only로 숨고 포커스를 받을 때만 좌상단에 나타난다.
            대상 <main>에는 각 레이아웃이 id="main" tabindex="-1"을 단다
            (tabindex가 없으면 일부 브라우저가 포커스를 옮기지 않는다). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          본문으로 건너뛰기
        </a>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
