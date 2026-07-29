// Edge 런타임(미들웨어, `export const runtime = 'edge'` 라우트)의 Sentry 초기화.
// 설정은 sentry.server.config.ts와 같아야 한다 — 한쪽만 고치면 런타임에 따라
// PII 정책이 달라진다. 파일이 갈라져 있는 것은 Next.js가 런타임별로 다른
// 번들을 만들기 때문이지, 정책이 다르기 때문이 아니다.

import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})
