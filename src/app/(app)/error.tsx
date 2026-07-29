'use client'

// 로그인 구간의 에러 바운더리. global-error.tsx와 달리 앱 셸(머리글·<main>)
// 안에서 렌더되므로 <html>을 그리지 않는다. Next가 넘겨주는 reset()으로
// 전체 새로고침 없이 해당 세그먼트만 다시 시도할 수 있다.

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
      <p className="text-muted-foreground">오류가 기록되었습니다. 잠시 후 다시 시도해 주세요.</p>
      <Button size="lg" onClick={reset} className="mt-2">
        다시 시도
      </Button>
    </div>
  )
}
