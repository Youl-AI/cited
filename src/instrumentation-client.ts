// 브라우저에서 실행되는 Sentry 초기화. Next.js가 클라이언트 번들 진입점에서
// 자동으로 적재한다.
//
// ★ 여기서 `@/lib/env`를 import하면 안 된다 — 그 모듈은 `server-only`라
//   클라이언트 번들에 섞이는 순간 빌드가 깨진다. 그리고 Next는 클라이언트
//   번들에서 `process.env.NEXT_PUBLIC_X` **리터럴만** 문자열로 치환하므로
//   아래처럼 직접 읽는 형태를 유지해야 한다.
//
// 공개 DSN이 없으면 `enabled: false`가 되어 아무것도 전송하지 않는다.

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  // 브라우저 이벤트에도 IP·쿠키를 붙이지 않는다.
  sendDefaultPii: false,
})

// 새 기능이 아니라 위 tracesSampleRate에 딸린 필수 배선이다. 없으면
// @sentry/nextjs가 빌드마다 "ACTION REQUIRED" 경고를 찍고, 페이지 이동
// 스팬이 이전 페이지에 잘못 붙는다.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
