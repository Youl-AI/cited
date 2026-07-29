# Cited 구현 로드맵

> 설계 문서: [2026-07-28-cited-design.md](../specs/2026-07-28-cited-design.md)
> 작성일 2026-07-28

**For agentic workers:** 이 문서는 인덱스다. 실제 실행 계획은 아래 6개 파일에 있다.
각 계획은 `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`로
태스크 단위 실행한다.

## 왜 6개로 쪼갰나

설계 문서는 독립적으로 배포 가능한 서브시스템 여러 개를 담고 있다. 한 계획으로
묶으면 리뷰 단위가 사라지고, 중간에 실패했을 때 되돌릴 지점이 없다. 각 단계는
**그 단계만 끝내도 동작하는 소프트웨어**를 만든다.

| 단계 | 산출물 | 이 단계가 끝나면 |
| --- | --- | --- |
| [1. 기반](2026-07-28-cited-phase-1-foundation.md) | Next.js + Neon + Drizzle + Better Auth + CI + 법적 페이지 | 회원가입/로그인이 되는 빈 앱이 Vercel에 떠 있다 |
| [2. 측정 코어](2026-07-28-cited-phase-2-measurement-core.md) | `engines/` `detection/` `stats/` | API 키만 있으면 CLI로 "이 브랜드 언급률"을 계산할 수 있다 |
| [3. 수집 코어 + 무료 진단(수동)](2026-07-28-cited-phase-3-collection-and-free-audit.md) | 수집·판정 코어, 운영자 CLI, 랜딩, 진단 신청 | **1차 배포 가능** — 신청받아 손으로 리포트를 보낸다 |
| [4. 결제 + 온보딩 + 자동화](2026-07-28-cited-phase-4-billing-and-onboarding.md) | Trigger.dev 파이프라인, 토스 빌링키, 구독 생애주기, 온보딩 마법사 | **2차 배포 가능** — 돈을 받고 주간 수집이 자동으로 돈다 |
| [5. 대시보드](2026-07-28-cited-phase-5-dashboard-and-reports.md) | 대시보드 카드 5종, 추이 차트, CSV, 주간 리포트 메일 | 유료 고객이 매주 볼 이유가 생긴다 |
| [6. 운영 콘솔](2026-07-28-cited-phase-6-admin-and-launch.md) | 관리자 화면, 원가 관측, 스모크 테스트, 런북 | 적자를 첫 달에 발견할 수 있다 |

## 의존 관계

```
1 기반
 ├─▶ 2 측정 코어 ──┐
 └─▶ 3 수집·무료진단 ◀┘   ← 여기서 1차 배포
        ├─▶ 4 결제·온보딩  ← 여기서 2차 배포 (매출 시작)
        │     └─▶ 5 대시보드
        └─────────────▶ 6 운영 콘솔 (4·5와 병행 가능)
```

2단계와 3단계 태스크 일부는 병행 가능하지만, 3단계의 수집 코어는 2단계의
`Engine` 인터페이스와 `detectMentions` 시그니처를 소비한다. 순서대로 하는 것이
안전하다.

**Trigger.dev는 4단계에 있다.** 3단계의 `runCollection`·`runDetection`은
잡 프레임워크를 모르는 순수 함수이고, 4단계의 잡이 그것을 **감싸기만** 한다.
3단계에는 스케줄러가 돌릴 대상(유료 고객)이 아직 없다.

## 단계별 배포 게이트

**1차 배포 (3단계 완료 후)** — 무료 진단만, **수동 배송**. SerpApi 가입 불필요.
고정비 약 32,000원/월. 진단이 자동 실행되지 않으므로 일일 상한·예산 킬스위치가
필요 없다 — 대신 **운영자가 `pnpm audit:run`으로 직접 실행**하고, 실행 전
이메일 인증이 유일한 관문이다. 배포 전에 본인 계정으로 신청→인증→발송→열람을
끝까지 돌려본다.

> **왜 수동인가:** 판정·통계·Share of Voice를 아직 실제 답변에 한 번도 돌려보지
> 않았다. 결과 50건을 눈으로 보기 전에 자동 공개로 넘어가면 틀린 것을 고객
> 화면에 띄우고 나서 알게 된다. 자동화 전환 기준은 시간이 아니라 **"리포트를
> 보내는 동안 손으로 고칠 것이 없어진 시점"**이다. 3단계 문서 맨 위의
> "2026-07-30 설계 변경" 절 참고.

**2차 배포 (4단계 완료 후)** — 유료 플랜 오픈. SerpApi Starter 선가입 필수.
Automatic Early Renewal을 켠 상태로 배포한다.

5단계와 6단계는 배포 게이트가 아니라 2차 배포 직후 연속으로 나간다.
단, **6단계 Task 4(원가 대시보드)는 첫 유료 고객이 생기기 전에 끝나 있어야 한다.**
설계 문서가 "계산은 틀리고 실측만 맞는다"고 못박은 지점이다.

## 전 단계 공통 제약 (Global Constraints)

아래는 6개 계획 전부에 적용된다. 각 계획의 태스크 요구사항에 암묵적으로 포함된다.

- **런타임**: Node.js 24 LTS, pnpm 10 (corepack으로 활성화)
  — 계획 초안은 22 LTS였으나 착수 시점(2026-07)에 24가 Active LTS, 22는 유지보수
  LTS(2027-04 EOL)라 24로 확정한다. `.nvmrc`·CI·Vercel 세 곳을 같은 값으로 고정
- **버전 고정**: `next@16.2.x` (`latest` 금지), `react@19.2.x`, `typescript@5.x`
  — `package.json`에 캐럿(`^`) 대신 틸드(`~`) 또는 정확한 버전을 쓴다
- **TypeScript**: `strict: true`, `noUncheckedIndexedAccess: true`. `any` 금지
  (외부 API 원본은 `unknown`으로 받고 zod로 파싱)
- **DB**: Neon Postgres + Drizzle ORM. 원시 SQL은 집계 쿼리에서만 허용
- **인증**: Better Auth (라이브러리, 우리 DB에 저장)
- **배치**: Trigger.dev. Vercel 서버리스 함수 안에서 5분 넘는 작업 금지
- **결제**: 토스페이먼츠 빌링키 정기결제. 카드 정보는 우리 DB에 절대 저장하지 않는다
- **테스트**: Vitest (단위·통합), Playwright (E2E). 외부 API를 실제로 호출하는
  테스트는 `*.smoke.test.ts`로 분리하고 CI 기본 실행에서 제외한다
- **순수 함수 원칙**: `detection/`, `stats/`는 외부 I/O를 하지 않는다. 이 두
  디렉터리에서 `fetch`, `db`, `process.env`를 import하면 lint 에러
- **원본 보관**: `answers.raw`에 엔진 응답 원본을 그대로 저장한다. 절대 버리지 않는다
- **금액 단위**: 원(KRW) 정수. 부동소수점 금액 연산 금지
- **시간대**: DB는 UTC(`timestamptz`), 표시는 `Asia/Seoul`. 스케줄 판정은
  `Asia/Seoul` 기준 요일
- **로그**: 구조화 로그(JSON). 개인정보(이메일 원문, 카드번호)를 로그에 남기지 않는다
- **커밋**: 태스크의 각 Step 5는 커밋이다. 커밋 메시지는 Conventional Commits

## 착수 전 사실 확인 (설계 문서 "구현 전 확인할 항목")

이 항목들은 **1단계 Task 0**과 **3단계 Task 1**에서 실제 명령으로 확인한다.
추측으로 넘어가면 안 된다.

- Trigger.dev 무료 크레딧($5) 소진 속도 → **4단계** Task 0에서 실측
- 토스페이먼츠 수수료율 → 4단계 Task 1 착수 전 계약서 확인
- OpenAI 웹검색 툴 호출당 단가 → 2단계 Task 4에서 실측 후 `PRICING` 상수에 반영
  (Gemini는 2026-07-29 실측 완료 — 검색 **질의당** $0.014, 무료 티어에 그라운딩 없음)
- `cited` 계열 도메인 확보 → 1단계 Task 0
- SerpApi 네이버 AI 브리핑 실제 커버리지 → 2단계 Task 4에서 실제 응답 저장 후 결정

## 실행 방법

```
1. superpowers:using-git-worktrees 로 격리 워크스페이스 확보 (선택)
2. docs/superpowers/plans/2026-07-28-cited-phase-1-foundation.md 를 연다
3. superpowers:subagent-driven-development 로 태스크 단위 실행
4. 단계가 끝나면 superpowers:requesting-code-review
5. 다음 단계로
```
