import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 설정.
 *
 * ## 왜 vitest로는 안 되는가
 *
 * 여기 있는 테스트는 전부 **브라우저에서만 드러나는 것**이다 — 폼이 무엇을
 * 직렬화해 보내는가, 라우터가 어디로 밀어내는가, 서버 응답의 오류 문구가 실제로
 * 화면에 뜨는가. 서버 로직 자체는 `src/lib/audit/handlers.test.ts`가 의존성을
 * 주입해 DB도 메일 서버도 없이 검증한다. 그 경계를 지킨다 — E2E가 서버 단위
 * 로직까지 다시 검증하려 들면 느려지고, 실패했을 때 원인이 어디인지 못 가린다.
 *
 * ## 개발 서버를 쓰는 이유
 *
 * 프로덕션 빌드가 더 충실하지만 빌드에 분 단위가 걸리고, 여기서 보는 것은
 * 폼·라우팅·문구라서 dev/prod 차이가 없다. 배포 전 실사용 확인(계획서 Task 9
 * Step 4)이 프로덕션 빌드를 실제로 밟는 몫을 맡는다.
 *
 * `.env.local`이 필요하다 — dev 서버가 부팅하면서 `env.ts`를 검증한다.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // 로컬에서는 실패를 즉시 보고 싶고, CI에서는 한 번의 네트워크 흔들림으로
  // 배포가 막히는 것을 원하지 않는다.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // 실패한 것만 남긴다. 전부 남기면 재실행마다 수백 MB가 쌓인다.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    // 이미 띄워 둔 개발 서버가 있으면 그것을 쓴다. CI에는 없으므로 새로 띄운다.
    reuseExistingServer: !process.env.CI,
    // Next.js 개발 서버의 첫 부팅은 Turbopack 컴파일 때문에 느리다.
    timeout: 180_000,
  },
})
