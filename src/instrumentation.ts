// Next.js가 서버 프로세스 부팅 시 가장 먼저 호출하는 훅. 런타임에 맞는
// Sentry 설정만 적재한다 — Node용 설정을 Edge에서 적재하면 Edge 번들에
// Node 전용 API가 섞여 들어간다.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// App Router가 서버에서 잡은 렌더·라우트 에러를 Sentry로 넘긴다. 이 export가
// 없으면 서버 컴포넌트에서 던진 예외가 error.tsx로만 가고 기록되지 않는다.
export { captureRequestError as onRequestError } from '@sentry/nextjs'
