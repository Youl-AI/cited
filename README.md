# Cited

브랜드가 AI 답변에 얼마나 인용되는지 추적하는 한국어 GEO(Generative Engine
Optimization) 모니터링 SaaS.

현재 상태: **1단계(기반) 구현 중** — 인증·법정 문서·DB 스키마가 올라간 빈 SaaS.
측정 코어는 2단계부터 들어온다.

| 문서 | 내용 |
| --- | --- |
| [설계](docs/superpowers/specs/2026-07-28-cited-design.md) | 제품·데이터 모델·판정 로직의 근거 |
| [로드맵](docs/superpowers/plans/2026-07-28-cited-roadmap.md) | 1~6단계 전체 |
| [1단계 계획](docs/superpowers/plans/2026-07-28-cited-phase-1-foundation.md) | 지금 구현 중인 태스크들 |
| [착수 전 확인](docs/superpowers/notes/2026-07-28-preflight.md) | 확정 버전·도메인 결정 |

## 요구사항

- **Node 24.x** — `package.json`의 `engines`가 `>=24 <25`로 고정돼 있고
  `.npmrc`에 `engine-strict=true`라 다른 메이저에서는 설치가 거부된다.
  `.nvmrc`가 있으므로 `nvm use`로 맞출 수 있다.
- **pnpm 10.34.5** — `packageManager` 필드가 진실의 원천이다.
  `corepack enable`만 해 두면 버전이 자동으로 맞춰진다. 다른 곳(CI 워크플로
  포함)에 버전을 또 적지 않는다 — 적으면 드리프트가 생긴다.
- **Neon Postgres** 프로젝트 하나, **Resend** 계정 하나.

## 로컬 셋업

```bash
pnpm install
cp .env.example .env.local
# .env.local의 아래 4개를 채운다 (자세한 내용은 다음 절)
pnpm db:migrate
pnpm dev
```

### `.env.local`에서 반드시 채워야 하는 값

`.env.example`을 복사한 직후 `pnpm dev`를 돌리면 `src/lib/env.ts`의 부팅 검증이
**빈 값 3개를 이유로 실패한다**(`env.test.ts`의 `.env.example` 테스트가 이 목록을
고정한다). 채워야 하는 것은 이 3개뿐이고, 나머지는 비워 둬도 로컬이 돈다.

| 변수 | 어디서 얻나 |
| --- | --- |
| `DATABASE_URL` | Neon 대시보드 > Connection string (**pooled**) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (32자 이상이어야 통과) |
| `RESEND_API_KEY` | resend.com > API Keys |

`DATABASE_URL_UNPOOLED`(Neon의 **direct** 연결 문자열)는 비워 둬도 부팅은 되지만
채우는 것을 권장한다 — `pnpm db:migrate`가 이 값을 쓰고, 없으면 pooled 연결로
DDL을 돌리게 되어 문제를 일으킬 수 있다. Neon이 두 문자열을 다 준다.

`BETTER_AUTH_URL`과 `NEXT_PUBLIC_APP_URL`은 `.env.example`에 이미
`http://localhost:3000`으로 들어 있다. **두 값은 정확히 같아야 한다** — 다르면
better-auth의 origin 검사가 모든 인증 요청을 거부하므로 부팅 단계에서 막는다.

`EMAIL_FROM`의 예시값(`noreply@example.com`)으로는 실제 발송이 안 된다. Resend는
인증된 도메인에서만 보낸다. 도메인 인증 전에는 `Cited <onboarding@resend.dev>`로
두면 **Resend 가입 계정 주소로만** 메일이 간다 — 로컬 가입 플로우 확인에는 충분하다.

`CRON_SECRET`은 로컬에서 비워 둔다(크론이 돌지 않는다). 배포에서는 필수다 —
[배포](#배포) 참고.

> 비밀 값은 `.env.local`에만 둔다. `.gitignore`가 `.env*`를 전부 무시하고
> `.env.example`만 예외로 둔다. `.env.example`에는 자리표시자만 적는다.

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | 개발 서버 (Turbopack) |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 빌드 결과 실행 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | 단위·통합 테스트. **외부 API도 실제 DB도 건드리지 않는다** (`vitest.config.ts`가 더미 환경변수를 주입한다) |
| `pnpm test:watch` | 위를 워치 모드로 |
| `pnpm test:smoke` | `*.smoke.test.ts`만. **실제 DB·외부 API에 붙는다** — `.env.local`의 진짜 자격증명을 읽고, 진짜 메일이 나갈 수 있다 |
| `pnpm test:e2e` | Playwright E2E. **아직 동작하지 않는다** — 스크립트만 있고 Playwright와 설정 파일은 들어오지 않았다 |
| `pnpm db:generate` | `schema.ts` 변경 → `drizzle/`에 마이그레이션 SQL 생성 |
| `pnpm db:migrate` | 마이그레이션 적용 (direct 연결 사용) |
| `pnpm db:studio` | DB 브라우저. 현재 테이블 13개 |
| `pnpm db:push` | 스키마를 마이그레이션 없이 밀어넣기. **공유 DB에는 쓰지 않는다** — 커밋된 마이그레이션과 실제 DB가 어긋난다 |

`pnpm db:generate`를 잊으면 CI가 막는다. 스키마 테스트는 메모리상의 drizzle
설정만 읽고 `drizzle/*.sql`은 읽지 않으므로, 테스트가 전부 초록인데 마이그레이션만
낡아 있을 수 있다. CI가 `db:generate`를 다시 돌려 `drizzle/` 트리가 더러워지면
실패시킨다.

## 배포

Vercel의 GitHub 연동으로 자동 배포된다. CI(`.github/workflows/ci.yml`)는 검증만
하고 배포는 수행하지 않는다.

### 환경변수

`.env.example`의 필수 항목을 Vercel Production 환경에 전부 등록한다. 로컬과
다른 점 두 가지:

1. **`BETTER_AUTH_URL`·`NEXT_PUBLIC_APP_URL`은 실제 도메인의 `https://` URL**로,
   서로 **정확히 같게**. 배포 환경에서 `http://`면 부팅이 거부된다. 이 판정은
   세션 쿠키의 `Secure` 플래그와 같은 조건을 쓴다(`src/lib/env.ts`,
   `src/lib/auth.ts`) — 한쪽만 켜지면 세션 토큰이 평문으로 나가기 때문이다.

2. **`CRON_SECRET`은 배포에서 필수다. 없으면 부팅이 실패한다.**
   그렇게 만든 이유: 이 값이 없으면 `/api/cron/*`이 fail-closed로 401만 돌려주고
   만료 세션 정리가 **조용히** 멈춘다 — 그러면 접속 IP·User-Agent가 든 만료
   세션이 계속 쌓여 개인정보처리방침 §3·§4의 "하루 1회 자동 삭제"가 거짓이 된다.
   조용한 실패를 시끄러운 부팅 실패로 바꾼 것이다.
   값은 `openssl rand -base64 32`로 만들어 Vercel 환경변수에만 넣는다(여기 적지 않는다).
   Vercel Cron은 이 변수가 설정돼 있으면 스케줄 호출에
   `Authorization: Bearer $CRON_SECRET` 헤더를 자동으로 붙인다.

### 크론

`vercel.json`:

| 경로 | 스케줄 | 하는 일 |
| --- | --- | --- |
| `/api/cron/cleanup-sessions` | `0 18 * * *` (UTC = 매일 03:00 KST) | 만료된 로그인 세션 일괄 삭제 |

편의 기능이 아니라 개인정보 보유기간의 집행 경로다. better-auth는 만료 세션을
"그 세션으로 다시 접속할 때" 지우므로, 접속이 없으면 만료 행이 영원히 남는다.
이 크론을 떼면 개인정보처리방침이 거짓이 된다.

### 헬스체크

```
GET /api/health
  200 {"ok":true,"db":"up","latencyMs":12}
  503 {"ok":false,"db":"down"}
```

DB에 `select 1`을 한 번 던진다. **실패해도 예외 내용을 응답에 담지 않는다** —
드라이버 예외에 접속 문자열이 실려 오기 때문이다. 진단은 로그(`health.db.failed`)에서 본다.

배포 후 확인은 `.github/workflows/post-deploy-health.yml`이 자동으로 한다. Vercel이
프로덕션 배포를 끝내고 GitHub에 남기는 `deployment_status`를 트리거로 쓰므로 배포와
경합하지 않는다(이 파일이 기본 브랜치에 있어야 발동한다). 손으로 돌리려면 Actions에서
수동 실행하거나:

```bash
curl -s https://<DOMAIN>/api/health          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/legal/terms
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/legal/privacy
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/sign-up
```

## 아키텍처 원칙

1. **`src/lib/detection/`과 `src/lib/stats/`는 순수 함수다.** 외부 I/O를 import하면
   lint 에러가 난다(`eslint.config.mjs`의 allow-list). 저장된 실제 답변으로 회귀
   테스트를 API 키·DB·네트워크 없이 돌리기 위해서다. 필요한 것은 인자로 주입받는다.
   *(두 디렉터리는 2단계에서 생기지만 규칙은 먼저 세워 뒀다.)*
2. **`answers.raw`를 절대 버리지 않는다.** 판정 로직을 개선하면 과거 데이터를 재판정한다.
3. **`collection_runs.planSnapshot`이 없는 수집은 만들지 않는다.** 없으면 시계열 비교가
   무의미해진다.
4. **플랜 설정은 코드 상수(`src/lib/plans.ts`)다.** DB 테이블로 만들지 않는다.
5. **라우트 핸들러에 로직을 두지 않는다.** 본체는 `src/lib/`의 순수 함수로 빼고
   의존성을 주입한다. 라우트 파일은 실제 의존성을 꽂는 얇은 층이다 — 그래야 실제
   DB 없이 테스트가 돈다 (`src/lib/cron/cleanup-sessions.ts`, `src/lib/health/check.ts`).
6. **개인정보를 로그에 넣지 않는다.** `logger.error`의 필드는 그대로 Sentry `extra`로
   간다. 이메일은 마스킹하고(`src/lib/email/send.ts`), 예외는 `message`가 아니라
   `name`만 남긴다.

## 구조

```
src/
  app/
    (marketing)/          랜딩
    (auth)/               sign-in · sign-up · verify-email
    (app)/                dashboard · billing · settings (인증 필요)
    legal/                terms · privacy
    api/auth/[...all]/    better-auth 핸들러
    api/cron/             스케줄 작업 (Bearer 인증)
    api/health/           헬스체크
  lib/
    db/                   drizzle 스키마 · 클라이언트
    env.ts                서버 환경변수 (부팅 시점 검증)
    env.client.ts         브라우저용 — 서버 시크릿이 존재하지 않는다
    auth.ts               better-auth 설정
    email/                Resend 발송 · 템플릿
    plans.ts              플랜 상수
drizzle/                  마이그레이션 SQL (커밋된다)
tests/                    앱 코드에 딸리지 않는 테스트
```
