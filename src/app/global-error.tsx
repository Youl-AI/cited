'use client'

// 루트 레이아웃 자체가 터졌을 때의 최후 보루. 이 컴포넌트는 layout.tsx를
// 대체하므로 <html>·<body>를 직접 그려야 한다. 그래서 폰트 변수·전역
// 스타일이 걸려 있지 않다 — Tailwind 유틸리티만으로 읽히게 만든다.

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
        <p className="text-neutral-600">오류가 기록되었습니다. 잠시 후 다시 시도해 주세요.</p>
        {/* next/link가 아니라 <a>인 것은 의도다. 여기까지 왔다는 것은 루트
            레이아웃 렌더가 깨졌다는 뜻이고, 클라이언트 내비게이션은 그
            망가진 라우터·React 트리를 그대로 재사용한다. 전체 새로고침으로
            앱을 처음부터 다시 세우는 편이 확실하다. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="underline">
          홈으로
        </a>
      </body>
    </html>
  )
}
