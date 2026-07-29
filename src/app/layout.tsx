import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

// 라틴 문자와 숫자만 웹폰트로 싣는다. 한글은 시스템 서체로 떨어진다
// (스택 정의는 globals.css의 --font-sans 주석 참고).
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
      className={`${plexSans.variable} ${plexMono.variable}`}
    >
      {/* Radix Tooltip은 Provider 없이는 던진다. 수치 옆의 "이 숫자는 어떻게
          나왔나" 설명이 앱 전역에서 쓰이므로 루트에서 한 번만 감싼다.
          Provider는 클라이언트 컴포넌트지만 children은 props로 들어오므로
          서버 렌더링 경계는 유지된다. */}
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
