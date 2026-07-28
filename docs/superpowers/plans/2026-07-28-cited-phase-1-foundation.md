# Cited 1단계 — 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 16 + Neon + Drizzle + Better Auth 기반 위에, 회원가입·로그인이
동작하고 법적 요건을 갖춘 빈 SaaS 껍데기를 Vercel에 배포한다.

**Architecture:** App Router 단일 Next.js 앱. DB는 Neon(Postgres) + Drizzle,
스키마는 코드가 진실의 원천이고 마이그레이션은 `drizzle-kit generate`로 생성한다.
인증은 Better Auth 라이브러리를 우리 앱 안에서 돌려 사용자 데이터를 우리 DB에
둔다. 플랜 설정은 DB가 아니라 코드 상수(`src/lib/plans.ts`)다.

**Tech Stack:** Next.js 16.2.x (App Router, Turbopack) · React 19.2 · TypeScript 5
· Tailwind 4 · shadcn/ui · Neon Postgres · Drizzle ORM · Better Auth · Resend
· Sentry · Vitest · Playwright · pnpm 10 · Vercel Pro

## Global Constraints

로드맵의 "전 단계 공통 제약"이 전부 적용된다. 이 단계에서 특히 강제되는 것:

- `next@16.2.x`로 고정. `latest` 금지
- `tsconfig.json`에 `"strict": true`, `"noUncheckedIndexedAccess": true`
- `any` 금지. 외부 입력은 `unknown` → zod 파싱
- 금액은 원(KRW) 정수. 부동소수점 금액 연산 금지
- DB 시각은 `timestamptz`, 저장은 UTC
- 개인정보(이메일 원문, 카드정보)를 로그에 남기지 않는다
- 각 태스크의 마지막 Step은 커밋. Conventional Commits 형식

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `package.json` `tsconfig.json` `next.config.ts` | 프로젝트 설정, 버전 고정 |
| `.github/workflows/ci.yml` | 타입체크·lint·테스트·빌드 |
| `src/lib/env.ts` | 환경변수 zod 스키마 + 부팅 시 검증 |
| `src/lib/plans.ts` | `PLANS` 상수, `QUERY_PACK_SIZE`, 한도 계산 순수 함수 |
| `src/lib/plans.test.ts` | 위의 단위 테스트 |
| `src/lib/db/schema.ts` | Drizzle 테이블 정의 전부 |
| `src/lib/db/index.ts` | Neon 커넥션 + `db` 인스턴스 |
| `drizzle.config.ts` | drizzle-kit 설정 |
| `src/lib/auth.ts` | Better Auth 서버 인스턴스 |
| `src/lib/auth-client.ts` | 클라이언트 훅 |
| `src/app/api/auth/[...all]/route.ts` | Better Auth 핸들러 |
| `src/lib/email/send.ts` | Resend 래퍼 + 템플릿 |
| `src/lib/logger.ts` | 구조화 로그 |
| `src/app/(marketing)/layout.tsx` 외 | 마케팅 셸 |
| `src/app/(app)/layout.tsx` | 로그인 필요 영역 셸 + 가드 |
| `src/app/legal/terms/page.tsx` `privacy/page.tsx` | 이용약관·개인정보처리방침 |
| `instrumentation.ts` `sentry.*.config.ts` | Sentry |

---

### Task 0: 사실 확인과 버전 고정

**Files:**
- Create: `docs/superpowers/notes/2026-07-28-preflight.md`

**Interfaces:**
- Consumes: 없음
- Produces: `docs/superpowers/notes/2026-07-28-preflight.md` — 이후 태스크가
  참조할 확정 버전 표와 도메인 결정

이 태스크는 코드를 쓰지 않는다. 설계 문서 "구현 전 확인할 항목" 중 지금
확인 가능한 것을 확인하고 기록한다. 추측으로 다음 태스크를 시작하면 안 된다.

- [ ] **Step 1: 패키지 실제 최신 버전 확인**

```bash
pnpm view next@16 version --json | tail -20
pnpm view react version
pnpm view drizzle-orm version
pnpm view better-auth version
pnpm view @trigger.dev/sdk version
pnpm view tailwindcss version
```

각 명령의 실제 출력을 기록한다. `next`는 16.2.x 계열 중 가장 높은 패치를 고른다.

- [ ] **Step 2: 도메인 확보 가능 여부 확인**

```bash
# whois가 없으면 레지스트라 검색 UI로 확인하고 결과를 기록
whois cited.co.kr | head -5
whois cited.kr | head -5
whois getcited.com | head -5
```

`cited` 계열이 전부 막혀 있으면 대안 후보를 3개 적는다. 이 결정은 6단계
런치 체크리스트가 소비한다.

- [ ] **Step 3: 노트 파일 작성**

`docs/superpowers/notes/2026-07-28-preflight.md`에 아래 표를 채워 넣는다.
값을 모르면 "미확인"이 아니라 **확인 방법과 담당 태스크**를 적는다.

```markdown
# 착수 전 확인 결과 (2026-07-28)

## 확정 버전
| 패키지 | 확정 버전 | 확인 명령 출력 |
| --- | --- | --- |
| next | 16.2.? | (붙여넣기) |
| react | 19.2.? | |
| drizzle-orm | | |
| better-auth | | |
| @trigger.dev/sdk | | |
| tailwindcss | | |

## 도메인
- 1순위: (도메인) / 상태: (가능·불가)
- 2순위:
- 결정:

## 미확정 항목과 해소 지점
| 항목 | 해소 태스크 |
| --- | --- |
| Trigger.dev $5 크레딧 소진 속도 | 3단계 Task 1 |
| 토스페이먼츠 수수료율 | 4단계 착수 전 계약 확인 |
| OpenAI 웹검색 툴 단가 | 2단계 Task 2 |
| SerpApi 네이버 AI 브리핑 커버리지 | 2단계 Task 4 |
```

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/notes/2026-07-28-preflight.md
git commit -m "docs: 착수 전 버전·도메인 확인 결과 기록"
```

---

### Task 1: 프로젝트 스캐폴드와 CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`,
  `.npmrc`, `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc`,
  `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`,
  `src/app/page.tsx`, `.github/workflows/ci.yml`, `.env.example`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: Task 0의 확정 버전 표
- Produces: `pnpm dev` `pnpm build` `pnpm test` `pnpm typecheck` `pnpm lint`
  스크립트. 이후 모든 태스크가 이 명령들로 검증한다.

- [ ] **Step 1: Next.js 앱 생성**

```bash
pnpm dlx create-next-app@16 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --turbopack --no-git
```

대화형 질문이 나오면 위 플래그와 같은 값을 고른다. 이미 `docs/`가 있으므로
"디렉터리가 비어있지 않다"는 경고가 나올 수 있다 — 덮어쓰기를 허용한다.

- [ ] **Step 2: 버전을 정확히 고정**

`package.json`의 `dependencies`를 열어 캐럿(`^`)을 제거하고 Task 0에서 확정한
버전을 정확히 박는다. 예시(Task 0 결과로 숫자를 교체):

```json
{
  "dependencies": {
    "next": "16.2.3",
    "react": "19.2.0",
    "react-dom": "19.2.0"
  },
  "devDependencies": {
    "typescript": "5.9.2",
    "tailwindcss": "4.1.11",
    "@types/node": "22.14.0",
    "@types/react": "19.2.0",
    "@types/react-dom": "19.2.0"
  },
  "packageManager": "pnpm@10.11.0",
  "engines": { "node": ">=22 <23" }
}
```

`.npmrc`를 만들어 정확 버전 설치를 강제한다:

```
save-exact=true
engine-strict=true
```

그 다음 재설치:

```bash
rm -rf node_modules pnpm-lock.yaml && pnpm install
```

- [ ] **Step 3: tsconfig를 엄격 모드로**

`tsconfig.json`의 `compilerOptions`에 아래를 추가/수정한다.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

`exactOptionalPropertyTypes`는 false로 둔다 — Drizzle과 Better Auth의 타입이
이 옵션에서 대량 에러를 낸다. 나머지는 전부 켠다.

- [ ] **Step 4: 테스트 러너 설치와 설정**

```bash
pnpm add -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.smoke.test.ts', '**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/lib/db/**', 'src/lib/env.ts'],
    },
  },
})
```

스모크 테스트를 기본 실행에서 제외한 것이 핵심이다. 외부 API를 실제로 부르는
테스트가 CI를 불안정하게 만들면 안 된다.

- [ ] **Step 5: 스크립트 정의**

`package.json`의 `scripts`를 이렇게 만든다:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:smoke": "vitest run --config vitest.smoke.config.ts",
    "test:e2e": "playwright test"
  }
}
```

`vitest.smoke.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.smoke.test.ts'],
    testTimeout: 60_000,
  },
})
```

- [ ] **Step 6: 실패하는 스모크 단위 테스트 작성**

`src/lib/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs typescript with path aliases', async () => {
    const mod = await import('@/lib/version')
    expect(mod.APP_NAME).toBe('Cited')
  })
})
```

- [ ] **Step 7: 테스트가 실패하는지 확인**

```bash
pnpm test
```

Expected: FAIL — `Cannot find module '@/lib/version'`

- [ ] **Step 8: 최소 구현**

`src/lib/version.ts`:

```ts
export const APP_NAME = 'Cited'
```

- [ ] **Step 9: 테스트 통과 확인**

```bash
pnpm test
```

Expected: PASS (1 passed)

- [ ] **Step 10: `.env.example` 작성**

`.env.example` — 실제 값은 절대 넣지 않는다. 키 이름과 획득처만 적는다.

```bash
# --- 필수 (1단계) ---
DATABASE_URL=                 # Neon 대시보드 > Connection string (pooled)
DATABASE_URL_UNPOOLED=        # Neon 대시보드 > Connection string (direct) — 마이그레이션용
BETTER_AUTH_SECRET=           # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=               # resend.com > API Keys
EMAIL_FROM=Cited <noreply@example.com>

# --- 선택 (1단계) ---
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# --- 2단계 이후에 채운다 ---
OPENAI_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
SERPAPI_API_KEY=
TRIGGER_SECRET_KEY=
TOSS_SECRET_KEY=
NEXT_PUBLIC_TOSS_CLIENT_KEY=
```

`.gitignore`에 `.env`, `.env.local`이 포함되어 있는지 확인한다. 없으면 추가한다.

- [ ] **Step 11: CI 워크플로 작성**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
        env:
          # 빌드만 통과시키기 위한 더미. 실제 값이 아니어야 한다.
          DATABASE_URL: postgres://user:pass@localhost:5432/db
          BETTER_AUTH_SECRET: ci-dummy-secret-not-used-at-runtime
          BETTER_AUTH_URL: http://localhost:3000
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          RESEND_API_KEY: re_ci_dummy
          EMAIL_FROM: Cited <noreply@example.com>
```

- [ ] **Step 12: 전체 검증**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 네 명령 모두 종료 코드 0

- [ ] **Step 13: 커밋**

```bash
git add -A
git commit -m "chore: Next.js 16 스캐폴드 · 버전 고정 · Vitest · CI 파이프라인"
```

---

### Task 2: 환경변수 스키마와 부팅 검증

**Files:**
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Consumes: `.env.example`의 키 목록 (Task 1)
- Produces: `env` — 타입 안전한 환경변수 객체.
  `import { env } from '@/lib/env'` 로 전 코드베이스가 사용한다.
  `process.env` 직접 접근은 이 파일 밖에서 금지(Task 8 lint 규칙이 강제).

키가 빠진 채 배포되면 런타임 한복판에서 터진다. 부팅 시점에 전부 검증한다.

> **실행 중 변경 (2026-07-29, 리뷰 지적 반영 · 사용자 승인)**
>
> 아래 Step들은 서버 시크릿과 `NEXT_PUBLIC_*`를 **한 스키마**에 담은 평면 구조로
> 쓰였다. 이 구조는 클라이언트 번들을 깨뜨린다 — Next.js는 클라이언트 코드에서
> `process.env.NEXT_PUBLIC_X` **리터럴 표현식만** 정적 치환하고 `process.env`
> 객체 참조는 채워주지 않는다. 따라서 4단계 토스 결제 위젯처럼 브라우저에서
> `NEXT_PUBLIC_TOSS_CLIENT_KEY`를 읽어야 하는 클라이언트 컴포넌트가 `env.ts`를
> import하는 순간 서버 전용 필수 변수가 없어 검증이 throw한다.
>
> 실제 구현은 세 파일로 나뉘었다:
> - `src/lib/env.ts` — 서버 전용. 최상단 `import 'server-only'`로 클라이언트
>   번들 유입을 **빌드 타임에** 차단한다
> - `src/lib/env.client.ts` — 공개 변수 전용. 각 키를 **개별 리터럴**
>   `process.env.NEXT_PUBLIC_X`로 읽는다. `process.env`를 객체로 넘기면 이
>   수정 전체가 무효가 되므로 절대 바꾸지 말 것
> - `src/lib/env.shared.ts` — 양쪽이 공유하는 순수 zod 검증자.
>   `server-only`를 import하지 않고 `process.env`도 읽지 않는다
>
> 클라이언트에서 공개 변수를 읽을 때는 `import { clientEnv } from '@/lib/env.client'`.
> `server-only`는 vitest에서 동작하지 않아 `tests/mocks/server-only.ts` 스텁을
> alias로 물려 놓았다 — **이 경계는 `pnpm test`가 아니라 `pnpm build`가 지킨다.**
> CI에서 `pnpm build`를 빼면 안 되는 이유다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/lib/env'

const valid = {
  DATABASE_URL: 'postgres://u:p@h/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Cited <noreply@example.com>',
}

describe('parseEnv', () => {
  it('필수 키가 모두 있으면 파싱된다', () => {
    const env = parseEnv(valid)
    expect(env.DATABASE_URL).toBe('postgres://u:p@h/db')
    expect(env.NODE_ENV).toBe('test')
  })

  it('필수 키가 빠지면 키 이름을 담은 에러를 던진다', () => {
    const { DATABASE_URL, ...missing } = valid
    expect(() => parseEnv(missing)).toThrowError(/DATABASE_URL/)
  })

  it('BETTER_AUTH_SECRET이 32자 미만이면 거부한다', () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrowError(
      /BETTER_AUTH_SECRET/,
    )
  })

  it('선택 키는 없어도 통과하고 undefined가 된다', () => {
    expect(parseEnv(valid).SENTRY_DSN).toBeUndefined()
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/env.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/env'`

- [ ] **Step 3: 구현**

```bash
pnpm add zod
```

`src/lib/env.ts`:

```ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // 필수 — 1단계
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET은 32자 이상이어야 합니다'),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  // 선택 — 관측
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // 2단계 이후. 없으면 해당 기능만 비활성화된다.
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  TRIGGER_SECRET_KEY: z.string().optional(),
  TOSS_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TOSS_CLIENT_KEY: z.string().optional(),
})

export type Env = z.infer<typeof schema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    )
    throw new Error(`환경변수 검증 실패\n${lines.join('\n')}`)
  }
  return result.data
}

export const env = parseEnv(process.env)
```

`process.env`를 모듈 최상단에서 파싱하므로, 키가 빠지면 첫 import 시점에
바로 터진다. 이것이 의도다.

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/env.test.ts
```

Expected: PASS (4 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/env.ts src/lib/env.test.ts package.json pnpm-lock.yaml
git commit -m "feat: 환경변수 zod 스키마와 부팅 시 검증"
```

---

### Task 3: 플랜 상수와 한도 계산

**Files:**
- Create: `src/lib/plans.ts`, `src/lib/plans.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `PLANS: Record<PlanId, PlanConfig>`
  - `QUERY_PACK_SIZE: 10`
  - `type PlanId = 'free' | 'starter' | 'business'`
  - `type EngineId = 'chatgpt' | 'gemini' | 'naver' | 'google_aio'`
  - `resolveLimits(plan: PlanId, queryPacks: number): PlanLimits`
  - `expectedCallsPerRun(plan: PlanId, queryCount: number): number`
  - `expectedSerpCallsPerMonth(plan: PlanId, queryCount: number): number`
  - 이후 모든 단계가 한도 검증·팬아웃 계산·SerpApi 소진 예측에 사용한다

설계 문서가 "DB가 아닌 상수로 두면 티어 추가가 한 줄"이라고 못박은 부분이다.
DB 테이블로 만들지 말 것.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/plans.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PLANS,
  QUERY_PACK_SIZE,
  expectedCallsPerRun,
  expectedSerpCallsPerMonth,
  resolveLimits,
} from '@/lib/plans'

describe('PLANS', () => {
  it('무료 진단은 LLM 2종만 쓰고 SERP 샘플이 0이다', () => {
    expect(PLANS.free.engines).toEqual(['chatgpt', 'gemini'])
    expect(PLANS.free.samples.serp).toBe(0)
    expect(PLANS.free.maxQueries).toBe(3)
  })

  it('Starter에 네이버가 포함된다 (요금 구조의 핵심 결정)', () => {
    expect(PLANS.starter.engines).toContain('naver')
    expect(PLANS.starter.engines).toContain('google_aio')
  })

  it('Starter와 Business의 차이는 규모뿐이다', () => {
    expect(PLANS.starter.engines).toEqual(PLANS.business.engines)
    expect(PLANS.starter.samples).toEqual(PLANS.business.samples)
    expect(PLANS.business.maxBrands).toBeGreaterThan(PLANS.starter.maxBrands)
  })

  it('Business만 무제한 히스토리와 CSV를 가진다', () => {
    expect(PLANS.business.historyMonths).toBeNull()
    expect(PLANS.business.csvExport).toBe(true)
    expect(PLANS.starter.csvExport).toBe(false)
  })
})

describe('resolveLimits', () => {
  it('질의 팩이 없으면 플랜 기본 한도', () => {
    expect(resolveLimits('starter', 0).maxQueries).toBe(10)
  })

  it('질의 팩 1개당 10질의가 더해진다', () => {
    expect(resolveLimits('business', 1).maxQueries).toBe(40)
    expect(resolveLimits('business', 3).maxQueries).toBe(60)
  })

  it('음수 팩은 0으로 취급한다', () => {
    expect(resolveLimits('starter', -5).maxQueries).toBe(10)
  })

  it('브랜드·경쟁사 한도는 팩과 무관하다', () => {
    const limits = resolveLimits('business', 5)
    expect(limits.maxBrands).toBe(3)
    expect(limits.maxCompetitors).toBe(10)
  })
})

describe('expectedCallsPerRun', () => {
  it('Starter 10질의 = 주 100회 (2 LLM x 3 + 2 SERP x 2 = 10/질의)', () => {
    expect(expectedCallsPerRun('starter', 10)).toBe(100)
  })

  it('Business 30질의 = 주 300회', () => {
    expect(expectedCallsPerRun('business', 30)).toBe(300)
  })

  it('무료 진단 3질의 = 6회 (2 LLM x 1샘플)', () => {
    expect(expectedCallsPerRun('free', 3)).toBe(6)
  })
})

describe('expectedSerpCallsPerMonth', () => {
  it('Starter 10질의 = 172건/월 (10 x 2엔진 x 2샘플 x 4.3주)', () => {
    expect(expectedSerpCallsPerMonth('starter', 10)).toBe(172)
  })

  it('Business 30질의 = 516건/월', () => {
    expect(expectedSerpCallsPerMonth('business', 30)).toBe(516)
  })

  it('무료 진단은 SERP를 쓰지 않으므로 0', () => {
    expect(expectedSerpCallsPerMonth('free', 3)).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/plans.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/plans'`

- [ ] **Step 3: 구현**

`src/lib/plans.ts`:

```ts
export type EngineId = 'chatgpt' | 'gemini' | 'naver' | 'google_aio'
export type EngineTier = 'llm' | 'serp'
export type PlanId = 'free' | 'starter' | 'business'

export const ENGINE_TIER: Record<EngineId, EngineTier> = {
  chatgpt: 'llm',
  gemini: 'llm',
  naver: 'serp',
  google_aio: 'serp',
}

export interface PlanConfig {
  /** 월 구독료(원). 무료 진단은 0 */
  priceKrw: number
  maxBrands: number
  maxQueries: number
  maxCompetitors: number
  engines: readonly EngineId[]
  samples: { llm: number; serp: number }
  /** null = 무제한 */
  historyMonths: number | null
  csvExport: boolean
}

export const PLANS = {
  free: {
    priceKrw: 0,
    maxBrands: 1,
    maxQueries: 3,
    maxCompetitors: 3,
    engines: ['chatgpt', 'gemini'],
    samples: { llm: 1, serp: 0 },
    historyMonths: 0,
    csvExport: false,
  },
  starter: {
    priceKrw: 99_000,
    maxBrands: 1,
    maxQueries: 10,
    maxCompetitors: 3,
    engines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
    samples: { llm: 3, serp: 2 },
    historyMonths: 3,
    csvExport: false,
  },
  business: {
    priceKrw: 290_000,
    maxBrands: 3,
    maxQueries: 30,
    maxCompetitors: 10,
    engines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
    samples: { llm: 3, serp: 2 },
    historyMonths: null,
    csvExport: true,
  },
} as const satisfies Record<PlanId, PlanConfig>

export const QUERY_PACK_SIZE = 10
export const QUERY_PACK_PRICE_KRW = 90_000

/** 월 평균 주 수. 원가·SerpApi 소진 예측에 쓴다. */
export const WEEKS_PER_MONTH = 4.3

export interface PlanLimits {
  maxBrands: number
  maxQueries: number
  maxCompetitors: number
  engines: readonly EngineId[]
  samples: { llm: number; serp: number }
  historyMonths: number | null
  csvExport: boolean
}

/**
 * 구매한 질의 팩을 반영한 실제 한도.
 * 설계 ②: `PLANS[plan].maxQueries + queryPacks * QUERY_PACK_SIZE`
 */
export function resolveLimits(plan: PlanId, queryPacks: number): PlanLimits {
  const base = PLANS[plan]
  const packs = Number.isFinite(queryPacks) ? Math.max(0, Math.floor(queryPacks)) : 0
  return {
    maxBrands: base.maxBrands,
    maxQueries: base.maxQueries + packs * QUERY_PACK_SIZE,
    maxCompetitors: base.maxCompetitors,
    engines: base.engines,
    samples: base.samples,
    historyMonths: base.historyMonths,
    csvExport: base.csvExport,
  }
}

/** 월 구독 금액(원) — 기본 플랜 + 질의 팩 */
export function monthlyPriceKrw(plan: PlanId, queryPacks: number): number {
  const packs = Math.max(0, Math.floor(queryPacks))
  return PLANS[plan].priceKrw + packs * QUERY_PACK_PRICE_KRW
}

/** 수집 1회의 총 엔진 호출 수 = 질의수 × Σ(엔진별 샘플수) */
export function expectedCallsPerRun(plan: PlanId, queryCount: number): number {
  const { engines, samples } = PLANS[plan]
  const perQuery = engines.reduce(
    (sum, id) => sum + (ENGINE_TIER[id] === 'llm' ? samples.llm : samples.serp),
    0,
  )
  return queryCount * perQuery
}

/**
 * 월 SerpApi 호출 예상치.
 * 설계 문서: 질의수 × 2 SERP엔진 × 2샘플 × 4.3주
 * SerpApi 플랜 업그레이드 판단은 고객 수가 아니라 이 값의 합계로 한다.
 */
export function expectedSerpCallsPerMonth(plan: PlanId, queryCount: number): number {
  const { engines, samples } = PLANS[plan]
  const serpEngines = engines.filter((id) => ENGINE_TIER[id] === 'serp').length
  return Math.round(queryCount * serpEngines * samples.serp * WEEKS_PER_MONTH)
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/plans.test.ts
```

Expected: PASS (13 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/plans.ts src/lib/plans.test.ts
git commit -m "feat: 플랜 상수와 한도·팬아웃·SERP 소진 계산"
```

---

### Task 4: Drizzle 스키마와 Neon 연결

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `drizzle.config.ts`
- Test: `src/lib/db/schema.test.ts`
- Modify: `package.json` (db 스크립트 추가)

**Interfaces:**
- Consumes: `env` (Task 2), `PlanId`/`EngineId` (Task 3)
- Produces:
  - `db` — Drizzle 인스턴스
  - 테이블: `user` `session` `account` `verification` `subscriptions` `brands`
    `queries` `collectionRuns` `answers` `detections` `freeAudits` `payments`
    `serpapiUsage`
  - `type Brand = typeof brands.$inferSelect` 등 추론 타입

설계 ②의 ★ 필드가 이 태스크의 핵심이다. `planSnapshot`, `answers.raw`,
`detectorVersion`, `queryPacks` — 이 넷이 빠지면 시계열 전체가 무의미해진다.

- [ ] **Step 1: 패키지 설치**

```bash
pnpm add drizzle-orm @neondatabase/serverless
pnpm add -D drizzle-kit
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/db/schema.test.ts` — 이 테스트는 DB에 붙지 않는다. 스키마 정의가
설계 문서의 필수 필드를 실제로 가지고 있는지만 검증한다.

```ts
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  answers,
  brands,
  collectionRuns,
  detections,
  freeAudits,
  queries,
  subscriptions,
} from '@/lib/db/schema'

describe('설계 ②의 핵심 필드', () => {
  it('collection_runs가 planSnapshot과 completeness를 가진다', () => {
    const cols = Object.keys(getTableColumns(collectionRuns))
    expect(cols).toContain('planSnapshot')
    expect(cols).toContain('completeness')
    expect(cols).toContain('metrics')
  })

  it('answers가 원본(raw)을 보관한다', () => {
    const cols = Object.keys(getTableColumns(answers))
    expect(cols).toContain('raw')
    expect(cols).toContain('citations')
    expect(cols).toContain('sampleIndex')
  })

  it('detections가 detectorVersion과 position을 가진다', () => {
    const cols = Object.keys(getTableColumns(detections))
    expect(cols).toContain('detectorVersion')
    expect(cols).toContain('position')
    expect(cols).toContain('sentiment')
    expect(cols).toContain('subject')
  })

  it('subscriptions가 queryPacks를 가진다', () => {
    expect(Object.keys(getTableColumns(subscriptions))).toContain('queryPacks')
  })

  it('brands가 별칭·경쟁사·질의쿼터를 가진다', () => {
    const cols = Object.keys(getTableColumns(brands))
    expect(cols).toContain('aliases')
    expect(cols).toContain('competitors')
    expect(cols).toContain('queryQuota')
    expect(cols).toContain('ambiguous')
    expect(cols).toContain('collectionWeekday')
  })

  it('queries가 source를 구분한다', () => {
    expect(Object.keys(getTableColumns(queries))).toContain('source')
  })

  it('free_audits가 A/B variant와 ipHash를 기록한다', () => {
    const cols = Object.keys(getTableColumns(freeAudits))
    expect(cols).toContain('variant')
    expect(cols).toContain('ipHash')
    expect(cols).toContain('email')
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/db/schema.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/db/schema'`

- [ ] **Step 4: 스키마 구현**

`src/lib/db/schema.ts`:

```ts
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { EngineId, PlanId } from '@/lib/plans'

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// ─────────────────────────────────────────────────────────────
// Better Auth 테이블 (auth.ts의 drizzleAdapter가 이 이름을 요구한다)
// ─────────────────────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** 'user' | 'admin' — 관리자 콘솔 접근 판정 (6단계) */
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ─────────────────────────────────────────────────────────────
// 구독
// ─────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'past_due' // 결제 실패, 유예 기간 중 — 수집은 계속
  | 'suspended' // 유예 만료 — 수집 중단, 데이터는 유지
  | 'canceled'

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    plan: text('plan').$type<PlanId>().notNull(),
    status: text('status').$type<SubscriptionStatus>().notNull().default('active'),
    /** ★ 구매한 질의 팩 수. 한도 = PLANS[plan].maxQueries + queryPacks * 10 */
    queryPacks: integer('query_packs').notNull().default(0),
    /** 토스 빌링키. 카드 정보는 저장하지 않는다. */
    billingKey: text('billing_key'),
    /** 토스 customerKey — 우리가 발급한 불변 식별자 */
    customerKey: text('customer_key'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** 결제 실패 후 유예 만료 시각. status=past_due일 때만 채워진다 */
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_user_idx').on(t.userId),
    index('subscriptions_period_end_idx').on(t.currentPeriodEnd),
  ],
)

// ─────────────────────────────────────────────────────────────
// 브랜드 / 질의
// ─────────────────────────────────────────────────────────────

export const brands = pgTable(
  'brands',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    /** 표기 변형·축약어·오탈자. 온보딩에서 자동 생성 후 고객이 편집 */
    aliases: jsonb('aliases').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 브랜드명이 일반어와 겹치는가. true면 2차 LLM 판정을 무조건 거친다 */
    ambiguous: boolean('ambiguous').notNull().default(false),
    competitors: jsonb('competitors')
      .$type<{ name: string; aliases: string[] }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Business에서 브랜드들이 총 질의 한도를 나눠 쓰기 위한 필드 */
    queryQuota: integer('query_quota').notNull().default(0),
    /** 0=일 … 6=토. 가입 요일 기준. 수집 부하를 요일별로 분산한다 */
    collectionWeekday: smallint('collection_weekday').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('brands_user_idx').on(t.userId),
    index('brands_weekday_idx').on(t.collectionWeekday, t.isActive),
  ],
)

export const queries = pgTable(
  'queries',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** 'generated' = 자동 생성, 'custom' = 고객이 직접 입력 */
    source: text('source').$type<'generated' | 'custom'>().notNull().default('generated'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('queries_brand_idx').on(t.brandId, t.isActive)],
)

// ─────────────────────────────────────────────────────────────
// 수집
// ─────────────────────────────────────────────────────────────

/** ★ 수집 당시의 플랜 설정을 통째로 박제한다. 없으면 시계열 비교가 무의미해진다. */
export interface PlanSnapshot {
  plan: PlanId
  queryPacks: number
  engines: EngineId[]
  samples: { llm: number; serp: number }
  queryIds: string[]
  detectorVersion: number
}

/** 엔진별 시도/성공 수. 90% 미만이면 대시보드에 배지를 붙인다. */
export type Completeness = Partial<
  Record<EngineId, { attempted: number; succeeded: number }>
>

/** 실측 원가·성능 지표. 6단계 관리자 화면이 소비한다. */
export interface RunMetrics {
  callsByEngine: Partial<Record<EngineId, number>>
  tokensIn: number
  tokensOut: number
  estimatedCostKrw: number
  serpApiCalls: number
  durationMs: number
  /** 1차 정규식 필터 통과율 — 원가를 좌우한다 */
  stage1PassRate: number | null
}

export type RunStatus = 'running' | 'succeeded' | 'partial' | 'failed'
export type RunTrigger = 'schedule' | 'signup' | 'manual' | 'free_audit'

export const collectionRuns = pgTable(
  'collection_runs',
  {
    id: text('id').primaryKey(),
    brandId: text('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    /** ★ 수집 당시 플랜 설정 박제 */
    planSnapshot: jsonb('plan_snapshot').$type<PlanSnapshot>().notNull(),
    completeness: jsonb('completeness').$type<Completeness>().notNull().default(sql`'{}'::jsonb`),
    metrics: jsonb('metrics').$type<RunMetrics | null>(),
    status: text('status').$type<RunStatus>().notNull().default('running'),
    trigger: text('trigger').$type<RunTrigger>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('runs_brand_started_idx').on(t.brandId, t.startedAt)],
)

export interface Citation {
  url: string
  title: string
}

export const answers = pgTable(
  'answers',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => collectionRuns.id, { onDelete: 'cascade' }),
    queryId: text('query_id').notNull(),
    /** 질의 텍스트 스냅샷 — 질의가 나중에 수정되어도 이 시점 텍스트가 남는다 */
    queryText: text('query_text').notNull(),
    engineId: text('engine_id').$type<EngineId>().notNull(),
    sampleIndex: smallint('sample_index').notNull(),
    text: text('text').notNull(),
    citations: jsonb('citations').$type<Citation[]>().notNull().default(sql`'[]'::jsonb`),
    /** ★ 엔진 응답 원본. 판정 로직 개선 후 재판정하기 위해 절대 버리지 않는다 */
    raw: jsonb('raw').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('answers_run_idx').on(t.runId),
    uniqueIndex('answers_unique_idx').on(t.runId, t.queryId, t.engineId, t.sampleIndex),
  ],
)

export type Sentiment = 'recommended' | 'neutral' | 'negative'

export const detections = pgTable(
  'detections',
  {
    id: text('id').primaryKey(),
    answerId: text('answer_id')
      .notNull()
      .references(() => answers.id, { onDelete: 'cascade' }),
    /** 'self' | 'competitor:<name>' — 우리 브랜드인지 경쟁사인지 */
    subject: text('subject').notNull(),
    mentioned: boolean('mentioned').notNull(),
    /** 답변에서 몇 번째로 언급된 브랜드인가. 이 제품에서 가장 값진 필드 */
    position: integer('position'),
    sentiment: text('sentiment').$type<Sentiment>(),
    /** 한 줄 요약 — 고객에게 그대로 노출한다 */
    context: text('context'),
    /** ★ 어느 버전 로직이 매긴 판정인가. 기존 판정을 지우지 않고 추가한다 */
    detectorVersion: integer('detector_version').notNull(),
    /** 2차 LLM 판정이 실패하면 true. 데이터 손실이 아니라 미판정으로 남긴다 */
    unresolved: boolean('unresolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('detections_answer_idx').on(t.answerId),
    uniqueIndex('detections_unique_idx').on(t.answerId, t.subject, t.detectorVersion),
  ],
)

// ─────────────────────────────────────────────────────────────
// 무료 진단
// ─────────────────────────────────────────────────────────────

export type AuditStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'waitlisted'

export const freeAudits = pgTable(
  'free_audits',
  {
    id: text('id').primaryKey(),
    brandName: text('brand_name').notNull(),
    category: text('category').notNull(),
    /** 결과 확인 후 게이트에서 입력받는다. 진단 시작 시점에는 null */
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    status: text('status').$type<AuditStatus>().notNull().default('queued'),
    /** 진단 결과 요약 — 지표·증거·순위 */
    result: jsonb('result').$type<unknown>(),
    /** IP 원문을 저장하지 않는다. HMAC 해시만. */
    ipHash: text('ip_hash').notNull(),
    /** 결과 화면 노출 순서 실험 — 'cba' | 'abc' 등 */
    variant: text('variant').notNull().default('cba'),
    /** 전환 결과 — 이메일 입력했는가, 가입했는가 */
    convertedEmailAt: timestamp('converted_email_at', { withTimezone: true }),
    convertedSignupAt: timestamp('converted_signup_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audits_iphash_created_idx').on(t.ipHash, t.createdAt),
    index('audits_brand_created_idx').on(t.brandName, t.createdAt),
  ],
)

// ─────────────────────────────────────────────────────────────
// 결제 이력 / 외부 쿼터
// ─────────────────────────────────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    /** 우리가 만든 멱등키. 같은 orderId로 두 번 청구되지 않는다 */
    orderId: text('order_id').notNull(),
    amountKrw: integer('amount_krw').notNull(),
    status: text('status').$type<'paid' | 'failed' | 'canceled'>().notNull(),
    /** 토스 응답 원본 (카드번호 마스킹된 형태로만 들어온다) */
    raw: jsonb('raw').$type<unknown>(),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_order_idx').on(t.orderId),
    index('payments_subscription_idx').on(t.subscriptionId, t.createdAt),
  ],
)

/** SerpApi는 선약정이므로 잔여 건수를 직접 추적한다 (설계 ⑤ 관측) */
export const serpapiUsage = pgTable(
  'serpapi_usage',
  {
    /** 'YYYY-MM' */
    period: varchar('period', { length: 7 }).primaryKey(),
    planLimit: integer('plan_limit').notNull(),
    used: integer('used').notNull().default(0),
    alerted80: boolean('alerted_80').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

// ─────────────────────────────────────────────────────────────
// 관계
// ─────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [user.id],
    references: [subscriptions.userId],
  }),
  brands: many(brands),
}))

export const brandRelations = relations(brands, ({ one, many }) => ({
  owner: one(user, { fields: [brands.userId], references: [user.id] }),
  queries: many(queries),
  runs: many(collectionRuns),
}))

export const runRelations = relations(collectionRuns, ({ one, many }) => ({
  brand: one(brands, { fields: [collectionRuns.brandId], references: [brands.id] }),
  answers: many(answers),
}))

export const answerRelations = relations(answers, ({ one, many }) => ({
  run: one(collectionRuns, { fields: [answers.runId], references: [collectionRuns.id] }),
  detections: many(detections),
}))

// ─────────────────────────────────────────────────────────────
// 추론 타입
// ─────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type Brand = typeof brands.$inferSelect
export type Query = typeof queries.$inferSelect
export type CollectionRun = typeof collectionRuns.$inferSelect
export type Answer = typeof answers.$inferSelect
export type Detection = typeof detections.$inferSelect
export type FreeAudit = typeof freeAudits.$inferSelect
export type Payment = typeof payments.$inferSelect
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm vitest run src/lib/db/schema.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 6: DB 클라이언트와 drizzle-kit 설정**

`src/lib/db/index.ts`:

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { env } from '@/lib/env'
import * as schema from './schema'

const sql = neon(env.DATABASE_URL)

export const db = drizzle(sql, { schema })
export { schema }
export type Db = typeof db
```

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 마이그레이션은 direct 연결로. pooled 연결은 DDL에서 문제를 일으킨다.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
```

`package.json`의 `scripts`에 추가:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:push": "drizzle-kit push"
}
```

- [ ] **Step 7: Neon 프로젝트 생성과 첫 마이그레이션**

1. https://neon.tech 에서 프로젝트를 만든다 (region: `ap-southeast-1` 또는
   가장 가까운 곳). scale-to-zero가 기본 5분인지 확인한다.
2. pooled / direct connection string 둘 다 복사해 `.env`에 넣는다.
3. 마이그레이션 생성·적용:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: `drizzle/0000_*.sql`이 생성되고, 적용 후 에러 없이 종료.

- [ ] **Step 8: 테이블 생성 확인**

```bash
pnpm db:studio
```

브라우저에서 13개 테이블이 보이는지 눈으로 확인한다. 확인 후 Ctrl+C.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/db drizzle.config.ts drizzle/ package.json pnpm-lock.yaml
git commit -m "feat: Drizzle 스키마 전체 · Neon 연결 · 첫 마이그레이션"
```

---

### Task 5: Better Auth 인증

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`,
  `src/app/api/auth/[...all]/route.ts`, `src/lib/email/send.ts`,
  `src/lib/email/templates.ts`, `src/app/(auth)/sign-in/page.tsx`,
  `src/app/(auth)/sign-up/page.tsx`, `src/lib/session.ts`
- Test: `src/lib/email/templates.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` (Task 4), `env` (Task 2)
- Produces:
  - `auth` — Better Auth 서버 인스턴스
  - `getSession()` — 서버 컴포넌트에서 현재 세션을 얻는다
  - `requireUser()` — 세션 없으면 `/sign-in`으로 redirect, 있으면 `User` 반환
  - `authClient` — 클라이언트 사이드 `signIn` / `signUp` / `signOut`
  - `sendEmail({ to, subject, html })` — 이후 단계의 모든 메일 발송이 사용

- [ ] **Step 1: 패키지 설치와 API 형태 확인**

```bash
pnpm add better-auth resend
node -e "const m=require('better-auth');console.log(Object.keys(m))"
node -e "const m=require('better-auth/adapters/drizzle');console.log(Object.keys(m))"
```

두 번째·세 번째 명령의 출력을 확인한다. `betterAuth`와 `drizzleAdapter`가
보이면 아래 구현을 그대로 쓴다. export 이름이 다르면 실제 이름으로 바꾼다
(버전에 따라 경로가 바뀔 수 있다 — 추측하지 말고 출력을 근거로 삼는다).

- [ ] **Step 2: 이메일 템플릿의 실패하는 테스트 작성**

`src/lib/email/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { verificationEmail, weeklyReportEmail } from '@/lib/email/templates'

describe('verificationEmail', () => {
  it('제목과 본문에 링크가 들어간다', () => {
    const mail = verificationEmail({ url: 'https://cited.test/verify?t=abc' })
    expect(mail.subject).toContain('이메일')
    expect(mail.html).toContain('https://cited.test/verify?t=abc')
  })

  it('HTML 특수문자를 이스케이프한다', () => {
    const mail = verificationEmail({ url: 'https://x.test/?a=1&b=2' })
    expect(mail.html).toContain('a=1&amp;b=2')
    expect(mail.html).not.toContain('a=1&b=2')
  })
})

describe('weeklyReportEmail', () => {
  it('Cited Rate와 대시보드 링크를 담는다', () => {
    const mail = weeklyReportEmail({
      brandName: '무신사',
      citedRate: 0.34,
      dashboardUrl: 'https://cited.test/dashboard',
      changed: false,
    })
    expect(mail.subject).toContain('무신사')
    expect(mail.html).toContain('34%')
    expect(mail.html).toContain('https://cited.test/dashboard')
  })

  it('변화가 없으면 화살표를 쓰지 않는다', () => {
    const mail = weeklyReportEmail({
      brandName: 'X',
      citedRate: 0.1,
      dashboardUrl: 'https://x.test',
      changed: false,
    })
    expect(mail.html).not.toMatch(/[▲▼]/)
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/email/templates.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/email/templates'`

- [ ] **Step 4: 이메일 구현**

`src/lib/email/templates.ts`:

```ts
export interface EmailContent {
  subject: string
  html: string
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(bodyHtml: string): string {
  return `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Segoe UI',sans-serif;color:#1a1a1a;line-height:1.6">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e6e1;border-radius:12px;padding:32px">
<div style="font-weight:700;font-size:18px;letter-spacing:-0.02em;margin-bottom:24px">Cited</div>
${bodyHtml}
<hr style="border:none;border-top:1px solid #e8e6e1;margin:32px 0 16px">
<p style="font-size:12px;color:#8a8580;margin:0">이 메일은 Cited 서비스 이용에 따라 발송되었습니다.</p>
</div></body></html>`
}

export function verificationEmail(params: { url: string }): EmailContent {
  const url = escapeHtml(params.url)
  return {
    subject: '[Cited] 이메일 주소를 확인해 주세요',
    html: layout(
      `<p>아래 버튼을 눌러 이메일 주소를 확인해 주세요. 링크는 24시간 후 만료됩니다.</p>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">이메일 확인하기</a></p>
<p style="font-size:13px;color:#8a8580">버튼이 동작하지 않으면 이 주소를 복사해 브라우저에 붙여넣으세요:<br>${url}</p>`,
    ),
  }
}

export function weeklyReportEmail(params: {
  brandName: string
  citedRate: number
  dashboardUrl: string
  changed: boolean
  direction?: 'up' | 'down'
}): EmailContent {
  const name = escapeHtml(params.brandName)
  const url = escapeHtml(params.dashboardUrl)
  const pct = Math.round(params.citedRate * 100)
  // 설계 ③: 신뢰구간이 겹치면 화살표를 쓰지 않는다.
  const badge = params.changed
    ? `<span style="color:${params.direction === 'up' ? '#1f7a4d' : '#b3261e'}">${params.direction === 'up' ? '▲' : '▼'} 지난주 대비 변화</span>`
    : `<span style="color:#8a8580">— 변화 없음 (측정 범위 내)</span>`

  return {
    subject: `[Cited] ${params.brandName} 이번 주 측정이 완료되었습니다`,
    html: layout(
      `<p>${name}의 이번 주 측정이 완료되었습니다.</p>
<div style="margin:24px 0;padding:20px;background:#faf9f7;border-radius:8px">
  <div style="font-size:13px;color:#8a8580;margin-bottom:4px">Cited Rate</div>
  <div style="font-size:32px;font-weight:700;letter-spacing:-0.03em">${pct}%</div>
  <div style="font-size:13px;margin-top:6px">${badge}</div>
</div>
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">대시보드에서 보기</a></p>`,
    ),
  }
}
```

`src/lib/email/send.ts`:

```ts
import { Resend } from 'resend'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { EmailContent } from './templates'

const resend = new Resend(env.RESEND_API_KEY)

export async function sendEmail(params: { to: string; content: EmailContent }) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: params.content.subject,
    html: params.content.html,
  })

  if (error) {
    // 이메일 원문을 로그에 남기지 않는다.
    logger.error('email.send_failed', { subject: params.content.subject, error: error.message })
    throw new Error(`이메일 발송 실패: ${error.message}`)
  }

  logger.info('email.sent', { id: data?.id, subject: params.content.subject })
  return data
}
```

`src/lib/logger.ts` (Task 7에서 Sentry와 합쳐지지만 지금 최소 버전이 필요하다):

```ts
type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (e: string, f?: Record<string, unknown>) => emit('debug', e, f),
  info: (e: string, f?: Record<string, unknown>) => emit('info', e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit('warn', e, f),
  error: (e: string, f?: Record<string, unknown>) => emit('error', e, f),
}
```

- [ ] **Step 5: 이메일 테스트 통과 확인**

```bash
pnpm vitest run src/lib/email/templates.test.ts
```

Expected: PASS (4 passed)

- [ ] **Step 6: Better Auth 서버 인스턴스**

`src/lib/auth.ts`:

```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db, schema } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { verificationEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    // 무료 진단 남용 방지의 한 축. 이메일 인증 없이는 계정이 활성화되지 않는다.
    requireEmailVerification: true,
    minPasswordLength: 10,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({ to: user.email, content: verificationEmail({ url }) })
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일
    updateAge: 60 * 60 * 24, // 하루에 한 번 갱신
  },
})

export type AuthSession = typeof auth.$Infer.Session
```

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'

export const { GET, POST } = toNextJsHandler(auth)
```

`src/lib/session.ts`:

```ts
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

/** 로그인 필수 구간에서 쓴다. 세션이 없으면 사인인으로 보낸다. */
export async function requireUser() {
  const session = await getSession()
  if (!session?.user) redirect('/sign-in')
  return session.user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/dashboard')
  return user
}
```

`src/lib/auth-client.ts`:

```ts
'use client'

import { createAuthClient } from 'better-auth/react'
import { env } from '@/lib/env'

export const authClient = createAuthClient({
  baseURL: env.NEXT_PUBLIC_APP_URL,
})

export const { signIn, signUp, signOut, useSession } = authClient
```

> `env`는 서버 전용 키를 담고 있으므로 클라이언트 번들에 들어가면 안 된다.
> `NEXT_PUBLIC_` 접두사 키만 클라이언트에서 접근 가능하다는 Next.js 규칙이
> 이를 보장하지만, 확실히 하려면 이 파일에서 `process.env.NEXT_PUBLIC_APP_URL`을
> 직접 읽어도 된다. Step 9 빌드에서 번들 오염 여부가 드러난다.

- [ ] **Step 7: 로그인/가입 화면**

`src/app/(auth)/sign-up/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signUp } from '@/lib/auth-client'

export default function SignUpPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const { error } = await signUp.email({
      email: String(formData.get('email')),
      password: String(formData.get('password')),
      name: String(formData.get('name')),
    })
    setPending(false)
    if (error) {
      setError(error.message ?? '가입에 실패했습니다.')
      return
    }
    router.push('/verify-email')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cited 시작하기</h1>
      <form action={onSubmit} className="flex flex-col gap-3">
        <input name="name" required placeholder="이름" className="rounded-lg border px-3 py-2" />
        <input name="email" type="email" required placeholder="이메일" className="rounded-lg border px-3 py-2" />
        <input
          name="password"
          type="password"
          required
          minLength={10}
          placeholder="비밀번호 (10자 이상)"
          className="rounded-lg border px-3 py-2"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? '처리 중…' : '가입하기'}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        이미 계정이 있으신가요? <a href="/sign-in" className="underline">로그인</a>
      </p>
    </main>
  )
}
```

`src/app/(auth)/sign-in/page.tsx` — 위와 같은 구조로, `signIn.email({ email, password })`를
호출하고 성공 시 `router.push('/dashboard')`. `name` 필드는 없다.

`src/app/(auth)/verify-email/page.tsx` — 정적 안내 페이지:

```tsx
export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">메일함을 확인해 주세요</h1>
      <p className="text-neutral-600">
        입력하신 주소로 확인 메일을 보냈습니다. 링크를 누르면 가입이 완료됩니다.
      </p>
    </main>
  )
}
```

- [ ] **Step 8: 수동 검증 — 실제 가입 플로우**

```bash
pnpm dev
```

1. `http://localhost:3000/sign-up`에서 실제로 가입한다
2. Resend 대시보드(또는 메일함)에서 확인 메일이 도착했는지 본다
3. 링크를 눌러 인증한다
4. `pnpm db:studio`로 `user` 테이블에 `email_verified = true`인 행이 있는지 확인

Expected: 4단계 모두 통과. 실패하면 Step 1의 API 형태 확인 결과와 대조한다.

- [ ] **Step 9: 전체 검증**

```bash
pnpm typecheck && pnpm test && pnpm build
```

Expected: 전부 통과. 빌드 중 "server-only 모듈이 클라이언트 번들에 포함됨"
에러가 나면 `auth-client.ts`에서 `env` import를 제거하고
`process.env.NEXT_PUBLIC_APP_URL!`을 직접 쓴다.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: Better Auth 이메일 인증 · Resend 메일 발송 · 로그인/가입 화면"
```

---

### Task 6: 앱 셸과 디자인 토큰

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(marketing)/layout.tsx`,
  `src/components/ui/*` (shadcn), `src/app/globals.css` (수정),
  `src/components/site-header.tsx`, `src/components/site-footer.tsx`
- Modify: `src/app/layout.tsx`, `components.json`

**Interfaces:**
- Consumes: `requireUser()` (Task 5)
- Produces:
  - `(app)` 라우트 그룹 — 이 그룹 안의 모든 페이지는 로그인 필수
  - shadcn 컴포넌트: `Button` `Card` `Badge` `Input` `Label` `Table` `Tabs`
    `Dialog` `Select` `Checkbox` `Tooltip` `Skeleton`
  - 디자인 토큰 (CSS 변수) — 5단계 대시보드가 소비한다

> **UI 작업 지침:** 이 태스크의 시각 디자인을 시작하기 전에
> `frontend-design` 스킬을 호출한다. 템플릿 기본값처럼 보이는 UI는 이 제품에서
> 특히 치명적이다 — 무료 진단 결과 화면에서 방문자의 첫 질문이 "이거 진짜야?"이기
> 때문이다.

- [ ] **Step 1: shadcn/ui 초기화**

```bash
pnpm dlx shadcn@latest init
```

프롬프트 응답: style은 `new-york`, base color는 `neutral`, CSS 변수 사용은 `yes`.

```bash
pnpm dlx shadcn@latest add button card badge input label table tabs dialog select checkbox tooltip skeleton separator
```

- [ ] **Step 2: 디자인 토큰 정의**

`src/app/globals.css`의 `:root` 블록에 제품 고유 토큰을 추가한다. shadcn이
생성한 변수는 건드리지 않고 아래를 덧붙인다.

```css
@theme {
  /* 지표 상태색 — 대시보드 전역에서 이것만 쓴다 */
  --color-metric-up: oklch(0.55 0.12 155);
  --color-metric-down: oklch(0.55 0.18 25);
  --color-metric-flat: oklch(0.62 0.01 90);
  /* 신뢰구간 띠 */
  --color-ci-band: oklch(0.92 0.02 250);
  /* 불완전 수집 표시 */
  --color-incomplete: oklch(0.75 0.12 70);
}
```

`--color-metric-flat`이 회색인 것이 중요하다. 설계 ③의 "겹치면 변화 없음(회색)"
규칙을 색 자체가 강제한다.

- [ ] **Step 3: 루트 레이아웃**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Cited — AI 답변에 우리 브랜드가 얼마나 인용되는지',
    template: '%s · Cited',
  },
  description:
    'ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews에서 브랜드 언급을 매주 자동 추적하는 한국어 GEO 모니터링 도구.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: 로그인 필수 영역 레이아웃**

`src/app/(app)/layout.tsx`:

```tsx
import { requireUser } from '@/lib/session'
import { SiteHeader } from '@/components/site-header'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader user={{ name: user.name, email: user.email }} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  )
}
```

`src/components/site-header.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function SiteHeader({ user }: { user: { name: string; email: string } }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          Cited
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 hover:bg-accent">
            대시보드
          </Link>
          <Link href="/settings" className="rounded-md px-3 py-1.5 hover:bg-accent">
            설정
          </Link>
          <Link href="/billing" className="rounded-md px-3 py-1.5 hover:bg-accent">
            결제
          </Link>
          <span className="ml-2 hidden text-muted-foreground sm:inline">{user.name}</span>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            로그아웃
          </Button>
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 5: 임시 대시보드 페이지**

`src/app/(app)/dashboard/page.tsx` — 5단계에서 완전히 교체되지만, 지금은
인증 가드가 실제로 동작하는지 확인할 대상이 필요하다.

```tsx
import { requireUser } from '@/lib/session'

export default async function DashboardPage() {
  const user = await requireUser()
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
      <p className="text-muted-foreground">
        {user.name}님, 아직 등록된 브랜드가 없습니다.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: 인증 가드 수동 검증**

```bash
pnpm dev
```

1. 로그아웃 상태에서 `http://localhost:3000/dashboard` 접근 → `/sign-in`으로 리다이렉트되는가
2. 로그인 후 다시 접근 → 대시보드가 보이는가
3. 로그아웃 버튼 → `/sign-in`으로 가는가

Expected: 3개 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: 앱 셸 · shadcn/ui · 디자인 토큰 · 인증 가드"
```

---

### Task 7: Sentry와 순수 함수 경계 강제

**Files:**
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts`,
  `src/instrumentation.ts`, `src/instrumentation-client.ts`,
  `src/app/global-error.tsx`, `src/app/(app)/error.tsx`
- Modify: `next.config.ts`, `eslint.config.mjs`, `src/lib/logger.ts`

**Interfaces:**
- Consumes: `env` (Task 2), `logger` (Task 5)
- Produces:
  - `logger.error`가 Sentry로도 전송된다
  - ESLint 규칙: `src/lib/detection/**`, `src/lib/stats/**`에서 I/O import 금지
    — 2단계가 이 규칙 아래에서 개발된다

설계 ①의 "판정 로직은 순수 함수" 원칙을 문서가 아니라 lint로 강제한다.
사람의 기억에 의존하면 반드시 깨진다.

- [ ] **Step 1: 순수 함수 경계 위반이 lint 에러가 되는지 확인할 파일 작성**

임시로 위반 파일을 만들어 규칙이 실제로 잡는지 본다.

```bash
mkdir -p src/lib/stats
cat > src/lib/stats/__boundary_probe.ts <<'EOF'
import { db } from '@/lib/db'
export const probe = db
EOF
```

- [ ] **Step 2: lint가 아직 잡지 못하는지 확인**

```bash
pnpm lint
```

Expected: 위반 파일에 대해 아무 에러도 나지 않음 (규칙이 없으므로)

- [ ] **Step 3: ESLint 경계 규칙 추가**

`eslint.config.mjs`에 아래 블록을 추가한다:

```js
{
  files: ['src/lib/detection/**/*.ts', 'src/lib/stats/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/lib/db', '@/lib/db/*', '@/lib/env', '@/lib/email/*', 'next/*'],
            message:
              'detection/ 과 stats/ 는 순수 함수여야 합니다. 외부 I/O를 주입받으세요. (설계 ① 핵심 원칙)',
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'fetch', message: 'detection/ · stats/ 에서 네트워크 호출 금지' },
      { name: 'process', message: 'detection/ · stats/ 에서 환경변수 접근 금지' },
    ],
  },
},
```

- [ ] **Step 4: 규칙이 위반을 잡는지 확인**

```bash
pnpm lint
```

Expected: FAIL — `src/lib/stats/__boundary_probe.ts`에서
`detection/ 과 stats/ 는 순수 함수여야 합니다` 에러

- [ ] **Step 5: 프로브 제거하고 lint 통과 확인**

```bash
rm src/lib/stats/__boundary_probe.ts
pnpm lint
```

Expected: PASS

- [ ] **Step 6: Sentry 설치와 설정**

```bash
pnpm add @sentry/nextjs
```

`sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0.1,
  // 이메일·카드 정보가 이벤트에 실려 나가지 않게 한다.
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies
    if (event.user) delete event.user.email
    return event
  },
})
```

`sentry.edge.config.ts` — 위와 동일 내용.

`src/instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
```

`src/instrumentation-client.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})
```

`next.config.ts`를 Sentry로 감싼다:

```ts
import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { typedRoutes: true },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  // SENTRY_AUTH_TOKEN이 없으면 소스맵 업로드를 건너뛴다 (로컬·CI에서 정상)
  disableLogger: true,
})
```

- [ ] **Step 7: logger를 Sentry에 연결**

`src/lib/logger.ts`의 `emit` 함수를 수정한다:

```ts
import * as Sentry from '@sentry/nextjs'

type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields })
  if (level === 'error') {
    console.error(line)
    Sentry.captureMessage(event, { level: 'error', extra: fields })
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}
```

- [ ] **Step 8: 에러 바운더리**

`src/app/global-error.tsx`:

```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold">문제가 발생했습니다</h1>
        <p className="text-neutral-600">
          오류가 기록되었습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <a href="/" className="underline">
          홈으로
        </a>
      </body>
    </html>
  )
}
```

`src/app/(app)/error.tsx` — 같은 구조지만 `<html>` 없이 앱 셸 안에서 렌더된다.

- [ ] **Step 9: 검증**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: 전부 통과

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: Sentry 연동 · 에러 바운더리 · 순수 함수 경계 lint 강제"
```

---

### Task 8: 법적 페이지와 사업자 정보

**Files:**
- Create: `src/app/legal/terms/page.tsx`, `src/app/legal/privacy/page.tsx`,
  `src/app/legal/layout.tsx`, `src/components/site-footer.tsx`,
  `src/lib/business-info.ts`
- Modify: `src/app/(marketing)/layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `BUSINESS_INFO` — 상호·대표·사업자번호·통신판매업 신고번호·주소·연락처.
  푸터와 결제 화면(4단계)이 소비한다.

전자상거래법상 통신판매업자는 사업자 정보를 표시해야 하고, 결제를 받으려면
이용약관과 개인정보처리방침이 필요하다. 이걸 나중으로 미루면 4단계에서
결제를 못 연다.

**설계 문서가 명시적으로 요구한 조항:** 약관에 "제3자 플랫폼 정책 변경 시 해당
엔진 측정이 중단될 수 있음"을 반드시 넣는다. 네이버 의존 리스크 완화의 한 축이다.

- [ ] **Step 1: 사업자 정보 상수**

`src/lib/business-info.ts` — 실제 값으로 채운다. 아직 없는 항목은 빈 문자열이
아니라 `null`로 두고, Step 5의 테스트가 그것을 잡아낸다.

```ts
export const BUSINESS_INFO = {
  serviceName: 'Cited',
  companyName: '', // 상호
  representative: '', // 대표자명
  businessNumber: '', // 사업자등록번호 000-00-00000
  mailOrderNumber: '', // 통신판매업 신고번호
  address: '',
  email: 'support@cited.example',
  phone: '',
  privacyOfficer: '', // 개인정보 보호책임자
  hostingProvider: 'Vercel Inc.',
} as const

export type BusinessInfo = typeof BUSINESS_INFO
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/business-info.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUSINESS_INFO } from '@/lib/business-info'

const REQUIRED_BEFORE_PAID_LAUNCH = [
  'companyName',
  'representative',
  'businessNumber',
  'mailOrderNumber',
  'address',
  'privacyOfficer',
] as const

describe('BUSINESS_INFO', () => {
  it.each(REQUIRED_BEFORE_PAID_LAUNCH)(
    '%s는 유료 오픈 전에 채워져 있어야 한다 (전자상거래법 표시 의무)',
    (key) => {
      expect(BUSINESS_INFO[key], `${key}가 비어 있습니다`).not.toBe('')
    },
  )

  it('연락 가능한 이메일이 있다', () => {
    expect(BUSINESS_INFO.email).toMatch(/@/)
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/business-info.test.ts
```

Expected: FAIL — 6개 실패 (`companyName가 비어 있습니다` 등)

이 실패는 **의도된 것이다.** 사업자 등록이 끝나면 값을 채우고 통과시킨다.
1차 배포(무료 진단)까지는 이 테스트를 `describe.skip`으로 두고, 4단계 착수
전에 skip을 풀어 강제한다. CI를 막지 않도록 지금은:

```ts
// 사업자 등록 완료 전까지 skip. 4단계(결제) 착수 전에 반드시 해제한다.
describe.skip('BUSINESS_INFO', () => {
```

- [ ] **Step 4: skip 상태로 통과 확인**

```bash
pnpm vitest run src/lib/business-info.test.ts
```

Expected: PASS (6 skipped)

- [ ] **Step 5: 푸터 컴포넌트**

`src/components/site-footer.tsx`:

```tsx
import Link from 'next/link'
import { BUSINESS_INFO as B } from '@/lib/business-info'

export function SiteFooter() {
  const rows: [string, string][] = [
    ['상호', B.companyName],
    ['대표', B.representative],
    ['사업자등록번호', B.businessNumber],
    ['통신판매업 신고', B.mailOrderNumber],
    ['주소', B.address],
    ['개인정보 보호책임자', B.privacyOfficer],
    ['문의', B.email],
  ].filter(([, v]) => v !== '') as [string, string][]

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/legal/terms" className="underline underline-offset-4">
            이용약관
          </Link>
          <Link href="/legal/privacy" className="font-medium underline underline-offset-4">
            개인정보처리방침
          </Link>
          <Link href="/pricing" className="underline underline-offset-4">
            요금제
          </Link>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="shrink-0">{label}</dt>
              <dd className="text-foreground/70">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs">© {new Date().getFullYear()} {B.serviceName}</p>
      </div>
    </footer>
  )
}
```

개인정보처리방침 링크만 `font-medium`인 것은 표시 의무 관행이다.

- [ ] **Step 6: 이용약관**

`src/app/legal/layout.tsx`:

```tsx
import { SiteFooter } from '@/components/site-footer'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <article className="prose prose-neutral mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        {children}
      </article>
      <SiteFooter />
    </div>
  )
}
```

`src/app/legal/terms/page.tsx` — 아래 조항을 **전부** 포함한다. 특히 제7조를
빼면 안 된다.

```tsx
import { BUSINESS_INFO as B } from '@/lib/business-info'

export const metadata = { title: '이용약관' }

export default function TermsPage() {
  return (
    <>
      <h1>이용약관</h1>
      <p>시행일: 2026년 7월 28일</p>

      <h2>제1조 (목적)</h2>
      <p>
        이 약관은 {B.companyName || B.serviceName}(이하 &ldquo;회사&rdquo;)가 제공하는 Cited
        서비스(이하 &ldquo;서비스&rdquo;)의 이용조건 및 절차, 회사와 이용자의 권리·의무 및
        책임사항을 규정함을 목적으로 합니다.
      </p>

      <h2>제2조 (서비스의 내용)</h2>
      <p>
        서비스는 이용자가 등록한 브랜드가 생성형 AI 검색 엔진의 응답에 언급되는 빈도와
        맥락을 주기적으로 측정하여 대시보드 형태로 제공합니다. 서비스는 측정 결과에
        기반한 정보 제공 도구이며, 특정 검색 결과나 순위를 보장하지 않습니다.
      </p>

      <h2>제3조 (회원가입 및 계정)</h2>
      <p>
        이용자는 이메일 주소 인증을 거쳐 계정을 생성합니다. 이용자는 계정 정보를
        정확하게 유지할 책임이 있으며, 계정의 관리 소홀로 발생한 손해에 대해
        회사는 책임을 지지 않습니다.
      </p>

      <h2>제4조 (유료 서비스 및 결제)</h2>
      <ul>
        <li>유료 플랜은 월 단위 정기결제로 제공되며, 결제일에 등록된 결제수단으로 자동 청구됩니다.</li>
        <li>이용자는 언제든지 해지할 수 있으며, 해지 시 이미 결제된 기간의 잔여일까지 서비스가 유지됩니다.</li>
        <li>결제가 실패한 경우 회사는 유예 기간을 부여하며, 유예 기간 종료 후에도 결제가 이루어지지 않으면 데이터 수집이 중단됩니다. 과거에 수집된 데이터는 유지되어 재구독 시 이어집니다.</li>
      </ul>

      <h2>제5조 (환불)</h2>
      <p>
        「전자상거래 등에서의 소비자보호에 관한 법률」에 따라, 이용자는 결제일로부터
        7일 이내에 서비스를 실질적으로 이용하지 않은 경우 전액 환불을 요청할 수 있습니다.
        서비스 이용이 개시된 경우(첫 측정이 완료된 경우) 이용 일수에 해당하는 금액을
        차감한 후 환불합니다.
      </p>

      <h2>제6조 (측정 결과의 성격)</h2>
      <p>
        생성형 AI의 응답은 비결정적입니다. 동일한 질의라도 시점과 조건에 따라 다른
        응답이 생성될 수 있습니다. 서비스가 제공하는 수치는 표본 측정에 기반한 추정치이며,
        회사는 신뢰구간을 함께 표시하여 측정의 불확실성을 명시합니다. 이용자는 개별
        수치가 아니라 신뢰구간을 포함한 추세로 결과를 해석하여야 합니다.
      </p>

      <h2>제7조 (제3자 플랫폼 의존성)</h2>
      <p>
        서비스는 회사가 통제할 수 없는 제3자 플랫폼(OpenAI, Google, 네이버 등) 및
        제3자 데이터 제공자에 의존합니다. <strong>해당 플랫폼의 정책 변경, 서비스 중단,
        접근 제한, 응답 형식 변경 등으로 인해 특정 엔진에 대한 측정이 일시적으로 또는
        영구적으로 중단될 수 있습니다.</strong> 이 경우 회사는 대시보드에 해당 사실을
        명시하고, 가능한 범위에서 대체 수단을 확보하기 위해 노력합니다. 다만 특정
        엔진의 측정 지속을 보장하지 않으며, 이로 인한 손해에 대해 책임을 지지 않습니다.
      </p>

      <h2>제8조 (금지행위)</h2>
      <p>
        이용자는 서비스를 자동화된 방법으로 과도하게 호출하거나, 타인의 브랜드를
        권한 없이 등록하거나, 무료 진단을 반복적으로 남용해서는 안 됩니다.
      </p>

      <h2>제9조 (책임의 제한)</h2>
      <p>
        회사의 손해배상 책임은 이용자가 최근 3개월간 회사에 지급한 이용요금을 한도로 합니다.
        다만 회사의 고의 또는 중대한 과실이 있는 경우에는 그러하지 아니합니다.
      </p>

      <h2>제10조 (약관의 변경)</h2>
      <p>
        회사는 약관을 변경할 수 있으며, 변경 시 시행일 7일 전(이용자에게 불리한 변경은
        30일 전)까지 서비스 내 공지 및 이메일로 통지합니다.
      </p>

      <h2>부칙</h2>
      <p>이 약관은 2026년 7월 28일부터 시행합니다.</p>
    </>
  )
}
```

- [ ] **Step 7: 개인정보처리방침**

`src/app/legal/privacy/page.tsx` — 아래 항목을 전부 포함한다. 수집 항목은
Task 4의 실제 스키마와 일치해야 한다.

```tsx
import { BUSINESS_INFO as B } from '@/lib/business-info'

export const metadata = { title: '개인정보처리방침' }

export default function PrivacyPage() {
  return (
    <>
      <h1>개인정보처리방침</h1>
      <p>시행일: 2026년 7월 28일</p>

      <h2>1. 수집하는 개인정보 항목</h2>
      <table>
        <thead>
          <tr><th>구분</th><th>항목</th><th>수집 시점</th></tr>
        </thead>
        <tbody>
          <tr><td>회원</td><td>이메일, 이름, 비밀번호(해시)</td><td>회원가입 시</td></tr>
          <tr><td>무료 진단</td><td>이메일, 브랜드명, 접속 IP의 해시값</td><td>진단 요청 및 결과 열람 시</td></tr>
          <tr><td>결제</td><td>결제수단 식별자(빌링키), 결제 이력</td><td>유료 플랜 구독 시</td></tr>
          <tr><td>자동 생성</td><td>접속 로그, 쿠키, 세션 정보</td><td>서비스 이용 시</td></tr>
        </tbody>
      </table>
      <p>
        <strong>카드번호·유효기간·CVC 등 결제 정보 원문은 회사 서버에 저장하지 않습니다.</strong>
        결제대행사(토스페이먼츠)가 발급한 빌링키만 보관합니다.
      </p>
      <p>
        접속 IP는 원문을 저장하지 않고, 남용 방지 목적의 단방향 해시값만 보관합니다.
      </p>

      <h2>2. 개인정보의 이용 목적</h2>
      <ul>
        <li>회원 식별 및 서비스 제공</li>
        <li>유료 서비스 결제 및 정산</li>
        <li>측정 완료 알림 및 서비스 공지 발송</li>
        <li>무료 진단 남용 방지 및 비용 통제</li>
      </ul>

      <h2>3. 보유 및 이용 기간</h2>
      <ul>
        <li>회원 정보: 회원 탈퇴 시 즉시 파기</li>
        <li>결제 기록: 전자상거래법에 따라 5년</li>
        <li>접속 로그: 통신비밀보호법에 따라 3개월</li>
        <li>무료 진단 기록: 수집일로부터 1년</li>
      </ul>

      <h2>4. 개인정보 처리 위탁</h2>
      <table>
        <thead>
          <tr><th>수탁자</th><th>위탁 업무</th></tr>
        </thead>
        <tbody>
          <tr><td>{B.hostingProvider}</td><td>서비스 호스팅</td></tr>
          <tr><td>Neon Inc.</td><td>데이터베이스 운영</td></tr>
          <tr><td>Resend Inc.</td><td>이메일 발송</td></tr>
          <tr><td>토스페이먼츠(주)</td><td>결제 처리</td></tr>
          <tr><td>Trigger.dev Ltd.</td><td>배치 작업 실행</td></tr>
        </tbody>
      </table>
      <p>
        측정 과정에서 이용자가 등록한 <strong>브랜드명과 질의문</strong>이 OpenAI,
        Google, SerpApi 등 제3자 API로 전송됩니다. 이 데이터에는 개인정보가 포함되지
        않으나, 이용자는 개인을 식별할 수 있는 정보를 브랜드명이나 질의문에 입력하지
        않아야 합니다.
      </p>

      <h2>5. 국외 이전</h2>
      <p>
        위 수탁자 중 다수는 국외(미국 등)에 서버를 두고 있습니다. 이용자는 서비스
        이용 시 개인정보의 국외 이전에 동의한 것으로 봅니다. 이전 항목·시점·방법은
        위 4항과 같습니다.
      </p>

      <h2>6. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있습니다.
        계정 설정에서 직접 수정하거나 {B.email}로 요청하실 수 있습니다.
      </p>

      <h2>7. 개인정보 보호책임자</h2>
      <p>
        성명: {B.privacyOfficer}
        <br />
        연락처: {B.email}
      </p>

      <h2>8. 방침의 변경</h2>
      <p>
        본 방침이 변경되는 경우 시행일 7일 전부터 서비스 내 공지사항을 통해 고지합니다.
      </p>
    </>
  )
}
```

- [ ] **Step 8: 마케팅 레이아웃에 푸터 연결**

`src/app/(marketing)/layout.tsx`:

```tsx
import { SiteFooter } from '@/components/site-footer'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  )
}
```

기존 `src/app/page.tsx`를 `src/app/(marketing)/page.tsx`로 옮긴다
(3단계에서 랜딩으로 완전히 교체된다).

- [ ] **Step 9: 검증**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev
```

브라우저에서 `/legal/terms`와 `/legal/privacy`를 열어 렌더링을 눈으로 확인한다.
`prose` 클래스가 동작하지 않으면 `pnpm add -D @tailwindcss/typography` 후
`globals.css`에 `@plugin "@tailwindcss/typography";`를 추가한다.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: 이용약관 · 개인정보처리방침 · 사업자 정보 푸터

약관 제7조에 제3자 플랫폼 의존성 조항 포함 (설계 문서 요구사항)"
```

---

### Task 9: Vercel 배포와 1단계 완료 검증

**Files:**
- Create: `vercel.json`, `README.md`
- Modify: `.github/workflows/ci.yml` (배포 후 헬스체크 추가)

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 공개 URL에서 동작하는 앱. 2단계 이후의 모든 작업이 이 위에 쌓인다.

- [ ] **Step 1: Vercel 프로젝트 연결**

```bash
pnpm dlx vercel@latest link
pnpm dlx vercel@latest env pull .env.local
```

Vercel 대시보드에서 Production 환경변수를 전부 등록한다 (`.env.example`의
필수 항목 6개). `BETTER_AUTH_URL`과 `NEXT_PUBLIC_APP_URL`은 실제 배포 도메인으로.

- [ ] **Step 2: 헬스체크 라우트**

`src/app/api/health/route.ts`:

```ts
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    await db.execute(sql`select 1`)
    return NextResponse.json({
      ok: true,
      db: 'up',
      latencyMs: Date.now() - started,
    })
  } catch {
    // 에러 내용을 외부에 노출하지 않는다.
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 })
  }
}
```

- [ ] **Step 3: 배포**

```bash
pnpm dlx vercel@latest --prod
```

- [ ] **Step 4: 배포 검증 — 실제 URL에서 확인**

```bash
# <DOMAIN>을 실제 배포 도메인으로 교체
curl -s https://<DOMAIN>/api/health | tee /dev/stderr | grep '"ok":true'
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/legal/terms
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/legal/privacy
curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/sign-up
```

Expected: 헬스체크가 `"ok":true`, 나머지 세 개가 `200`

- [ ] **Step 5: 프로덕션 가입 플로우 수동 검증**

배포된 URL에서:
1. 실제 이메일로 가입
2. 확인 메일 수신 → 링크 클릭
3. `/dashboard` 접근 가능 확인
4. 로그아웃 후 `/dashboard` 접근 → `/sign-in`으로 리다이렉트 확인

Expected: 4단계 모두 통과

- [ ] **Step 6: README 작성**

`README.md`:

````markdown
# Cited

브랜드가 AI 답변에 얼마나 인용되는지 추적하는 한국어 GEO 모니터링 SaaS.

- 설계: [docs/superpowers/specs/2026-07-28-cited-design.md](docs/superpowers/specs/2026-07-28-cited-design.md)
- 구현 계획: [docs/superpowers/plans/2026-07-28-cited-roadmap.md](docs/superpowers/plans/2026-07-28-cited-roadmap.md)

## 개발 시작

```bash
pnpm install
cp .env.example .env.local   # 값을 채운다
pnpm db:migrate
pnpm dev
```

## 명령

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm test` | 단위·통합 테스트 (외부 API 호출 없음) |
| `pnpm test:smoke` | 실제 외부 API를 1회씩 호출하는 스모크 테스트 |
| `pnpm test:e2e` | Playwright E2E |
| `pnpm typecheck` | 타입 검사 |
| `pnpm db:generate` | 스키마 변경 → 마이그레이션 SQL 생성 |
| `pnpm db:migrate` | 마이그레이션 적용 |
| `pnpm db:studio` | DB 브라우저 |

## 아키텍처 원칙

1. **`src/lib/detection/` 과 `src/lib/stats/` 는 순수 함수다.** 외부 I/O를
   import하면 lint 에러가 난다. 저장된 실제 답변으로 회귀 테스트를 돌리기 위해서다.
2. **`answers.raw`를 절대 버리지 않는다.** 판정 로직을 개선하면 과거 데이터를
   재판정한다.
3. **`collection_runs.planSnapshot`이 없는 수집은 만들지 않는다.** 이게 없으면
   시계열 비교가 무의미해진다.
4. **플랜 설정은 코드 상수(`src/lib/plans.ts`)다.** DB 테이블로 만들지 않는다.
````

- [ ] **Step 7: 커밋과 태그**

```bash
git add -A
git commit -m "feat: Vercel 배포 · 헬스체크 · README

1단계 기반 완료: 인증되는 빈 SaaS가 프로덕션에 떠 있다."
git tag phase-1-complete
```

---

## 1단계 완료 조건

아래를 전부 만족해야 2단계로 넘어간다.

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] 배포된 URL에서 가입 → 이메일 인증 → 로그인 → 대시보드 접근이 동작
- [ ] `/legal/terms`가 제7조(제3자 플랫폼 의존성)를 포함
- [ ] `src/lib/stats/`에서 `@/lib/db`를 import하면 lint 에러가 남
- [ ] `pnpm db:studio`에서 13개 테이블이 보임
- [ ] `docs/superpowers/notes/2026-07-28-preflight.md`에 확정 버전과 도메인 결정이 기록됨

## 다음 단계

[2단계 — 측정 코어](2026-07-28-cited-phase-2-measurement-core.md)
