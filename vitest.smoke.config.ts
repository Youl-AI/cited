import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// 스모크 테스트는 실제 DB·외부 API에 붙으므로 진짜 자격증명이 필요하다
// (기본 `pnpm test`는 vitest.config.ts의 더미 값으로 돈다). Vite의 loadEnv는
// test 모드에서 .env.local을 건너뛰므로 Node의 loadEnvFile로 직접 읽는다.
const envLocal = fileURLToPath(new URL('./.env.local', import.meta.url))
if (existsSync(envLocal)) process.loadEnvFile(envLocal)

// 워커로 넘길 키를 명시적으로 나열한다. process.env를 통째로 넘기지 않는 이유는
// 무엇이 테스트에 필요한지가 이 목록에 드러나야 하기 때문이다.
const PASSTHROUGH = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
] as const

const env: Record<string, string> = { NODE_ENV: 'test' }
for (const key of PASSTHROUGH) {
  const value = process.env[key]
  if (value !== undefined) env[key] = value
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // vitest.config.ts와 같은 이유. 자세한 설명은 tests/mocks/server-only.ts 참고.
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.smoke.test.ts'],
    testTimeout: 60_000,
    // 스모크 테스트는 같은 외부 DB를 공유한다. 병렬로 돌면 "전체 테이블 0행"
    // 같은 전역 단언이 다른 파일이 만든 행과 부딪힌다. 순차로만 돌린다.
    fileParallelism: false,
    env,
  },
})
