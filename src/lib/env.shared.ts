// 공개 환경변수의 공유 검증자. 서버(env.ts)와 클라이언트(env.client.ts)
// 양쪽이 import해서 사용한다. 드리프트 방지를 위해 한 곳에서만 정의한다.
//
// 주의: 이 파일은 `server-only`를 import하지 않고, `process.env`를 읽지도 않는다.
// 순수한 zod 스키마만 export하므로 클라이언트 번들에 포함되어도 안전하다.

import { z } from 'zod'

// NEXT_PUBLIC_APP_URL: 서버에서는 인증 콜백과 이메일 링크 생성에 필수,
// 클라이언트에서는 절대 URL이 필요할 때 쓴다.
export const appUrlSchema = z.url()

// NEXT_PUBLIC_SENTRY_DSN: 서버와 클라이언트 양쪽의 Sentry 설정이
// 같은 DSN을 사용하도록 통일한다.
export const sentryDsnSchema = z.string().optional()
