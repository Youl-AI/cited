# 착수 전 확인 결과 (2026-07-28)

## 확인 방법 메모

- `pnpm`이 환경에 설치되어 있지 않아(`which pnpm` → not found) 브리프 대안 지시에 따라
  **`npm view <pkg> version`** (npm 11.8.0)을 사용했다. `next`는 16.2.x 계열 존재 여부와
  최신 패치를 확인하기 위해 `npm view next@16 versions --json`과 `npm view next dist-tags --json`을
  추가로 실행했다.
- `whois` 명령이 Git Bash 환경에 없어(`which whois` → not found) 브리프 대안 지시에 따라
  `nslookup`으로 DNS 응답 여부만 확인했다. **DNS 응답이 있으면 "등록됨"으로만 결론짓고,
  응답이 없으면(NXDOMAIN) "구매 가능"이라 단정하지 않았다** — 미등록일 수도, 네임서버
  미설정일 수도 있어 레지스트라 UI 확인이 필요하다.

## 확정 버전

| 패키지 | 확정 버전 | 확인 명령 출력 |
| --- | --- | --- |
| next | **16.2.12** | `npm view next dist-tags --json` → `"latest": "16.2.12"`. `npm view next@16 versions --json`로 16.2.x 계열 전체 나열 확인 결과 16.2.0~16.2.12까지 존재, 16.2.12가 최고 패치. (16.3.0은 `canary`/`preview` 태그로만 존재, 정식 릴리스 아님 — `dist-tags`: `"canary": "16.3.0-canary.97"`, `"preview": "16.3.0-preview.9"`) |
| react | **19.2.8** | `npm view react version` → `19.2.8` |
| drizzle-orm | **0.45.2** | `npm view drizzle-orm version` → `0.45.2` |
| better-auth | **1.6.25** | `npm view better-auth version` → `1.6.25` |
| @trigger.dev/sdk | **4.5.8** | `npm view @trigger.dev/sdk version` → `4.5.8` |
| tailwindcss | **4.3.3** | `npm view tailwindcss version` → `4.3.3` |

계획이 전제한 `next@16.2.x` 고정은 유효하다. 16.2.x 계열이 실제로 존재하며(16.2.0~16.2.12),
그중 최고 패치인 16.2.12를 다음 태스크(프로젝트 스캐폴드)의 `package.json`에 고정한다.

## 도메인

DNS 조회(`nslookup`) 결과:

| 도메인 | nslookup 결과 | 해석 |
| --- | --- | --- |
| cited.co.kr | `kns.kornet.net 에서... 찾을 수 없습니다. Non-existent domain` (NXDOMAIN) | 응답 없음 — 등록 여부 불확실. **레지스트라 UI(가비아/후이즈 등)에서 사용자 직접 확인 필요.** |
| cited.kr | `kns.kornet.net 에서... 찾을 수 없습니다. Non-existent domain` (NXDOMAIN) | 응답 없음 — 등록 여부 불확실. **레지스트라 UI에서 사용자 직접 확인 필요.** |
| getcited.com | `getcited.com Address: 207.34.60.134` | DNS 응답 있음 → **등록됨(사용 중).** 확보 불가로 간주. |
| cited.com (참고, 브리프 목록 외 추가 확인) | `cited.com Addresses: 15.197.148.33, 3.33.130.190` | DNS 응답 있음 → **등록됨(사용 중, 파킹 페이지 가능성 있는 IP 대역).** 확보 불가로 간주. |

- 1순위: `cited.co.kr` / 상태: **미확인(레지스트라 UI 확인 필요)** — NXDOMAIN이지만 이것만으로
  구매 가능 여부를 단정할 수 없음.
- 2순위: `cited.kr` / 상태: **미확인(레지스트라 UI 확인 필요)** — 위와 동일한 이유.
- 결정: **보류.** `cited.com`과 `getcited.com`은 DNS 응답이 있어 확보 불가로 확인됐다.
  `.co.kr`/`.kr`은 NXDOMAIN만으로는 판단할 수 없어 담당자가 가비아·후이즈 등 국내
  레지스트라 검색 UI에서 실제 등록 여부를 확인해야 한다. `cited` 계열 전체가 막힌 것으로
  최종 확인될 경우를 대비한 대안 후보 3개(브랜드명 재검토용, 등록 여부는 미확인):
  1. `citehq.co.kr` / `citehq.com`
  2. `citedly.com`
  3. `aicited.co.kr`
  담당 태스크: **6단계 런치 체크리스트** 착수 전 사용자가 레지스트라 UI에서 `cited.co.kr`,
  `cited.kr` 등록 여부를 확인하고 최종 도메인을 확정한다.

### 확정 (2026-07-29, 사용자 결정)

**최종 도메인: `cited.co.kr`**

DNS 재확인: `cited.co.kr`·`cited.kr` 둘 다 NS 레코드 없음(8.8.8.8 조회 시 Non-existent domain).
미등록 가능성이 높으나 **NXDOMAIN이 구매 가능을 증명하지는 않는다** — 등록됐지만 네임서버를
안 걸어둔 경우도 있다. 레지스트라 신청 화면에서 최종 확인 후 구매할 것.

구매 시 확인: `.co.kr`이 개인 명의로 등록 가능한지. 사업자만 가능하다면 `.kr`로 간다.

**도메인이 확정되면 연쇄로 처리해야 하는 것 (1단계 Task 9 배포 전):**

1. **Resend 도메인 인증** — resend.com/domains에서 `cited.co.kr` 추가 → 대시보드가 주는
   DNS 레코드(MX + SPF TXT on `send.`, DKIM TXT on `resend._domainkey.`, 선택적 DMARC)를
   레지스트라 DNS 관리에 추가 → Verify.
   **값은 반드시 대시보드에서 복사한다** — MX 대상과 DKIM 키는 선택한 region마다 다르다.
   인증 완료 후 `EMAIL_FROM`을 `Cited <noreply@cited.co.kr>`로 교체.
   그 전까지는 `onboarding@resend.dev`라 Resend 가입 계정 주소로만 발송된다.
2. **Vercel 환경변수** — `BETTER_AUTH_URL`과 `NEXT_PUBLIC_APP_URL`을 **정확히 같은**
   `https://cited.co.kr`로 설정. 다르거나 `http://`면 `src/lib/env.ts`가 부팅을 거부한다
   (Task 5에서 세션 쿠키 `Secure` 플래그가 여기 걸려 있어 의도적으로 강제함).

## 미확정 항목과 해소 지점

| 항목 | 해소 태스크 |
| --- | --- |
| Trigger.dev $5 크레딧 소진 속도 | 3단계 Task 1 |
| 토스페이먼츠 수수료율 | 4단계 착수 전 계약 확인 |
| OpenAI 웹검색 툴 단가 | 2단계 Task 2 |
| SerpApi 네이버 AI 브리핑 커버리지 | 2단계 Task 4 |
| ~~`cited.co.kr` 등록 여부~~ → **cited.co.kr로 확정(2026-07-29)**. 남은 것은 실제 구매 | 1단계 Task 9 배포 전 |
| Resend 도메인 인증(SPF·DKIM) + EMAIL_FROM 교체 | 1단계 Task 9 배포 전 |
