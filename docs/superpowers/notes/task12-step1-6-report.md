# Task 12 Steps 1–6 실행 보고 (자동화 절반)

- 일시: 2026-08-03
- 커밋: `e05ed05` (master, `e0a4763` 위)
- 상태: **완료** — Step 7(실측 수동 게이트)은 운영자 몫으로 남음
  (`docs/superpowers/notes/` Task 12 수동 체크리스트 참고)

## 생성/수정 파일

- `tests/e2e/onboarding-gate.spec.ts` — CI-safe 게이트 spec (DB 쓰기 없음)
- `tests/e2e/onboarding-full.spec.ts` — 온보딩 완주 spec (`E2E_ONBOARDING=1` 로컬 전용)
- `scripts/e2e-onboarding-seed.mts` — 계획서 코드 그대로. `auth.api.signUpEmail({ body })`
  시그니처는 `auth.smoke.test.ts`의 실사용과 동일해 수정 불필요했다
- `scripts/e2e-onboarding-cleanup.mts` — 계획서 코드 그대로
- `package.json` — `e2e:onboarding:seed` / `e2e:onboarding:cleanup` 2줄 (`plan:revoke` 아래)

## 완주 spec 셀렉터 적응 (4곳 — 화면은 동결, spec을 화면에 맞춤)

계획서의 spec은 화면 출시 전에 쓰였다. 출시된 화면과 대조해 다음 4곳을 고쳤고,
나머지 셀렉터('브랜드명'·'업종'·'지역'·'경쟁사 1'·/다음/·'확정하기'·'확정하고 동결'·
role='status'·'AI 생성 0/5회'·'대시보드로'·/요일 새벽/)는 전부 실물과 일치했다.

1. `getByRole('button', { name: /AI 후보 생성/ })` → `/AI 후보/`
   — 에디터는 뒤쪽 빈 줄을 걷어내므로(`trimTrailingBlanks`) 초기 상태에 빈 칸이 없고,
   그때 버튼 라벨은 'AI 후보 N개 만들기'다 ('AI 후보 생성 — …'은 빈 칸이 있을 때만).
2. `toHaveTextContent(...)` → `toContainText(...)`
   — `toHaveTextContent`는 Testing Library 매처로 Playwright에 존재하지 않는다.
3. `getByText(/동결됩니다/)` → `getByText(/동결 후에는 바꾸지 않습니다/)`
   — '동결됩니다'는 확인 패널 밖(queries/page.tsx 안내문·에디터 실시간 문구)에도 있어
   strict mode 다중 매치. 확인 패널 고유 문장으로 교체.
4. `getByText(/첫 측정이 끝나면/)` → `getByText(/첫 측정이 끝나면 점이 하나 찍힙니다/)`
   — 대시보드 빈 상태에 같은 구절이 두 곳(trend-chart·run-list) 있어 strict 위반.
   추이 차트 고유 문장으로 교체.

가짜 생성기(`E2E_FAKE_QUERY_GENERATOR=1`, `src/app/(app)/onboarding/actions.ts`
`e2eFakeGenerator`)가 `createCustomQueryGenerator`의 `parse` 옵션으로 Anthropic 호출
**앞에서** 가로채는 것을 코드로 확인했다 — 유료 LLM 호출 0회. 생성 질의
("강남 초보한테 … N번째 …")가 `checkCustomQueries` 규칙(브랜드·경쟁사명 금지,
중복 금지, 템플릿 포함)을 통과함도 사전 확인.

## 실행 결과

| 명령 | 결과 |
|---|---|
| `pnpm test:e2e --grep "밀려난다"` | 2 passed |
| `pnpm e2e:onboarding:seed` | 시드 완료 (starter) |
| `E2E_ONBOARDING=1 E2E_FAKE_QUERY_GENERATOR=1 pnpm test:e2e --grep 온보딩완주` | **1 passed (12.1s, 첫 시도)** |
| `pnpm e2e:onboarding:cleanup` | 정리 완료 |
| `pnpm test` | 78 files / **1296 passed / 1 skipped** — 베이스라인과 정확히 일치, auth-errors 플레이크 미발생 |
| `pnpm typecheck` | 통과 |
| `pnpm lint` | 통과 |
| `pnpm build` | 통과 |
| `pnpm test:e2e` (env 없이) | **11 passed / 1 skipped** — 완주 spec이 skip으로 뜸 = CI-safety 확인 |

## 프로덕션 DB 검증 (읽기 전용 카운트)

임시 스크립트(`scripts/tmp-e2e-verify.mts`, 실행 후 삭제·미커밋)로 확인:

- 시드 전 베이스라인: `{"subscriptions":"1","brands":"0","collection_runs":"0","free_audits":"4","e2e_users":"0"}`
- cleanup 후: `{"subscriptions":"1","brands":"0","collection_runs":"0","free_audits":"4","e2e_users":"0"}`

**완전 일치** — E2E 계정과 파생 행이 전부 제거됐고, 그 외 프로덕션 행은 건드리지 않았다.

## 환경 위생

- 매 `pnpm test:e2e` 후 `netstat`으로 :3000 확인 — LISTENING 소켓 0회 발생,
  taskkill 불필요. 좀비 서버 없음.
- 시드 시 가입 인증 메일 1통이 `e2e-onboarding@cited.co.kr`(발송 도메인 주소)로
  발송됨 — 계획서가 예상한 동작(외부 반송 없음).

## 우려/메모

- 푸시하지 않았다 — 코디네이터 리뷰 후 푸시.
- Step 7(실측·크몽 프리필·실패 메일·스케줄 대조)은 수동 체크리스트대로 운영자가 진행.
- 완주 spec은 문구 결합이 강하다(의도된 설계 — free-audit.spec.ts와 같은 원칙).
  화면 문구를 바꾸면 spec이 깨지는 것이 맞다.
