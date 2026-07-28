import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-errors'
import { db, schema } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { verificationEmail } from '@/lib/email/templates'
import { type Env, env } from '@/lib/env'
import { logger } from '@/lib/logger'

/** 인증 링크 유효 기간. `verificationEmail` 본문의 "24시간" 문구와 반드시 같아야 한다. */
const VERIFICATION_EXPIRES_IN = 60 * 60 * 24

/** 세션 유효 기간. 쿠키의 Max-Age와 세션 행의 expiresAt이 이 값을 공유한다. */
const SESSION_EXPIRES_IN = 60 * 60 * 24 * 30 // 30일

/**
 * 세션 쿠키의 `Secure` 여부를 **실행 환경**으로 결정한다.
 *
 * better-auth 1.6.25는 `advanced.useSecureCookies`가 없으면
 * `baseURL.startsWith("https://")`로 secure를 정한다
 * (node_modules/better-auth/dist/cookies/index.mjs:21). 즉 이 옵션이 없으면
 * 세션 토큰의 유일한 전송 보호가 환경변수 문자열 하나의 오타 거리에 놓인다 —
 * 프로덕션에 http:// 값이 들어가도 아무것도 실패하지 않고 쿠키만 조용히
 * 평문으로 나간다. 명시해서 그 결합을 끊는다.
 *
 * env.ts가 프로덕션의 http:// BETTER_AUTH_URL을 따로 막지만, 그건 인증 링크
 * URL을 위한 방어이고 쿠키는 이쪽이 책임진다 — 방어선을 둘로 나눠 둔다.
 */
export function secureCookiePolicy(nodeEnv: Env['NODE_ENV']): { useSecureCookies: boolean } {
  return { useSecureCookies: nodeEnv === 'production' }
}

export const auth = betterAuth({
  // 기존 마이그레이션으로 이미 만들어진 테이블에 그대로 붙인다. 스키마는 손대지 않는다.
  // drizzleAdapter는 `schema[model]`(모델명 = user/session/account/verification)로
  // 테이블을, 그 테이블의 camelCase 프로퍼티로 컬럼을 찾는다. 우리 Drizzle 스키마의
  // JS 프로퍼티가 이미 camelCase(emailVerified, userId, expiresAt …)라 매핑이 그대로
  // 맞는다 — `fields` 재매핑이 필요 없다.
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
    // Neon HTTP 드라이버는 대화형 트랜잭션을 지원하지 않는다. 어댑터 기본값도
    // false지만, 나중에 누가 켰다가 런타임에 깨지지 않도록 명시해 둔다.
    transaction: false,
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // 무료 진단 남용 방지의 한 축. 이메일 인증 없이는 계정이 활성화되지 않는다.
    requireEmailVerification: true,
    // 가입 폼의 minLength와 PASSWORD_TOO_SHORT 한국어 문구가 같은 상수를 쓴다.
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
  emailVerification: {
    sendOnSignUp: true,
    // 확인 메일이 끝내 도착하지 않았을 때의 복구 경로. 미인증 상태로 로그인을
    // 다시 시도하면 새 확인 메일이 나간다(sign-in.mjs:314). 별도 재발송 UI 없이
    // 이걸로 커버한다.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_EXPIRES_IN,
    sendVerificationEmail: async ({ user, url }) => {
      const result = await sendEmail({ to: user.email, content: verificationEmail({ url }) })
      if (!result.ok) {
        // Better Auth는 이 훅의 예외를 삼키므로(create-context.mjs의
        // runInBackgroundOrAwait) 던져도 가입 응답을 바꿀 수 없다. 대신 가입이
        // 영향을 받았다는 사실을 인증 문맥의 이벤트로 남긴다. `reason`은
        // sendEmail이 이미 마스킹해서 돌려주는 값이라 그대로 실어도 안전하다.
        // user.email은 절대 담지 않는다.
        logger.error('auth.verification_email_failed', { reason: result.reason })
      }
    },
  },
  user: {
    additionalFields: {
      // DB의 `user_role_check` 제약과 같은 값. `input: false`라 클라이언트가
      // 가입 요청에 role을 실어 보내도 무시된다 (권한 상승 방지).
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN,
    updateAge: 60 * 60 * 24, // 하루에 한 번 갱신
  },
  advanced: {
    ...secureCookiePolicy(env.NODE_ENV),
    // defaultCookieAttributes는 일부러 두지 않는다. better-auth의 기본값
    // (httpOnly: true, sameSite: 'lax', path: '/')이 우리가 원하는 값이고,
    // 여기에 객체를 하나 얹는 순간 그 기본값을 조용히 덮어쓸 수 있다.
    // 실제 Set-Cookie 헤더는 auth.smoke.test.ts가, 프로덕션의 Secure는
    // auth.test.ts가 고정한다.
  },
})

export type AuthSession = typeof auth.$Infer.Session
