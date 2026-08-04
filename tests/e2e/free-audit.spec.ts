import { expect, test } from '@playwright/test'

/**
 * 무료 진단 신청 플로우.
 *
 * ## ★ 성공 경로에서 `/api/audit/request`를 가로챈다 — 이유가 중요하다
 *
 * 이 라우트를 실제로 밟으면 **진짜 Neon DB에 행이 생기고 Resend가 진짜 메일을
 * 보낸다.** 계획서의 원안은 수신자로 `e2e-…@cited-smoke.invalid`를 썼는데,
 * 그러면 둘 중 하나가 일어난다:
 *
 * - Resend가 거부한다 → 라우트가 502를 주고 이 테스트는 **원인과 무관하게**
 *   항상 실패한다.
 * - Resend가 받는다 → `.invalid`는 존재할 수 없는 TLD라 하드 바운스가 남고,
 *   테스트를 돌릴 때마다 **우리 발송 도메인의 평판이 깎인다.** 확인 메일이
 *   스팸함으로 가기 시작하면 제품이 죽는다.
 *
 * 그래서 성공 경로는 네트워크 경계에서 끊는다. 잃는 것은 없다 — 서버 쪽
 * 동작(행 생성·메일 발송·실패 처리)은 `src/lib/audit/handlers.test.ts`가
 * 의존성 주입으로 이미 검증하고, 실제 발송까지 포함한 진짜 끝단 확인은
 * 배포 후 운영자가 본인 주소로 1건 돌리는 것으로 한다.
 *
 * 대신 가로채는 김에 **폼이 무엇을 보내는지**를 본다. 그건 vitest가 볼 수 없고
 * 여기서만 보이는 것이다 — 빈 경쟁사 칸이 걸러지는가, 선택 항목이 빠지는가.
 *
 * ## 실패 경로는 가로채지 않는다
 *
 * 400을 받는 경로는 `parseAuditRequest`에서 먼저 끊기므로 **DB에도 메일에도
 * 닿지 않는다.** 서버가 실제로 그 문구를 돌려주고 폼이 그것을 띄우는지까지
 * 봐야 하므로 그대로 둔다.
 */

const FORM = {
  brandName: 'E2E테스트브랜드',
  // ★ 라벨은 '카테고리'가 아니라 '업종'이다. 화면 문구를 바꾸면 여기가 깨진다 —
  //   그게 맞다. 라벨은 고객이 읽는 것이고, 조용히 바뀌면 안 된다.
  category: '패션',
  email: 'e2e@example.com',
}

/**
 * 폼이 띄운 오류 문구.
 *
 * ★ `getByRole('alert')`만 쓰면 Next.js가 라우팅 안내용으로 항상 넣어 두는
 *   `#__next-route-announcer__`(비어 있는 `role="alert"`)까지 잡혀 두 개가 된다.
 *   폼 안으로 범위를 좁힌다.
 */
function formAlert(page: import('@playwright/test').Page) {
  return page.locator('form').getByRole('alert')
}

async function fillRequired(page: import('@playwright/test').Page) {
  // ★ 폼 안으로 범위를 좁힌다. 랜딩에는 질의 프로토콜 카드의 업종 탭
  //   (`aria-label="업종 선택"`)이 있어서, 페이지 전체에서 '업종'을 찾으면
  //   부분 일치로 둘이 잡힌다.
  const form = page.locator('form')
  await form.getByLabel('브랜드명').fill(FORM.brandName)
  await form.getByLabel('업종').fill(FORM.category)
  await form.getByLabel('이메일').fill(FORM.email)
}

test('랜딩 CTA를 눌러 신청 페이지에서 신청하면 확인 안내로 이동한다', async ({ page }) => {
  let payload: unknown = null
  await page.route('**/api/audit/request', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true } })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // 폼은 `/audit/new` 단독이다(2026-08-04 확정). 랜딩의 CTA가 그리로 잇는다.
  // 머리글 CTA는 아래 별도 테스트가 커버하므로, 여기서는 **본문**(히어로)
  // CTA를 눌러 랜딩 본문 경로를 검증한다. 목적지 동일성은 컴포넌트 테스트가
  // 잠근다.
  await page.locator('main').getByRole('link', { name: '무료 진단 받기' }).first().click()
  await expect(page).toHaveURL(/\/audit\/new/)

  // 즉시 결과를 약속하지 않는다. 이 문구가 사라지면 확인 메일이 스팸 신고를 받는다.
  await expect(page.getByText(/영업일 1일/).first()).toBeVisible()

  await fillRequired(page)
  // 경쟁사 칸을 하나 더 열고 **비워 둔 채로** 보낸다. 폼이 빈 칸을 걸러내지
  //   않으면 `parseAuditRequest`가 아니라 여기서 먼저 잡힌다 — 실수로 빈 칸을
  //   남긴 사용자가 거부당하는 것이 이 제품에서 가장 흔한 이탈이다.
  await page.getByLabel('경쟁사 1').fill('29CM')
  await page.getByRole('button', { name: /경쟁사 추가/ }).click()
  await page.getByRole('button', { name: '무료 진단 신청하기' }).click()

  await expect(page).toHaveURL(/\/audit\/requested/)
  await expect(page.getByRole('heading', { name: '메일함을 확인해 주세요' })).toBeVisible()

  // 폼이 보낸 것. 선택 항목을 비웠으면 빈 값으로 가야 하고, 경쟁사는 입력한
  // 것만 가야 한다.
  expect(payload).toEqual({
    brandName: FORM.brandName,
    category: FORM.category,
    email: FORM.email,
    siteUrl: '',
    competitors: ['29CM'],
  })
})

test('랜딩이 실제 측정 질의를 공개하고 표본과 잇는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '무엇을 묻는지 공개합니다' })).toBeVisible()

  // 패션 템플릿의 실제 질의. `queries.ts`를 고치면 여기도 같이 고쳐야 한다 —
  // 그게 맞다. 고객에게 공개한 질문이 조용히 바뀌면 안 된다.
  await expect(page.getByText('가성비 좋은 온라인 패션 쇼핑몰 추천해줘')).toBeVisible()

  // ★ 히어로 표본을 만든 질의에 표식이 붙어 있어야 한다. 표식은 표본 문구와
  //   템플릿이 문자열까지 일치할 때만 그려지므로, 이 단언이 "위 답변은 이
  //   질문에서 나왔다"는 랜딩의 주장을 지킨다. 어긋나면 여기서 걸린다.
  await expect(page.getByText('위 표본의 질문')).toBeVisible()

  // 업종 탭 — 다른 업종의 질의로 바뀐다
  await page.getByRole('button', { name: '화장품' }).click()
  await expect(page.getByText('건성 피부에 맞는 수분크림 추천해줘')).toBeVisible()
  await expect(page.getByText('가성비 좋은 온라인 패션 쇼핑몰 추천해줘')).not.toBeVisible()
})

test('머리글의 무료 진단 버튼이 신청 페이지로 보낸다', async ({ page }) => {
  // ★ 예전에는 이 자리가 `시작하기`(회원가입)였다. 가입해도 볼 것이 없고
  //   결제도 안 열려 있어서, 화면에서 가장 강한 버튼이 빈 곳으로 보내면서
  //   실제 제품인 무료 진단과 경쟁했다.
  await page.goto('/pricing')
  // 요금제에는 같은 라벨이 머리글과 마감 블록 두 곳에 있다(같은 목적지).
  // 이 테스트의 주장은 "머리글 버튼"이므로 머리글로 범위를 좁힌다.
  await page.locator('header').getByRole('link', { name: '무료 진단 받기' }).click()
  await expect(page).toHaveURL(/\/audit\/new/)
  await expect(page.getByRole('button', { name: '무료 진단 신청하기' })).toBeVisible()
})

test('신청 페이지에서도 신청이 되고, 순서 안내가 함께 보인다', async ({ page }) => {
  await page.route('**/api/audit/request', (route) => route.fulfill({ json: { ok: true } }))
  await page.goto('/audit/new')

  // ★ 순서 안내와 "계정 없음"은 폼 **안에** 있다. 폼이 그려지는 곳이면
  //   어디든 따라와야 한다 — 랜딩에만 있으면 이 페이지로 들어온 사람은
  //   확인 메일을 회원가입 인증으로 읽는다.
  await expect(page.getByText(/가입이나 로그인은 필요 없습니다/)).toBeVisible()
  await expect(page.getByText('메일 확인')).toBeVisible()

  await fillRequired(page)
  await page.getByRole('button', { name: '무료 진단 신청하기' }).click()
  await expect(page).toHaveURL(/\/audit\/requested/)
  await expect(page.getByText(/가입이나 로그인은 필요 없습니다/)).toBeVisible()
})

test('잘못된 이메일은 제출되지 않는다', async ({ page }) => {
  await page.goto('/audit/new')
  await fillRequired(page)
  await page.getByLabel('이메일').fill('not-an-email')
  await page.getByRole('button', { name: '무료 진단 신청하기' }).click()

  await expect(formAlert(page)).toHaveText(/이메일 주소 형식이 올바르지 않습니다/)
  await expect(page).not.toHaveURL(/\/audit\/requested/)
})

// ★ 사이트 주소는 선택 항목이다. 위 첫 테스트가 그것을 비운 채로 통과하므로
//   선택임이 이미 증명된다. 여기서는 **알아볼 수 없는 값을 조용히 삼키지
//   않는지**만 본다 — 조용히 버리면 고객은 넣었다고 믿고 리포트에는 그 줄이 없다.
test('알아볼 수 없는 사이트 주소는 오류를 보여준다', async ({ page }) => {
  await page.goto('/audit/new')
  await fillRequired(page)
  await page.getByLabel('사이트 주소').fill('무신사')
  await page.getByRole('button', { name: '무료 진단 신청하기' }).click()

  await expect(formAlert(page)).toHaveText(/사이트 주소를 알아볼 수 없습니다/)
  await expect(page).not.toHaveURL(/\/audit\/requested/)
})

test('위조된 인증 링크는 안내 화면으로 보낸다', async ({ page }) => {
  // 서명이 맞지 않으므로 `readVerifyToken`이 먼저 끊는다 — DB에 닿지 않는다.
  await page.goto('/api/audit/verify?token=forged.signature')
  await expect(page).toHaveURL(/state=invalid/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/만료|올바르지/)

  // ★ 리다이렉트가 **같은 오리진**에 머물러야 한다. 이 라우트는
  //   `env.NEXT_PUBLIC_APP_URL`로 Location을 만드는데, `.env.local`에 프로덕션
  //   주소가 들어가면 로컬에서 띄운 서버가 사용자를 프로덕션으로 보낸다.
  //   `state=invalid`만 보면 그래도 통과하므로 조용히 지나간다 — 실제로
  //   2026-07-30에 그 상태였다.
  expect(new URL(page.url()).origin).toBe('http://localhost:3000')
})

test('발송되지 않은 리포트 링크는 404다', async ({ page }) => {
  const res = await page.goto('/audit/aud_does_not_exist')
  expect(res?.status()).toBe(404)
})

// ★ 리포트 화면의 `noindex`는 여기서 검증하지 않는다. `notFound()`가 발동하면
//   Next.js는 not-found 화면을 렌더하고 **라우트의 `metadata`를 적용하지
//   않는다** — 존재하지 않는 ID로는 그 메타 태그를 볼 수 없다. 실제로 확인하려면
//   발송된 리포트가 하나 있어야 하므로, 배포 후 본인 신청 1건을 돌릴 때
//   `/audit/<id>` 소스에서 확인한다(계획서 Task 9 Step 4).

test('요금제 화면이 유료 가격을 보여준다', async ({ page }) => {
  await page.goto('/pricing')
  // ★ 요금제 화면은 같은 금액을 **두 번** 그린다 — 모바일 카드(`lg:hidden`)와
  //   데스크톱 표(`hidden lg:block`). 그냥 `getByText(...).first()`를 쓰면 DOM
  //   순서상 앞에 있는 카드가 잡히고, 데스크톱 뷰포트에서 그건 숨겨져 있어서
  //   실패한다. 어느 쪽을 보는지 명시한다.
  const table = page.locator('table')
  await expect(table.getByText('99,000')).toBeVisible()
  await expect(table.getByText('290,000')).toBeVisible()
})
