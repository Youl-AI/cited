import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.smoke.test.ts', '**/node_modules/**', 'tests/e2e/**'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Cited <noreply@example.com>',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/lib/db/**', 'src/lib/env.ts'],
    },
  },
})
