// 서버 전용 환경변수 모듈. Server Component, Route Handler, Server Action 등
// 서버에서만 실행되는 코드에서 import한다. 아래 `import 'server-only'`
// 때문에 클라이언트 컴포넌트가 실수로 이 파일을 import하면 빌드가 즉시
// 실패한다 (Next.js가 클라이언트 번들에서 이 모듈을 발견하면 에러를 낸다).
// 브라우저에서 실행되는 코드(클라이언트 컴포넌트)는 대신 '@/lib/env.client'를
// 사용한다 — 서버 시크릿은 그 파일에 존재하지 않는다.
import 'server-only'

import { z } from 'zod'
import { appUrlSchema, sentryDsnSchema } from '@/lib/env.shared'

const baseSchema = z.object({
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
  NEXT_PUBLIC_APP_URL: appUrlSchema,
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // Vercel이 빌드·런타임 양쪽에 자동으로 넣는 시스템 변수("1"). 우리가
  // 설정하는 값이 아니라 "지금 배포 환경인가"를 알려주는 신호다. 아래
  // BETTER_AUTH_URL 검증이 이걸 본다 (로컬 `next build`와 실제 배포를
  // 구분해야 하는데 NODE_ENV만으로는 둘 다 'production'이라 구분되지 않는다).
  VERCEL: z.string().optional(),

  // 선택 — 관측
  SENTRY_DSN: z.string().optional(),
  // Sentry 서버 설정(sentry.server.config)도 관례상 동일한 DSN을 읽는다.
  // 시크릿이 아니므로 서버 스키마에도 남긴다.
  NEXT_PUBLIC_SENTRY_DSN: sentryDsnSchema,

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

/** 루프백 호스트인가 — 개발 머신에서만 의미가 있는 주소. */
function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url)
}

// BETTER_AUTH_URL은 단순한 설정값이 아니라 인증 경계의 일부다. 두 가지를
// 부팅 시점에 막는다.
//
//  1. 배포 환경의 http://  — 이 값으로 인증 링크와 콜백 URL이 만들어진다.
//     세션 쿠키의 Secure 플래그 자체는 auth.ts의 advanced.useSecureCookies가
//     NODE_ENV로 결정하므로 이 변수에 걸려 있지 않다(그게 원래 결함이었다).
//     그래도 평문 URL이 배포에 남으면 인증 링크가 http로 나가므로 막는다.
//
//     "배포"의 판정이 미묘하다. `next build`와 `next start`는 로컬에서도
//     NODE_ENV=production으로 돈다. 그래서 NODE_ENV만 보고 https를 강제하면
//     로컬 프로덕션 빌드가 통째로 막힌다(실제로 막혔다). 두 축으로 나눈다.
//       - VERCEL이 세팅되어 있으면(빌드·런타임 모두에 Vercel이 주입한다)
//         → 예외 없이 https. 로컬 값이 Vercel 환경변수로 복사되는 사고가
//           여기서 걸린다.
//       - VERCEL이 없으면 루프백 주소만 http를 허용한다. 즉 로컬 빌드는
//         돌아가되, 프로덕션에 `http://cited.co.kr` 같은 실호스트가
//         들어가면 여전히 막힌다.
//
//  2. NEXT_PUBLIC_APP_URL과의 불일치 — auth-client.ts가 NEXT_PUBLIC_APP_URL을
//     클라이언트 baseURL로 쓴다. 서버의 baseURL과 다르면 better-auth의 origin
//     검사가 모든 인증 요청을 거부한다. 지금까지는 우연히 같았을 뿐이다.
//     이건 환경과 무관하게 항상 강제한다.
const schema = baseSchema.superRefine((value, ctx) => {
  const isDeployed = value.VERCEL !== undefined
  const httpAllowedHere = !isDeployed && isLoopbackUrl(value.BETTER_AUTH_URL)
  if (
    value.NODE_ENV === 'production' &&
    !value.BETTER_AUTH_URL.startsWith('https://') &&
    !httpAllowedHere
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['BETTER_AUTH_URL'],
      message:
        '프로덕션에서는 https:// URL이어야 합니다 (세션·인증 링크가 평문으로 나갑니다). http는 배포가 아닌 로컬 루프백 주소에서만 허용됩니다',
    })
  }
  if (value.BETTER_AUTH_URL !== value.NEXT_PUBLIC_APP_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['BETTER_AUTH_URL'],
      message:
        'BETTER_AUTH_URL과 NEXT_PUBLIC_APP_URL이 정확히 같아야 합니다 (다르면 origin 검사가 모든 인증 요청을 거부합니다)',
    })
  }
})

export type Env = z.infer<typeof baseSchema>

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
