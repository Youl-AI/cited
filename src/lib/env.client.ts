// 브라우저에서 실행되는 코드(클라이언트 컴포넌트, 'use client' 모듈)는
// 반드시 이 파일에서 환경변수를 가져온다. 서버 전용 값(DATABASE_URL,
// BETTER_AUTH_SECRET, RESEND_API_KEY 등)이 필요하면 대신 '@/lib/env'를
// 사용한다 — 그 파일은 최상단에 `import 'server-only'`가 있어 클라이언트
// 번들에 섞여 들어가는 순간 빌드가 즉시 실패한다.
//
// 주의 (이 파일을 고칠 때 절대 깨면 안 되는 규칙):
// Next.js는 클라이언트 번들에서 `process.env.NEXT_PUBLIC_X` 형태의
// "리터럴" 표현식만 정적으로 문자열로 치환한다. `process.env` 객체 자체를
// 함수에 넘기거나 스프레드하거나 동적 키(`process.env[key]`)로 접근하면
// 번들러가 치환하지 못해 브라우저에서는 전부 undefined가 된다.
// 그래서 아래 `clientEnv`는 각 변수를 하나씩 리터럴로 읽어서 객체를
// 새로 만든다 — `parseClientEnv(process.env)`처럼 통째로 넘기지 말 것.

import { z } from 'zod'

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
})

export type ClientEnv = z.infer<typeof clientSchema>

interface RawClientEnv {
  NEXT_PUBLIC_APP_URL: string | undefined
  NEXT_PUBLIC_SENTRY_DSN: string | undefined
  NEXT_PUBLIC_TOSS_CLIENT_KEY: string | undefined
}

export function parseClientEnv(raw: RawClientEnv): ClientEnv {
  const result = clientSchema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    )
    throw new Error(`공개 환경변수 검증 실패\n${lines.join('\n')}`)
  }
  return result.data
}

// 각 변수를 개별 리터럴로 읽는다 (위 주의사항 참고).
export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
})
