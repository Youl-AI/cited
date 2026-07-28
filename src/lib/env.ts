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

/**
 * 루프백 호스트인가 — 개발 머신에서만 의미가 있는 주소.
 *
 * 앵커(`^`)와 종결자(`(\/|$)`)가 이 정규식의 핵심이다. 종결자가 없으면
 * `http://localhost.evil.com`이나 `http://localhost@evil.com`이 루프백으로
 * 통과해 https 강제를 우회한다. 절대 완화하지 말 것.
 * 호스트명은 대소문자를 구분하지 않으므로(RFC 3986 §3.2.2) `i`를 붙인다 —
 * `http://LOCALHOST:3000`도 같은 주소다.
 */
function isLoopbackUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(url)
}

/**
 * 표기 차이를 지운 URL. `https://cited.co.kr`와 `https://cited.co.kr/`는
 * 같은 오리진이므로 불일치로 취급하면 안 된다. 파싱이 안 되는 값은
 * zod의 `z.url()`이 이미 먼저 거부하므로, 방어적으로 원문을 돌려준다.
 */
function normalizeUrl(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

/**
 * "지금 배포 환경인가" — https 강제(이 파일)와 세션 쿠키의 Secure(auth.ts)가
 * **같은 판정**을 쓰도록 여기 한 곳에만 정의한다. 두 방어선이 배포의 정의에
 * 대해 어긋나면, 한쪽만 켜진 상태로 세션 토큰이 평문으로 나갈 수 있다.
 *
 * NODE_ENV로는 이걸 알 수 없다. `next build`·`next start`는 로컬에서도
 * production이고, 반대로 커스텀 진입점(`node server.js`)이나 컨테이너가
 * NODE_ENV를 빠뜨린 배포는 production이 아니다. VERCEL은 우리가 설정하는
 * 값이 아니라 플랫폼이 빌드·런타임 양쪽에 주입하는 신호라 덮어쓸 여지가 적다.
 */
export function isDeployedEnv(value: Pick<Env, 'VERCEL'>): boolean {
  return value.VERCEL !== undefined
}

// BETTER_AUTH_URL은 단순한 설정값이 아니라 인증 경계의 일부다. 두 가지를
// 부팅 시점에 막는다.
//
//  1. 배포 환경의 http://  — 이 값으로 인증 링크와 콜백 URL이 만들어진다.
//     세션 쿠키의 Secure 플래그 자체는 auth.ts의 advanced.useSecureCookies가
//     결정하므로 이 변수에 걸려 있지 않다(그게 원래 결함이었다). 그래도
//     평문 URL이 배포에 남으면 인증 링크가 http로 나가므로 막는다.
//
//     **발동 조건은 auth.ts의 쿠키 정책과 같아야 한다.** 둘 다
//     `NODE_ENV === 'production' || isDeployedEnv(...)`를 본다. NODE_ENV 하나만
//     보면, Vercel에서 NODE_ENV를 덮어썼거나 커스텀 진입점이 빠뜨린 배포에서
//     https 강제와 쿠키 Secure가 **동시에** 조용히 꺼진다 — NODE_ENV는
//     `.default('development')`라 값이 없으면 fail-open이다.
//
//     그다음 "http를 봐줄 것인가"가 갈린다. `next build`와 `next start`는
//     로컬에서도 NODE_ENV=production으로 돌기 때문이다(실제로 로컬 빌드를
//     통째로 막았다가 되돌렸다).
//       - 배포 신호가 있으면 → 예외 없이 https. 로컬 값이 Vercel 환경변수로
//         복사되는 사고가 여기서 걸린다.
//       - 배포 신호가 없으면 루프백 주소만 http를 허용한다. 즉 로컬 빌드는
//         돌아가되, `http://cited.co.kr` 같은 실호스트는 여전히 막힌다.
//
//  2. NEXT_PUBLIC_APP_URL과의 불일치 — auth-client.ts가 NEXT_PUBLIC_APP_URL을
//     클라이언트 baseURL로 쓴다. 서버의 baseURL과 다르면 better-auth의 origin
//     검사가 모든 인증 요청을 거부한다. 지금까지는 우연히 같았을 뿐이다.
//     이건 환경과 무관하게 항상 강제한다.
const schema = baseSchema.superRefine((value, ctx) => {
  const isDeployed = isDeployedEnv(value)
  const httpAllowedHere = !isDeployed && isLoopbackUrl(value.BETTER_AUTH_URL)
  if (
    (value.NODE_ENV === 'production' || isDeployed) &&
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
  if (normalizeUrl(value.BETTER_AUTH_URL) !== normalizeUrl(value.NEXT_PUBLIC_APP_URL)) {
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
