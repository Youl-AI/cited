// 서버 전용 환경변수 모듈. Server Component, Route Handler, Server Action 등
// 서버에서만 실행되는 코드에서 import한다. 아래 `import 'server-only'`
// 때문에 클라이언트 컴포넌트가 실수로 이 파일을 import하면 빌드가 즉시
// 실패한다 (Next.js가 클라이언트 번들에서 이 모듈을 발견하면 에러를 낸다).
// 브라우저에서 실행되는 코드(클라이언트 컴포넌트)는 대신 '@/lib/env.client'를
// 사용한다 — 서버 시크릿은 그 파일에 존재하지 않는다.
import 'server-only'

import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // 필수 — 1단계
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET은 32자 이상이어야 합니다'),
  BETTER_AUTH_URL: z.url(),
  // NEXT_PUBLIC_* 이지만 서버에서도 필요하다 (이메일 링크, 인증 콜백 URL,
  // 절대 URL 생성 등). 공개 변수라 서버 프로세스의 process.env에서
  // 그대로 읽을 수 있으므로(클라이언트 번들 리터럴 치환 문제가 없다)
  // 서버 스키마에도 남긴다. 클라이언트에서 쓰려면 '@/lib/env.client'를 쓴다.
  NEXT_PUBLIC_APP_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // 선택 — 관측
  SENTRY_DSN: z.string().optional(),
  // Sentry 서버 설정(sentry.server.config)도 관례상 동일한 DSN을 읽는다.
  // 시크릿이 아니므로 서버 스키마에도 남긴다.
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // 2단계 이후. 없으면 해당 기능만 비활성화된다.
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  TRIGGER_SECRET_KEY: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  // NEXT_PUBLIC_TOSS_CLIENT_KEY는 여기 없다: 서버는 결제 확인에
  // TOSS_SECRET_KEY만 쓰고, 클라이언트 위젯 키는 브라우저에서만 필요하다.
  // 브라우저에서 쓰려면 '@/lib/env.client'의 clientEnv를 쓴다.
})

export type Env = z.infer<typeof schema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    )
    throw new Error(`환경변수 검증 실패\n${lines.join('\n')}`)
  }
  return result.data
}

export const env = parseEnv(process.env)
