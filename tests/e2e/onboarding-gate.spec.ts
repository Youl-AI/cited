import { expect, test } from '@playwright/test'

/**
 * CI에서도 도는 게이트 검증 — DB 쓰기 없음.
 * (app) 그룹의 인증 가드가 온보딩 라우트에도 걸리는지 본다.
 */
test('비로그인으로 /onboarding에 가면 사인인으로 밀려난다', async ({ page }) => {
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('비로그인으로 회차 상세에 가도 사인인으로 밀려난다 — 인증 없는 경로 추가 금지', async ({ page }) => {
  await page.goto('/dashboard/runs/run_does_not_exist')
  await expect(page).toHaveURL(/\/sign-in/)
})
