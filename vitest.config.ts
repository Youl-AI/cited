import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // src/lib/env.ts는 최상단에 `import 'server-only'`를 두어 클라이언트
      // 번들에 섞이면 Next.js 빌드가 실패하도록 만든다. vitest는 Next.js가
      // 서버 번들에 설정하는 "react-server" 조건을 쓰지 않기 때문에, 별칭
      // 없이 그대로 두면 'server-only'가 항상 throw하는 쪽으로 해석되어
      // 테스트 자체가 막힌다. 자세한 이유는 tests/mocks/server-only.ts 참고.
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.smoke.test.ts', '**/node_modules/**', 'tests/e2e/**'],
    // 아래 필수 키 목록은 src/lib/env.ts와 src/lib/env.client.ts의 필수
    // 필드와 동기화되어야 한다. 이 두 파일에서 선택 필드를 필수로 승격하면
    // 여기도 같이 고쳐야 하며, 안 그러면 이 목록과 무관한 테스트 파일들까지
    // env.ts의 부팅 검증 단계에서 원인을 알기 힘든 zod 에러로 깨진다.
    env: {
      NODE_ENV: 'test',
      // 형식이 유효해야 한다. @neondatabase/serverless의 neon()은 모듈 평가
      // 시점에 문자열을 파싱하고 형식이 어긋나면 그 자리에서 던진다. 그래서
      // 아무 더미 문자열이나 넣으면 '@/lib/db'를 (그리고 그걸 import하는
      // '@/lib/auth'를) 단위 테스트에서 아예 적재할 수 없다. 접속은 하지
      // 않는다 — neon HTTP 드라이버는 첫 쿼리 때 비로소 네트워크를 탄다.
      DATABASE_URL: 'postgresql://user:password@host.tld/dbname',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'Cited <noreply@example.com>',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/lib/db/**', 'src/lib/env.ts', 'src/lib/env.client.ts'],
    },
  },
})
