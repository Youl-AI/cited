import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // 필수 — 1단계
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET은 32자 이상이어야 합니다'),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // 선택 — 관측
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // 2단계 이후. 없으면 해당 기능만 비활성화된다.
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  TRIGGER_SECRET_KEY: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
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
