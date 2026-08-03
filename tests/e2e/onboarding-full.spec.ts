import { expect, test } from '@playwright/test'

/**
 * 온보딩 완주 — 로그인 → 브랜드 → 질의 에디터(AI 생성은 dev 전용 가짜) →
 * 동결 → 완료 화면 (스펙 테스트 요구: "온보딩 E2E 완주, LLM은 인터셉트").
 *
 * 로컬 전용. 실행 전 `pnpm e2e:onboarding:seed`, 실행 후
 * `pnpm e2e:onboarding:cleanup`. dev 서버는 E2E_FAKE_QUERY_GENERATOR=1로
 * 떠 있어야 한다 (playwright webServer가 러너의 env를 물려받는다).
 *
 * ★ 셀렉터는 **출시된 화면**(Task 3~5·8~10 리뷰 완료본)에 맞춘다 — 계획서의
 *   원안 셀렉터 네 곳을 화면 쪽 문구로 고쳤다. 화면을 스펙에 맞추지 않는다:
 *   - 생성 버튼: 빈 줄이 없으면 라벨이 'AI 후보 N개 만들기'다 → /AI 후보/
 *   - Playwright에는 toHaveTextContent가 없다 → toContainText
 *   - '동결됩니다'는 에디터 안내문에도 있어 strict 위반 → 확인 패널 고유 문장
 *   - '첫 측정이 끝나면'은 추이·회차 목록 빈 상태 둘 다에 있어 strict 위반 →
 *     추이 차트 고유 문장
 */
test.describe('온보딩완주', () => {
  test.skip(process.env.E2E_ONBOARDING !== '1', '로컬 전용 — E2E_ONBOARDING=1로 실행')

  test('plan:grant된 계정이 질의 확정까지 완주한다', async ({ page }) => {
    // 1. 로그인 → 대시보드가 온보딩으로 민다
    await page.goto('/sign-in')
    await page.getByLabel(/이메일/).fill('e2e-onboarding@cited.co.kr')
    await page.getByLabel(/비밀번호/).fill('e2e-passw0rd!')
    await page.getByRole('button', { name: /로그인/ }).click()
    await expect(page).toHaveURL(/\/onboarding/)

    // 2. 브랜드 단계 — 지역형 업종을 고르면 지역 필드가 나타난다
    await page.getByLabel('브랜드명').fill('바디텍')
    await page.getByLabel('업종').fill('필라테스')
    await expect(page.getByLabel('지역')).toBeVisible()
    await page.getByLabel('지역').fill('강남')
    await page.getByLabel('경쟁사 1').fill('필라피플')
    await page.getByRole('button', { name: /다음/ }).click()
    await expect(page).toHaveURL(/\/onboarding\/queries/)

    // 3. 에디터 — 템플릿 3개 프리필 + 가짜 생성으로 빈 칸 채움
    await expect(page.getByText(/AI 생성 0\/5회/)).toBeVisible()
    await page.getByRole('button', { name: /AI 후보/ }).click()
    await expect(page.getByText(/AI 생성 1\/5회/)).toBeVisible()
    await expect(page.getByRole('status')).toContainText(/확정할 수 있습니다/)

    // 4. 확정 → 동결 확인 → 완료
    await page.getByRole('button', { name: '확정하기' }).click()
    await expect(page.getByText(/동결 후에는 바꾸지 않습니다/)).toBeVisible()
    await page.getByRole('button', { name: '확정하고 동결' }).click()
    await expect(page).toHaveURL(/\/onboarding\/done/)
    await expect(page.getByText(/요일 새벽/)).toBeVisible()

    // 5. 대시보드 — 빈 상태가 방향을 준다
    await page.getByRole('link', { name: '대시보드로' }).click()
    await expect(page.getByText(/첫 측정이 끝나면 점이 하나 찍힙니다/)).toBeVisible()
  })
})
