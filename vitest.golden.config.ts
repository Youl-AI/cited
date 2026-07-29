import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// 골드 라벨 회귀는 **실제 판정 API**를 부른다. 기본 `pnpm test`에서 분리해
// 두는 이유가 이것이다 — 단위 테스트를 돌릴 때마다 돈이 나가면 안 된다.
//
// CI에서는 ANTHROPIC_API_KEY를 넣어 이 설정으로 돌린다. 키가 없으면
// regression.test.ts가 스스로 실패한다(조용히 건너뛰지 않는다) — 게이트가
// 꺼진 채 초록불이 뜨는 것이 게이트가 없는 것보다 나쁘다.
const envLocal = fileURLToPath(new URL('./.env.local', import.meta.url))
if (existsSync(envLocal)) process.loadEnvFile(envLocal)

const env: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@host.tld/dbname',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Cited <noreply@example.com>',
}
if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/golden/**/*.test.ts'],
    testTimeout: 600_000,
    env,
  },
})
