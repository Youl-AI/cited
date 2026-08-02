# Cited 4단계 — 온보딩·정기 측정·풀 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 `pnpm plan:grant`로 고객을 등록하면, 고객이 온보딩(브랜드 + 질의
에디터)을 스스로 마치고, GitHub Actions cron이 월·수·금 KST 새벽에 자동 측정해,
고객이 로그인해서 풀 대시보드(추이·히트맵·점유율·출처·회차 상세)로 보는 루프를
완성한다. 결제는 없다 — 플랜은 수동 부여, 청구는 계좌이체.

**Architecture:** 3단계 코어를 **그대로 재사용**하고 새로 만드는 것은 세 겹뿐이다.
① 온보딩 화면·서버 액션(검증은 기존 `validateCustomQueries`, 생성은 기존
`createCustomQueryGenerator`), ② cron 핸들러(순수 due 판정 + DB 어댑터 —
수집·판정·저장은 기존 `runCollection`·`runDetection`·`buildAuditResult`·
`repository.ts`), ③ `collection_runs.result` 스냅샷을 읽는 대시보드 조립(순수
집계 + 수제 SVG 차트, 회차 상세는 기존 `ResultView`). **병렬 재구현 금지** —
아래 Global Constraints의 재사용 지도를 지킨다.

**Tech Stack:** Next.js 16 App Router(Server Components + Server Actions) ·
Better Auth 1.6.25(`requireUser`, `src/lib/session.ts`) · Neon + Drizzle ·
Resend(`sendEmail`) · GitHub Actions cron · 수제 SVG 차트(의존성 추가 없음 —
`IntervalBar` 전례) · vitest + @testing-library/react(jsdom) · Playwright.

## Global Constraints

스펙(`docs/superpowers/specs/2026-07-31-phase4-onboarding-dashboard-design.md`)의
프로젝트 전역 요구. **모든 태스크의 요구사항에 이 절이 암묵적으로 포함된다.**

- **생성 한도: 브랜드당 누적 5회.** LLM 질의 생성(`QUERY_GENERATION_LIMIT = 5`)은
  서버가 원자적 UPDATE로 강제한다 — 클라이언트 카운터를 신뢰하지 않는다.
  초과 시 문구: "AI 생성은 브랜드당 5회까지입니다. 남은 질의는 직접 수정해 주세요."
- **CRON_SECRET 타이밍 세이프 비교.** `/api/cron/*`은 `Authorization: Bearer` +
  SHA-256 고정길이 `timingSafeEqual`(기존 `isAuthorizedCronRequest` 재사용)로만
  인증한다. 시크릿 미설정이면 fail-closed(401). **그 외 인증 없는 경로 추가 금지.**
- **호출당 측정 대상 브랜드 1개.** 실측 1브랜드 233초, 함수 한도 300초
  (`export const maxDuration = 300`). 여러 브랜드는 15분 간격 다음 호출이
  이어받는다(큐 없는 소진 방식). due 판정·중복 실행 잠금은 `collection_runs`
  상태로만 한다.
- **유료 게이트.** 질의 에디터의 AI 생성(회당 ~3원)은 활성 구독(`plan:grant`)이
  있는 계정만. 플랜 없는 가입 계정은 기존 빈 대시보드 + 무료 진단 안내 유지.
- **질의 한도는 계정 전체.** 브랜드마다가 아니다. 강제 지점은
  `validateRunStart`의 `queriesOnOtherBrands`(필수 필드)이고, 에디터의
  quota 계산도 같은 규칙(`resolveLimits(plan, queryPacks).maxQueries − 다른
  브랜드의 활성 질의 수)이다.
- **오차 범위를 감추는 시각화 금지.** 추이는 점 + Wilson 구간 오차 밴드, 점만
  찍고 구간을 감추지 않는다. 구간이 겹치면 ▲▼를 쓰지 않는다(`judgeChange`
  단일 판정 — 화면이 점추정끼리 따로 비교하지 않는다). 히트맵 셀도 k/n을
  함께 표기한다. 상세 규칙은 Task 0의 `docs/design-language.md`가 계약이다.
- **동결 불변식.** [확정] = 동결(`brands.queriesFrozenAt`). 동결 후 질의 수정은
  운영자 CLI로만 — 전후 비교(회차 간 비교 가능성)가 이 불변식에 걸려 있다.
- **마이그레이션은 additive only.** 기존 컬럼 변경·삭제 금지. `pnpm db:generate`
  결과를 커밋한다(CI가 drizzle 동기화를 검사한다).
- **TypeScript strict** (`noUncheckedIndexedAccess` 포함). `exactOptionalPropertyTypes`는
  tsconfig상 false지만 **코드베이스 관례는 조건부 스프레드**다 — 선택 필드는
  `...(x ? { x } : {})`로 넘긴다(`execute.ts` 전례).
- **CRLF.** 저장소는 `core.autocrlf=true` + CRLF 파일. 도구가 만드는 파일도
  이 관례를 따른다.
- **재사용 지도 (병렬 재구현 금지):** 질의 검증 = `validateCustomQueries`
  (Task 4에서 순수 모듈로 분리, 로직 불변) · 질의 생성 = `createCustomQueryGenerator`
  (프롬프트에 브랜드명 미포함) · 템플릿 = `generateAuditQueries`/`KNOWN_CATEGORIES`/
  `isRegionalCategory` · 수집 = `buildFanout`+`runCollection` · 저장 =
  `repository.ts`(`validateRunStart`·`createRun`·`saveAnswers`·`finishRun`) ·
  판정 = `runDetection`+`createClaudeJudge` · 별칭 = `createAliasGenerator` ·
  리포트 조립 = `buildAuditResult` · 원가 = `createCostMeter` · 메일 = `sendEmail`+
  `templates.ts` · 회차 상세 화면 = `ResultView` · 크론 인증 =
  `isAuthorizedCronRequest` · 도메인 정규화 = `parseHostname` · 변화 판정 =
  `judgeChange`.
- **UI 문구는 한국어, 정직한 계측 보이스.** 오차 범위 상시 표기, 화살표를 아낀다.
  `EngineId` 원문을 화면에 노출하지 않는다 — `engineLabel()`을 쓴다.
- **(app) 그룹의 모든 page.tsx는 자체적으로 `requireUser()`(또는 그것을 부르는
  로더)를 호출한다.** 레이아웃의 requireUser는 소프트 내비게이션에서 재실행되지
  않는다(`src/app/(app)/layout.tsx` 주석).
- **테스트 명령:** 단위 `pnpm vitest run <경로>` · 전체 `pnpm test` ·
  `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm test:e2e`.
  각 태스크 커밋 전에 최소 해당 태스크의 vitest + `pnpm typecheck`를 돌린다.
- **돈 주의.** 이 플랜에서 실제 API 비용이 나가는 것은 Task 12의 수동 검증뿐이다
  (에디터 생성 테스트 ~100원 + 실측 1~2회 ~2,400~4,800원 — 스펙의 비용 전제).
  자동 테스트는 전부 주입(fake)으로 돈을 쓰지 않는다.

---

## 파일 지도

| 구역 | 파일 | 역할 |
|---|---|---|
| 문서 | `docs/design-language.md` (Create, Task 0) | 디자인 언어 계약 — 이후 모든 UI 태스크의 바인딩 입력 |
| DB | `src/lib/db/schema.ts` (Modify, Task 1) | additive 컬럼 6개 |
| CLI | `scripts/plan-grant.mts` · `scripts/plan-revoke.mts` (Create, Task 2) | 플랜 수동 부여/회수 |
| 구독 | `src/lib/subscriptions/grant-args.ts` · `repository.ts` (Create, Task 2) | 인자 파싱(순수) · upsert |
| 시간 | `src/lib/kst.ts` (Create, Task 3) | KST 요일·일 시작·다음 측정 시각 (순수) |
| 온보딩 | `src/lib/onboarding/{state,brand-schema,editor}.ts` (Create, 순수) · `{gate,prefill,quota,generation}.ts` (Create, DB) | 게이트 판정·폼 검증·에디터 초기값·프리필·quota·생성 크레딧 |
| 온보딩 화면 | `src/app/(app)/onboarding/{page.tsx,actions.ts,brand-step-form.tsx}` · `queries/{page.tsx,query-editor.tsx}` · `done/page.tsx` (Create, Task 3~5) | 3단계 플로우 |
| 질의 규칙 | `src/lib/audit/query-rules.ts` (Create, Task 4) | `validateCustomQueries` 순수 분리(클라이언트 실시간 검증용) |
| 크론 | `src/lib/cron/auth.ts` (Create) · `measure.ts` (Create, 순수) · `measure-run.ts` (Create, DB) · `src/app/api/cron/measure/route.ts` (Create, Task 6) | 정기 측정 |
| 워크플로 | `.github/workflows/measure.yml` (Create, Task 7) | 월·수·금 KST 새벽 15분 간격 호출 |
| 대시보드 | `src/lib/dashboard/data.ts` (Create, 순수) · `load.ts` (Create, DB) · `src/lib/stats/change-copy.ts` (Create) (Task 8) | 스냅샷 → 화면 데이터 |
| 대시보드 화면 | `src/components/interval-bar.tsx` · `src/components/dashboard/*` · `src/app/(app)/dashboard/page.tsx` · `runs/[runId]/page.tsx` (Task 9~10) | 풀 대시보드 |
| 재사용 수선 | `src/components/audit/result-view.tsx` (Modify, Task 8·10) | `IntervalBar`·`changeSentence` 추출, `variant='run'` |
| 메일 | `src/lib/email/templates.ts` (Modify, Task 6) | 측정 실패 운영자 알림 |
| E2E | `tests/e2e/onboarding-gate.spec.ts` · `onboarding-full.spec.ts` · `scripts/e2e-onboarding-{seed,cleanup}.mts` (Task 12) | 게이트(CI) · 완주(로컬) |

---

### Task 0: 디자인 언어 문서 (`docs/design-language.md`)

흩어진 조판·색 규칙을 문서 하나로 모으고, 모션 규칙과 차트 문법을 새로 정의한다.
**이후 모든 UI 태스크(3·5·9·10·11)의 브리프가 이 파일을 바인딩 입력으로 받는다.**
소스는 전부 저장소 안에 있다: `src/app/globals.css`의 토큰 주석,
`src/components/audit/result-view.tsx`("sans는 말, mono는 계측값"),
`report-cover.tsx`, `tests/design-tokens.test.ts`. 코드 변경 없음 — 문서만.

**Files:**
- Create: `docs/design-language.md`

**Interfaces:**
- Consumes: `src/app/globals.css`의 `--color-metric-*`·`--color-engine-*` 토큰,
  `result-view.tsx`·`report-cover.tsx`의 조판 주석 (읽기만)
- Produces: 이후 UI 태스크가 인용할 규칙 문서. 특히 §모션·§차트 문법의 수치는
  Task 9·11이 그대로 구현·검증한다.

- [ ] **Step 1: 문서 작성**

아래 내용 그대로 `docs/design-language.md`를 만든다 (전문):

````markdown
# Cited 디자인 언어

2026-07-31 4단계 Task 0. 새 화면(온보딩·대시보드)은 전부 이 문서를 받아
구현한다. 기존 마케팅 화면 리트로핏은 구독 오픈 준비 때 같은 기준으로.
값의 계약은 `src/app/globals.css` + `tests/design-tokens.test.ts`가 지킨다 —
이 문서는 그 값들의 **사용 규칙**이다.

## 0. 원칙 — 정직한 계측 회사

Cited가 파는 것은 숫자가 아니라 "그 숫자를 얼마나 믿어도 되는가"다.
- **점추정 단독 노출은 거짓말이다.** 큰 숫자 옆에는 반드시 Wilson 구간을
  붙인다 (`formatInterval`). 리포트 요약 카드·PDF 표지와 같은 규칙.
- **구간이 겹치면 ▲▼를 쓰지 않는다.** 변화 판정은 `judgeChange` 하나로만
  한다. 화면이 점추정끼리 따로 비교해 화살표를 그리면 안 된다.
- **"측정 없음"과 "측정했는데 0%"를 가른다.** `Interval.n === 0`이 판별
  기준이다 (`metrics.ts` 상단 주석). n=0을 "0% ~ 100%"로 그리지 않는다.
- **조건이 다르면 비교하지 않는다.** 엔진 구성이 다른 회차, 경쟁사 집합이
  다른 구간의 SoV — `incomparable`은 숨기지 말고 "비교하지 않는 이유"를 쓴다.

## 1. 조판

- **sans는 말, mono는 계측값.** 언급률·구간·날짜·개수·엔진 이름·도메인·표기는
  전부 `font-mono tabular-nums`. 사람이 쓴 말(설명·가이드·버튼)은 sans.
  숫자는 `Metric` 패턴(`<span className="font-mono tabular-nums">`)을 통과시킨다.
- **한글 스케일은 토큰이 다시 잡았다** (`--text-*--line-height`,
  `--tracking-*`). Tailwind 기본값을 임의로 되돌리지 않는다.
- `word-break: keep-all`은 전역이다. 표의 숫자는 `tabular-nums`(전역 table 규칙).
- 화면 제목: `text-2xl font-semibold tracking-tight`. 섹션 제목: 리포트의
  `SectionHeading` 위계(`text-lg sm:text-xl font-semibold`)를 따른다.
- 아이브로(구역 표식): `font-mono text-xs tracking-[0.14em] uppercase
  text-muted-foreground` — 리포트 표제·PDF 표지와 같은 조판.

## 2. 색

- **지표 상태 5색은 채우기 전용,** 텍스트·아이콘은 `-fg` 짝을 쓴다
  (`globals.css` 주석의 대비 수치가 근거). `text-metric-up` 같은 조합은 금지 —
  `text-metric-up-fg`.
- **회색(`metric-flat`)의 뜻은 "변화 없음(측정 범위 내)" 하나뿐이다.**
  회색 램프를 다른 뜻(강도·순서)으로 재사용하지 않는다.
- **엔진 계열색은 이름으로 쓴다:** `--color-engine-chatgpt`(청록) ·
  `--color-engine-gemini`(보라) · `--color-engine-naver`(자홍) ·
  `--color-engine-google`(진청록). `google_aio` → `--color-engine-google`.
  면·선 전용(3:1 기준) — 엔진 이름 글자는 `--foreground`로 쓰고 색은 옆에
  스와치(●)로 붙인다.
- **gemini와 google은 휘도가 거의 같다.** 색만으로 가르지 않는다 — 마커
  모양을 함께 단다: chatgpt=원, gemini=사각, naver=마름모, google=삼각.
- 브랜드색(`--primary`)은 "불확실성의 색" — 신뢰구간 띠(`--color-ci-band`)의
  진한 쪽. UI 크롬과 강조에 쓰고 지표 방향에는 쓰지 않는다.
- 시스템의 빨강은 하나다: 지표 하락 = 파괴적 동작 = `--destructive`와 동계.

## 3. 컴포넌트 문법

- **IntervalBar** (`src/components/interval-bar.tsx`, Task 9에서 공용으로 추출):
  회색 트랙 + `bg-ci-band` 구간 띠 + `bg-primary` 2px 점추정 눈금.
  `role="img"` + `aria-label="신뢰구간 X% ~ Y%"`. 모든 단일 구간 표시는 이걸 쓴다.
- **헤드라인 카드:** `font-mono text-5xl` 점추정 + 옆에 `font-mono text-sm`
  구간 + 아래 IntervalBar. 리포트 요약 카드와 같은 문법.
- **배지/판정 문장:** 판정은 문장으로 쓴다(`changeSentence`). 색은 `-fg` 짝.
- **빈 상태는 방향을 준다.** "없습니다"로 끝내지 않는다 — 다음에 무엇이
  일어나는지("첫 측정이 끝나면 점이 하나 찍힙니다")를 쓴다.

## 4. 차트 문법 (4단계 신설)

의존성을 추가하지 않는다 — 수제 SVG(IntervalBar 전례).

### 4.1 추이 차트 (회차별 언급률)

- **점 + 오차 밴드.** 회차마다 점추정 점을 찍고, lower~upper를 잇는
  반투명 밴드(계열색, opacity 0.14)를 **반드시 함께** 그린다. 점만 찍고
  구간을 감추는 것은 금지. 연결선은 보조(1.5px, 계열색)다.
- Y축은 0%~100% 고정, 눈금 0·50·100. X축은 회차 날짜(`MM.DD`, mono).
- **엔진별 토글:** 전체(=`citedRate`, `--primary`) / 엔진별(`byEngine`,
  엔진 계열색 + 마커 모양). 토글은 즉시 반영, 애니메이션은 opacity 전환만.
- 점 1개뿐이면 밴드는 세로 띠로 그린다 — "구간이 넓다"가 첫 화면의 정직한
  인상이어야 한다.
- 각 점은 `<title>`로 `날짜 · 점추정 (구간) · k/n`을 노출하고, svg 루트는
  `role="img"` + 최신 값 요약 aria-label.

### 4.2 질문별 히트맵 (질의 × 회차)

- 행 = 질의(동결 순서), 열 = 회차(최근 8회, 오래된 → 최신), 셀 = 그 회차의
  질의별 언급률(`byQuery`).
- **셀 채움:** `color-mix(in oklab, var(--primary) P%, transparent)`,
  `P = round(6 + 74 × point)` — 6%(0%)에서 80%(100%)까지. 브랜드색 단색
  램프인 이유: 히트맵의 값은 방향(좋다/나쁘다)이 아니라 강도이고, 상태색
  (초록/빨강)을 쓰면 "질문별 오차 넓은 1회 측정"에 방향 판정을 입히게 된다.
- **셀 텍스트:** `k/n` (mono, `text-xs`). 채움이 진한 셀(P ≥ 50)은 글자를
  `--primary-foreground`로. 퍼센트가 아니라 k/n을 쓰는 이유: 분모가 곧
  오차의 크기라서다.
- 해당 회차에 그 질의가 없으면(질의 변경 전 회차) 셀은 `—` + 배경 없음 +
  `aria-label="측정 없음"`.
- 셀 `<title>`: `질의 · 회차 날짜 · 점추정 (구간)`.

### 4.3 점유율(SoV) 추이

- 추이 차트와 같은 점+밴드 문법, 색은 `--primary`.
- `shareOfVoice.n === 0`인 회차는 그리지 않는다.
- **경쟁사 집합이 직전 회차와 다른 점은 직전과 선으로 잇지 않고**, 차트 아래에
  고정 문구를 쓴다: "경쟁사 설정이 바뀐 구간은 이전과 비교하지 않습니다 —
  분모가 달라지면 점유율은 설정 변경만으로도 움직입니다."
- 분모(등록 경쟁사 목록)를 차트 옆에 항상 표기한다.

## 5. 모션

- **움직이는 것:** opacity·transform(translate/scale)만. 레이아웃 속성
  (width·height·top)은 애니메이션하지 않는다.
- **지속시간:** 마이크로(호버·포커스) 120ms · 요소 등장 200ms · 차트 상태
  전환(엔진 토글) 240ms. 이보다 길게 쓰지 않는다 — 계측기는 굼뜨지 않다.
- **이징:** `cubic-bezier(0.2, 0, 0, 1)` (감속 위주). 바운스·오버슈트 금지.
- **루프 애니메이션 금지.** 로딩 표시가 필요하면 opacity 펄스 1개만.
- **`prefers-reduced-motion: reduce`면 전부 끈다.** 전역 규칙(Task 9에서
  `globals.css`에 추가):
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
  ```
- 데이터가 바뀌었다고 숫자를 굴리는(count-up) 연출 금지 — 계측값은 튀지 않고
  제자리에 있어야 한다.

## 6. 금지 목록 (리뷰 체크리스트)

- [ ] 점추정 단독 노출 (구간 없이 큰 숫자)
- [ ] 구간이 겹치는데 ▲▼
- [ ] `text-metric-up` 등 채움색을 글자에 사용 (`-fg` 짝 미사용)
- [ ] `--chart-1..5` 참조 (걷어냈다 — 엔진 계열색을 쓴다)
- [ ] `EngineId` 원문 노출 (`engineLabel` 미사용)
- [ ] n=0을 0%로 그리기
- [ ] 색만으로 gemini/google 구분
- [ ] reduced-motion 무시한 transition/animation
````

- [ ] **Step 2: 커밋**

```bash
git add docs/design-language.md
git commit -m "docs(design): 디자인 언어 계약 — 조판·색 규칙 통합 + 모션·차트 문법 신설 (4단계 Task 0)"
```

---
### Task 1: 스키마 확장 — additive 컬럼 6개 + 마이그레이션

4단계가 필요로 하는 저장 공간을 한 번에 연다. **전부 additive** — 기존 컬럼은
건드리지 않는다. `brands`에 `region`·`selfDomains`가 없다는 것이 정찰에서
확인됐다(무료 진단은 `free_audits`에 자기 것을 따로 갖고 있다). 셀프서비스
온보딩은 지역형 업종과 출처 소유 판정이 브랜드 행에 있어야 성립한다.

**Files:**
- Modify: `src/lib/db/schema.ts` (subscriptions 블록, brands 블록, collectionRuns 블록)
- Create: `drizzle/0005_*.sql` (`pnpm db:generate` 산출물 — 이름은 drizzle이 짓는다)
- Test: `src/lib/db/schema.phase4.test.ts`

**Interfaces:**
- Consumes: 기존 `pgTable` 정의, `AuditResult`(jsonb에 저장될 형태 — 타입 참조는 하지 않고 `unknown`으로 둔다. `free_audits.result` 전례)
- Produces (이후 태스크가 기대는 컬럼):
  - `subscriptions.fromAuditId: text | null` — `plan:grant --from-audit`가 채우고 온보딩 프리필이 읽는다
  - `brands.region: text | null` — 지역형 업종의 지역
  - `brands.selfDomains: string[]` (jsonb, default `[]`) — 출처 소유 판정
  - `brands.queryGenerations: number` (smallint, default 0) — AI 생성 누적 횟수 (서버 강제 한도의 원장)
  - `brands.queriesFrozenAt: Date | null` — 동결 시각. null이면 온보딩 미완료 — cron 측정 대상 아님
  - `collectionRuns.result: unknown | null` (jsonb) — 회차별 `AuditResult` 스냅샷

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/db/schema.phase4.test.ts`:

```ts
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { AnyPgTable } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'vitest'
import { brands, collectionRuns, subscriptions } from './schema'

function columnNames(table: AnyPgTable): string[] {
  return getTableConfig(table).columns.map((c) => c.name)
}

describe('4단계 additive 컬럼', () => {
  test('subscriptions.from_audit_id — 크몽 진단 연결(plan:grant --from-audit)', () => {
    expect(columnNames(subscriptions)).toContain('from_audit_id')
  })

  test('brands — region · self_domains · query_generations · queries_frozen_at', () => {
    const cols = columnNames(brands)
    for (const name of ['region', 'self_domains', 'query_generations', 'queries_frozen_at']) {
      expect(cols).toContain(name)
    }
  })

  test('collection_runs.result — 회차 결과 스냅샷', () => {
    expect(columnNames(collectionRuns)).toContain('result')
  })

  test('query_generations 기본값 0 · self_domains 기본값 [] (notNull)', () => {
    const cols = getTableConfig(brands).columns
    const gen = cols.find((c) => c.name === 'query_generations')
    const domains = cols.find((c) => c.name === 'self_domains')
    expect(gen?.notNull).toBe(true)
    expect(domains?.notNull).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/db/schema.phase4.test.ts`
Expected: FAIL — `expected [...] to contain 'from_audit_id'`

- [ ] **Step 3: 스키마 수정**

`src/lib/db/schema.ts` — 세 군데.

(a) `subscriptions` 테이블, `customerKey` 컬럼 바로 아래에 추가:

```ts
    /**
     * 크몽 진단 행 연결 (`pnpm plan:grant --from-audit aud_xxx`).
     *
     * ★ 크몽 건은 운영자 이메일로 등록돼 있어 가입 이메일 자동 매칭이 불가능하다
     *   — 이 명시 연결이 유일한 길이다. 온보딩 프리필(브랜드 정보 + 동결 질의
     *   10개)이 이 id로 `free_audits`를 읽는다. FK를 걸지 않는다: 진단 행은
     *   구독과 수명이 다르고, 연결이 끊겨도 온보딩은 프리필 없이 성립한다.
     */
    fromAuditId: text('from_audit_id'),
```

(b) `brands` 테이블, `queryQuota` 컬럼 바로 아래에 추가:

```ts
    /** 지역형 업종의 지역 (예: '강남'). 전국형은 null. 템플릿 질의 생성·검증에 쓴다 */
    region: text('region'),
    /**
     * 고객 사이트 호스트명(`parseHostname` 정규화 값). 인용 출처 소유 판정에 쓴다.
     * ★ 비어 있으면 소유 판정을 하지 않는다 — `free_audits.selfDomains`와 같은 원칙.
     */
    selfDomains: jsonb('self_domains').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * 질의 에디터의 AI 생성 누적 횟수. 한도는 `QUERY_GENERATION_LIMIT`(5회, 스펙 ②).
     * ★ 서버가 원자적 UPDATE(where < 한도)로 강제한다 — 클라이언트 카운터는
     *   표시용일 뿐이다.
     */
    queryGenerations: smallint('query_generations').notNull().default(0),
    /**
     * 질의 동결 시각. [확정]이 채운다. null = 온보딩 미완료 — cron이 측정하지 않는다.
     * ★ 동결 후 질의 수정은 운영자 CLI로만 (전후 비교 불변식, 스펙 ②).
     */
    queriesFrozenAt: timestamp('queries_frozen_at', { withTimezone: true }),
```

(c) `collectionRuns` 테이블, `metrics` 컬럼 바로 아래에 추가:

```ts
    /**
     * 회차 결과 스냅샷 — `AuditResult` 형태 (`buildAuditResult` 재사용, 스펙 ④).
     * 추이·히트맵·점유율은 이 스냅샷들에서 계산하고, 회차 상세는 `ResultView`가
     * 그대로 그린다. `free_audits.result`와 같은 이유로 `unknown`이다 — 과거
     * 스냅샷에 지금 없는 필드가 있을 수 있고, 읽는 쪽(`parseRunResult`)이 걸러낸다.
     */
    result: jsonb('result').$type<unknown>(),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/db/schema.phase4.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 마이그레이션 생성 + 내용 검수**

Run: `pnpm db:generate`

생성된 `drizzle/0005_*.sql`이 **정확히 아래 6줄(순서는 무관)** 인지 확인한다.
다른 ALTER/DROP이 섞여 있으면 스키마 수정이 잘못된 것이다 — 멈추고 원인을 찾는다:

```sql
ALTER TABLE "brands" ADD COLUMN "region" text;
ALTER TABLE "brands" ADD COLUMN "self_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "brands" ADD COLUMN "query_generations" smallint DEFAULT 0 NOT NULL;
ALTER TABLE "brands" ADD COLUMN "queries_frozen_at" timestamp with time zone;
ALTER TABLE "collection_runs" ADD COLUMN "result" jsonb;
ALTER TABLE "subscriptions" ADD COLUMN "from_audit_id" text;
```

- [ ] **Step 6: 개발 DB에 적용**

Run: `pnpm db:migrate`
Expected: 오류 없이 종료. (프로덕션 적용은 Task 12의 수동 검증 체크리스트에서.)

- [ ] **Step 7: 전체 회귀 + 커밋**

Run: `pnpm vitest run src/lib/db` && `pnpm typecheck`
Expected: PASS

```bash
git add src/lib/db/schema.ts src/lib/db/schema.phase4.test.ts drizzle/
git commit -m "feat(db): 4단계 additive 컬럼 — collection_runs.result 스냅샷, 브랜드 지역·도메인·생성한도·동결, 구독 from_audit 연결"
```

---

### Task 2: 플랜 부여 CLI — `plan:grant` / `plan:revoke`

스펙 ①. 운영자가 돈 받은 고객에게만 플랜을 부여한다(비용 통제 장치).
CLI 관례는 `scripts/audit-new.mts`를 따른다: `option()` 파서, 한국어 사용법
헤더, 다음 단계 안내 출력.

**Files:**
- Create: `src/lib/subscriptions/grant-args.ts` (순수 — 인자 파싱)
- Create: `src/lib/subscriptions/repository.ts` (DB — upsert/revoke)
- Create: `scripts/plan-grant.mts`, `scripts/plan-revoke.mts`
- Modify: `package.json` (scripts 2줄)
- Test: `src/lib/subscriptions/grant-args.test.ts`

**Interfaces:**
- Consumes: `PLANS`·`PlanId`(`@/lib/plans`), `getAudit`(`@/lib/audit/repository`),
  `db`·`schema`(`@/lib/db`), Task 1의 `subscriptions.fromAuditId`
- Produces:
  - `GRANTABLE_PLANS = ['starter', 'business'] as const`, `type GrantablePlan`
  - `parseGrantArgs(argv: readonly string[]): { ok: true; args: GrantArgs } | { ok: false; reason: string }`
    — `GrantArgs = { email: string; plan: GrantablePlan; queryPacks: number; fromAuditId: string | null }`
  - `findUserByEmail(email: string): Promise<{ id: string; email: string; name: string } | null>`
  - `grantPlan(args: { userId: string; plan: GrantablePlan; queryPacks: number; fromAuditId: string | null }): Promise<Subscription>`
  - `revokePlan(userId: string): Promise<Subscription | null>`
  - pnpm 스크립트 `plan:grant`, `plan:revoke`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/subscriptions/grant-args.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { parseGrantArgs } from './grant-args'

describe('parseGrantArgs', () => {
  test('기본형: 이메일 + 플랜', () => {
    const r = parseGrantArgs(['user@example.com', 'starter'])
    expect(r).toEqual({
      ok: true,
      args: { email: 'user@example.com', plan: 'starter', queryPacks: 0, fromAuditId: null },
    })
  })

  test('--packs와 --from-audit', () => {
    const r = parseGrantArgs(['user@example.com', 'business', '--from-audit', 'aud_x1', '--packs', '2'])
    expect(r).toEqual({
      ok: true,
      args: { email: 'user@example.com', plan: 'business', queryPacks: 2, fromAuditId: 'aud_x1' },
    })
  })

  test('이메일은 소문자로 정규화한다 — user 테이블 unique 매칭', () => {
    const r = parseGrantArgs(['User@Example.COM', 'starter'])
    expect(r.ok && r.args.email).toBe('user@example.com')
  })

  test('free는 부여할 수 없다 — 부여는 유료 플랜만', () => {
    const r = parseGrantArgs(['user@example.com', 'free'])
    expect(r.ok).toBe(false)
  })

  test('--packs 음수·소수·NaN 거부', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(parseGrantArgs(['a@b.co', 'starter', '--packs', bad]).ok).toBe(false)
    }
  })

  test('인자 부족이면 사용법 안내용 실패', () => {
    expect(parseGrantArgs(['user@example.com']).ok).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/subscriptions/grant-args.test.ts`
Expected: FAIL — `Cannot find module './grant-args'`

- [ ] **Step 3: 구현 — `src/lib/subscriptions/grant-args.ts`**

```ts
/**
 * `plan:grant` 인자 파싱 — 순수 모듈. I/O 없음.
 *
 * ★ 'free'는 부여 대상이 아니다. free는 "구독 없음"의 다른 이름이고, 부여는
 *   돈 받은 고객에게만 한다(스펙 비용 전제 — 부여한 만큼 운영자 부담).
 */

export const GRANTABLE_PLANS = ['starter', 'business'] as const
export type GrantablePlan = (typeof GRANTABLE_PLANS)[number]

export interface GrantArgs {
  email: string
  plan: GrantablePlan
  queryPacks: number
  fromAuditId: string | null
}

export type ParsedGrant = { ok: true; args: GrantArgs } | { ok: false; reason: string }

function isGrantable(value: string): value is GrantablePlan {
  return (GRANTABLE_PLANS as readonly string[]).includes(value)
}

export function parseGrantArgs(argv: readonly string[]): ParsedGrant {
  const rest = [...argv]
  const option = (name: string): string | undefined => {
    const i = rest.indexOf(name)
    if (i < 0) return undefined
    const value = rest[i + 1]
    rest.splice(i, value === undefined ? 1 : 2)
    return value
  }

  const fromAuditId = option('--from-audit') ?? null
  const packsArg = option('--packs')

  const [emailRaw, planRaw] = rest
  if (!emailRaw || !planRaw) {
    return {
      ok: false,
      reason:
        '사용법: pnpm plan:grant <이메일> starter|business [--from-audit aud_xxx] [--packs N]',
    }
  }
  if (!isGrantable(planRaw)) {
    return { ok: false, reason: `알 수 없는 플랜: ${planRaw} (${GRANTABLE_PLANS.join(' | ')})` }
  }

  let queryPacks = 0
  if (packsArg !== undefined) {
    const n = Number(packsArg)
    // ★ 음수·소수를 조용히 정제하지 않는다 — resolveLimits의 sanitizePacks는
    //   저장된 값의 방어선이고, 운영자 입력 오타는 여기서 크게 멈춰야 한다.
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, reason: `--packs는 0 이상의 정수여야 합니다 (받은 값: ${packsArg})` }
    }
    queryPacks = n
  }

  return {
    ok: true,
    args: { email: emailRaw.trim().toLowerCase(), plan: planRaw, queryPacks, fromAuditId },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/subscriptions/grant-args.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: DB 계층 — `src/lib/subscriptions/repository.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import type { GrantablePlan } from './grant-args'

/**
 * 구독 CRUD — DB 접근만. 검증(`grant-args.ts`)은 순수 모듈에 있다.
 * `audit/repository.ts`와 같은 분리.
 */

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const row = await db.query.user.findFirst({ where: eq(schema.user.email, email) })
  return row ? { id: row.id, email: row.email, name: row.name } : null
}

/**
 * 부여 = upsert. 이미 구독 행이 있으면(회수됐던 고객 포함) 갱신한다 —
 * `subscriptions_user_idx`가 unique라 사용자당 행은 하나다.
 *
 * ★ 결제가 없으므로 `currentPeriodEnd`는 채우지 않는다. 기간 관리는 수동
 *   청구(계좌이체)와 함께 운영자 책임이고, 회수는 `plan:revoke`가 한다.
 */
export async function grantPlan(args: {
  userId: string
  plan: GrantablePlan
  queryPacks: number
  fromAuditId: string | null
}): Promise<Subscription> {
  const rows = await db
    .insert(schema.subscriptions)
    .values({
      id: randomUUID(),
      userId: args.userId,
      plan: args.plan,
      status: 'active',
      queryPacks: args.queryPacks,
      fromAuditId: args.fromAuditId,
      currentPeriodStart: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.subscriptions.userId,
      set: {
        plan: args.plan,
        status: 'active',
        queryPacks: args.queryPacks,
        fromAuditId: args.fromAuditId,
        canceledAt: null,
        updatedAt: new Date(),
      },
    })
    .returning()
  const created = rows[0]
  if (!created) throw new Error('구독을 저장하지 못했습니다')
  return created
}

export async function revokePlan(userId: string): Promise<Subscription | null> {
  const rows = await db
    .update(schema.subscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.subscriptions.userId, userId))
    .returning()
  return rows[0] ?? null
}
```

- [ ] **Step 6: CLI — `scripts/plan-grant.mts`**

```ts
/**
 * 플랜 수동 부여 (4단계 ① — 결제 없음, 수동 청구).
 *
 *   pnpm plan:grant <이메일> starter|business [--from-audit aud_xxx] [--packs N]
 *
 * ★ 부여 전 가입 여부를 확인한다. 미가입 이메일이면 거부 — 구독 행은
 *   user FK가 필요하고, 고객이 먼저 가입해야 온보딩으로 이어진다.
 * ★ --from-audit: 크몽 진단 행을 온보딩 프리필로 연결한다. 크몽 건은 운영자
 *   이메일로 등록돼 있어 자동 매칭이 불가능하다 — 명시 연결이 유일한 길이다.
 * ★ 부여한 만큼 운영자 원가가 나간다 (Starter 1명 ≈ 월 ~10,000원 실측 단가).
 *   돈 받은 고객만 부여하는 것이 비용 통제 장치다.
 */
import { getAudit } from '@/lib/audit/repository'
import { monthlyPriceKrw, resolveLimits } from '@/lib/plans'
import { parseGrantArgs } from '@/lib/subscriptions/grant-args'
import { findUserByEmail, grantPlan } from '@/lib/subscriptions/repository'

const parsed = parseGrantArgs(process.argv.slice(2))
if (!parsed.ok) {
  console.error(parsed.reason)
  process.exit(1)
}
const { email, plan, queryPacks, fromAuditId } = parsed.args

const user = await findUserByEmail(email)
if (!user) {
  console.error(`가입된 계정이 없습니다: ${email}`)
  console.error('먼저 가입을 안내하세요 — 가입 후 다시 실행하면 됩니다.')
  process.exit(1)
}

if (fromAuditId) {
  const audit = await getAudit(fromAuditId)
  if (!audit) {
    console.error(`진단을 찾을 수 없습니다: ${fromAuditId}`)
    process.exit(1)
  }
  console.log(`진단 연결: ${audit.brandName} · ${audit.category} · tier=${audit.tier}`)
  if (!audit.queries || audit.queries.length === 0) {
    // 동결 질의가 없으면 프리필은 브랜드 정보뿐이다. 막지는 않는다 — 무료
    // 진단 전환도 이 경로를 쓸 수 있다.
    console.warn('  [주의] 동결 질의가 없습니다 — 질의 프리필 없이 템플릿으로 시작합니다.')
  }
}

const subscription = await grantPlan({ userId: user.id, plan, queryPacks, fromAuditId })
const limits = resolveLimits(plan, queryPacks)

console.log(`부여 완료: ${user.name} <${email}>`)
console.log(`  플랜 ${plan} · 질의 팩 ${queryPacks} → 질의 한도 ${limits.maxQueries}개(계정 전체) · 브랜드 ${limits.maxBrands}개`)
console.log(`  월 청구액(수동): ${monthlyPriceKrw(plan, queryPacks).toLocaleString('ko-KR')}원`)
console.log(`  구독 id: ${subscription.id}`)
console.log('\n다음: 고객이 로그인하면 온보딩(브랜드 → 질의 확정)으로 안내됩니다.')
```

- [ ] **Step 7: CLI — `scripts/plan-revoke.mts`**

```ts
/**
 * 플랜 회수.
 *
 *   pnpm plan:revoke <이메일>
 *
 * ★ 행을 지우지 않는다 — status='canceled'로 바꾼다. 결제 이력 보존
 *   (`subscriptions.userId`의 restrict 주석)과 재부여 시 upsert 대상이 되기
 *   위해서다. 회수하면 cron 측정 대상에서 빠진다(측정은 active·past_due만).
 */
import { parseGrantArgs } from '@/lib/subscriptions/grant-args'
import { findUserByEmail, revokePlan } from '@/lib/subscriptions/repository'

const [emailRaw] = process.argv.slice(2)
if (!emailRaw) {
  console.error('사용법: pnpm plan:revoke <이메일>')
  process.exit(1)
}
// 정규화 규칙을 grant와 하나로 — parseGrantArgs를 재사용한다.
const parsed = parseGrantArgs([emailRaw, 'starter'])
if (!parsed.ok) {
  console.error(parsed.reason)
  process.exit(1)
}
const email = parsed.args.email

const user = await findUserByEmail(email)
if (!user) {
  console.error(`가입된 계정이 없습니다: ${email}`)
  process.exit(1)
}
const revoked = await revokePlan(user.id)
if (!revoked) {
  console.error(`구독이 없습니다: ${email} — 회수할 것이 없습니다.`)
  process.exit(1)
}
console.log(`회수 완료: ${email} (plan=${revoked.plan} → canceled)`)
console.log('데이터는 유지됩니다. 다음 측정부터 대상에서 빠집니다.')
```

- [ ] **Step 8: `package.json` scripts 추가**

`"measure":` 줄 아래에:

```json
    "plan:grant": "tsx --conditions=react-server --env-file=.env.local scripts/plan-grant.mts",
    "plan:revoke": "tsx --conditions=react-server --env-file=.env.local scripts/plan-revoke.mts",
```

- [ ] **Step 9: 검증 + 커밋**

Run: `pnpm vitest run src/lib/subscriptions` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add src/lib/subscriptions scripts/plan-grant.mts scripts/plan-revoke.mts package.json
git commit -m "feat(plan): plan:grant/plan:revoke CLI — 수동 부여, --from-audit 크몽 연결, 가입 확인"
```

---
### Task 3: 온보딩 게이트 + 1단계 브랜드 정보

스펙 ②의 게이트("활성 구독이 있고 브랜드가 없는 계정만")와 1단계 폼.
지역형 업종이면 지역 필드가 나타난다 — 무료 진단 웹 폼의 "지역은 CLI만"
결정은 그 폼의 것이고, 셀프서비스 온보딩은 지역 없이는 성립하지 않는다(스펙).
프리필: `--from-audit` 연결 행 또는 이메일 매칭 무료 진단.

**Files:**
- Create: `src/lib/kst.ts` (순수 — KST 시간 유틸)
- Create: `src/lib/onboarding/state.ts` (순수 — 게이트 판정)
- Create: `src/lib/onboarding/brand-schema.ts` (순수 — 폼 검증)
- Create: `src/lib/onboarding/gate.ts` (DB — 세션+구독+브랜드 수 로드)
- Create: `src/lib/onboarding/prefill.ts` (DB — 진단 프리필)
- Create: `src/app/(app)/onboarding/actions.ts` (`createBrandAction` — Task 4가 확장)
- Create: `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/onboarding/brand-step-form.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (needs-onboarding 리다이렉트만 — 화면 교체는 Task 9)
- Test: `src/lib/kst.test.ts`, `src/lib/onboarding/state.test.ts`, `src/lib/onboarding/brand-schema.test.ts`

**Interfaces:**
- Consumes: `requireUser`(`@/lib/session`), `resolveLimits`·`PlanLimits`(`@/lib/plans`),
  `KNOWN_CATEGORIES`·`isRegionalCategory`(`@/lib/audit/queries` — 순수라 클라이언트
  import 가능), `parseHostname`(`@/lib/audit/request-schema`), `getAudit`,
  Task 1의 `brands.region`·`brands.selfDomains`, `subscriptions.fromAuditId`
- Produces:
  - `KST_OFFSET_MS`, `kstWeekday(now: Date): number`, `kstDayStart(now: Date): Date`,
    `MEASURE_WEEKDAYS_KST = [1, 3, 5] as const`, `MEASURE_HOUR_KST = 3`,
    `nextMeasurement(now: Date): { weekdayLabel: string; date: Date }`
  - `type OnboardingState = 'no-plan' | 'needs-onboarding' | 'complete'`,
    `resolveOnboardingState(args: { subscription: Pick<Subscription, 'status'> | null; brandCount: number }): OnboardingState`
  - `brandFormSchema(maxCompetitors: number)` — zod, transform 결과
    `{ name; category; region: string; competitors: string[]; siteUrl: string; selfDomains: string[] }`
  - `loadOnboardingGate(): Promise<OnboardingGate>` —
    `OnboardingGate = { user: { id; email; name }; subscription: Subscription | null; limits: PlanLimits | null; brandCount: number; state: OnboardingState }`
  - `loadPrefill(userEmail: string, fromAuditId: string | null): Promise<OnboardingPrefill | null>` —
    `OnboardingPrefill = { brandName: string; category: string; region: string | null; competitors: string[]; selfDomains: string[]; frozenQueries: string[] | null }`
  - `type ActionResult<T> = { ok: true; value: T } | { ok: false; reason: string }` (actions.ts)
  - `createBrandAction(raw: unknown): Promise<ActionResult<{ brandId: string }>>`

- [ ] **Step 1: 실패하는 테스트 — KST 유틸**

`src/lib/kst.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { kstDayStart, kstWeekday, nextMeasurement } from './kst'

describe('kst', () => {
  // 2026-08-05T20:00Z = 2026-08-06(목) 05:00 KST
  const thuDawn = new Date('2026-08-05T20:00:00Z')

  test('kstWeekday — UTC 수요일 밤은 KST 목요일', () => {
    expect(kstWeekday(thuDawn)).toBe(4)
  })

  test('kstDayStart — KST 자정의 UTC 표현', () => {
    // KST 2026-08-06 00:00 = UTC 2026-08-05 15:00
    expect(kstDayStart(thuDawn).toISOString()).toBe('2026-08-05T15:00:00.000Z')
  })

  test('nextMeasurement — 목요일이면 다음은 금요일 03:00 KST', () => {
    const n = nextMeasurement(thuDawn)
    expect(n.weekdayLabel).toBe('금')
    expect(n.date.toISOString()).toBe('2026-08-06T18:00:00.000Z') // 금 03:00 KST
  })

  test('nextMeasurement — 월요일 02:00 KST는 아직 오늘 새벽', () => {
    // 2026-08-02(일) 17:00Z = 월 02:00 KST
    const n = nextMeasurement(new Date('2026-08-02T17:00:00Z'))
    expect(n.weekdayLabel).toBe('월')
  })

  test('nextMeasurement — 월요일 04:00 KST는 창이 지나 수요일', () => {
    const n = nextMeasurement(new Date('2026-08-02T19:00:00Z'))
    expect(n.weekdayLabel).toBe('수')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/kst.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현 — `src/lib/kst.ts`**

```ts
/**
 * KST 시간 유틸 — 순수 모듈. I/O 없음.
 *
 * 정기 측정의 "하루"와 "요일"은 전부 KST 기준이다. UTC로 계산하면 due 판정이
 * 오전 9시에 날짜를 넘겨 하루 두 번 측정하거나 하루를 건너뛴다
 * (`recordSerpUsage`의 period가 KST인 것과 같은 이유).
 */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 기준 요일 (0=일 … 6=토) */
export function kstWeekday(now: Date): number {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCDay()
}

/** KST 기준 그 날 00:00의 UTC 시각 — due 판정의 "오늘" 경계 */
export function kstDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS,
  )
}

/** 측정 요일: 월·수·금 (스펙 ③). 워크플로 cron과 같은 값이어야 한다. */
export const MEASURE_WEEKDAYS_KST = [1, 3, 5] as const
/** 측정 창 시작: KST 03:00 (= UTC 전날 18:00) */
export const MEASURE_HOUR_KST = 3

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export interface NextMeasurement {
  weekdayLabel: string
  /** 창 시작 시각 (UTC Date) */
  date: Date
}

/** 다음 측정 창. 온보딩 완료 화면의 "다음 측정 시각 예고"가 쓴다. */
export function nextMeasurement(now: Date): NextMeasurement {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  for (let add = 0; add <= 7; add++) {
    const day = (kst.getUTCDay() + add) % 7
    if (!(MEASURE_WEEKDAYS_KST as readonly number[]).includes(day)) continue
    if (add === 0 && kst.getUTCHours() >= MEASURE_HOUR_KST) continue // 오늘 창은 지났다
    const date = new Date(
      Date.UTC(
        kst.getUTCFullYear(),
        kst.getUTCMonth(),
        kst.getUTCDate() + add,
        MEASURE_HOUR_KST,
      ) - KST_OFFSET_MS,
    )
    return { weekdayLabel: WEEKDAY_LABELS[day] ?? '월', date }
  }
  throw new Error('unreachable: 7일 안에 측정 요일이 반드시 있다')
}
```

- [ ] **Step 4: KST 테스트 통과 확인**

Run: `pnpm vitest run src/lib/kst.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 실패하는 테스트 — 게이트 판정 + 폼 검증**

`src/lib/onboarding/state.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { resolveOnboardingState } from './state'

describe('resolveOnboardingState', () => {
  test('구독 없음 → no-plan (빈 대시보드 + 무료 진단 안내 유지)', () => {
    expect(resolveOnboardingState({ subscription: null, brandCount: 0 })).toBe('no-plan')
  })

  test('canceled/suspended → no-plan', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'canceled' }, brandCount: 0 }),
    ).toBe('no-plan')
    expect(
      resolveOnboardingState({ subscription: { status: 'suspended' }, brandCount: 0 }),
    ).toBe('no-plan')
  })

  test('active + 브랜드 0개 → needs-onboarding', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'active' }, brandCount: 0 }),
    ).toBe('needs-onboarding')
  })

  test('past_due도 활성으로 본다 — 유예 중 수집은 계속(schema 주석)', () => {
    expect(
      resolveOnboardingState({ subscription: { status: 'past_due' }, brandCount: 1 }),
    ).toBe('complete')
  })
})
```

`src/lib/onboarding/brand-schema.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { brandFormSchema } from './brand-schema'

const schema = brandFormSchema(3)

describe('brandFormSchema', () => {
  test('기본형 — 도메인 정규화까지', () => {
    const v = schema.parse({
      name: '무신사',
      category: '패션',
      competitors: ['29CM', ' 지그재그 ', '무신사'],
      siteUrl: 'https://www.musinsa.com/kr',
    })
    expect(v.competitors).toEqual(['29CM', '지그재그']) // 자기 자신·공백 제거
    expect(v.selfDomains).toEqual(['musinsa.com'])
    expect(v.region).toBe('')
  })

  test('지역형 업종은 지역 필수', () => {
    const r = schema.safeParse({ name: '바디텍', category: '필라테스' })
    expect(r.success).toBe(false)
  })

  test('지역형 + 지역 → 통과, 전국형의 지역은 버린다', () => {
    const regional = schema.parse({ name: '바디텍', category: '필라테스', region: '강남' })
    expect(regional.region).toBe('강남')
    const national = schema.parse({ name: '무신사', category: '패션', region: '강남' })
    expect(national.region).toBe('') // generateAuditQueries와 같은 규칙
  })

  test('경쟁사 한도 초과 거부', () => {
    const r = schema.safeParse({
      name: 'a',
      category: '패션',
      competitors: ['b', 'c', 'd', 'e'],
    })
    expect(r.success).toBe(false)
  })

  test('알아볼 수 없는 사이트 주소 거부', () => {
    const r = schema.safeParse({ name: 'a', category: '패션', siteUrl: '무신사' })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm vitest run src/lib/onboarding`
Expected: FAIL — 모듈 없음

- [ ] **Step 7: 구현 — `src/lib/onboarding/state.ts`**

```ts
import type { Subscription } from '@/lib/db/schema'

/**
 * 온보딩 게이트 판정 — 순수 모듈.
 *
 * 스펙 ②: **활성 구독(plan:grant)이 있고 브랜드가 없는 계정만** 온보딩으로
 * 보낸다. 플랜 없는 가입 계정은 지금처럼 빈 대시보드 + 무료 진단 안내를 본다 —
 * 질의 에디터의 AI 생성은 돈이 드는 기능이라(회당 ~3원 + 남용 리스크)
 * 유료 게이트가 필수다.
 */
export type OnboardingState = 'no-plan' | 'needs-onboarding' | 'complete'

/** past_due도 활성이다 — 유예 기간 중 수집은 계속한다 (schema.ts SUBSCRIPTION_STATUSES 주석) */
export function isActiveSubscription(
  subscription: Pick<Subscription, 'status'> | null,
): boolean {
  return subscription?.status === 'active' || subscription?.status === 'past_due'
}

export function resolveOnboardingState(args: {
  subscription: Pick<Subscription, 'status'> | null
  brandCount: number
}): OnboardingState {
  if (!isActiveSubscription(args.subscription)) return 'no-plan'
  return args.brandCount === 0 ? 'needs-onboarding' : 'complete'
}
```

- [ ] **Step 8: 구현 — `src/lib/onboarding/brand-schema.ts`**

```ts
import { z } from 'zod'
import { isRegionalCategory } from '@/lib/audit/queries'
import { parseHostname } from '@/lib/audit/request-schema'

/**
 * 온보딩 1단계(브랜드 정보) 검증 — 순수 모듈.
 *
 * 무료 진단 폼(`request-schema.ts`)과 규칙을 공유하되 두 가지가 다르다:
 *  1. 지역형 업종을 거부하지 않고 **지역을 요구한다** — 셀프서비스 온보딩은
 *     지역 없이는 성립하지 않는다(스펙 ②). "지역은 CLI만"은 무료 폼의 결정이다.
 *  2. 경쟁사 한도가 플랜에 따른다(`maxCompetitors` 인자).
 */

const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}을(를) 입력해 주세요`)
    .max(100, `${label}은(는) 100자를 넘을 수 없습니다`)

export function brandFormSchema(maxCompetitors: number) {
  return z
    .object({
      name: nameField('브랜드명'),
      category: nameField('업종'),
      region: z.string().trim().max(50, '지역은 50자를 넘을 수 없습니다').optional().default(''),
      competitors: z
        .array(z.string().max(100, '경쟁사 이름은 100자를 넘을 수 없습니다'))
        .optional()
        .default([]),
      siteUrl: z.string().trim().optional().default(''),
    })
    .transform((v) => ({
      name: v.name,
      category: v.category,
      // 전국형은 지역을 버린다 — generateAuditQueries와 같은 규칙 (붙이면 전국
      // 브랜드 질문이 지역 질문으로 변질된다).
      region: isRegionalCategory(v.category) ? v.region : '',
      competitors: [
        ...new Set(v.competitors.map((c) => c.trim()).filter((c) => c.length > 0 && c !== v.name)),
      ],
      siteUrl: v.siteUrl,
      selfDomains: v.siteUrl
        ? [parseHostname(v.siteUrl)].filter((h): h is string => h !== null)
        : [],
    }))
    .refine((v) => v.competitors.length <= maxCompetitors, {
      message: `경쟁사는 최대 ${maxCompetitors}개까지 등록할 수 있습니다`,
      path: ['competitors'],
    })
    .refine((v) => !isRegionalCategory(v.category) || v.region.length > 0, {
      message: '이 업종은 지역이 필요합니다 (예: 강남). 지역 없이 물으면 AI가 "어디 사세요?"부터 묻습니다.',
      path: ['region'],
    })
    .refine((v) => !v.siteUrl || v.selfDomains.length > 0, {
      message: '사이트 주소를 알아볼 수 없습니다. 예: musinsa.com',
      path: ['siteUrl'],
    })
}

export type BrandFormValues = z.infer<ReturnType<typeof brandFormSchema>>
```

- [ ] **Step 9: 순수 테스트 통과 확인**

Run: `pnpm vitest run src/lib/onboarding src/lib/kst.test.ts`
Expected: PASS

- [ ] **Step 10: DB 로더 — `src/lib/onboarding/gate.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import { resolveLimits, type PlanLimits } from '@/lib/plans'
import { requireUser } from '@/lib/session'
import { resolveOnboardingState, type OnboardingState } from './state'

export interface OnboardingGate {
  user: { id: string; email: string; name: string }
  subscription: Subscription | null
  /** 활성 구독이 없으면 null */
  limits: PlanLimits | null
  brandCount: number
  state: OnboardingState
}

/**
 * (app) 그룹 페이지·액션의 공통 진입점. 내부에서 `requireUser()`를 부르므로
 * 이 함수를 쓰는 페이지는 "모든 page.tsx가 자체 requireUser" 규칙을 만족한다
 * (`(app)/layout.tsx` 주석).
 */
export async function loadOnboardingGate(): Promise<OnboardingGate> {
  const user = await requireUser()
  const subscription =
    (await db.query.subscriptions.findFirst({
      where: eq(schema.subscriptions.userId, user.id),
    })) ?? null
  const brandRows = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(and(eq(schema.brands.userId, user.id), eq(schema.brands.isActive, true)))
  const state = resolveOnboardingState({ subscription, brandCount: brandRows.length })
  return {
    user: { id: user.id, email: user.email, name: user.name },
    subscription,
    limits:
      state !== 'no-plan' && subscription
        ? resolveLimits(subscription.plan, subscription.queryPacks)
        : null,
    brandCount: brandRows.length,
    state,
  }
}
```

- [ ] **Step 11: 프리필 — `src/lib/onboarding/prefill.ts`**

```ts
import { and, desc, eq } from 'drizzle-orm'
import { getAudit } from '@/lib/audit/repository'
import { db, schema } from '@/lib/db'

export interface OnboardingPrefill {
  brandName: string
  category: string
  region: string | null
  competitors: string[]
  selfDomains: string[]
  /** 크몽 동결 질의. 있으면 에디터가 그대로 프리필한다 (전후 비교 연속성) */
  frozenQueries: string[] | null
}

/**
 * 온보딩 프리필 (스펙 ①·②).
 *
 * 우선순위: ① `plan:grant --from-audit` 명시 연결(크몽 — 운영자 이메일로
 * 등록돼 자동 매칭 불가) ② 가입 이메일 = 인증된 신청 이메일인 최신 무료 진단.
 * 없으면 null — 빈 폼으로 시작한다.
 */
export async function loadPrefill(
  userEmail: string,
  fromAuditId: string | null,
): Promise<OnboardingPrefill | null> {
  if (fromAuditId) {
    const audit = await getAudit(fromAuditId)
    if (audit) return toPrefill(audit)
    // 연결이 깨졌으면 이메일 매칭으로 조용히 폴백하지 않는다 — 크몽 건의
    // 이메일은 운영자 것이라 폴백 결과가 남의 진단일 수 있다.
    return null
  }
  const rows = await db
    .select()
    .from(schema.freeAudits)
    .where(
      and(
        eq(schema.freeAudits.email, userEmail.toLowerCase()),
        eq(schema.freeAudits.emailVerified, true),
      ),
    )
    .orderBy(desc(schema.freeAudits.createdAt))
    .limit(1)
  const audit = rows[0]
  return audit ? toPrefill(audit) : null
}

function toPrefill(audit: typeof schema.freeAudits.$inferSelect): OnboardingPrefill {
  return {
    brandName: audit.brandName,
    category: audit.category,
    region: audit.region,
    competitors: audit.competitors,
    selfDomains: audit.selfDomains,
    frozenQueries: audit.queries,
  }
}
```

- [ ] **Step 12: 서버 액션 — `src/app/(app)/onboarding/actions.ts`**

```ts
'use server'

import { randomBytes } from 'node:crypto'
import { db, schema } from '@/lib/db'
import { kstWeekday } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { brandFormSchema } from '@/lib/onboarding/brand-schema'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

/**
 * 온보딩 서버 액션. 모든 액션이 `loadOnboardingGate()`로 시작한다 —
 * 세션·유료 게이트·소유 검증을 클라이언트에 맡기지 않는다.
 */

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string }

export async function createBrandAction(
  raw: unknown,
): Promise<ActionResult<{ brandId: string }>> {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.limits) {
    return { ok: false, reason: '활성 플랜이 없습니다. 운영자에게 문의해 주세요.' }
  }
  if (gate.brandCount >= gate.limits.maxBrands) {
    return {
      ok: false,
      reason: `플랜의 브랜드 한도(${gate.limits.maxBrands}개)를 다 썼습니다.`,
    }
  }
  const parsed = brandFormSchema(gate.limits.maxCompetitors).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' }
  }
  const v = parsed.data
  const brandId = `brd_${randomBytes(12).toString('base64url')}`
  await db.insert(schema.brands).values({
    id: brandId,
    userId: gate.user.id,
    name: v.name,
    category: v.category,
    region: v.region || null,
    selfDomains: v.selfDomains,
    // 별칭은 이번 단계에서 받지 않는다 — 측정이 회차마다 생성한다
    // (진단 경로 `audit-run.mts`와 동일. 편집 UI는 이후 단계).
    competitors: v.competitors.map((name) => ({ name, aliases: [] })),
    collectionWeekday: kstWeekday(new Date()),
  })
  logger.info('onboarding.brand_created', { brandId })
  return { ok: true, value: { brandId } }
}
```

- [ ] **Step 13: 페이지 — `src/app/(app)/onboarding/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { loadPrefill } from '@/lib/onboarding/prefill'
import { BrandStepForm } from './brand-step-form'

export const metadata = { title: '온보딩 — 브랜드' }

export default async function OnboardingPage() {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan') redirect('/dashboard')
  if (!gate.limits || gate.brandCount >= gate.limits.maxBrands) redirect('/dashboard')

  const prefill = await loadPrefill(gate.user.email, gate.subscription?.fromAuditId ?? null)

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 1 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정할 브랜드</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        여기 등록한 브랜드와 경쟁사가 측정의 분모가 됩니다. 경쟁사를 적게 등록하면 점유율이
        실제보다 높게 나옵니다 — 실제 경쟁 상대를 그대로 넣어 주세요.
      </p>
      {prefill && (
        <p className="mt-4 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          이전 진단 정보를 미리 채웠습니다. 바뀐 내용이 있으면 고쳐 주세요.
        </p>
      )}
      <div className="mt-8">
        <BrandStepForm
          maxCompetitors={gate.limits.maxCompetitors}
          prefill={
            prefill
              ? {
                  name: prefill.brandName,
                  category: prefill.category,
                  region: prefill.region ?? '',
                  competitors: prefill.competitors,
                  siteUrl: prefill.selfDomains[0] ?? '',
                }
              : null
          }
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 14: 폼 — `src/app/(app)/onboarding/brand-step-form.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'
import { createBrandAction } from './actions'

interface PrefillValues {
  name: string
  category: string
  region: string
  competitors: string[]
  siteUrl: string
}

export function BrandStepForm({
  maxCompetitors,
  prefill,
}: {
  maxCompetitors: number
  prefill: PrefillValues | null
}) {
  const router = useRouter()
  const listId = useId()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(prefill?.name ?? '')
  const [category, setCategory] = useState(prefill?.category ?? '')
  const [region, setRegion] = useState(prefill?.region ?? '')
  const [siteUrl, setSiteUrl] = useState(prefill?.siteUrl ?? '')
  const [competitors, setCompetitors] = useState<string[]>(() => {
    const base = prefill?.competitors.slice(0, maxCompetitors) ?? []
    while (base.length < maxCompetitors) base.push('')
    return base
  })

  const regional = isRegionalCategory(category)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createBrandAction({ name, category, region, competitors, siteUrl })
      if (result.ok) router.push(`/onboarding/queries?brand=${result.value.brandId}`)
      else setError(result.reason)
    })
  }

  const field = 'w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor={`${listId}-name`} className="text-sm font-medium">브랜드명</label>
        <input id={`${listId}-name`} className={`mt-1.5 ${field}`} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="예: 무신사" />
      </div>
      <div>
        <label htmlFor={`${listId}-cat`} className="text-sm font-medium">업종</label>
        <input id={`${listId}-cat`} className={`mt-1.5 ${field}`} value={category}
          onChange={(e) => setCategory(e.target.value)} list={`${listId}-cats`}
          placeholder="목록에서 고르거나 직접 입력" />
        <datalist id={`${listId}-cats`}>
          {KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      {regional && (
        <div>
          <label htmlFor={`${listId}-region`} className="text-sm font-medium">지역</label>
          <input id={`${listId}-region`} className={`mt-1.5 ${field}`} value={region}
            onChange={(e) => setRegion(e.target.value)} placeholder="예: 강남" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            이 업종은 지역이 필요합니다. 지역 없이 물으면 AI가 &ldquo;어디 사세요?&rdquo;부터 묻습니다.
          </p>
        </div>
      )}
      <div>
        <span className="text-sm font-medium">경쟁사 (최대 {maxCompetitors}개)</span>
        <div className="mt-1.5 space-y-2">
          {competitors.map((value, i) => (
            <input key={i} className={field} value={value} aria-label={`경쟁사 ${i + 1}`}
              onChange={(e) =>
                setCompetitors((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
              placeholder={i === 0 ? '예: 29CM' : ''} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          여기 등록한 브랜드만 셀 수 있습니다 — 등록하지 않은 경쟁사는 점유율에서 빠집니다.
        </p>
      </div>
      <div>
        <label htmlFor={`${listId}-site`} className="text-sm font-medium">
          사이트 주소 <span className="font-normal text-muted-foreground">(선택)</span>
        </label>
        <input id={`${listId}-site`} className={`mt-1.5 ${field}`} value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)} placeholder="예: musinsa.com" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          알려주시면 AI가 읽는 출처에서 내 사이트가 인용되는지 함께 확인합니다.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm text-incomplete-fg">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '다음 — 질의 만들기'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 15: 대시보드 게이트 연결 — `src/app/(app)/dashboard/page.tsx`**

기존 파일의 함수 본문 앞부분만 바꾼다 (스텁 문구는 유지 — 화면 교체는 Task 9):

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

export const metadata = { title: '대시보드' }

export default async function DashboardPage() {
  // requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 규칙 충족).
  const gate = await loadOnboardingGate()
  if (gate.state === 'needs-onboarding') redirect('/onboarding')
  const user = gate.user
  // 아래 JSX는 기존 스텁과 동일하다 — 이 태스크는 게이트만 단다.
  // Task 9가 이 함수 본문을 통째로 교체한다.
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
      <p className="text-muted-foreground">
        {user.name}님, 정기 측정은 아직 준비 중입니다. 결제가 열리면 브랜드를 등록하고 주{' '}
        <span className="font-mono tabular-nums">3</span>회 측정한 추이를 여기서 보게 됩니다.
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        지금 바로 받을 수 있는 것은 무료 진단입니다. 계정과는 별개로 동작하며, 결과는 메일로
        갑니다.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild>
          <Link href="/audit/new">무료 진단 받기</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/pricing">요금제 보기</Link>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 16: 검증 + 커밋**

Run: `pnpm vitest run src/lib/onboarding src/lib/kst.test.ts` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add src/lib/kst.ts src/lib/kst.test.ts src/lib/onboarding "src/app/(app)/onboarding" "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(onboarding): 유료 게이트 + 1단계 브랜드 폼 — 지역형 지역 필수, 진단 프리필, 플랜 한도 검증"
```

---

### Task 4: 질의 규칙 순수 분리 + 에디터 서버 로직

에디터의 실시간 검증은 `validateCustomQueries` **재사용**이 스펙 요구다. 그런데
`custom-queries.ts`는 최상위에서 `@anthropic-ai/sdk`와 server-only `env`를
import한다 — 클라이언트 컴포넌트가 가져다 쓰면 빌드가 죽는다. 검증 함수를
순수 모듈 `query-rules.ts`로 **이동**(로직 문자 그대로 — 재구현 금지)하고
기존 파일은 re-export로 호환을 유지한다. 그 위에 생성 한도(5회, 서버 강제)와
동결 액션을 얹는다.

**Files:**
- Create: `src/lib/audit/query-rules.ts` (이동 + `checkCustomQueries`·`normalizeQueryKey` 추가)
- Modify: `src/lib/audit/custom-queries.ts` (본문 삭제 → re-export)
- Create: `src/lib/onboarding/editor.ts` (순수 — 초기값)
- Create: `src/lib/onboarding/generation.ts` (DB — 생성 크레딧)
- Create: `src/lib/onboarding/quota.ts` (DB — 계정 전체 quota)
- Modify: `src/app/(app)/onboarding/actions.ts` (`generateQueriesAction`·`freezeQueriesAction` 추가)
- Test: `src/lib/audit/query-rules.test.ts`, `src/lib/onboarding/editor.test.ts`

**Interfaces:**
- Consumes: `validateCustomQueries`·`CustomQueryContext`(기존 — 이동만),
  `createCustomQueryGenerator`(기존), `generateAuditQueries`(기존),
  `resolveLimits`, Task 1의 `brands.queryGenerations`·`queriesFrozenAt`,
  Task 3의 `loadOnboardingGate`·`ActionResult`
- Produces:
  - `query-rules.ts`: `validateCustomQueries`(시그니처 불변),
    `normalizeQueryKey(value: string): string` (기존 내부 `norm` 공개),
    `type QueryVerdict = { ok: true; queries: string[] } | { ok: false; reason: string }`,
    `checkCustomQueries(queries: readonly string[], ctx: CustomQueryContext): QueryVerdict`
  - `editor.ts`: `buildInitialQueries(args: { frozen: string[] | null; templates: string[]; quota: number }): { queries: string[]; source: 'frozen' | 'template' }`
  - `generation.ts`: `QUERY_GENERATION_LIMIT = 5`,
    `takeGenerationCredit(brandId: string, userId: string): Promise<{ ok: true; used: number } | { ok: false }>`,
    `refundGenerationCredit(brandId: string): Promise<void>`
  - `quota.ts`: `loadEditorQuota(userId: string, brandId: string, subscription: Subscription): Promise<{ quota: number; queriesOnOtherBrands: number; maxQueries: number }>`
  - `actions.ts`: `generateQueriesAction(input: { brandId: string; count: number }): Promise<ActionResult<{ queries: string[]; used: number; limit: number }>>`,
    `freezeQueriesAction(input: { brandId: string; queries: string[] }): Promise<ActionResult<{ frozen: number }>>`

- [ ] **Step 1: 실패하는 테스트 — 분리된 모듈의 공개 API**

`src/lib/audit/query-rules.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { checkCustomQueries, normalizeQueryKey, validateCustomQueries } from './query-rules'
import { generateAuditQueries } from '@/lib/audit/queries'

const templates = generateAuditQueries('패션', '무신사')
const ctx = {
  brandName: '무신사',
  competitors: ['29CM'] as const,
  category: '패션',
  requiredCount: 5,
}
const valid = [...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘']

describe('query-rules (custom-queries에서 이동)', () => {
  test('유효 세트 통과 — 이동 후에도 로직 동일', () => {
    expect(validateCustomQueries(valid, ctx)).toHaveLength(5)
  })

  test('브랜드명 포함 거부', () => {
    const bad = [...templates, '무신사 어때?', '겨울 코트 브랜드 추천해줘']
    expect(() => validateCustomQueries(bad, ctx)).toThrow(/브랜드명/)
  })

  test('checkCustomQueries — 던지지 않고 이유를 돌려준다 (화면 실시간 검증용)', () => {
    const ok = checkCustomQueries(valid, ctx)
    expect(ok).toEqual({ ok: true, queries: valid })
    const bad = checkCustomQueries([...templates, '29CM 대신 뭐 써?', 'x'], ctx)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain('경쟁사명')
  })

  test('normalizeQueryKey — 공백·대소문자를 뭉갠다', () => {
    expect(normalizeQueryKey('바디텍 필라테스')).toBe(normalizeQueryKey('바디텍필라테스'))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/audit/query-rules.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 이동 — `src/lib/audit/query-rules.ts` 생성**

`custom-queries.ts`에서 다음을 **문자 그대로 옮긴다**: `CustomQueryContext`
인터페이스, `norm` 함수, `validateCustomQueries` 함수 (상단 주석 블록 포함).
import는 `generateAuditQueries`·`REGION_SLOT` 둘만 남는다 (둘 다 순수 — 이
모듈은 클라이언트에서 import 가능해진다). 파일 끝에 추가:

```ts
/** `norm`의 공개 이름. 동결 시 템플릿/맞춤 판별(`source` 분류)이 쓴다. */
export function normalizeQueryKey(value: string): string {
  return norm(value)
}

export type QueryVerdict = { ok: true; queries: string[] } | { ok: false; reason: string }

/**
 * 화면용 비예외 래퍼. **검증 로직은 하나다** — validateCustomQueries를 그대로
 * 부르고 예외 메시지를 이유로 돌려준다. 화면이 규칙을 다시 구현하면 서버와
 * 화면이 다른 말을 하게 된다 (스펙 ②: "화면이 이유를 그 자리에서 보여준다").
 */
export function checkCustomQueries(
  queries: readonly string[],
  ctx: CustomQueryContext,
): QueryVerdict {
  try {
    return { ok: true, queries: validateCustomQueries(queries, ctx) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
```

- [ ] **Step 4: `custom-queries.ts`를 re-export로 수선**

`custom-queries.ts`에서 옮긴 본문(인터페이스·norm·validateCustomQueries)을
지우고, import 정리 후 파일 상단에 추가:

```ts
// 검증은 query-rules.ts로 이동했다 (4단계) — 에디터 화면이 실시간 검증에
// 같은 함수를 써야 하는데, 이 파일은 Anthropic SDK와 server-only env를 끌고
// 있어 클라이언트가 import할 수 없다. 기존 호출자(audit-queries.mts 등)를
// 위해 그대로 re-export한다. **여기에 검증 로직을 되돌리지 말 것.**
export { validateCustomQueries } from '@/lib/audit/query-rules'
export type { CustomQueryContext } from '@/lib/audit/query-rules'
```

(`createCustomQueryGenerator`·프롬프트·모델 상수는 그대로 남는다.)

- [ ] **Step 5: 이동 후 회귀 확인**

Run: `pnpm vitest run src/lib/audit` && `pnpm typecheck`
Expected: PASS — 기존 `custom-queries.test.ts`가 전부 초록 (로직 이동만 했다는 증거)

- [ ] **Step 6: 실패하는 테스트 — 에디터 초기값**

`src/lib/onboarding/editor.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { buildInitialQueries } from './editor'

const templates = ['t1', 't2', 't3']

describe('buildInitialQueries', () => {
  test('크몽 동결 질의가 있으면 그대로 (연속성 — 크몽 리포트와 비교 가능)', () => {
    const frozen = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10']
    const init = buildInitialQueries({ frozen, templates, quota: 10 })
    expect(init).toEqual({ queries: frozen, source: 'frozen' })
  })

  test('동결 질의 10 + quota 30(business 전환)이면 빈 칸 20개를 붙인다', () => {
    const frozen = Array.from({ length: 10 }, (_, i) => `q${i + 1}`)
    const init = buildInitialQueries({ frozen, templates, quota: 30 })
    expect(init.queries).toHaveLength(30)
    expect(init.queries.slice(0, 10)).toEqual(frozen)
    expect(init.queries[10]).toBe('')
  })

  test('동결 질의가 없으면 템플릿 3 + 빈 칸', () => {
    const init = buildInitialQueries({ frozen: null, templates, quota: 10 })
    expect(init.source).toBe('template')
    expect(init.queries.slice(0, 3)).toEqual(templates)
    expect(init.queries).toHaveLength(10)
    expect(init.queries[3]).toBe('')
  })
})
```

- [ ] **Step 7: 실패 확인**

Run: `pnpm vitest run src/lib/onboarding/editor.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 8: 구현 — `src/lib/onboarding/editor.ts`**

```ts
/**
 * 질의 에디터 초기값 — 순수 모듈.
 *
 * 프리필 규칙 (스펙 ②): 크몽 전환이면 동결 질의 그대로(연속성 — 크몽 리포트와
 * 비교 가능해야 한다). 아니면 업종 템플릿 3개 + 빈 칸(고객이 [AI 후보 생성]
 * 또는 직접 입력으로 채운다).
 */
export interface EditorInit {
  queries: string[]
  source: 'frozen' | 'template'
}

export function buildInitialQueries(args: {
  frozen: string[] | null
  templates: string[]
  quota: number
}): EditorInit {
  const pad = (base: string[]): string[] => [
    ...base.slice(0, args.quota),
    ...Array<string>(Math.max(0, args.quota - base.length)).fill(''),
  ]
  if (args.frozen && args.frozen.length > 0) {
    return { queries: pad(args.frozen), source: 'frozen' }
  }
  return { queries: pad(args.templates), source: 'template' }
}
```

- [ ] **Step 9: 통과 확인**

Run: `pnpm vitest run src/lib/onboarding/editor.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: 생성 크레딧 — `src/lib/onboarding/generation.ts`**

```ts
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/** 스펙 ②: AI 생성은 브랜드당 누적 5회. LLM 비용 남용 방지. */
export const QUERY_GENERATION_LIMIT = 5

/**
 * 크레딧 1개를 원자적으로 차감한다.
 *
 * ★ UPDATE … WHERE query_generations < 한도. 검사와 증가가 한 문장이라
 *   동시 요청이 와도 한도를 넘지 못한다 — SELECT 후 UPDATE로 나누면
 *   경합이 한도를 뚫는다. **클라이언트 카운터는 표시용일 뿐이다** (스펙:
 *   생성 한도 서버 강제).
 * ★ 동결된 브랜드(`queriesFrozenAt` not null)는 차감 자체가 거부된다.
 */
export async function takeGenerationCredit(
  brandId: string,
  userId: string,
): Promise<{ ok: true; used: number } | { ok: false }> {
  const rows = await db
    .update(schema.brands)
    .set({
      queryGenerations: sql`${schema.brands.queryGenerations} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.brands.id, brandId),
        eq(schema.brands.userId, userId),
        isNull(schema.brands.queriesFrozenAt),
        lt(schema.brands.queryGenerations, QUERY_GENERATION_LIMIT),
      ),
    )
    .returning({ used: schema.brands.queryGenerations })
  const used = rows[0]?.used
  return used === undefined ? { ok: false } : { ok: true, used }
}

/**
 * 생성 호출이 실패했을 때 크레딧을 돌려준다. 한도는 남용 방지 장치이지
 * 실패 벌점이 아니다 — rate limit에 다섯 번 걸린 고객이 한도를 다 잃으면
 * 그건 우리 잘못이다. `greatest(…, 0)`라 경합에도 음수가 되지 않는다.
 */
export async function refundGenerationCredit(brandId: string): Promise<void> {
  await db
    .update(schema.brands)
    .set({ queryGenerations: sql`greatest(${schema.brands.queryGenerations} - 1, 0)` })
    .where(eq(schema.brands.id, brandId))
}
```

- [ ] **Step 11: quota — `src/lib/onboarding/quota.ts`**

```ts
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { Subscription } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'

export interface EditorQuota {
  /** 이 브랜드가 확정해야 하는 질의 수 = 계정 전체 한도 − 다른 브랜드 사용분 */
  quota: number
  queriesOnOtherBrands: number
  maxQueries: number
}

/**
 * 질의 한도는 **계정 전체**다 (plans.ts `PlanLimits.maxQueries` 주석 — Business는
 * 브랜드에 나눠 쓴다). 강제 지점은 두 곳: 여기(동결 시)와 `validateRunStart`
 * (수집 시). 같은 규칙의 이중 방어다.
 */
export async function loadEditorQuota(
  userId: string,
  brandId: string,
  subscription: Subscription,
): Promise<EditorQuota> {
  const limits = resolveLimits(subscription.plan, subscription.queryPacks)
  const others = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, userId),
        ne(schema.brands.id, brandId),
        eq(schema.brands.isActive, true),
      ),
    )
  let queriesOnOtherBrands = 0
  if (others.length > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.queries)
      .where(
        and(
          inArray(schema.queries.brandId, others.map((b) => b.id)),
          eq(schema.queries.isActive, true),
        ),
      )
    queriesOnOtherBrands = row?.n ?? 0
  }
  return {
    quota: Math.max(0, limits.maxQueries - queriesOnOtherBrands),
    queriesOnOtherBrands,
    maxQueries: limits.maxQueries,
  }
}
```

- [ ] **Step 12: 액션 확장 — `src/app/(app)/onboarding/actions.ts`에 추가**

기존 import에 더해:

```ts
import { and, eq, isNull } from 'drizzle-orm'
import {
  createCustomQueryGenerator,
  type CustomQueryGeneratorOptions,
} from '@/lib/audit/custom-queries'
import { generateAuditQueries } from '@/lib/audit/queries'
import {
  checkCustomQueries,
  normalizeQueryKey,
  type CustomQueryContext,
} from '@/lib/audit/query-rules'
import type { Brand, QuerySource } from '@/lib/db/schema'
import {
  QUERY_GENERATION_LIMIT,
  refundGenerationCredit,
  takeGenerationCredit,
} from '@/lib/onboarding/generation'
import { loadEditorQuota } from '@/lib/onboarding/quota'
```

추가 함수:

```ts
async function ownEditableBrand(userId: string, brandId: string): Promise<Brand | null> {
  const brand = await db.query.brands.findFirst({
    where: and(eq(schema.brands.id, brandId), eq(schema.brands.userId, userId)),
  })
  return brand ?? null
}

/**
 * E2E 전용 가짜 생성기. `next dev`에서 `E2E_FAKE_QUERY_GENERATOR=1`일 때만
 * 켜진다 — 프로덕션 빌드에서는 절대 켜지지 않는다. **한도 차감은 이 분기보다
 * 앞에서 이미 끝난다** — 가짜 여부와 무관하게 남용 방어는 동작한다.
 */
function e2eFakeGenerator(): CustomQueryGeneratorOptions | undefined {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_FAKE_QUERY_GENERATOR !== '1') {
    return undefined
  }
  return {
    parse: async (prompt) => {
      const req = JSON.parse(prompt) as { count: number; region: string | null }
      const where = req.region ?? '요즘'
      return {
        queries: Array.from(
          { length: req.count },
          (_, i) => `${where} 초보한테 괜찮은 곳 ${i + 1}번째로 뭐가 있어?`,
        ),
      }
    },
  }
}

export async function generateQueriesAction(input: {
  brandId: string
  count: number
}): Promise<ActionResult<{ queries: string[]; used: number; limit: number }>> {
  const gate = await loadOnboardingGate()
  // ★ 유료 게이트 — AI 생성은 돈이 드는 기능이다 (회당 ~3원 + 남용 리스크).
  if (gate.state === 'no-plan' || !gate.subscription) {
    return { ok: false, reason: '활성 플랜이 없습니다.' }
  }
  const brand = await ownEditableBrand(gate.user.id, input.brandId)
  if (!brand) return { ok: false, reason: '브랜드를 찾을 수 없습니다.' }
  if (brand.queriesFrozenAt) {
    return { ok: false, reason: '이미 확정된 질의입니다. 수정이 필요하면 운영자에게 문의해 주세요.' }
  }
  const count = Math.min(Math.max(1, Math.floor(input.count)), 10)

  const credit = await takeGenerationCredit(brand.id, gate.user.id)
  if (!credit.ok) {
    return {
      ok: false,
      reason: `AI 생성은 브랜드당 ${QUERY_GENERATION_LIMIT}회까지입니다. 남은 질의는 직접 수정해 주세요.`,
    }
  }
  const generate = createCustomQueryGenerator(e2eFakeGenerator() ?? {})
  try {
    // 프롬프트에 브랜드명·경쟁사명을 넣지 않는 것은 생성기 자신의 규칙이다
    // (custom-queries.ts 주석) — 여기서는 재료만 넘긴다.
    const queries = await generate({
      brandName: brand.name,
      category: brand.category,
      ...(brand.region ? { region: brand.region } : {}),
      competitors: brand.competitors.map((c) => c.name),
      count,
    })
    return { ok: true, value: { queries, used: credit.used, limit: QUERY_GENERATION_LIMIT } }
  } catch (error) {
    await refundGenerationCredit(brand.id)
    logger.error('onboarding.generate_failed', {
      reason: error instanceof Error ? error.name : 'unknown',
    })
    return { ok: false, reason: '질의 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }
}

export async function freezeQueriesAction(input: {
  brandId: string
  queries: string[]
}): Promise<ActionResult<{ frozen: number }>> {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.subscription) {
    return { ok: false, reason: '활성 플랜이 없습니다.' }
  }
  const brand = await ownEditableBrand(gate.user.id, input.brandId)
  if (!brand) return { ok: false, reason: '브랜드를 찾을 수 없습니다.' }
  if (brand.queriesFrozenAt) return { ok: false, reason: '이미 확정된 질의입니다.' }

  const quota = await loadEditorQuota(gate.user.id, brand.id, gate.subscription)
  const ctx: CustomQueryContext = {
    brandName: brand.name,
    competitors: brand.competitors.map((c) => c.name),
    category: brand.category,
    ...(brand.region ? { region: brand.region } : {}),
    requiredCount: quota.quota,
  }
  // ★ 검증은 서버가 최종 책임진다 — 화면의 실시간 검증과 같은 함수, 같은 규칙.
  const verdict = checkCustomQueries(input.queries, ctx)
  if (!verdict.ok) return { ok: false, reason: verdict.reason }
  // 계정 전체 한도 재확인 (수집 시 validateRunStart가 한 번 더 검증한다).
  if (quota.queriesOnOtherBrands + verdict.queries.length > quota.maxQueries) {
    return {
      ok: false,
      reason: `계정 전체 질의 한도(${quota.maxQueries}개)를 넘습니다 — 다른 브랜드가 ${quota.queriesOnOtherBrands}개를 쓰고 있습니다.`,
    }
  }

  const templates = new Set(
    generateAuditQueries(brand.category, brand.name, brand.region ?? undefined).map(
      normalizeQueryKey,
    ),
  )
  // 동결 전 임시 상태가 남아 있을 수 있으므로 브랜드의 질의를 전부 갈아끼운다.
  // (neon-http는 트랜잭션이 없다 — 부분 실패 시 아래 동결 UPDATE가 실행되지
  //  않으므로 브랜드는 미동결로 남고, 재시도가 다시 갈아끼운다.)
  await db.delete(schema.queries).where(eq(schema.queries.brandId, brand.id))
  await db.insert(schema.queries).values(
    verdict.queries.map((text) => ({
      id: `qry_${randomBytes(12).toString('base64url')}`,
      brandId: brand.id,
      text,
      source: (templates.has(normalizeQueryKey(text)) ? 'generated' : 'custom') as QuerySource,
    })),
  )
  const frozen = await db
    .update(schema.brands)
    .set({
      queriesFrozenAt: new Date(),
      queryQuota: verdict.queries.length,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.brands.id, brand.id), isNull(schema.brands.queriesFrozenAt)))
    .returning({ id: schema.brands.id })
  if (frozen.length === 0) return { ok: false, reason: '이미 확정된 질의입니다.' }

  logger.info('onboarding.queries_frozen', { brandId: brand.id, count: verdict.queries.length })
  return { ok: true, value: { frozen: verdict.queries.length } }
}
```

- [ ] **Step 13: 검증 + 커밋**

Run: `pnpm vitest run src/lib/audit src/lib/onboarding` && `pnpm typecheck` && `pnpm lint`
Expected: PASS (기존 audit 테스트 포함 전부 초록)

```bash
git add src/lib/audit/query-rules.ts src/lib/audit/query-rules.test.ts src/lib/audit/custom-queries.ts src/lib/onboarding "src/app/(app)/onboarding/actions.ts"
git commit -m "feat(onboarding): 질의 검증 순수 분리(query-rules) + 생성 한도 5회 서버 강제 + 동결 액션"
```

---
### Task 5: 2단계 질의 에디터 화면 + 3단계 완료

에디터가 온보딩의 본체다(스펙 ②). 수정·삭제·개별 재생성, 실시간 검증(이유를
그 자리에서), 생성 카운터, [확정] = 동결. 완료 화면은 다음 측정 시각을 예고한다.
디자인은 **`docs/design-language.md`가 바인딩**이다(§1 조판, §3 컴포넌트, §5 모션).

**Files:**
- Create: `src/app/(app)/onboarding/queries/page.tsx`
- Create: `src/app/(app)/onboarding/queries/query-editor.tsx`
- Create: `src/app/(app)/onboarding/done/page.tsx`
- Test: `src/app/(app)/onboarding/queries/query-editor.test.tsx` (jsdom)

**Interfaces:**
- Consumes: Task 4의 `checkCustomQueries`·`CustomQueryContext`(순수 — 클라이언트
  import), `generateQueriesAction`·`freezeQueriesAction`·`ActionResult`,
  `buildInitialQueries`, `loadEditorQuota`, `loadOnboardingGate`, `loadPrefill`,
  `generateAuditQueries`, Task 3의 `nextMeasurement`
- Produces: `QueryEditor` 컴포넌트 —
  `props: { brandId: string; initial: string[]; quota: number; generationsUsed: number; generationLimit: number; ctx: CustomQueryContext }`

- [ ] **Step 1: 실패하는 테스트 — 에디터 동작**

`src/app/(app)/onboarding/queries/query-editor.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { QueryEditor } from './query-editor'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../actions', () => ({
  generateQueriesAction: vi.fn(async () => ({ ok: true, value: { queries: [], used: 1, limit: 5 } })),
  freezeQueriesAction: vi.fn(async () => ({ ok: true, value: { frozen: 5 } })),
}))

const ctx = {
  brandName: '무신사',
  competitors: ['29CM'],
  category: '패션',
  requiredCount: 5,
}
// 템플릿 3개는 실제 규칙으로 만든 값과 같아야 검증이 통과한다.
const templates = [
  '30대 남자 옷 어디서 사는 게 좋아?',
  '가성비 좋은 온라인 패션 쇼핑몰 추천해줘',
  '요즘 인기 있는 국내 패션 브랜드 알려줘',
]

function renderEditor(initial: string[]) {
  return render(
    <QueryEditor brandId="brd_x" initial={initial} quota={5} generationsUsed={0} generationLimit={5} ctx={ctx} />,
  )
}

describe('QueryEditor', () => {
  test('빈 칸이 있으면 확정 버튼이 비활성이고 이유가 보인다', () => {
    renderEditor([...templates, '', ''])
    expect(screen.getByRole('button', { name: /확정/ })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/비어 있는 질의/)
  })

  test('브랜드명을 넣으면 그 자리에서 거부 이유가 보인다', () => {
    renderEditor([...templates, '무신사 어때?', '겨울 코트 추천해줘'])
    expect(screen.getByRole('status')).toHaveTextContent(/브랜드명/)
    expect(screen.getByRole('button', { name: /확정/ })).toBeDisabled()
  })

  test('유효한 세트면 확정 버튼이 활성화된다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘'])
    expect(screen.getByRole('status')).toHaveTextContent(/확정할 수 있습니다/)
    expect(screen.getByRole('button', { name: /확정/ })).toBeEnabled()
  })

  test('질의 카운터와 생성 카운터가 보인다', () => {
    renderEditor([...templates, '', ''])
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText(/AI 생성 0\/5회/)).toBeInTheDocument()
  })

  test('수정하면 검증이 즉시 다시 돈다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘'])
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[4]!, { target: { value: '29CM 말고 뭐 있어?' } })
    expect(screen.getByRole('status')).toHaveTextContent(/경쟁사명/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run "src/app/(app)/onboarding/queries"`
Expected: FAIL — 컴포넌트 없음

- [ ] **Step 3: 구현 — `src/app/(app)/onboarding/queries/query-editor.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { checkCustomQueries, type CustomQueryContext } from '@/lib/audit/query-rules'
import { freezeQueriesAction, generateQueriesAction } from '../actions'

/**
 * 질의 에디터 (온보딩 2단계의 본체).
 *
 * 검증은 서버와 **같은 함수**(`checkCustomQueries`)를 매 입력마다 돌린다 —
 * 순수 함수라 비용이 없고, 화면과 서버가 다른 말을 할 수 없다.
 * 생성 카운터는 표시용이다 — 한도는 서버가 강제한다(`takeGenerationCredit`).
 */
export function QueryEditor({
  brandId,
  initial,
  quota,
  generationsUsed,
  generationLimit,
  ctx,
}: {
  brandId: string
  initial: string[]
  quota: number
  generationsUsed: number
  generationLimit: number
  ctx: CustomQueryContext
}) {
  const router = useRouter()
  const [queries, setQueries] = useState<string[]>(initial)
  const [used, setUsed] = useState(generationsUsed)
  const [busyRow, setBusyRow] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const verdict = useMemo(() => checkCustomQueries(queries, ctx), [queries, ctx])
  const filled = queries.filter((q) => q.trim().length > 0).length
  const emptySlots = queries
    .map((q, i) => (q.trim().length === 0 ? i : -1))
    .filter((i) => i >= 0)
  const creditsLeft = Math.max(0, generationLimit - used)

  function setQuery(index: number, value: string) {
    setConfirming(false)
    setQueries((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  function clearQuery(index: number) {
    setQuery(index, '')
  }

  /** 빈 칸 채우기 또는 한 줄 재생성. 크레딧 1개 = 호출 1회. */
  function generate(targetIndexes: number[]) {
    if (targetIndexes.length === 0) return
    setActionError(null)
    setBusyRow(targetIndexes.length === 1 ? targetIndexes[0]! : -1)
    startTransition(async () => {
      const result = await generateQueriesAction({ brandId, count: targetIndexes.length })
      setBusyRow(null)
      if (!result.ok) {
        setActionError(result.reason)
        return
      }
      setUsed(result.value.used)
      setQueries((prev) => {
        const next = [...prev]
        targetIndexes.forEach((slot, i) => {
          const candidate = result.value.queries[i]
          if (candidate !== undefined) next[slot] = candidate
        })
        return next
      })
    })
  }

  function freeze() {
    if (!verdict.ok) return
    setActionError(null)
    startTransition(async () => {
      const result = await freezeQueriesAction({ brandId, queries })
      if (result.ok) router.push('/onboarding/done')
      else {
        setActionError(result.reason)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* 계측값은 mono — 디자인 언어 §1 */}
        <p className="text-sm text-muted-foreground">
          질의 <span className="font-mono tabular-nums">{filled}/{quota}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          AI 생성 <span className="font-mono tabular-nums">{used}/{generationLimit}회</span>
        </p>
      </div>

      <ul className="space-y-2">
        {queries.map((value, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-8 shrink-0 font-mono text-xs text-muted-foreground">
              q{i + 1}
            </span>
            <input
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-ring/50"
              value={value}
              aria-label={`질의 ${i + 1}`}
              onChange={(e) => setQuery(i, e.target.value)}
              placeholder="소비자가 AI에게 묻는 말투로"
            />
            <Button
              type="button" variant="outline" size="sm" className="mt-0.5 shrink-0"
              disabled={pending || creditsLeft === 0}
              onClick={() => generate([i])}
              aria-label={`질의 ${i + 1} 재생성`}
            >
              {busyRow === i ? '…' : '재생성'}
            </Button>
            <Button
              type="button" variant="ghost" size="sm" className="mt-0.5 shrink-0"
              disabled={pending} onClick={() => clearQuery(i)}
              aria-label={`질의 ${i + 1} 비우기`}
            >
              지우기
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button" variant="outline"
          disabled={pending || emptySlots.length === 0 || creditsLeft === 0}
          onClick={() => generate(emptySlots)}
        >
          AI 후보 생성 — 빈 칸 {emptySlots.length}개 채우기
        </Button>
        {creditsLeft === 0 && (
          <p className="self-center text-xs text-muted-foreground">
            생성 한도를 다 썼습니다. 남은 질의는 직접 수정해 주세요.
          </p>
        )}
      </div>

      {/* 실시간 검증 — 서버와 같은 함수의 이유를 그 자리에서 보여준다 */}
      <p
        role="status"
        className={
          verdict.ok
            ? 'rounded-lg border border-metric-up/30 bg-metric-up/5 px-4 py-3 text-sm text-metric-up-fg'
            : 'rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm text-incomplete-fg'
        }
      >
        {verdict.ok
          ? `질의 ${quota}개가 규칙을 통과했습니다 — 확정할 수 있습니다.`
          : verdict.reason}
      </p>

      {actionError && (
        <p role="alert" className="rounded-lg border border-metric-down/30 bg-metric-down/5 px-4 py-3 text-sm text-metric-down-fg">
          {actionError}
        </p>
      )}

      {confirming ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <p className="text-sm leading-relaxed">
            확정하면 질의가 <strong className="font-semibold">동결</strong>됩니다. 회차끼리
            비교할 수 있으려면 질의가 같아야 하므로, 동결 후에는 바꾸지 않습니다 — 수정이
            꼭 필요하면 운영자에게 문의해 주세요.
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={pending || !verdict.ok} onClick={freeze}>
              {pending ? '동결 중…' : '확정하고 동결'}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              더 고치기
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || !verdict.ok} onClick={() => setConfirming(true)}>
          확정하기
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run "src/app/(app)/onboarding/queries"`
Expected: PASS (5 tests)

- [ ] **Step 5: 페이지 — `src/app/(app)/onboarding/queries/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { generateAuditQueries } from '@/lib/audit/queries'
import type { CustomQueryContext } from '@/lib/audit/query-rules'
import { db, schema } from '@/lib/db'
import { buildInitialQueries } from '@/lib/onboarding/editor'
import { QUERY_GENERATION_LIMIT } from '@/lib/onboarding/generation'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { loadPrefill } from '@/lib/onboarding/prefill'
import { loadEditorQuota } from '@/lib/onboarding/quota'
import { QueryEditor } from './query-editor'
import { and, eq } from 'drizzle-orm'

export const metadata = { title: '온보딩 — 질의' }

export default async function OnboardingQueriesPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan' || !gate.subscription) redirect('/dashboard')
  const { brand: brandId } = await searchParams
  if (!brandId) redirect('/onboarding')

  const brand = await db.query.brands.findFirst({
    where: and(eq(schema.brands.id, brandId), eq(schema.brands.userId, gate.user.id)),
  })
  if (!brand) redirect('/onboarding')
  if (brand.queriesFrozenAt) redirect('/onboarding/done')

  const quota = await loadEditorQuota(gate.user.id, brand.id, gate.subscription)
  const templates = generateAuditQueries(brand.category, brand.name, brand.region ?? undefined)
  const prefill = await loadPrefill(gate.user.email, gate.subscription.fromAuditId ?? null)
  const initial = buildInitialQueries({
    frozen: prefill?.frozenQueries ?? null,
    templates,
    quota: quota.quota,
  })
  const ctx: CustomQueryContext = {
    brandName: brand.name,
    competitors: brand.competitors.map((c) => c.name),
    category: brand.category,
    ...(brand.region ? { region: brand.region } : {}),
    requiredCount: quota.quota,
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 2 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정할 질문</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {initial.source === 'frozen'
          ? '진단에 썼던 질의를 그대로 가져왔습니다. 같은 질의로 재야 진단 리포트와 비교할 수 있습니다.'
          : `앞의 ${templates.length}개는 업종 공통 질문입니다 — 무료 진단과 같은 질문이라 반드시 포함됩니다. 나머지는 AI 후보로 채우거나 직접 쓰세요.`}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        질의에는 브랜드명·경쟁사명을 넣지 않습니다 — 이름을 대면 측정이 무효입니다. 우리가
        재는 것은 이름을 대지 않은 소비자 질문에 AI가 브랜드를 스스로 꺼내는가입니다.
      </p>
      <div className="mt-8">
        <QueryEditor
          brandId={brand.id}
          initial={initial.queries}
          quota={quota.quota}
          generationsUsed={brand.queryGenerations}
          generationLimit={QUERY_GENERATION_LIMIT}
          ctx={ctx}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 완료 — `src/app/(app)/onboarding/done/page.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { nextMeasurement } from '@/lib/kst'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

export const metadata = { title: '온보딩 — 완료' }

export default async function OnboardingDonePage() {
  await loadOnboardingGate() // requireUser 포함 ((app) 규칙)
  const next = nextMeasurement(new Date())
  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 3 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정 예약이 끝났습니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        질의가 동결됐습니다. 다음 측정은{' '}
        <span className="font-mono">{next.weekdayLabel}요일 새벽</span>에 돕니다 — 이후 월·수·금
        새벽마다 같은 질의로 다시 잽니다.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        첫 회차가 끝나면 대시보드에 점이 하나 찍힙니다. 점 하나로는 변화를 말할 수 없습니다 —
        회차가 쌓일수록 구간이 좁아지고, 그때부터 변화가 실제인지 측정 오차인지 판정합니다.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/dashboard">대시보드로</Link>
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 검증 + 커밋**

Run: `pnpm vitest run "src/app/(app)/onboarding"` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add "src/app/(app)/onboarding/queries" "src/app/(app)/onboarding/done"
git commit -m "feat(onboarding): 질의 에디터 화면 — 실시간 검증·개별 재생성·동결 확인, 완료 화면 다음 측정 예고"
```

---

### Task 6: 정기 측정 핸들러 — `/api/cron/measure` + 실패 메일

스펙 ③·④. 호출당 브랜드 1개, due 판정·잠금은 `collection_runs` 상태로,
파이프라인은 기존 코어 재사용, 실패는 운영자 메일 + 다음 호출 1회 재시도,
재실패면 회차 건너뜀. 결과는 `collection_runs.result`에 `AuditResult` 스냅샷.

**Files:**
- Create: `src/lib/cron/auth.ts` (타이밍 세이프 비교 이동)
- Modify: `src/lib/cron/cleanup-sessions.ts` (auth 재사용 — re-export 유지)
- Create: `src/lib/cron/measure.ts` (순수 — due 판정 + 핸들러)
- Create: `src/lib/cron/measure-run.ts` (DB — 컨텍스트 로드 + 측정 파이프라인)
- Modify: `src/lib/collection/repository.ts` (`saveRunResult` 추가)
- Modify: `src/lib/email/templates.ts` (`measureFailureNotice` 추가)
- Create: `src/app/api/cron/measure/route.ts`
- Test: `src/lib/cron/measure.test.ts`

**Interfaces:**
- Consumes: `isAuthorizedCronRequest`(이동), `kstDayStart`(`@/lib/kst`),
  `validateRunStart`·`createRun`·`saveAnswers`·`buildAnswerRow`·`buildRunMetrics`·
  `resolveRunStatus`·`finishRun`·`recordSerpUsage`(repository), `buildFanout`·
  `buildPlanSnapshot`·`runCollection`·`answerKey`, `runDetection`·`DETECTOR_VERSION`·
  `createClaudeJudge`, `createAliasGenerator`·`toBrandProfiles`, `buildAuditResult`,
  `createCostMeter`, `implementedEngineIds`, `PLANS`, `sendEmail`, `env.CRON_SECRET`·
  `env.OPERATOR_EMAIL`
- Produces:
  - `src/lib/cron/auth.ts`: `isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | undefined): boolean`
  - `measure.ts`: `RUNNING_STALE_MS = 15 * 60 * 1000`, `MAX_ATTEMPTS_PER_WINDOW = 2`,
    `interface RunSummary { brandId: string; status: RunStatus; startedAt: Date }`,
    `selectDueBrand(brands: readonly { id: string; name: string }[], todaysRuns: readonly RunSummary[], now: Date): { brandId: string; brandName: string; attempt: number } | null`,
    `interface MeasureDeps { secret: string | undefined; loadDueContext: () => Promise<DueContext>; measureBrand: (brandId: string) => Promise<MeasureOutcome>; notifyFailure: (args: { brandId: string; brandName: string; reason: string; attempt: number }) => Promise<void>; now?: () => Date }`,
    `interface DueContext { brands: { id: string; name: string }[]; todaysRuns: RunSummary[] }`,
    `interface MeasureOutcome { runId: string; status: RunStatus }`,
    `handleMeasure(request: Request, deps: MeasureDeps): Promise<Response>`
  - `measure-run.ts`: `loadMeasureContext(now?: Date): Promise<DueContext>`,
    `measureBrand(brandId: string): Promise<MeasureOutcome>`
  - repository: `saveRunResult(runId: string, result: unknown): Promise<void>`
  - templates: `measureFailureNotice(params: { brandName: string; brandId: string; reason: string; attempt: number }): EmailContent`

- [ ] **Step 1: auth 이동 (테스트는 기존 것이 지킨다)**

`src/lib/cron/auth.ts` 생성 — `cleanup-sessions.ts`에서 `BEARER_PREFIX`,
`secretsMatch`, `isAuthorizedCronRequest`를 **주석 포함 문자 그대로** 옮긴다
(import는 `node:crypto`만). `cleanup-sessions.ts`에서는 세 정의를 지우고:

```ts
// 크론 인증은 auth.ts로 이동했다 (4단계 — /api/cron/measure와 공유).
// 기존 호출자·테스트를 위해 그대로 re-export한다.
export { isAuthorizedCronRequest } from '@/lib/cron/auth'
```

를 넣은 뒤 내부 사용처(`handleCleanupSessions`)의 참조를 유지한다.

Run: `pnpm vitest run src/lib/cron` — 기존 cleanup-sessions 테스트 전부 PASS.

- [ ] **Step 2: 실패하는 테스트 — due 판정과 핸들러**

`src/lib/cron/measure.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest'
import {
  MAX_ATTEMPTS_PER_WINDOW,
  RUNNING_STALE_MS,
  handleMeasure,
  selectDueBrand,
  type MeasureDeps,
} from './measure'

// KST 2026-08-03(월) 03:10 = UTC 2026-08-02 18:10
const NOW = new Date('2026-08-02T18:10:00Z')
const b = (id: string) => ({ id, name: `브랜드${id}` })
const run = (brandId: string, status: 'running' | 'succeeded' | 'partial' | 'failed', minAgo: number) => ({
  brandId,
  status,
  startedAt: new Date(NOW.getTime() - minAgo * 60 * 1000),
})

describe('selectDueBrand — 큐 없는 소진 방식', () => {
  test('오늘 회차가 없는 첫 브랜드를 고른다 (id 순 안정)', () => {
    expect(selectDueBrand([b('a'), b('b')], [], NOW)).toEqual({
      brandId: 'a', brandName: '브랜드a', attempt: 1,
    })
  })

  test('성공·부분 회차가 있으면 그 브랜드는 끝 — 다음 브랜드로', () => {
    expect(selectDueBrand([b('a'), b('b')], [run('a', 'succeeded', 5)], NOW)?.brandId).toBe('b')
    expect(selectDueBrand([b('a')], [run('a', 'partial', 5)], NOW)).toBeNull()
  })

  test('진행 중(15분 미만) 회차는 잠금 — 건너뛴다', () => {
    expect(selectDueBrand([b('a')], [run('a', 'running', 3)], NOW)).toBeNull()
  })

  test('실패 1회면 재시도 대상 (attempt=2)', () => {
    expect(selectDueBrand([b('a')], [run('a', 'failed', 20)], NOW)).toEqual({
      brandId: 'a', brandName: '브랜드a', attempt: 2,
    })
  })

  test('실패 2회면 이번 회차 건너뜀 — 공백 1회가 잘못된 데이터보다 낫다', () => {
    const runs = [run('a', 'failed', 40), run('a', 'failed', 20)]
    expect(selectDueBrand([b('a')], runs, NOW)).toBeNull()
  })

  test('15분 넘은 running은 죽은 실행 — 실패로 세고 재시도를 허용한다', () => {
    const stale = run('a', 'running', RUNNING_STALE_MS / 60000 + 1)
    expect(selectDueBrand([b('a')], [stale], NOW)?.attempt).toBe(2)
  })
})

describe('handleMeasure', () => {
  const deps = (over: Partial<MeasureDeps>): MeasureDeps => ({
    secret: 's3cret',
    loadDueContext: async () => ({ brands: [b('a')], todaysRuns: [] }),
    measureBrand: async () => ({ runId: 'run1', status: 'succeeded' }),
    notifyFailure: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  })
  const req = (auth?: string) =>
    new Request('https://x/api/cron/measure', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    })

  test('시크릿 불일치 → 401, 아무 일도 하지 않는다', async () => {
    const loadDueContext = vi.fn()
    const res = await handleMeasure(req('Bearer wrong'), deps({ loadDueContext }))
    expect(res.status).toBe(401)
    expect(loadDueContext).not.toHaveBeenCalled()
  })

  test('due 브랜드가 없으면 measured: null', async () => {
    const d = deps({ loadDueContext: async () => ({ brands: [], todaysRuns: [] }) })
    const res = await handleMeasure(req('Bearer s3cret'), d)
    expect(await res.json()).toEqual({ ok: true, measured: null, remaining: 0 })
  })

  test('측정 성공 → measured에 브랜드 id', async () => {
    const res = await handleMeasure(req('Bearer s3cret'), deps({}))
    expect(await res.json()).toEqual({
      ok: true, measured: 'a', runId: 'run1', status: 'succeeded', remaining: 0,
    })
  })

  test('측정 실패 → notifyFailure(attempt 포함) 호출, 200 ok:false', async () => {
    const notifyFailure = vi.fn(async () => {})
    const d = deps({
      measureBrand: async () => { throw new Error('수집이 전부 실패했습니다') },
      notifyFailure,
    })
    const res = await handleMeasure(req('Bearer s3cret'), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, measured: 'a' })
    expect(notifyFailure).toHaveBeenCalledWith({
      brandId: 'a', brandName: '브랜드a', reason: '수집이 전부 실패했습니다', attempt: 1,
    })
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run src/lib/cron/measure.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현 — `src/lib/cron/measure.ts`**

```ts
import 'server-only'

import type { RunStatus } from '@/lib/db/schema'
import { kstDayStart } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { isAuthorizedCronRequest } from './auth'

/**
 * 정기 측정 핸들러 코어 — 순수 판정 + DI (스펙 ③).
 *
 * ★ 호출당 브랜드 1개만 처리한다. 실측 1브랜드 233초로 함수 한도(300초) 안.
 *   브랜드가 여러 개면 15분 뒤 다음 호출이 이어받는다 — 큐 없는 소진 방식.
 * ★ due 판정과 중복 실행 잠금은 collection_runs 상태로만 한다. 별도 잠금
 *   테이블을 만들지 않는다 — 상태의 출처가 둘이면 갈라진다.
 */

/** running이 이보다 오래됐으면 죽은 실행으로 본다 (함수 한도 300초 + 여유) */
export const RUNNING_STALE_MS = 15 * 60 * 1000
/** KST 하루 안의 시도 상한. 1회 재시도 후 재실패면 회차를 건너뛴다 (스펙 ③) */
export const MAX_ATTEMPTS_PER_WINDOW = 2

export interface RunSummary {
  brandId: string
  status: RunStatus
  startedAt: Date
}

export interface DueContext {
  /** 측정 대상: 활성 구독 + 동결 완료 + isActive. id 순 정렬(안정 소진) */
  brands: { id: string; name: string }[]
  /** KST 오늘 시작 이후의 schedule 트리거 회차들 */
  todaysRuns: RunSummary[]
}

export interface MeasureOutcome {
  runId: string
  status: RunStatus
}

/**
 * 다음으로 측정할 브랜드. 없으면 null.
 *
 * 브랜드마다 (KST 오늘 기준):
 *  - succeeded/partial 회차가 있다 → 오늘 몫은 끝
 *  - RUNNING_STALE_MS 미만의 running → 진행 중(잠금) — 건너뜀
 *  - 실패 시도 수 = failed + 죽은 running. 상한 미만이면 due (attempt = 시도+1)
 */
export function selectDueBrand(
  brands: readonly { id: string; name: string }[],
  todaysRuns: readonly RunSummary[],
  now: Date,
): { brandId: string; brandName: string; attempt: number } | null {
  const dayStart = kstDayStart(now).getTime()
  for (const brand of brands) {
    const runs = todaysRuns.filter(
      (r) => r.brandId === brand.id && r.startedAt.getTime() >= dayStart,
    )
    if (runs.some((r) => r.status === 'succeeded' || r.status === 'partial')) continue
    const inFlight = runs.some(
      (r) => r.status === 'running' && now.getTime() - r.startedAt.getTime() < RUNNING_STALE_MS,
    )
    if (inFlight) continue
    const failedAttempts = runs.filter(
      (r) =>
        r.status === 'failed' ||
        (r.status === 'running' && now.getTime() - r.startedAt.getTime() >= RUNNING_STALE_MS),
    ).length
    if (failedAttempts >= MAX_ATTEMPTS_PER_WINDOW) continue
    return { brandId: brand.id, brandName: brand.name, attempt: failedAttempts + 1 }
  }
  return null
}

export interface MeasureDeps {
  /** `env.CRON_SECRET`. 없으면 fail-closed */
  secret: string | undefined
  loadDueContext: () => Promise<DueContext>
  measureBrand: (brandId: string) => Promise<MeasureOutcome>
  /** 실패 통지 — 운영자 메일. 통지 실패는 측정 실패를 덮지 않는다 */
  notifyFailure: (args: {
    brandId: string
    brandName: string
    reason: string
    attempt: number
  }) => Promise<void>
  now?: () => Date
}

export async function handleMeasure(request: Request, deps: MeasureDeps): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), deps.secret)) {
    logger.warn('cron.measure.unauthorized', { configured: Boolean(deps.secret) })
    return new Response(null, { status: 401 })
  }
  const now = (deps.now ?? (() => new Date()))()
  const ctx = await deps.loadDueContext()
  const due = selectDueBrand(ctx.brands, ctx.todaysRuns, now)
  const remainingAfter = (excluded: string) =>
    ctx.brands.filter(
      (b) => b.id !== excluded && selectDueBrand([b], ctx.todaysRuns, now) !== null,
    ).length

  if (!due) {
    logger.info('cron.measure.idle', { brands: ctx.brands.length })
    return Response.json({ ok: true, measured: null, remaining: 0 })
  }

  try {
    const outcome = await deps.measureBrand(due.brandId)
    logger.info('cron.measure.done', {
      brandId: due.brandId, runId: outcome.runId, status: outcome.status,
    })
    return Response.json({
      ok: true,
      measured: due.brandId,
      runId: outcome.runId,
      status: outcome.status,
      remaining: remainingAfter(due.brandId),
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught)
    logger.error('cron.measure.failed', { brandId: due.brandId, attempt: due.attempt })
    try {
      await deps.notifyFailure({
        brandId: due.brandId, brandName: due.brandName, reason, attempt: due.attempt,
      })
    } catch {
      logger.error('cron.measure.notify_failed', { brandId: due.brandId })
    }
    // ★ 200으로 돌려준다. 15분 간격 반복 호출이 곧 재시도 메커니즘이라
    //   워크플로를 빨간불로 만들면 소음만 는다 — 실패 신호는 운영자 메일이다.
    return Response.json({ ok: false, measured: due.brandId })
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/cron/measure.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: repository에 `saveRunResult` 추가**

`src/lib/collection/repository.ts` — `finishRun` 아래에:

```ts
/**
 * 회차 결과 스냅샷 저장 (스펙 ④). 추이·히트맵·점유율이 이 스냅샷에서 계산되고,
 * 회차 상세는 ResultView가 그대로 그린다 — 재집계하지 않는다.
 */
export async function saveRunResult(runId: string, result: unknown): Promise<void> {
  await db
    .update(schema.collectionRuns)
    .set({ result })
    .where(eq(schema.collectionRuns.id, runId))
}
```

- [ ] **Step 7: 실패 메일 템플릿 — `src/lib/email/templates.ts`에 추가**

`auditRequestedNotice` 아래에 (같은 `layout`·`row` 스타일 관례):

```ts
/**
 * 정기 측정 실패 — 운영자 알림 (스펙 ⑤).
 * attempt=1이면 다음 호출이 자동 재시도하고, 2면 이번 회차를 건너뛴다.
 */
export function measureFailureNotice(params: {
  brandName: string
  brandId: string
  reason: string
  attempt: number
}): EmailContent {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#8a8580;white-space:nowrap">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
  const nextStep =
    params.attempt === 1
      ? '15분 뒤 호출에서 1회 자동 재시도합니다. 재실패하면 다시 알려드립니다.'
      : '이번 회차는 건너뜁니다 — 공백 1회가 잘못된 데이터보다 낫습니다. 다음 스케줄(월·수·금 새벽)에 정상 측정합니다.'
  return {
    subject: `[Cited 운영] 정기 측정 실패 — ${params.brandName} (${params.attempt}번째 시도)`,
    html: layout(
      `<h1 style="margin:0 0 16px;font-size:20px;letter-spacing:-0.02em">정기 측정이 실패했습니다</h1>
<table style="border-collapse:collapse;margin:0 0 20px;font-size:14px">
${row('브랜드', params.brandName)}
${row('브랜드 id', params.brandId)}
${row('시도', `${params.attempt} / 2`)}
${row('사유', params.reason.slice(0, 500))}
</table>
<p style="margin:0;color:#8a8580;font-size:13px">${nextStep}</p>`,
    ),
  }
}
```

- [ ] **Step 8: DB 어댑터 + 파이프라인 — `src/lib/cron/measure-run.ts`**

```ts
import 'server-only'

import { randomUUID } from 'node:crypto'
import { and, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { createAliasGenerator, toBrandProfiles } from '@/lib/audit/aliases'
import { createCostMeter } from '@/lib/audit/cost'
import { buildAuditResult } from '@/lib/audit/result'
import { buildFanout } from '@/lib/collection/fanout'
import { buildPlanSnapshot } from '@/lib/collection/plan-snapshot'
import {
  buildAnswerRow,
  buildRunMetrics,
  createRun,
  finishRun,
  recordSerpUsage,
  resolveRunStatus,
  saveAnswers,
  saveRunResult,
  validateRunStart,
} from '@/lib/collection/repository'
import { answerKey, runCollection } from '@/lib/collection/run'
import { db, schema } from '@/lib/db'
import { DETECTOR_VERSION } from '@/lib/detection'
import { runDetection } from '@/lib/detection/pipeline'
import { implementedEngineIds } from '@/lib/engines'
import { createClaudeJudge } from '@/lib/judge/claude'
import { kstDayStart } from '@/lib/kst'
import { logger } from '@/lib/logger'
import { PLANS } from '@/lib/plans'
import type { DueContext, MeasureOutcome } from './measure'

/** 측정 대상과 오늘 회차를 읽는다. 순수 판정(selectDueBrand)의 입력이 된다. */
export async function loadMeasureContext(now = new Date()): Promise<DueContext> {
  const brandRows = await db
    .select({ id: schema.brands.id, name: schema.brands.name })
    .from(schema.brands)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.brands.userId))
    .where(
      and(
        eq(schema.brands.isActive, true),
        isNotNull(schema.brands.queriesFrozenAt),
        inArray(schema.subscriptions.status, ['active', 'past_due']),
      ),
    )
    .orderBy(schema.brands.id)
  if (brandRows.length === 0) return { brands: [], todaysRuns: [] }

  const todaysRuns = await db
    .select({
      brandId: schema.collectionRuns.brandId,
      status: schema.collectionRuns.status,
      startedAt: schema.collectionRuns.startedAt,
    })
    .from(schema.collectionRuns)
    .where(
      and(
        inArray(schema.collectionRuns.brandId, brandRows.map((b) => b.id)),
        gte(schema.collectionRuns.startedAt, kstDayStart(now)),
        eq(schema.collectionRuns.trigger, 'schedule'),
      ),
    )
  return { brands: brandRows, todaysRuns }
}

/**
 * 브랜드 1개 측정 — 기존 파이프라인의 조립이다 (스펙 ③: "기존 수집·판정
 * 파이프라인 + 계정 전체 한도 검증 그대로. 동결 질의 사용").
 *
 * 순서는 audit-run.mts와 같은 이유로 고정된다: 검증(공짜) → 수집(비쌈) →
 * 별칭(수집 실패 시 안 씀) → 판정 → 집계·저장.
 */
export async function measureBrand(brandId: string): Promise<MeasureOutcome> {
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) })
  if (!brand) throw new Error(`브랜드가 없습니다: ${brandId}`)
  if (!brand.queriesFrozenAt) throw new Error(`질의가 동결되지 않았습니다: ${brandId}`)
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, brand.userId),
  })
  if (!subscription || (subscription.status !== 'active' && subscription.status !== 'past_due')) {
    throw new Error(`활성 구독이 없습니다: ${brandId}`)
  }

  const queryRows = await db
    .select()
    .from(schema.queries)
    .where(and(eq(schema.queries.brandId, brandId), eq(schema.queries.isActive, true)))
    .orderBy(schema.queries.createdAt)
  const queries = queryRows.map((q) => ({ id: q.id, text: q.text }))

  // 계정 전체 한도 — 같은 계정의 다른 브랜드가 쓰는 질의 수 (validateRunStart 주석)
  const others = await db
    .select({ id: schema.brands.id })
    .from(schema.brands)
    .where(
      and(
        eq(schema.brands.userId, brand.userId),
        ne(schema.brands.id, brandId),
        eq(schema.brands.isActive, true),
      ),
    )
  let queriesOnOtherBrands = 0
  if (others.length > 0) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.queries)
      .where(
        and(
          inArray(schema.queries.brandId, others.map((b) => b.id)),
          eq(schema.queries.isActive, true),
        ),
      )
    queriesOnOtherBrands = row?.n ?? 0
  }
  // ★ 돈을 쓰기 전에 검증한다. 한도를 넘은 수집이 돌면 원가가 새어나간다.
  validateRunStart({
    brandId,
    queries,
    plan: subscription.plan,
    queryPacks: subscription.queryPacks,
    queriesOnOtherBrands,
  })

  // ★ 플랜 엔진 중 **구현된 것만** 잰다. SerpApi(네이버·Google AIO)는 이번
  //   단계의 명시적 보류다. 스냅샷에는 실제로 잰 엔진만 남긴다 — judgeChange가
  //   엔진 구성으로 비교 가능성을 판정하므로, 안 잰 엔진이 스냅샷에 남으면
  //   SerpApi가 켜지는 날 과거와의 비교가 조용히 거짓이 된다.
  const implemented = implementedEngineIds()
  const engines = PLANS[subscription.plan].engines.filter((e) => implemented.includes(e))
  const snapshot = {
    ...buildPlanSnapshot({
      plan: subscription.plan,
      queryPacks: subscription.queryPacks,
      queryIds: queries.map((q) => q.id),
      competitors: brand.competitors.map((c) => c.name),
      detectorVersion: DETECTOR_VERSION,
    }),
    engines: [...engines],
  }

  const runId = await createRun({ brandId, planSnapshot: snapshot, trigger: 'schedule' })
  const meter = createCostMeter()
  const startedMs = Date.now()

  try {
    const items = buildFanout(snapshot, queries)
    const collected = await runCollection(items, {
      onProgress: (done, total) =>
        logger.info('cron.measure.progress', { runId, done, total }),
    })
    meter.collection(collected.costMilliKrw)

    if (collected.answers.length === 0) {
      // 답변 0건으로 만든 스냅샷은 "언급 0%"처럼 보인다. 측정 실패를 측정
      // 결과로 저장하면 안 된다 (executeAudit과 같은 규칙).
      throw new Error(`수집이 전부 실패했습니다 (${collected.outcomes.length}회 시도)`)
    }

    await saveAnswers(runId, collected.answers)

    // 별칭 — 수집 뒤에 생성한다 (수집이 전부 실패하면 이 비용을 안 쓴다).
    // 자기 브랜드와 경쟁사를 한 번에 — 경쟁사 별칭이 없으면 SoV가 우리에게
    // 유리한 쪽으로 틀린다 (execute.ts 주석).
    const aliasFn = createAliasGenerator({
      onUsage: meter.alias,
      onError: (error) =>
        logger.warn('cron.measure.alias_failed', {
          runId,
          reason: error instanceof Error ? error.name : 'unknown',
        }),
    })
    const suggestions = await aliasFn(
      [brand.name, ...brand.competitors.map((c) => c.name)],
      brand.category,
    )
    const [self, ...competitors] = toBrandProfiles(suggestions)
    if (!self) throw new Error('별칭 생성이 자기 브랜드를 돌려주지 않았습니다')

    // 판정 — 답변 id는 DB 행 id를 쓴다. detections FK와 스냅샷 조인의 단일 키.
    const dbId = (a: (typeof collected.answers)[number]) => buildAnswerRow(runId, a).id
    const answersForDetection = collected.answers.map((a) => ({
      id: dbId(a),
      queryId: a.queryId,
      queryText: a.queryText,
      engineId: a.engineId,
      text: a.text,
    }))
    const judge = createClaudeJudge({ onUsage: meter.judge })
    const detection = await runDetection(
      { answers: answersForDetection, self, competitors },
      judge,
      {
        onBatchError: (error, ids) =>
          logger.error('cron.measure.judge_batch_failed', {
            runId,
            count: ids.length,
            reason: error instanceof Error ? error.name : 'unknown',
          }),
      },
    )

    // 판정 저장 — 재판정(detectorVersion) 이력을 위해 detections에도 남긴다.
    if (detection.detections.length > 0) {
      await db
        .insert(schema.detections)
        .values(
          detection.detections.map((d) => ({
            id: randomUUID(),
            answerId: d.answerId,
            subject: d.subject,
            mentioned: d.mentioned,
            position: d.position,
            sentiment: d.sentiment,
            context: d.context,
            detectorVersion: DETECTOR_VERSION,
            unresolved: d.unresolved,
          })),
        )
        .onConflictDoNothing()
    }

    const status = resolveRunStatus(collected.completeness)
    const metrics = {
      ...buildRunMetrics(collected.outcomes, collected.answers, meter.breakdown().totalMilliKrw),
      durationMs: Date.now() - startedMs,
      stage1PassRate: detection.stage1PassRate,
    }
    await finishRun({ runId, completeness: collected.completeness, metrics, status })
    await recordSerpUsage(metrics.serpApiCalls)

    // 스냅샷 — 리포트와 같은 조립기, 같은 화면 문법 (스펙 ④).
    const result = buildAuditResult({
      brandName: brand.name,
      category: brand.category,
      competitors: brand.competitors.map((c) => c.name),
      engines: [...engines],
      aliases: self.aliases,
      measuredAt: new Date().toISOString(),
      metrics: detection.metrics,
      answers: collected.answers.map((a) => ({
        id: dbId(a),
        queryText: a.queryText,
        engineId: a.engineId,
        text: a.text,
        citations: a.citations,
      })),
      detections: detection.detections.map((d) => ({
        answerId: d.answerId,
        subject: d.subject,
        mentioned: d.mentioned,
        position: d.position,
        context: d.context,
        sentiment: d.sentiment,
        unresolved: d.unresolved,
      })),
      ...(brand.selfDomains.length > 0 ? { selfDomains: brand.selfDomains } : {}),
      evidenceMax: 6,
      unresolved: detection.unresolved,
    })
    await saveRunResult(runId, result)

    logger.info('cron.measure.run_done', {
      runId, status, costKrw: Math.round(meter.breakdown().totalMilliKrw / 1000),
    })
    return { runId, status }
  } catch (error) {
    // ★ 실패해도 이미 쓴 돈과 저장된 답변은 남긴다. 회차를 failed로 닫아
    //   selectDueBrand의 재시도 판정이 이 행을 세게 한다.
    const metrics = {
      ...buildRunMetrics([], [], meter.breakdown().totalMilliKrw),
      durationMs: Date.now() - startedMs,
    }
    await finishRun({ runId, completeness: {}, metrics, status: 'failed' })
    throw error
  }
}
```

- [ ] **Step 9: 라우트 — `src/app/api/cron/measure/route.ts`**

```ts
import { handleMeasure } from '@/lib/cron/measure'
import { loadMeasureContext, measureBrand } from '@/lib/cron/measure-run'
import { sendEmail } from '@/lib/email/send'
import { measureFailureNotice } from '@/lib/email/templates'
import { env } from '@/lib/env'

// cleanup-sessions와 같은 이유 — 프리렌더되면 크론이 캐시 응답만 받는다.
export const dynamic = 'force-dynamic'
// 실측 1브랜드 233초 (스펙 ③). Vercel Fluid Compute 상한 안이다.
export const maxDuration = 300

/** GitHub Actions cron이 POST로 호출한다 (`.github/workflows/measure.yml`). */
export async function POST(request: Request): Promise<Response> {
  return handleMeasure(request, {
    secret: env.CRON_SECRET,
    loadDueContext: () => loadMeasureContext(),
    measureBrand,
    notifyFailure: async ({ brandId, brandName, reason, attempt }) => {
      // OPERATOR_EMAIL은 배포에서 필수(env.ts superRefine). 로컬 미설정이면
      // 조용히 생략 — 알림 없는 로컬 실패는 콘솔 로그로 충분하다.
      if (!env.OPERATOR_EMAIL) return
      await sendEmail({
        to: env.OPERATOR_EMAIL,
        content: measureFailureNotice({ brandName, brandId, reason, attempt }),
      })
    },
  })
}
```

- [ ] **Step 10: 검증 + 커밋**

Run: `pnpm vitest run src/lib/cron src/lib/collection src/lib/email` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add src/lib/cron src/lib/collection/repository.ts src/lib/email/templates.ts src/app/api/cron/measure
git commit -m "feat(cron): 정기 측정 핸들러 — 호출당 1브랜드 소진, KST due 판정·잠금·재시도 1회, 결과 스냅샷 저장, 실패 운영자 메일"
```

---

### Task 7: GitHub Actions 스케줄 워크플로

스펙 결정 기록: 스케줄러는 **GitHub Actions cron → API 호출** (0원, Vercel Cron
Pro 요금 회피). 월·수·금 KST 새벽 창, 15분 간격 반복 — 브랜드 수만큼 호출이
이어받는다. **vercel.json의 crons에는 추가하지 않는다** — 스케줄러의 출처는
하나여야 한다.

**Files:**
- Create: `.github/workflows/measure.yml`

**Interfaces:**
- Consumes: Task 6의 `POST /api/cron/measure` (Bearer `CRON_SECRET`)
- Produces: 저장소 시크릿 `CRON_SECRET`(Vercel 환경변수와 같은 값) 요구 —
  등록 절차는 Task 12 체크리스트에 있다

- [ ] **Step 1: 워크플로 작성 — `.github/workflows/measure.yml`**

```yaml
name: 정기 측정

# 월·수·금 KST 03:00~04:45 창을 15분 간격으로 두드린다 (스펙 ③).
# UTC로는 일·화·목 18:00~19:45다 — KST = UTC+9라 요일이 하루 밀린다.
# 핸들러는 호출당 브랜드 1개만 처리하므로(함수 한도 300초), 이 반복 호출이
# 곧 소진 큐이자 재시도 메커니즘이다. 브랜드 8개면 두 시간 창에 충분하다.
# GitHub Actions cron은 수 분 지연될 수 있다 — due 판정이 KST 하루 단위라
# 지연은 무해하다.
on:
  schedule:
    - cron: '*/15 18-19 * * 0,2,4'
  # 운영자 수동 트리거 (실측 검증·놓친 회차 보충). due 판정이 하루 단위라
  # 아무 때나 눌러도 이중 측정은 일어나지 않는다.
  workflow_dispatch:

jobs:
  measure:
    runs-on: ubuntu-latest
    timeout-minutes: 6 # 함수 최대 300초 + 여유
    steps:
      # 저장소 Settings > Secrets and variables > Actions 에 CRON_SECRET을
      # 등록해야 한다 — Vercel 환경변수의 CRON_SECRET과 같은 값
      # (ANTHROPIC_API_KEY·DATABASE_URL과 같은 방식).
      - name: POST /api/cron/measure
        run: |
          curl -fsS -X POST \
            --max-time 320 \
            -H "Authorization: Bearer $CRON_SECRET" \
            "https://cited.co.kr/api/cron/measure"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

- [ ] **Step 2: 문법 검증**

Run: `pnpm exec prettier --check .github/workflows/measure.yml || true` 후
`git status`로 파일 존재 확인. (Actions 스케줄은 기본 브랜치에 머지된 뒤에만
돈다 — 실동 확인은 Task 12의 `workflow_dispatch` 수동 실행.)

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/measure.yml
git commit -m "feat(cron): GitHub Actions 스케줄 — 월·수·금 KST 새벽 15분 간격 측정 호출"
```

---
### Task 8: 대시보드 데이터 조립 (순수) + 변화 문장 공용화

스냅샷(`collection_runs.result`)들에서 추이·히트맵·SoV·출처 변화·헤드라인을
계산하는 순수 모듈과 DB 로더. `changeSentence`를 `result-view.tsx`에서 공용
모듈로 추출한다 — 대시보드 헤드라인과 리포트가 **같은 판정에 같은 문장**을
써야 한다.

**Files:**
- Create: `src/lib/stats/change-copy.ts`
- Modify: `src/components/audit/result-view.tsx` (로컬 `changeSentence` 삭제 → import)
- Create: `src/lib/dashboard/data.ts` (순수)
- Create: `src/lib/dashboard/load.ts` (DB)
- Test: `src/lib/dashboard/data.test.ts`, `src/lib/stats/change-copy.test.ts`

**Interfaces:**
- Consumes: `AuditResult`·`AUDIT_RESULT_VERSION`(`@/lib/audit/result`),
  `Interval`·`judgeChange`·`ChangeVerdict`(`@/lib/stats/wilson`),
  `SourceStat`·`SourceOwner`(`@/lib/stats/sources`), `CollectionRun`·`RunStatus`·`PlanSnapshot`,
  `resolveLimits`, Task 1의 `collectionRuns.result`
- Produces (★ 아래는 **실제로 출하된 시그니처**다 — Task 9~11은 이것을 보고 코딩한다):
  - `change-copy.ts`: `changeSentence(verdict: ChangeVerdict): string` (문장은
    기존 result-view의 것과 문자 그대로 동일)
  - `data.ts`:
    - `parseRunResult(value: unknown): AuditResult | null`
      (검사하는 필드: `version`·`citedRate`·`byQuery`·`sources`·`byEngine`·`shareOfVoice`.
      그 외는 보지 않는다 — 과거 스냅샷 호환)
    - `interface RunPoint { runId: string; measuredAt: string; engines: string[]; competitors: string[]; queryIds: string[]; detectorVersion: number; skippedBefore: number; result: AuditResult }`
      (`queryIds`·`detectorVersion`은 **비교 가능성 필드**다. 질의 집합이 바뀌면
      `citedRate`의 분모가, 판정기 버전이 바뀌면 분자의 정의가 바뀐다 — `engines`와 같은 취급.
      `skippedBefore`는 이 회차 **직전에 스냅샷이 없어 버려진 회차 수**다 — 아래 `toRunPoints` 참고)
    - `toRunPoints(runs: readonly Pick<CollectionRun, 'id' | 'startedAt' | 'planSnapshot' | 'result'>[]): RunPoint[]`
      (★ **회차 → 점 변환의 유일한 공개 입구다.** 회차 하나짜리 변환 함수는
      export하지 않는다 — 회차 하나만 보면 `skippedBefore`에 넣을 수 있는 값이
      0뿐인데 그 0은 "앞에 버려진 회차가 없다"는 **답이 아니라 모름**이다.
      내보내면 `runs.map(…)` 한 줄이 간격 신호를 통째로 잃은 채 조용히 컴파일된다.
      이 함수는 스냅샷이 없어 버려진 회차의 **자리**를 `skippedBefore`로 남긴다)
    - `interface TrendPoint { runId: string; measuredAt: string; interval: Interval; comparableWithPrev: boolean; runsSkippedBefore: number }`
      (★ `comparableWithPrev: false`면 화면은 **선을 끊는다.** 두 점은 참이지만
      그 사이 선분이 거짓이다. 첫 점은 이을 대상이 없으므로 true.
      ★ `runsSkippedBefore > 0`이면 두 점 **사이에 잰 값이 없는 회차**가 그만큼 있다 —
      조건은 같아서 `comparableWithPrev`는 true인데도 그렇다. 원인은 둘이다:
      스냅샷 저장만 실패한 회차(`points`에 못 들어온다)와 n=0 회차(계열에서 빠진다).
      서수 축은 2주 떨어진 두 점을 옆칸에 붙여 그린다 — 화면은 이 구간에
      연속성을 암시하면 안 된다. 첫 점은 0)
    - `buildTrend(points: readonly RunPoint[], engineId: string | 'all'): TrendPoint[]`
      (★ 엔진 집합이 바뀌면 **개별 엔진 계열도** 끊는다. chatgpt의 분모는 그대로인데도
      그렇다 — 의도된 과잉 발화이고 테스트가 못 박는다. 완화하려면 `sameConditions`
      본문이 아니라 호출부 옵션으로 하라)
    - `engineIdsIn(points: readonly RunPoint[]): string[]`
    - `interface HeatmapView { runs: { runId: string; measuredAt: string }[]; rows: { queryText: string; cells: (Interval | null)[] }[] }`
    - `buildHeatmap(points: readonly RunPoint[], maxRuns?: number): HeatmapView`
    - `interface SovPoint { runId: string; measuredAt: string; interval: Interval; comparableWithPrev: boolean; runsSkippedBefore: number }`
      (SoV는 위 셋에 **경쟁사 집합까지** 같아야 comparable.
      ★ `runsSkippedBefore`는 `TrendPoint`의 것과 같은 규칙이다 — 두 점 사이에 잰
      값이 없는 회차가 그만큼 있다는 뜻이고, 첫 점은 0이다. SoV 화면도 같은 서수
      축을 쓰므로 **같은 함정** 위에 있다. 여기서는 빠지는 원인이 둘인데 둘 다
      실재한다: 스냅샷이 없어 `points`에 못 들어온 회차와, `shareOfVoice.n === 0`
      이라 이 계열에서 빠지는 회차. 후자는 답변이 없을 때만이 아니라 **경쟁사를
      하나도 등록하지 않은 회차 전부**에서 난다 — 경쟁사가 없으면 SoV는 정의되지
      않아 `wilsonInterval(0, 0)`이다. 경쟁사를 뒤늦게 등록한 고객은 그 앞 회차가
      통째로 사라진다)
    - `buildSovTrend(points: readonly RunPoint[]): SovPoint[]`
    - `interface SourceChangeRow { domain: string; owner: SourceOwner; selfDomainsKnown: boolean; answers: number; prevAnswers: number | null; comparableWithPrev: boolean }`
      (★ `comparableWithPrev: false`면 화면은 `prevAnswers → answers` **화살표를
      그리면 안 된다.** 질의를 셋 더 넣은 다음 회차는 인용 수가 당연히 늘고,
      판정기가 바뀌면 무엇을 인용으로 셌는지가 바뀐다 — "2 → 5"는 브랜드가 한
      일이 아니라 설정 변경이다. 추이가 선을 끊는데 표만 화살표를 그리면 같은
      거짓말이 표 모양으로 나갈 뿐이다. 직전 회차가 아예 없으면 false다.
      `prevAnswers`를 null로 뭉개지 **않는** 이유: "직전에 없던 도메인(새로 등장)"과
      "비교할 수 없는 회차"는 다른 사실이다.
      ★ `SourceOwner`는 `'self' | 'competitor' | 'third-party'` — **null이 아니다.**
      `owner === null` 분기는 영원히 거짓이다. 그리고 `selfDomainsKnown: false`면
      `'third-party'`는 "남의 사이트"가 아니라 "자사 도메인을 몰라서 못 갈랐다"이다 —
      `AuditResult.hasSelfDomains`의 주석대로 화면이 이 둘을 반드시 갈라야 한다)
    - `buildSourceChanges(points: readonly RunPoint[], topN?: number): SourceChangeRow[]`
    - `interface Headline { latest: RunPoint | null; prev: RunPoint | null; verdict: ChangeVerdict }`
      (`verdict`는 `judgeChange`(엔진) **위에** 질의 집합·판정기 버전까지 걸러 낸 값이다)
    - `buildHeadline(points: readonly RunPoint[]): Headline`
    - `interface RunListItem { runId: string; startedAt: string; status: RunStatus; hasResult: boolean }`
  - `load.ts`:
    - `interface DashboardData { brands: { id: string; name: string }[]; selected: Brand | null; points: RunPoint[]; runList: RunListItem[] }`
    - `loadDashboard(userId: string, brandId: string | undefined): Promise<DashboardData>`
      (이력 창 = 플랜의 `historyMonths` (null=무제한). ★ 구독 조회에 status 필터가
      **없다** — 해지한 고객도 자기가 돈 내고 받은 이력을 그대로 본다. 의도된 정책이고
      `load.test.ts`가 못 박는다.
      ★ 브랜드가 있는데 구독 행이 없으면 **던진다** — 기본값을 두지 않는다.
      이력 창은 플랜에서만 나오고, 플랜이 없으면 답이 없는 것이지 기본값이 있는 게 아니다.
      `?? null`이면 무료 사용자에게 무제한 이력을, `?? 0`이면 돈 낸 고객의 회차를
      통째로 감추는 정책이 조용히 생긴다)
    - `loadRunDetail(userId: string, runId: string): Promise<{ brandName: string; startedAt: string; result: AuditResult } | null>`

- [ ] **Step 1: 실패하는 테스트 — 변화 문장 추출**

`src/lib/stats/change-copy.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { changeSentence } from './change-copy'

describe('changeSentence — 판정 하나에 문장 하나', () => {
  test('unchanged는 오차 범위 문장', () => {
    expect(changeSentence('unchanged')).toContain('측정 오차 범위')
  })
  test('up/down은 신뢰구간 비겹침 문장', () => {
    expect(changeSentence('up')).toContain('상승')
    expect(changeSentence('down')).toContain('하락')
  })
  test('incomparable은 조건 차이 문장', () => {
    expect(changeSentence('incomparable')).toContain('비교할 수 없습니다')
  })
})
```

- [ ] **Step 2: 실패 확인 후 추출**

Run: `pnpm vitest run src/lib/stats/change-copy.test.ts` → FAIL (모듈 없음)

`src/lib/stats/change-copy.ts` 생성 — `result-view.tsx`의 `changeSentence`를
**문자 그대로** 옮긴다:

```ts
import type { ChangeVerdict } from '@/lib/stats/wilson'

/**
 * 변화 판정 문장 — `judgeChange`의 출력에 대한 유일한 문장이다.
 * 리포트(전후 비교)와 대시보드(헤드라인)가 같은 판정에 같은 말을 해야 한다.
 */
export function changeSentence(verdict: ChangeVerdict): string {
  switch (verdict) {
    case 'unchanged':
      return '두 측정의 신뢰구간이 겹칩니다 — 차이가 측정 오차 범위 안에 있어, 실제 변화라고 판정할 수 없습니다.'
    case 'up':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 상승입니다.'
    case 'down':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 하락입니다.'
    case 'incomparable':
      return '두 측정의 조건(엔진 구성)이 달라 변화를 비교할 수 없습니다.'
  }
}
```

`result-view.tsx`에서 로컬 `changeSentence` 함수를 지우고
`import { changeSentence } from '@/lib/stats/change-copy'`를 추가한다.

Run: `pnpm vitest run src/lib/stats src/components/audit` → PASS (기존 result-view 테스트 초록)

- [ ] **Step 3: 실패하는 테스트 — 데이터 조립**

`src/lib/dashboard/data.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { PlanSnapshot } from '@/lib/db/schema'
import { wilsonInterval } from '@/lib/stats/wilson'
import {
  buildHeadline, buildHeatmap, buildSourceChanges, buildSovTrend, buildTrend,
  engineIdsIn, parseRunResult, toRunPoints, type RunPoint,
} from './data'

function makeResult(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: AUDIT_RESULT_VERSION,
    brandName: '무신사', category: '패션', competitors: ['29CM'],
    engines: ['chatgpt', 'gemini'], aliases: ['MUSINSA'],
    measuredAt: '2026-08-03T18:30:00.000Z', totalAnswers: 60,
    citedRate: wilsonInterval(20, 60),
    shareOfVoice: wilsonInterval(20, 35),
    ranking: [], evidence: [],
    byEngine: { chatgpt: wilsonInterval(8, 30), gemini: wilsonInterval(12, 30) },
    byQuery: [
      { queryText: 'q-a', interval: wilsonInterval(0, 6) },
      { queryText: 'q-b', interval: wilsonInterval(5, 6) },
    ],
    sources: [
      { domain: 'blog.naver.com', answers: 12, pages: [], owner: 'third-party', share: wilsonInterval(12, 60) },
      { domain: 'musinsa.com', answers: 3, pages: [], owner: 'self', share: wilsonInterval(3, 60) },
    ],
    sourceSummary: { totalAnswers: 60, answersWithCitations: 40, distinctDomains: 9, selfAnswers: 3 },
    hasSelfDomains: true, unresolved: 0,
    ...over,
  }
}

function makePoint(runId: string, over: Partial<RunPoint> = {}): RunPoint {
  return {
    runId, measuredAt: `2026-08-0${runId.length}T18:30:00.000Z`,
    engines: ['chatgpt', 'gemini'], competitors: ['29CM'],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0,
    result: makeResult(), ...over,
  }
}

describe('parseRunResult · toRunPoints', () => {
  test('스냅샷이 아니면 null — 실패 회차·구버전을 화면이 삼키지 않는다', () => {
    expect(parseRunResult(null)).toBeNull()
    expect(parseRunResult({ 이상한: '값' })).toBeNull()
    expect(parseRunResult(makeResult())).not.toBeNull()
  })

  // ★ 회차 하나짜리 변환 함수는 export되지 않는다 (Task 8 Interfaces).
  //   공개 입구는 `toRunPoints` 하나이고, 버려진 회차의 자리를 세어 남긴다.
  test('스냅샷 없는 회차는 점이 되지 않고, 그 자리는 skippedBefore로 남는다', () => {
    // ★ `PlanSnapshot`으로 못 박아야 한다 — 그냥 두면 `plan: 'starter'`가
    //   `string`으로 추론돼 `PlanId`에 대입되지 않는다.
    const snapshot: PlanSnapshot = { plan: 'starter', queryPacks: 0, engines: ['chatgpt'], samples: { llm: 3, serp: 0 }, queryIds: ['q1', 'q2'], detectorVersion: 1, competitors: ['29CM'] }
    const run = (id: string, result: unknown) =>
      ({ id, startedAt: new Date('2026-08-03T18:30:00Z'), planSnapshot: snapshot, result })
    const points = toRunPoints([run('r1', makeResult()), run('r2', null), run('r3', makeResult())])
    expect(points.map((p) => p.runId)).toEqual(['r1', 'r3'])
    expect(points.map((p) => p.skippedBefore)).toEqual([0, 1])
  })
})

describe('buildTrend · engineIdsIn', () => {
  test('all은 citedRate, 엔진 id는 byEngine에서', () => {
    const points = [makePoint('a'), makePoint('ab')]
    expect(buildTrend(points, 'all')).toHaveLength(2)
    expect(buildTrend(points, 'chatgpt')[0]?.interval.k).toBe(8)
  })
  test('엔진이 없는 회차는 그 계열에서 빠진다 — 없는 값을 지어내지 않는다', () => {
    const noGemini = makePoint('a', { result: makeResult({ byEngine: { chatgpt: wilsonInterval(8, 30) } }) })
    expect(buildTrend([noGemini, makePoint('ab')], 'gemini')).toHaveLength(1)
    expect(engineIdsIn([noGemini])).toEqual(['chatgpt'])
  })
})

describe('buildHeatmap', () => {
  test('질의 × 회차 매트릭스 — 최신 회차의 질의 순서 기준', () => {
    const heat = buildHeatmap([makePoint('a'), makePoint('ab')])
    expect(heat.runs).toHaveLength(2)
    expect(heat.rows.map((r) => r.queryText)).toEqual(['q-a', 'q-b'])
    expect(heat.rows[0]?.cells[0]?.k).toBe(0)
  })
  test('그 회차에 없던 질의는 null 셀 — "측정 없음"', () => {
    const old = makePoint('a', { result: makeResult({ byQuery: [{ queryText: 'q-b', interval: wilsonInterval(1, 6) }] }) })
    const heat = buildHeatmap([old, makePoint('ab')])
    expect(heat.rows.find((r) => r.queryText === 'q-a')?.cells[0]).toBeNull()
  })
  test('maxRuns 초과분은 오래된 쪽을 버린다', () => {
    const points = ['a', 'ab', 'abc'].map((id) => makePoint(id))
    expect(buildHeatmap(points, 2).runs.map((r) => r.runId)).toEqual(['ab', 'abc'])
  })
})

describe('buildSovTrend', () => {
  test('n=0 회차는 빠진다 — 측정 없음을 0%로 그리지 않는다', () => {
    const noSov = makePoint('a', { result: makeResult({ shareOfVoice: wilsonInterval(0, 0) }) })
    expect(buildSovTrend([noSov, makePoint('ab')])).toHaveLength(1)
  })
  test('경쟁사 집합이 직전과 다르면 comparableWithPrev=false', () => {
    const changed = makePoint('ab', { competitors: ['29CM', '지그재그'] })
    const sov = buildSovTrend([makePoint('a'), changed])
    expect(sov[1]?.comparableWithPrev).toBe(false)
  })
})

describe('buildSourceChanges · buildHeadline', () => {
  test('최신 출처 상위 + 직전 회차 답변 수', () => {
    const prev = makePoint('a', {
      result: makeResult({ sources: [{ domain: 'blog.naver.com', answers: 7, pages: [], owner: 'third-party', share: wilsonInterval(7, 60) }] }),
    })
    const rows = buildSourceChanges([prev, makePoint('ab')])
    expect(rows[0]).toMatchObject({ domain: 'blog.naver.com', answers: 12, prevAnswers: 7 })
    expect(rows[1]).toMatchObject({ domain: 'musinsa.com', prevAnswers: null })
  })
  test('헤드라인 — 회차 1개면 incomparable, 겹치면 unchanged', () => {
    expect(buildHeadline([makePoint('a')]).verdict).toBe('incomparable')
    expect(buildHeadline([makePoint('a'), makePoint('ab')]).verdict).toBe('unchanged')
  })
  test('엔진 구성이 다른 회차끼리는 incomparable — judgeChange 규칙', () => {
    const oneEngine = makePoint('a', { engines: ['chatgpt'] })
    expect(buildHeadline([oneEngine, makePoint('ab')]).verdict).toBe('incomparable')
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `pnpm vitest run src/lib/dashboard`
Expected: FAIL — 모듈 없음

- [ ] **Step 5: 구현 — `src/lib/dashboard/data.ts`**

```ts
import type { AuditResult } from '@/lib/audit/result'
import type { CollectionRun, RunStatus } from '@/lib/db/schema'
import type { SourceOwner } from '@/lib/stats/sources'
import { judgeChange, type ChangeVerdict, type Interval } from '@/lib/stats/wilson'

/**
 * 대시보드 데이터 조립 — 순수 모듈. I/O 없음.
 *
 * 입력은 회차 스냅샷(`collection_runs.result`의 AuditResult)이다. 추이·히트맵·
 * SoV·출처는 전부 스냅샷에서 계산한다 (스펙 ④ — answers를 재집계하지 않는다).
 *
 * ★ n=0은 "측정 없음"이다 (metrics.ts 상단 주석). 이 모듈의 모든 빌더가
 *   n=0을 걸러내거나 null로 표시한다 — 0%로 그리는 순간 거짓말이 된다.
 */

/**
 * 스냅샷 파서. 모양이 아니면 null — 실패 회차(result null)와 알 수 없는 구조를
 * 화면이 삼키지 않게 한다.
 *
 * ★ 관대함의 범위는 **이 모듈이 건드리지 않는 필드까지**다. 버전이 올라가며
 *   `ranking`·`evidence` 같은 필드가 사라지거나 늘어나는 것은 통과시키되,
 *   **이 모듈이 실제로 파고드는 필드는 전부 여기서 확인한다.** `engineIdsIn`은
 *   `Object.keys(result.byEngine)`를, `buildSovTrend`는 `result.shareOfVoice.n`을
 *   가드 없이 읽는다 — 여기서 안 보면 통과한 스냅샷이 화면에서 터진다.
 *   (검사하는 것: `version`·`citedRate`·`byQuery`·`sources`·`byEngine`·
 *   `shareOfVoice`. 그 외 필드는 보지 않는다.)
 *
 * ★ **`result IS NULL`인 `succeeded` 회차가 실제로 존재한다.** 측정은 끝났는데
 *   스냅샷 저장(`saveRunResult`)만 실패한 경우로, 3단계 cron은 이미 성공으로
 *   닫은 회차를 다시 실패로 덮지 않는다(덮으면 이미 측정한 브랜드에 유료
 *   파이프라인이 한 번 더 돈다). 남는 신호는 `cron.measure.snapshot_save_failed`
 *   로그 한 줄뿐이다. 그러니 상태가 아니라 **스냅샷 유무**로 판단해야 한다 —
 *   status만 보고 0%로 그리면 돈 낸 고객에게 없는 측정을 보여주게 된다.
 */
export function parseRunResult(value: unknown): AuditResult | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<AuditResult>
  if (typeof v.version !== 'number') return null
  if (!v.citedRate || typeof v.citedRate !== 'object') return null
  if (!Array.isArray(v.byQuery) || !Array.isArray(v.sources)) return null
  // byEngine은 엔진 id → Interval 맵이다. 배열이면 Object.keys가 인덱스를
  // 엔진 id로 내놓는다 — 토글 목록에 '0'·'1'이 뜨는 대신 여기서 거른다.
  if (!v.byEngine || typeof v.byEngine !== 'object' || Array.isArray(v.byEngine)) return null
  if (!v.shareOfVoice || typeof v.shareOfVoice !== 'object') return null
  return value as AuditResult
}

export interface RunPoint {
  runId: string
  /** run.startedAt ISO — 축과 정렬의 기준 시각 */
  measuredAt: string
  /** planSnapshot.engines — 실제로 잰 엔진 (비교 가능성 판정에 쓴다) */
  engines: string[]
  /** planSnapshot.competitors — SoV 분모의 정의 (정렬돼 저장된다) */
  competitors: string[]
  /**
   * planSnapshot.queryIds — 이 회차가 실제로 물어본 질의 집합.
   *
   * ★ **비교 가능성 필드다.** `citedRate`의 분모는 "모든 질의에 대한 모든 답변"
   *   이므로, 질의 하나만 바뀌어도 숫자가 움직인다 — 브랜드가 한 일이 없어도.
   *   동결 후 질의 수정은 운영자 CLI로 **지원되는 경로**이므로(스펙 ②) 실제로
   *   일어난다. 집합이 다른 회차끼리 ▲▼를 붙이면 설정 변경을 실적으로 보고하게
   *   된다 — `engines`가 다른 주끼리 비교하지 않는 것과 정확히 같은 이유다.
   */
  queryIds: string[]
  /**
   * planSnapshot.detectorVersion — **무엇을 "언급"으로 셌는가**.
   *
   * ★ 이것도 비교 가능성 필드다. 판정기가 바뀌면 같은 원본 답변에서 나오는
   *   언급 수가 달라진다. 분자가 정의째로 바뀌는 것이라 `queryIds`와 똑같이
   *   다루지 않으면 판정기 개선이 고객 화면에서 "유의미한 상승"이 된다.
   */
  detectorVersion: number
  /**
   * 이 회차 **직전에 스냅샷이 없어 버려진 회차 수** (`toRunPoints`가 센다).
   *
   * ★ 시간 간격은 조건 비교로 보이지 않는다. 6/01 측정 → 6/08 스냅샷 저장 실패
   *   → 6/15 측정이면 `sameConditions`는 셋 다 같으니 "비교 가능"이 맞다.
   *   그런데 두 점 사이에는 **측정이 없던 한 주**가 있다. 서수 축(점을 등간격으로
   *   찍는 축)은 그 주를 통째로 감춘다 — 6/01과 6/15가 옆칸에 나란히 앉는다.
   *   여기서 세어 두지 않으면 화면이 그 사실을 알 방법이 없다.
   */
  skippedBefore: number
  result: AuditResult
}

/**
 * 회차 한 행 → 점 (스냅샷이 없으면 null).
 *
 * ★ **export하지 않는다.** 이 함수는 회차 하나만 보므로 `skippedBefore`에
 *   넣을 수 있는 값이 0뿐인데, 그 0은 "앞에 버려진 회차가 없다"는 **답이 아니라
 *   모름**이다. 밖으로 내보내면 `runs.map(toRunPoint)`가 언제나 손 닿는 곳에
 *   있고, 그렇게 부른 호출부는 간격 신호를 통째로 잃은 채 조용히 컴파일된다 —
 *   `load.ts`가 실제로 그렇게 하고 있었다. 공개 입구는 `toRunPoints` 하나다.
 */
function toRunPoint(
  run: Pick<CollectionRun, 'id' | 'startedAt' | 'planSnapshot' | 'result'>,
): RunPoint | null {
  const result = parseRunResult(run.result)
  if (!result) return null
  return {
    runId: run.id,
    measuredAt: run.startedAt.toISOString(),
    engines: [...run.planSnapshot.engines],
    competitors: [...run.planSnapshot.competitors],
    queryIds: [...run.planSnapshot.queryIds],
    detectorVersion: run.planSnapshot.detectorVersion,
    // 회차 하나만 보면 앞에 무엇이 버려졌는지 알 수 없다 — `toRunPoints`가 채운다.
    skippedBefore: 0,
    result,
  }
}

/**
 * 회차 목록(오래된 → 최신) → 추이 입력. **이 모듈의 유일한 공개 입구다.**
 * 한 회차씩 변환하는 것과 다른 점은 **버려진 회차를 세어 남긴다**는 것 하나다.
 *
 * ★ 스냅샷이 없는 회차(`succeeded` + `result IS NULL`, `failed`)는 여기서
 *   사라진다. 사라진 자리를 `skippedBefore`로 남기지 않으면, 화면은 일주일
 *   떨어진 두 점을 붙어 있는 두 점으로 그린다 — 각 점은 참인데 그 사이의
 *   "매주 재고 있다"는 인상이 거짓이 된다.
 */
export function toRunPoints(
  runs: readonly Pick<CollectionRun, 'id' | 'startedAt' | 'planSnapshot' | 'result'>[],
): RunPoint[] {
  const out: RunPoint[] = []
  let skipped = 0
  for (const run of runs) {
    const point = toRunPoint(run)
    if (!point) {
      skipped += 1
      continue
    }
    out.push({ ...point, skippedBefore: skipped })
    skipped = 0
  }
  return out
}

/** 순서 무관 문자열 집합 비교. 스냅샷이 정렬을 보장하지 않는 필드가 있다. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((v, i) => v === y[i])
}

/**
 * 두 회차가 **같은 조건에서 측정됐는가**. 여기 있는 셋 중 하나라도 다르면
 * 두 숫자의 차이는 브랜드의 변화가 아니라 설정의 변화다.
 *
 *   - `engines` — 잰 엔진이 다르면 분모가 다르다 (설계 ③, `judgeChange`와 동일)
 *   - `queryIds` — 물어본 질문이 다르면 분모가 다르다
 *   - `detectorVersion` — 무엇을 언급으로 세는지가 다르면 분자가 다르다
 *
 * ★ 이 판정은 **보수적**이다. 엔진이 하나 늘어난 경우 개별 엔진 계열의 분모는
 *   실제로 그대로지만, 그래도 끊는다. 잘못 이어 붙인 선(없는 상승)의 대가가
 *   한 번 끊긴 선의 대가보다 비교할 수 없이 크다 — 이 제품이 파는 것이
 *   정직한 측정이라서다.
 *
 * ★ 이 과잉 발화는 **의도된 것이고 테스트가 못 박는다**
 *   (`buildTrend(points, 'chatgpt')` 계열도 엔진 집합이 바뀌면 끊긴다).
 *   완화하고 싶으면 **이 함수 본문을 고치지 말고** 호출부가 넘기는 옵션
 *   (예: `sameConditions(prev, curr, { ignoreEngines: true })`)으로 하라 —
 *   그래야 어느 화면이 무엇을 포기했는지가 코드에 남는다. 본문에
 *   `engineId !== 'all'` 같은 특수 케이스를 넣으면 그 결정이 사라진다.
 */
function sameConditions(prev: RunPoint, curr: RunPoint): boolean {
  return (
    sameSet(prev.engines, curr.engines) &&
    sameSet(prev.queryIds, curr.queryIds) &&
    prev.detectorVersion === curr.detectorVersion
  )
}

export interface TrendPoint {
  runId: string
  measuredAt: string
  interval: Interval
  /**
   * 직전 추이 점과 같은 조건에서 측정됐는가 (`sameConditions`).
   *
   * ★ false면 화면은 **선을 끊어야 한다.** 점은 둘 다 참이지만 그 사이를 잇는
   *   선분은 거짓이다 — Starter→Business 업그레이드로 엔진이 늘거나(플랜의
   *   `engines`가 바뀐다), 운영자가 동결 질의를 고치거나, 판정기 버전이 오르면
   *   숫자는 브랜드와 무관하게 움직인다. 첫 점은 이을 대상이 없으므로 true다.
   */
  comparableWithPrev: boolean
  /**
   * 직전 추이 점과 이 점 **사이에서 통째로 빠진 회차 수**. 0이면 두 점은
   * 실제로 연속한 두 회차다. 첫 점은 이을 대상이 없으므로 0이다.
   *
   * ★ `comparableWithPrev`와 **다른 종류의 거짓말**을 막는다. 조건은 같은데
   *   (그래서 comparable=true) 그 사이 회차가 스냅샷 없이 죽었거나(n=0,
   *   `result IS NULL`, 실패) 하면, 두 점은 2주 떨어져 있는데 서수 축은
   *   나란히 붙여 그린다. "매주 재고 있다"는 인상이 거짓이 되는 자리다.
   *   화면은 이 값이 0이 아닌 구간에 연속성을 암시해선 안 된다 — 시간 축을
   *   쓰거나(간격이 저절로 벌어진다), 끊거나, 최소한 표시해야 한다.
   */
  runsSkippedBefore: number
}

/** 추이 계열. 'all' = citedRate, 엔진 id = byEngine — 없는 회차는 뺀다. */
export function buildTrend(
  points: readonly RunPoint[],
  engineId: string | 'all',
): TrendPoint[] {
  const out: TrendPoint[] = []
  // 비교 대상은 "직전 회차"가 아니라 **직전에 실제로 찍힌 점**이다. 빠진 회차
  // 너머로 조건 비교를 하지 않으면 끊어야 할 구간을 이어 버린다.
  let prev: RunPoint | null = null
  // 빠진 회차 수. 원인이 둘이다 — 스냅샷이 아예 없어 `points`에 못 들어온 회차
  // (`RunPoint.skippedBefore`가 실어 온다)와, 이 계열에서 n=0이라 빠지는 회차.
  // 화면에서는 구분되지 않는다: 둘 다 "그 주에는 잰 값이 없다"이다.
  let skipped = 0
  for (const p of points) {
    skipped += p.skippedBefore
    const interval = engineId === 'all' ? p.result.citedRate : p.result.byEngine[engineId]
    if (!interval || interval.n === 0) {
      skipped += 1
      continue
    }
    out.push({
      runId: p.runId,
      measuredAt: p.measuredAt,
      interval,
      comparableWithPrev: prev === null ? true : sameConditions(prev, p),
      runsSkippedBefore: prev === null ? 0 : skipped,
    })
    prev = p
    skipped = 0
  }
  return out
}

/** 스냅샷들에 등장한 엔진 id (등장 순서 유지) — 토글 목록의 근거 */
export function engineIdsIn(points: readonly RunPoint[]): string[] {
  const seen = new Set<string>()
  for (const p of points) for (const id of Object.keys(p.result.byEngine)) seen.add(id)
  return [...seen]
}

export interface HeatmapView {
  runs: { runId: string; measuredAt: string }[]
  rows: { queryText: string; cells: (Interval | null)[] }[]
}

/**
 * 질의 × 회차 히트맵 (스펙 ⑤ — "어느 질문에서 비는가"). 행 순서는 **최신
 * 회차의 byQuery 순서**(못 나오는 질문이 위)다. 과거 회차에 없던 질의는
 * null 셀 — "측정 없음"이지 0%가 아니다.
 */
export function buildHeatmap(points: readonly RunPoint[], maxRuns = 8): HeatmapView {
  const recent = points.slice(-maxRuns)
  const latest = recent[recent.length - 1]
  if (!latest) return { runs: [], rows: [] }
  const queryTexts = latest.result.byQuery.map((q) => q.queryText)
  return {
    runs: recent.map((p) => ({ runId: p.runId, measuredAt: p.measuredAt })),
    rows: queryTexts.map((queryText) => ({
      queryText,
      cells: recent.map((p) => {
        const hit = p.result.byQuery.find((q) => q.queryText === queryText)
        return hit && hit.interval.n > 0 ? hit.interval : null
      }),
    })),
  }
}

export interface SovPoint {
  runId: string
  measuredAt: string
  interval: Interval
  /**
   * 직전 SoV 점과 조건이 같은가 — 다르면 잇지도 비교하지도 않는다.
   * 추이(`sameConditions`)가 보는 셋 **위에 경쟁사 집합까지** 같아야 한다.
   */
  comparableWithPrev: boolean
  /**
   * 직전 SoV 점과 이 점 **사이에서 통째로 빠진 회차 수** (`TrendPoint`와 같은
   * 규칙, 첫 점은 0).
   *
   * ★ SoV 화면도 서수 축(점을 등간격으로 찍는 축)을 쓰므로 `TrendPoint`와
   *   **똑같은 함정** 위에 있다. 조건은 같아서 `comparableWithPrev`는 true인데
   *   두 점 사이에 잰 값이 없는 회차가 있으면, 2주가 1주로 보인다.
   *
   * ★ 여기서는 빠지는 원인이 **둘**이다 — 스냅샷이 없어 `points`에 아예 못
   *   들어온 회차(`RunPoint.skippedBefore`가 실어 온다), 그리고 이 계열에서
   *   `shareOfVoice.n === 0`이라 빠지는 회차. 후자는 답변이 없을 때만이 아니라
   *   **경쟁사를 하나도 등록하지 않은 회차 전부**에서 난다 (`metrics.ts`:
   *   경쟁사가 없으면 `wilsonInterval(0, 0)`). 경쟁사를 뒤늦게 등록한 고객은
   *   그 앞 회차가 통째로 사라지는데, 이 값이 없으면 화면은 그 사실을 모른 채
   *   첫 두 점을 나란히 붙여 그린다.
   */
  runsSkippedBefore: number
}

/**
 * 점유율 추이. SoV는 분모가 등록 경쟁사에 의존하는 유일한 지표라
 * (`PlanSnapshot.competitors` 주석), 집합이 바뀐 구간에는 비교를 걸지 않는다.
 * 경쟁사 집합만 보는 게 아니다 — 엔진·질의·판정기가 바뀌어도 SoV는 움직인다.
 *
 * 구조는 `buildTrend`와 같다 (빠진 회차를 세어 `runsSkippedBefore`로 남긴다).
 */
export function buildSovTrend(points: readonly RunPoint[]): SovPoint[] {
  const out: SovPoint[] = []
  // 비교 대상은 "직전 회차"가 아니라 **직전에 실제로 찍힌 점**이다.
  let prev: RunPoint | null = null
  // 빠진 회차 수. 원인이 둘이다 — 스냅샷이 아예 없어 `points`에 못 들어온 회차
  // (`RunPoint.skippedBefore`가 실어 온다)와, 여기서 n=0이라 빠지는 회차.
  let skipped = 0
  for (const p of points) {
    skipped += p.skippedBefore
    const interval = p.result.shareOfVoice
    if (interval.n === 0) {
      skipped += 1
      continue
    }
    out.push({
      runId: p.runId,
      measuredAt: p.measuredAt,
      interval,
      comparableWithPrev:
        prev === null
          ? true
          : sameConditions(prev, p) && sameSet(prev.competitors, p.competitors),
      runsSkippedBefore: prev === null ? 0 : skipped,
    })
    prev = p
    skipped = 0
  }
  return out
}

export interface SourceChangeRow {
  domain: string
  /**
   * `SourceStat.owner`를 그대로 통과시킨다.
   *
   * ★ `'self' | 'competitor' | null`이 **아니다.** 2단계 `aggregateSources`는
   *   소유를 모르는 도메인에 null이 아니라 `'third-party'`를 넣는다. 여기서
   *   null로 좁히면 남의 사이트와 판정 불가가 한 값으로 뭉개져, "AI가 읽는
   *   출처" 표에서 자사·경쟁사·제3자를 갈라 보여줄 수 없게 된다.
   */
  owner: SourceOwner
  /**
   * 이 회차가 **자사 도메인을 알고 있었는가** (`AuditResult.hasSelfDomains`).
   *
   * ★ false면 `owner: 'third-party'`를 "남의 사이트"로 읽으면 안 된다.
   *   `aggregateSources`는 `'third-party'`를 순수한 fallthrough로 넣는다 —
   *   `selfDomains`가 비어 있으면 **고객 본인 사이트까지 전부** 'third-party'다.
   *   `hasSelfDomains`가 존재하는 이유가 정확히 이것이고("인용되지 않았다" vs
   *   "도메인을 몰라서 못 셌다"), 그 주석은 "화면이 이 둘을 반드시 갈라야
   *   한다"고 못 박는다. 이 값이 false인데 표가 "제3자"라고 단정하면
   *   고객 자기 사이트를 남의 것이라고 말하는 화면이 된다.
   */
  selfDomainsKnown: boolean
  /** 최신 회차에서 이 도메인이 인용된 답변 수 */
  answers: number
  /** 직전 회차의 값. 그 회차에 없던 도메인이면 null */
  prevAnswers: number | null
  /**
   * 최신 회차와 직전 회차가 **같은 조건에서 측정됐는가** (`sameConditions`).
   *
   * ★ false면 화면은 `prevAnswers → answers` 화살표(증가/감소)를 그려선 안
   *   된다. 질의를 셋 더 넣은 다음 회차는 출처 인용 수가 당연히 늘고, 판정기가
   *   바뀌면 무엇을 인용으로 셌는지가 바뀐다 — "2 → 5"는 브랜드가 한 일이
   *   아니라 설정 변경이다. 언급률 추이는 `comparableWithPrev`로 선을 끊는데
   *   출처 표만 화살표를 그리면, 같은 거짓말이 표 모양으로 나갈 뿐이다.
   *
   * ★ 직전 회차가 아예 없으면 false다 — 비교 자체가 없다. (이 경우
   *   `prevAnswers`는 전부 null이라 화면은 어차피 "새로 등장"을 쓴다.)
   *   `prevAnswers`를 null로 뭉개지 **않는** 이유가 이것이다: "직전에 없던
   *   도메인"과 "비교할 수 없는 회차"는 다른 사실이고, null 하나로 합치면
   *   화면이 멀쩡히 있던 도메인을 "새로 등장"이라고 말하게 된다.
   */
  comparableWithPrev: boolean
}

/** 출처 상위 변화 (스펙 ⑤ — 도메인별 인용 수). 최신 회차 상위 topN 기준. */
export function buildSourceChanges(points: readonly RunPoint[], topN = 8): SourceChangeRow[] {
  const latest = points[points.length - 1]
  if (!latest) return []
  const prev = points[points.length - 2]
  const prevByDomain = new Map((prev?.result.sources ?? []).map((s) => [s.domain, s.answers]))
  const selfDomainsKnown = latest.result.hasSelfDomains === true
  const comparableWithPrev = prev !== undefined && sameConditions(prev, latest)
  return latest.result.sources.slice(0, topN).map((s) => ({
    domain: s.domain,
    owner: s.owner,
    selfDomainsKnown,
    answers: s.answers,
    prevAnswers: prevByDomain.get(s.domain) ?? null,
    comparableWithPrev,
  }))
}

export interface Headline {
  latest: RunPoint | null
  prev: RunPoint | null
  verdict: ChangeVerdict
}

/** 최신 언급률 + 직전 회차 대비 판정. 판정은 judgeChange 하나로만 한다. */
export function buildHeadline(points: readonly RunPoint[]): Headline {
  const latest = points[points.length - 1] ?? null
  const prev = points[points.length - 2] ?? null
  if (!latest) return { latest: null, prev: null, verdict: 'incomparable' }
  // ★ 질의 집합·판정기 버전은 `judgeChange`가 모르는 조건이다 (그 함수는 엔진만
  //   본다). 여기서 먼저 끊지 않으면 운영자의 질의 수정 한 번이 고객 화면에
  //   "통계적으로 유의미한 상승입니다"로 나간다 — 브랜드는 아무것도 하지 않았는데.
  if (prev && !sameConditions(prev, latest)) {
    return { latest, prev, verdict: 'incomparable' }
  }
  const verdict = judgeChange(prev?.result.citedRate ?? null, latest.result.citedRate, {
    ...(prev ? { prevEngines: prev.engines } : {}),
    currEngines: latest.engines,
  })
  return { latest, prev, verdict }
}

export interface RunListItem {
  runId: string
  startedAt: string
  status: RunStatus
  /**
   * 스냅샷이 있는가. ★ `status === 'succeeded'`인데 false일 수 있다 —
   * `parseRunResult` 주석 참고. 화면은 이 회차를 "스냅샷 없음"으로 써야 하고,
   * 0%로 그리거나 목록에서 감춰선 안 된다.
   */
  hasResult: boolean
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/dashboard`
Expected: PASS (12 tests)

- [ ] **Step 7: DB 로더 — `src/lib/dashboard/load.ts`**

```ts
import { and, eq, gte } from 'drizzle-orm'
import type { AuditResult } from '@/lib/audit/result'
import { db, schema } from '@/lib/db'
import type { Brand } from '@/lib/db/schema'
import { resolveLimits } from '@/lib/plans'
import { parseRunResult, toRunPoints, type RunListItem, type RunPoint } from './data'

/**
 * 대시보드 DB 로더. 조립은 전부 `./data`(순수)가 하고 여기서는 읽기만 한다 —
 * 그래야 `data.ts`가 클라이언트 컴포넌트에서도 import 가능한 채로 남는다.
 */

export interface DashboardData {
  brands: { id: string; name: string }[]
  selected: Brand | null
  /** result 스냅샷이 있는 회차 — 오래된 → 최신 */
  points: RunPoint[]
  /** 전체 회차 — 최신 → 오래된 (실패 회차 포함 — 감추지 않는다) */
  runList: RunListItem[]
}

export async function loadDashboard(
  userId: string,
  brandId: string | undefined,
): Promise<DashboardData> {
  const brandRows = await db
    .select()
    .from(schema.brands)
    .where(and(eq(schema.brands.userId, userId), eq(schema.brands.isActive, true)))
    .orderBy(schema.brands.createdAt)
  const selected = brandRows.find((b) => b.id === brandId) ?? brandRows[0] ?? null
  const brands = brandRows.map((b) => ({ id: b.id, name: b.name }))
  if (!selected) return { brands, selected: null, points: [], runList: [] }

  const subscription = await db.query.subscriptions.findFirst({
    where: eq(schema.subscriptions.userId, userId),
  })
  // 이력 창 = 플랜의 historyMonths (null이면 무제한). 달력 월이 아니라 30일
  // 근사다 — 경계에서 하루 이틀 차이는 제품 약속("3개월")을 해치지 않는다.
  //
  // ★ 구독 조회에 status 필터가 **없다.** 의도된 정책이다 — 해지한 고객도
  //   자기가 돈 내고 받은 측정 이력을 그대로 본다. 정직한 측정을 소급해서
  //   감추지 않는다 (`revokePlan`은 행을 지우지 않고 status만 'canceled'로
  //   바꾼다). 이 정책은 `load.test.ts`가 못 박는다.
  //
  // ★ 구독 행이 없는 경우는 **도달하지 않는다.** `subscriptions.userId`는
  //   `onDelete: 'restrict'`라 행이 사라지지 않고, 구독이 없는 사용자는
  //   `createBrandAction`이 'no-plan'으로 막아 브랜드를 못 만들며, 브랜드가
  //   없으면 위 `if (!selected)`에서 이미 돌아간다.
  //
  //   그래서 **기본값을 두지 않고 던진다.** 여기에 `?? null`(무제한)이나
  //   `?? 0`(전부 숨김)을 두면, 도달 불가능하다던 분기가 언젠가 도달됐을 때
  //   (예: 무료 대시보드가 열리는 날) 아무 소리 없이 정책을 하나 만들어 낸다 —
  //   무료 사용자에게 무제한 이력을 주거나, 돈 낸 고객의 회차를 통째로 감추거나.
  //   이력 창은 **플랜에서만** 나온다. 플랜이 없으면 답이 없는 것이지
  //   기본값이 있는 게 아니다.
  if (!subscription) {
    throw new Error(`대시보드: 브랜드는 있는데 구독 행이 없습니다 (userId=${userId})`)
  }
  const months = resolveLimits(subscription.plan, subscription.queryPacks).historyMonths
  const conditions = [eq(schema.collectionRuns.brandId, selected.id)]
  if (months !== null) {
    conditions.push(
      gte(
        schema.collectionRuns.startedAt,
        new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000),
      ),
    )
  }
  const runs = await db
    .select()
    .from(schema.collectionRuns)
    .where(and(...conditions))
    .orderBy(schema.collectionRuns.startedAt)

  return {
    brands,
    selected,
    // ★ 회차를 한 건씩 변환해 `filter`하는 것이 아니다. 스냅샷이 없어 버려진 회차의
    //   **자리**를 `skippedBefore`로 남겨야, 화면이 2주 떨어진 두 점을 붙어
    //   있는 두 점으로 그리지 않는다 (`toRunPoints` 주석).
    points: toRunPoints(runs),
    runList: [...runs].reverse().map((r) => ({
      runId: r.id,
      startedAt: r.startedAt.toISOString(),
      status: r.status,
      // ★ status가 아니라 스냅샷 유무로 판단한다. 측정은 성공했는데 스냅샷
      //   저장만 실패한 회차(`succeeded` + `result IS NULL`)가 실제로 존재한다 —
      //   `parseRunResult` 주석 참고.
      hasResult: parseRunResult(r.result) !== null,
    })),
  }
}

/** 회차 상세 — ★ 본인 소유 브랜드의 회차만 (세션 검증은 호출한 페이지가 한다). */
export async function loadRunDetail(
  userId: string,
  runId: string,
): Promise<{ brandName: string; startedAt: string; result: AuditResult } | null> {
  const rows = await db
    .select({ run: schema.collectionRuns, brand: schema.brands })
    .from(schema.collectionRuns)
    .innerJoin(schema.brands, eq(schema.collectionRuns.brandId, schema.brands.id))
    .where(and(eq(schema.collectionRuns.id, runId), eq(schema.brands.userId, userId)))
    .limit(1)
  const hit = rows[0]
  if (!hit) return null
  const result = parseRunResult(hit.run.result)
  if (!result) return null
  return { brandName: hit.brand.name, startedAt: hit.run.startedAt.toISOString(), result }
}
```

- [ ] **Step 8: 검증 + 커밋**

Run: `pnpm vitest run src/lib/dashboard src/lib/stats src/components/audit` && `pnpm typecheck`
Expected: PASS

```bash
git add src/lib/dashboard src/lib/stats/change-copy.ts src/lib/stats/change-copy.test.ts src/components/audit/result-view.tsx
git commit -m "feat(dashboard): 스냅샷 기반 데이터 조립 — 추이·히트맵·SoV·출처 변화·헤드라인 (순수) + 변화 문장 공용화"
```

---

### Task 9: 대시보드 화면 A — 헤드라인·추이 차트·히트맵

스펙 ⑤의 상반부. **`docs/design-language.md` §3·§4·§5가 바인딩** — 점+오차
밴드, 엔진 토글, 마커 모양, 히트맵 스케일(`P = round(6 + 74 × point)`),
reduced-motion 전역 규칙. `IntervalBar`를 공용으로 추출해 리포트와 대시보드가
같은 구간 표기를 쓴다.

★ **이 태스크의 가장 중요한 규칙: 추이 차트는 끊이지 않는 선을 그리지 않는다.**
Task 8의 `TrendPoint`는 그 판단에 필요한 값 둘을 이미 들고 온다.

- `comparableWithPrev === false` — 엔진 구성·질의 집합·판정기 버전 중 하나가
  바뀐 회차다. 분모나 분자의 **정의**가 달라졌으므로 두 숫자의 차이는 브랜드의
  변화가 아니라 설정의 변화다. Starter→Business 업그레이드(엔진 추가), 운영자의
  동결 질의 수정(스펙 ②의 지원 경로), 판정기 개선 — 셋 다 실제로 일어난다.
- `runsSkippedBefore > 0` — 두 점 **사이에 잰 값이 없는 회차**가 그만큼 있다.
  조건이 같아 `comparableWithPrev`는 true인데도 그렇다. 등간격 서수 축은 2주
  떨어진 두 점을 옆칸에 붙여 그려 "매주 재고 있다"는 인상을 만든다.

두 경우 모두 **선분도 오차 밴드도 잇지 않고**, 왜 끊겼는지를 캡션에 쓴다.
`buildTrend`의 결과를 폴리라인 하나로 이어 버리면 — 각 점은 참인데 그 사이
선분만 거짓인 — 이 제품이 팔지 않기로 한 종류의 그림이 나온다. 말없이 끊긴
선은 버그로 읽히므로 이유 문장은 선택이 아니다.

**Files:**
- Create: `src/components/interval-bar.tsx` (result-view에서 추출)
- Modify: `src/components/audit/result-view.tsx` (로컬 IntervalBar 삭제 → import)
- Modify: `src/app/globals.css` (reduced-motion 전역 규칙 — 디자인 언어 §5)
- Create: `src/components/dashboard/headline-card.tsx`
- Create: `src/components/dashboard/trend-chart.tsx` (client)
- Create: `src/components/dashboard/query-heatmap.tsx`
- Create: `src/components/dashboard/brand-picker.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (통째로 교체)
- Test: `src/components/dashboard/trend-chart.test.tsx`, `src/components/dashboard/query-heatmap.test.tsx`

**Interfaces:**
- Consumes: Task 8의 `RunPoint`·`buildTrend`·`engineIdsIn`·`buildHeatmap`·
  `buildHeadline`·`loadDashboard`, `changeSentence`, `engineLabel`,
  `formatPercent`·`formatInterval`, Task 3의 `loadOnboardingGate`
- Produces:
  - `IntervalBar({ interval }: { interval: Interval })` — result-view의 것과 동일 시그니처
  - `HeadlineCard({ points }: { points: RunPoint[] })`
  - `TrendChart({ points }: { points: RunPoint[] })`
  - `QueryHeatmap({ points }: { points: RunPoint[] })`
  - `BrandPicker({ brands, selectedId, canAdd }: { brands: { id: string; name: string }[]; selectedId: string; canAdd: boolean })`

- [ ] **Step 1: IntervalBar 추출**

`src/components/interval-bar.tsx` 생성 — `result-view.tsx`의 `IntervalBar`를
주석 포함 문자 그대로 옮기고 `export`를 붙인다. `result-view.tsx`는 로컬 정의를
지우고 `import { IntervalBar } from '@/components/interval-bar'`.

Run: `pnpm vitest run src/components/audit` → PASS (기존 테스트가 추출 무결성을 지킨다)

- [ ] **Step 2: reduced-motion 전역 규칙 — `src/app/globals.css`**

`@layer base` 블록 끝에 추가 (디자인 언어 §5의 코드 그대로):

```css
  /* 모션 전역 스위치 — docs/design-language.md §5. 움직임을 줄여 달라는
     사용자에게는 전부 끈다. 개별 컴포넌트가 각자 기억할 일이 아니다. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
```

- [ ] **Step 3: 실패하는 테스트 — 차트·히트맵**

`src/components/dashboard/trend-chart.test.tsx`:

```tsx
// @vitest-environment jsdom
// ★ 위 지시자와 아래 두 줄은 이 저장소의 컴포넌트 테스트 규약이다
//   (`vitest.config.ts`의 `environment: 'node'` 주석 · 기존 `result-view.test.tsx`).
//   빠뜨리면 `tsc`는 통과하는데 실행이 깨진다 — jsdom 지시자가 없으면
//   `document is not defined`, jest-dom import가 없으면 `toBeInTheDocument` 없음,
//   `afterEach(cleanup)`이 없으면 앞 테스트의 DOM이 남아 `getBy*`가 중복으로 던진다.
//   지시자는 **파일 첫 줄**이어야 한다.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'
import type { RunPoint } from '@/lib/dashboard/data'
import { TrendChart } from './trend-chart'

afterEach(cleanup)

// ★ RunPoint는 `queryIds`·`detectorVersion`·`skippedBefore`까지 **필수**다
//   (Task 8 Interfaces). 빠뜨리면 TS2322이고, 기본값을 지어 넣으면 조건 변경과
//   빠진 회차가 픽스처에서 관측 불가능해진다 — 이 파일이 검증할 대상 그 자체다.
function point(runId: string, k: number, over: Partial<RunPoint> = {}): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt', 'gemini'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 60, citedRate: wilsonInterval(k, 60), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [],
    byEngine: { chatgpt: wilsonInterval(k, 30), gemini: wilsonInterval(k, 30) },
    byQuery: [], sources: [],
    sourceSummary: { totalAnswers: 60, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId, measuredAt: result.measuredAt, engines: result.engines, competitors: [],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0, result, ...over,
  }
}

describe('TrendChart', () => {
  test('빈 상태는 방향을 준다', () => {
    render(<TrendChart points={[]} />)
    expect(screen.getByText(/첫 측정이 끝나면/)).toBeInTheDocument()
  })

  test('점과 오차 밴드를 함께 그린다 — 밴드 없는 점은 없다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(2)
    expect(container.querySelector('[data-testid="trend-band"]')).not.toBeNull()
  })

  test('조건이 같으면 선을 잇는다 — 멀쩡한 선을 괜히 끊지 않는다', () => {
    const { container } = render(<TrendChart points={[point('r1', 20), point('r2', 25)]} />)
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(1)
    expect(screen.queryByText(/비교하지 않습니다/)).toBeNull()
  })

  /**
   * ★ 두 점은 참인데 그 사이 선분이 거짓인, 가장 알아채기 어려운 종류의 거짓말.
   *   질의 집합이 바뀐 회차끼리는 `citedRate`의 분모가 다르다 — 운영자가 동결
   *   질의를 한 줄 고친 다음 주에 고객이 "올랐다"고 읽으면 안 된다.
   *   두 점이 각각 1점짜리 구간으로 갈리므로 선분은 0개다.
   */
  test('조건이 바뀐 구간은 선을 끊고 이유를 화면에 쓴다', () => {
    const { container } = render(
      <TrendChart points={[point('r1', 20), point('r2', 25, { queryIds: ['q1', 'q9'] })]} />,
    )
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0)
    expect(screen.getByText(/비교하지 않습니다/)).toBeInTheDocument()
  })

  /**
   * ★ `comparableWithPrev`와 다른 종류의 문제다. 조건은 같으니 비교는 가능한데,
   *   두 점 사이에 **잰 값이 없는 회차**가 있다. 서수 축은 2주 떨어진 두 점을
   *   옆칸에 붙여 그려 "매주 재고 있다"는 인상을 만든다.
   */
  test('빠진 회차가 있으면 그 구간도 잇지 않는다', () => {
    const { container } = render(
      <TrendChart points={[point('r1', 20), point('r3', 25, { skippedBefore: 1 })]} />,
    )
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(0)
    expect(screen.getByText(/측정이 없던/)).toBeInTheDocument()
  })

  test('엔진 토글이 있고 계측값 요약이 aria로 노출된다', () => {
    render(<TrendChart points={[point('r1', 20)]} />)
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT' }))
    expect(screen.getByRole('img')).toHaveAccessibleName(/ChatGPT/)
  })
})
```

`src/components/dashboard/query-heatmap.test.tsx`:

```tsx
// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (`trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'
import type { RunPoint } from '@/lib/dashboard/data'
import { QueryHeatmap } from './query-heatmap'

afterEach(cleanup)

function point(runId: string, byQuery: AuditResult['byQuery']): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [], byEngine: {}, byQuery, sources: [],
    sourceSummary: { totalAnswers: 6, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  // RunPoint의 필수 필드 — Task 8 Interfaces 참고 (빠뜨리면 TS2322).
  return {
    runId, measuredAt: result.measuredAt, engines: ['chatgpt'], competitors: [],
    queryIds: ['q1'], detectorVersion: 1, skippedBefore: 0, result,
  }
}

describe('QueryHeatmap', () => {
  test('셀에 k/n을 표기한다 — 분모가 곧 오차의 크기', () => {
    render(<QueryHeatmap points={[point('r1', [{ queryText: 'q-a', interval: wilsonInterval(2, 6) }])]} />)
    expect(screen.getByText('2/6')).toBeInTheDocument()
  })

  test('측정 없는 셀은 — 로 표기한다 (0%가 아니다)', () => {
    const p1 = point('r1', [{ queryText: 'q-old', interval: wilsonInterval(1, 6) }])
    const p2 = point('r2', [
      { queryText: 'q-old', interval: wilsonInterval(1, 6) },
      { queryText: 'q-new', interval: wilsonInterval(0, 6) },
    ])
    render(<QueryHeatmap points={[p1, p2]} />)
    expect(screen.getByLabelText('측정 없음')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `pnpm vitest run src/components/dashboard`
Expected: FAIL — 컴포넌트 없음

- [ ] **Step 5: 구현 — `src/components/dashboard/trend-chart.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { buildTrend, engineIdsIn, type RunPoint, type TrendPoint } from '@/lib/dashboard/data'
import { engineLabel } from '@/lib/plans'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 추이 차트 — 점 + 오차 밴드 (디자인 언어 §4.1). 점만 찍고 구간을 감추지
 * 않는다. 의존성 없음 — 수제 SVG (IntervalBar 전례).
 *
 * ★ **선을 끊어야 하는 자리가 둘 있다.** 점은 전부 참인데 그 사이를 잇는
 *   선분이 거짓인, 가장 알아채기 어려운 종류의 거짓말을 막는 장치다.
 *     - `comparableWithPrev === false` — 엔진 구성·질의 집합·판정기 버전이
 *       바뀌었다. 분모나 분자의 정의가 달라졌으므로 두 숫자의 차이는 브랜드의
 *       변화가 아니라 설정의 변화다.
 *     - `runsSkippedBefore > 0` — 그 사이에 잰 값이 없는 회차가 있다. 조건은
 *       같아서 비교는 가능하지만, 등간격 서수 축이 2주를 1주로 보이게 한다.
 *   두 경우 모두 **선분도 오차 밴드도 잇지 않고**, 왜 끊겼는지를 캡션에 쓴다.
 *   말없이 끊긴 선은 버그로 읽힌다.
 */

const ENGINE_COLOR: Record<string, string> = {
  chatgpt: 'var(--color-engine-chatgpt)',
  gemini: 'var(--color-engine-gemini)',
  naver: 'var(--color-engine-naver)',
  google_aio: 'var(--color-engine-google)',
}

const W = 640
const H = 220
const PAD = { top: 12, right: 12, bottom: 26, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

function mmdd(iso: string): string {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`
}

/**
 * 이을 수 있는 구간으로 자른다. 반환은 **전역 인덱스**의 묶음이다 — x 좌표는
 * 계열 전체에서의 위치로 정해야 구간이 갈려도 점이 제자리에 남는다.
 */
function segmentsOf(series: TrendPoint[]): number[][] {
  const out: number[][] = []
  series.forEach((p, i) => {
    const breaks = !p.comparableWithPrev || p.runsSkippedBefore > 0
    if (i === 0 || breaks) out.push([i])
    else out[out.length - 1]!.push(i)
  })
  return out
}

/** gemini/google은 휘도가 붙는다 — 색과 함께 마커 모양으로 가른다 (§2). */
function Marker({ engine, cx, cy, color }: { engine: string; cx: number; cy: number; color: string }) {
  const common = { fill: color, 'data-testid': 'trend-point' } as const
  switch (engine) {
    case 'gemini':
      return <rect {...common} x={cx - 3.5} y={cy - 3.5} width={7} height={7} />
    case 'naver':
      return <rect {...common} x={cx - 4} y={cy - 4} width={8} height={8} transform={`rotate(45 ${cx} ${cy})`} />
    case 'google_aio':
      return <polygon {...common} points={`${cx},${cy - 4.5} ${cx + 4.5},${cy + 4} ${cx - 4.5},${cy + 4}`} />
    default:
      return <circle {...common} cx={cx} cy={cy} r={4} />
  }
}

export function TrendChart({ points }: { points: RunPoint[] }) {
  const engines = engineIdsIn(points)
  const [engine, setEngine] = useState<'all' | string>('all')
  const series: TrendPoint[] = buildTrend(points, engine)
  const color = engine === 'all' ? 'var(--primary)' : (ENGINE_COLOR[engine] ?? 'var(--primary)')
  const label = engine === 'all' ? '전체' : engineLabel(engine)

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
        아직 측정 회차가 없습니다. 첫 측정이 끝나면 점이 하나 찍힙니다 — 점 하나로는 변화를
        말할 수 없고, 회차가 쌓일수록 구간이 좁아집니다.
      </p>
    )
  }

  const n = series.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const latest = series[n - 1]
  const segments = segmentsOf(series)
  // 왜 끊겼는지를 캡션에 쓴다 — 말없이 끊긴 선은 버그로 읽힌다.
  const hasConditionBreak = series.some((p, i) => i > 0 && !p.comparableWithPrev)
  const hasGap = series.some((p) => p.runsSkippedBefore > 0)

  /** 한 구간의 오차 밴드 — 위쪽 경계를 따라가고 아래쪽 경계로 되짚어 닫는다. */
  const bandPathOf = (idx: number[]) =>
    `M ${idx.map((i) => `${x(i)},${y(series[i]!.interval.upper)}`).join(' L ')} L ${[...idx]
      .reverse()
      .map((i) => `${x(i)},${y(series[i]!.interval.lower)}`)
      .join(' L ')} Z`

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="엔진 선택">
        {(['all', ...engines] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setEngine(id)}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors duration-[120ms] ${
              engine === id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {id !== 'all' && (
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: ENGINE_COLOR[id] ?? 'var(--primary)' }}
              />
            )}
            {id === 'all' ? '전체' : engineLabel(id)}
          </button>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full transition-opacity duration-[240ms]"
        role="img"
        aria-label={
          latest
            ? `${label} 언급률 추이 — 최신 ${formatPercent(latest.interval.point)} (${formatInterval(latest.interval)})`
            : `${label} 언급률 추이 — 표시할 회차 없음`
        }
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={11}>
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        {/* 오차 밴드 — 점보다 먼저(아래에) 그린다. ★ 구간마다 따로 그린다:
            선만 끊고 밴드를 통째로 이으면 같은 거짓말이 띠 모양으로 남는다. */}
        {segments.map((idx) =>
          idx.length > 1 ? (
            <path
              key={`band-${idx[0]}`}
              d={bandPathOf(idx)}
              fill={color}
              opacity={0.14}
              data-testid="trend-band"
            />
          ) : (
            <rect
              key={`band-${idx[0]}`}
              data-testid="trend-band"
              x={x(idx[0]!) - 5}
              y={y(series[idx[0]!]!.interval.upper)}
              width={10}
              height={Math.max(
                y(series[idx[0]!]!.interval.lower) - y(series[idx[0]!]!.interval.upper),
                1,
              )}
              fill={color}
              opacity={0.25}
            />
          ),
        )}

        {/* ★ 계열 전체를 잇는 폴리라인 하나가 아니다. 조건이 바뀌었거나
            (`comparableWithPrev === false`) 그 사이 회차가 빠진
            (`runsSkippedBefore > 0`) 자리에서는 선분이 없다. */}
        {segments.map((idx) =>
          idx.length > 1 ? (
            <path
              key={`line-${idx[0]}`}
              data-testid="trend-line"
              d={`M ${idx.map((i) => `${x(i)},${y(series[i]!.interval.point)}`).join(' L ')}`}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
            />
          ) : null,
        )}

        {series.map((p, i) => (
          <g key={p.runId}>
            <Marker engine={engine} cx={x(i)} cy={y(p.interval.point)} color={color} />
            <title>{`${mmdd(p.measuredAt)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)}) · ${p.interval.k}/${p.interval.n}`}</title>
          </g>
        ))}

        {series.map((p, i) => (
          <text key={p.runId} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={11}>
            {mmdd(p.measuredAt)}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        점은 회차별 언급률, 띠는 95% 신뢰구간입니다. 구간이 겹치는 변화는 변화로 읽지 마세요.
        {hasConditionBreak &&
          ' 선이 끊긴 자리는 측정 조건(엔진 구성·질의 집합·판정기 버전)이 바뀐 곳입니다 — 분모나 분자의 정의가 달라져 앞뒤를 비교하지 않습니다.'}
        {hasGap &&
          ' 측정이 없던 회차가 있는 구간도 잇지 않습니다 — 점 사이 간격이 실제로 지난 기간과 다릅니다.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: 구현 — `src/components/dashboard/query-heatmap.tsx`**

```tsx
import { buildHeatmap, type RunPoint } from '@/lib/dashboard/data'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 질의 × 회차 히트맵 (디자인 언어 §4.2). 채움은 --primary 단색 램프
 * (P = round(6 + 74 × point)) — 방향이 아니라 강도다. 셀 텍스트는 k/n —
 * 분모가 곧 오차의 크기라서 퍼센트 대신 쓴다.
 */
export function QueryHeatmap({ points }: { points: RunPoint[] }) {
  const heat = buildHeatmap(points, 8)
  if (heat.runs.length === 0) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
              질문 · 못 나오는 것부터
            </th>
            {heat.runs.map((r) => (
              <th key={r.runId} scope="col" className="px-2 py-2.5 text-center font-mono text-xs font-normal text-muted-foreground">
                {`${r.measuredAt.slice(5, 7)}.${r.measuredAt.slice(8, 10)}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.queryText}`} className="border-b border-border last:border-b-0">
              <th scope="row" className="max-w-64 truncate px-4 py-2 text-left text-sm font-normal">
                {row.queryText}
              </th>
              {row.cells.map((cell, i) => {
                const run = heat.runs[i]!
                if (cell === null) {
                  return (
                    <td key={run.runId} aria-label="측정 없음" className="px-2 py-2 text-center font-mono text-xs text-muted-foreground">
                      —
                    </td>
                  )
                }
                const p = Math.round(6 + 74 * cell.point)
                return (
                  <td
                    key={run.runId}
                    className="px-2 py-2 text-center font-mono text-xs tabular-nums"
                    style={{
                      background: `color-mix(in oklab, var(--primary) ${p}%, transparent)`,
                      color: p >= 50 ? 'var(--primary-foreground)' : 'var(--foreground)',
                    }}
                    title={`${row.queryText} · ${run.measuredAt.slice(5, 7)}.${run.measuredAt.slice(8, 10)} · ${formatPercent(cell.point)} (${formatInterval(cell)})`}
                  >
                    {cell.k}/{cell.n}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7: 구현 — 헤드라인 카드·브랜드 선택**

`src/components/dashboard/headline-card.tsx`:

```tsx
import { IntervalBar } from '@/components/interval-bar'
import { buildHeadline, type RunPoint } from '@/lib/dashboard/data'
import { changeSentence } from '@/lib/stats/change-copy'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/** 최신 언급률 + 구간 헤드라인 — 리포트 요약 카드와 같은 문법 (§3). */
export function HeadlineCard({ points }: { points: RunPoint[] }) {
  const { latest, prev, verdict } = buildHeadline(points)
  if (!latest) return null
  const ci = latest.result.citedRate
  return (
    <section className="rounded-lg border border-border bg-card p-6 sm:p-7">
      <p className="text-sm text-muted-foreground">AI 답변에 인용된 비율 — 최신 회차</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-5xl font-semibold tracking-tighter tabular-nums">
          {formatPercent(ci.point)}
        </span>
        <span className="font-mono text-sm text-muted-foreground">{formatInterval(ci)}</span>
      </div>
      <div className="mt-4">
        <IntervalBar interval={ci} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {prev === null
          ? '첫 회차입니다 — 변화 판정은 다음 측정부터 가능합니다.'
          : changeSentence(verdict)}
      </p>
    </section>
  )
}
```

`src/components/dashboard/brand-picker.tsx`:

```tsx
import Link from 'next/link'

export function BrandPicker({
  brands,
  selectedId,
  canAdd,
}: {
  brands: { id: string; name: string }[]
  selectedId: string
  canAdd: boolean
}) {
  if (brands.length <= 1 && !canAdd) return null
  return (
    <nav aria-label="브랜드 선택" className="flex flex-wrap gap-1.5">
      {brands.map((b) => (
        <Link
          key={b.id}
          href={`/dashboard?brand=${b.id}`}
          aria-current={b.id === selectedId ? 'page' : undefined}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors duration-[120ms] ${
            b.id === selectedId
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          {b.name}
        </Link>
      ))}
      {canAdd && (
        <Link
          href="/onboarding"
          className="rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          + 브랜드 추가
        </Link>
      )}
    </nav>
  )
}
```

- [ ] **Step 8: 대시보드 페이지 교체 — `src/app/(app)/dashboard/page.tsx`**

★ 게이트는 Task 4의 `resolveDashboardEntry`를 그대로 쓴다 — `needs-onboarding`
문자열만 보고 튕기면 "미동결 브랜드 + 동결 브랜드 0" 계정이 온보딩과 대시보드
사이에 갇힌다(Task 4가 막은 함정). 튕기는 것은 동결 브랜드가 0일 때뿐이고,
미동결 브랜드는 배너로 안내한다. 아래 코드는 구현과 바이트 단위로 같다.

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandPicker } from '@/components/dashboard/brand-picker'
import { HeadlineCard } from '@/components/dashboard/headline-card'
import { QueryHeatmap } from '@/components/dashboard/query-heatmap'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { Button } from '@/components/ui/button'
import { loadDashboard } from '@/lib/dashboard/load'
import { queriesStepPath } from '@/lib/onboarding/editor'
import { loadOnboardingGate } from '@/lib/onboarding/gate'
import { resolveDashboardEntry } from '@/lib/onboarding/state'

export const metadata = { title: '대시보드' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  // requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 규칙).
  const gate = await loadOnboardingGate()
  // ★ 강제 리다이렉트 판정은 순수 함수가 한다 (Task 4). 튕기는 것은 "측정 중인
  //   것이 하나도 없을 때"뿐이다 — 미동결 브랜드가 있어도 동결된 브랜드가 있으면
  //   대시보드를 그리고 배너로 안내한다 (state.ts `resolveDashboardEntry` 주석).
  const entry = resolveDashboardEntry({
    state: gate.state,
    pendingBrandId: gate.pendingBrandId,
    frozenBrandCount: gate.frozenBrandCount,
  })
  if (entry.kind === 'redirect') redirect(entry.to)

  if (gate.state === 'no-plan') {
    // 기존 빈 대시보드 유지 (스펙 ② — 플랜 없는 계정은 무료 진단 안내).
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground">
          {gate.user.name}님, 정기 측정은 구독 고객에게 열려 있습니다. 지금 바로 받을 수 있는
          것은 무료 진단입니다 — 계정과는 별개로 동작하며, 결과는 메일로 갑니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href="/audit/new">무료 진단 받기</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/pricing">요금제 보기</Link>
          </Button>
        </div>
      </div>
    )
  }

  const { brand } = await searchParams
  const data = await loadDashboard(gate.user.id, brand)
  if (!data.selected) redirect('/onboarding')
  const canAdd = gate.limits !== null && data.brands.length < gate.limits.maxBrands

  return (
    <div className="space-y-10">
      {entry.pendingBrandId && (
        // 튕기지 않고 알린다 (Task 4). 이미 측정 중인 브랜드가 있으므로 대시보드를
        // 막을 이유가 없고, 그렇다고 미동결 브랜드를 잊게 두면 그 브랜드는 영영
        // 측정되지 않는다 — 이어서 갈 링크를 항상 눈에 보이는 자리에 둔다.
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed">
          아직 질의를 확정하지 않은 브랜드가 있습니다. 확정 전까지 그 브랜드는 측정되지
          않습니다.{' '}
          <Link href={queriesStepPath(entry.pendingBrandId)} className="font-medium underline">
            이어서 확정하기
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            정기 측정
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{data.selected.name}</h1>
        </div>
        <BrandPicker brands={data.brands} selectedId={data.selected.id} canAdd={canAdd} />
      </div>

      <HeadlineCard points={data.points} />

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">언급률 추이</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          회차별 언급률과 95% 신뢰구간입니다. 엔진을 골라 따로 볼 수 있습니다.
        </p>
        <TrendChart points={data.points} />
      </section>

      {data.points.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">질문별 히트맵</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            어느 질문에서 비는가 — 여기가 가장 실행 가능한 정보입니다. 셀의 숫자는 언급된
            답변 수 / 전체 답변 수입니다.
          </p>
          <QueryHeatmap points={data.points} />
        </section>
      )}
      {/* 점유율·출처·회차 목록은 Task 10이 이 아래에 붙인다 */}
    </div>
  )
}
```

- [ ] **Step 9: 테스트 통과 확인 + 커밋**

Run: `pnpm vitest run src/components/dashboard src/components/audit` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add src/components/interval-bar.tsx src/components/audit/result-view.tsx src/components/dashboard src/app/globals.css "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): 헤드라인·추이 차트(점+오차 밴드·엔진 토글)·질문별 히트맵 — 디자인 언어 §4 적용"
```

---
### Task 10: 대시보드 화면 B — 점유율·출처 변화·회차 목록/상세

스펙 ⑤의 하반부. 회차 상세는 **`ResultView` 재사용** — 진단 리포트와 같은 화면
문법. 다만 구독 고객에게 "무료 진단 리포트" 표제와 요금제 업셀은 틀린 말이라
`variant='run'`을 추가한다(조립 재구현 금지 — 표제·업셀 두 지점만 분기).

★ **점유율 추이도 끊이지 않는 선을 그리지 않는다 — Task 9의 추이 차트와 같은
규칙이고 같은 이유다.** `SovTrend`는 `TrendChart`와 **똑같은 서수 축**
(`x = (i) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))`)을 쓰므로,
빠진 회차를 감추는 방식도 똑같다. `SovPoint`가 들고 오는 값 둘로 끊는다.

- `comparableWithPrev === false` — 경쟁사 집합·엔진 구성·질의 집합·판정기 버전
  중 하나가 바뀌었다. 분모나 분자의 **정의**가 달라졌다.
- `runsSkippedBefore > 0` — 두 점 **사이에 잴 값이 없던 회차**가 그만큼 있다.
  조건이 같아 `comparableWithPrev`는 true인데도 그렇다. 원인이 둘인데 둘 다
  실재한다: 스냅샷 저장만 실패한 회차(`points`에 못 들어온다)와,
  `shareOfVoice.n === 0`이라 이 계열에서 빠지는 회차. 후자는 답변이 없을 때만이
  아니라 **경쟁사를 하나도 등록하지 않은 회차 전부**에서 난다 — 경쟁사가 없으면
  SoV는 정의되지 않아 `wilsonInterval(0, 0)`이다. 경쟁사를 나중에 등록한 고객은
  그 앞 회차가 통째로 사라지는데, 서수 축은 남은 점들을 옆칸에 붙여 그린다.

두 경우 모두 **선분을 잇지 않고**, 왜 끊겼는지를 캡션에 쓴다 (Task 9와 같은
`segmentsOf` 헬퍼). 말없이 끊긴 선은 버그로 읽힌다.

**Files:**
- Modify: `src/components/audit/result-view.tsx` (`variant?: 'audit' | 'run'` prop)
- Create: `src/components/dashboard/sov-trend.tsx`
- Create: `src/components/dashboard/source-changes.tsx`
- Create: `src/components/dashboard/run-list.tsx`
- Create: `src/app/(app)/dashboard/runs/[runId]/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx` (섹션 3개 추가)
- Test: `src/components/audit/result-view.test.tsx` (variant 케이스 추가),
  `src/components/dashboard/source-changes.test.tsx`,
  `src/components/dashboard/sov-trend.test.tsx`

**Interfaces:**
- Consumes: Task 8의 `buildSovTrend`·`buildSourceChanges`·`RunListItem`·
  `loadRunDetail`, `ResultView`, `IntervalBar`, `requireUser`
- Produces:
  - `ResultView` 시그니처 확장: `variant?: 'audit' | 'run'` (기본 `'audit'` —
    기존 호출부 전부 무변경)
  - `SovTrend({ points }: { points: RunPoint[] })`
  - `SourceChanges({ points }: { points: RunPoint[] })`
  - `RunListSection({ items }: { items: RunListItem[] })`

- [ ] **Step 1: 실패하는 테스트 — ResultView variant**

`src/components/audit/result-view.test.tsx`에 기존 픽스처(`result`)를 재사용하는
케이스를 추가한다:

```tsx
describe('ResultView variant="run" (정기 측정 회차 상세)', () => {
  test('표제가 정기 측정 리포트다 — 산 것과 받은 것이 같아야 한다', () => {
    render(<ResultView result={result} variant="run" />)
    expect(screen.getByText('정기 측정 리포트')).toBeInTheDocument()
    expect(screen.queryByText(/무료 진단 리포트/)).toBeNull()
  })

  test('요금제 업셀 섹션이 없다 — 이미 구독 중인 고객이다', () => {
    render(<ResultView result={result} variant="run" />)
    expect(screen.queryByRole('link', { name: '요금제 보기' })).toBeNull()
  })

  test('기본값은 audit — 기존 화면 무변경', () => {
    render(<ResultView result={result} />)
    expect(screen.getByText('무료 진단 리포트')).toBeInTheDocument()
  })
})
```

Run: `pnpm vitest run src/components/audit/result-view.test.tsx` → FAIL

- [ ] **Step 2: ResultView 수정**

`result-view.tsx` — props에 `variant`를 추가하고 두 지점만 분기한다:

```tsx
export function ResultView({
  result,
  tier = 'free',
  guide,
  compare,
  variant = 'audit',
}: {
  result: AuditResult
  tier?: AuditTier
  guide?: string
  compare?: { before: AuditResult; beforeDate: string }
  /** 'run' = 정기 측정 회차 상세 — 표제가 바뀌고 요금제 업셀이 빠진다 */
  variant?: 'audit' | 'run'
}) {
  const isRun = variant === 'run'
```

(a) 표제 아이브로:

```tsx
          {isRun ? '정기 측정 리포트' : isPaidTier(tier) ? '정밀 진단 리포트' : '무료 진단 리포트'}
```

(b) "이 숫자를 어떻게 읽어야 하는가" — 무료 문구 분기를 `!isRun && tier === 'free'`로
바꾼다 (회차 상세는 유료 문구 쪽 — 질의 수·답변 수 기반이라 그대로 맞는 말이다).

(c) 마지막 유료 전환 섹션을 `{!isRun && (` … `)}`로 감싼다 — 구독 고객에게
"요금제 보기" 업셀은 틀린 말이다.

Run: `pnpm vitest run src/components/audit/result-view.test.tsx` → PASS

- [ ] **Step 3: 실패하는 테스트 — 출처 변화**

`src/components/dashboard/source-changes.test.tsx`:

```tsx
// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (Task 9 `trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import type { SourceOwner } from '@/lib/stats/sources'
import { wilsonInterval } from '@/lib/stats/wilson'
import type { RunPoint } from '@/lib/dashboard/data'
import { SourceChanges } from './source-changes'

afterEach(cleanup)

// ★ RunPoint는 `queryIds`·`detectorVersion`·`skippedBefore`까지 **필수**다
//   (Task 8 Interfaces). 빠뜨리면 TS2322. 그리고 `queryIds`·`detectorVersion`을
//   두 회차가 **같게** 두어야 "2 → 5"가 실제로 그려진다 — 다르면 비교 불가라
//   화살표가 나오지 않는 것이 옳은 동작이다.
function point(runId: string, sources: AuditResult['sources'], over: Partial<RunPoint> = {}): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: [],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(0, 0),
    ranking: [], evidence: [], byEngine: {}, byQuery: [], sources,
    sourceSummary: { totalAnswers: 6, answersWithCitations: 3, distinctDomains: sources.length, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId, measuredAt: result.measuredAt, engines: ['chatgpt'], competitors: [],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0, result, ...over,
  }
}
// ★ `SourceOwner`는 `'self' | 'competitor' | 'third-party'`다 — null이 아니다.
//   `aggregateSources`는 소유를 모르는 도메인에 'third-party'를 넣는다.
const src = (domain: string, answers: number, owner: SourceOwner = 'third-party') =>
  ({ domain, answers, pages: [], owner, share: wilsonInterval(answers, 6) })

describe('SourceChanges', () => {
  test('직전 회차 대비 인용 수 변화를 mono로 표기한다', () => {
    render(<SourceChanges points={[point('r1', [src('a.com', 2)]), point('r2', [src('a.com', 5)])]} />)
    expect(screen.getByText('2 → 5')).toBeInTheDocument()
  })
  test('직전 회차에 없던 도메인은 새로 등장으로 표기', () => {
    render(<SourceChanges points={[point('r1', []), point('r2', [src('new.com', 3)])]} />)
    expect(screen.getByText(/새로 등장/)).toBeInTheDocument()
  })

  /**
   * ★ 추이 차트가 선을 끊는 자리에서 이 표는 화살표를 그리면 안 된다.
   *   운영자가 동결 질의를 셋 더 넣으면 인용 수는 당연히 는다 — "2 → 5"는
   *   브랜드가 한 일이 아니라 설정 변경이고, 그걸 증가로 그리면 같은 거짓말이
   *   표 모양으로 나갈 뿐이다. 도메인이 사라진 것은 아니므로 "새로 등장"도
   *   틀린 말이다 — 화살표만 뺀다.
   */
  test('조건이 바뀐 회차끼리는 화살표를 그리지 않고 이유를 쓴다', () => {
    render(
      <SourceChanges
        points={[
          point('r1', [src('a.com', 2)]),
          point('r2', [src('a.com', 5)], { queryIds: ['q1', 'q9'] }),
        ]}
      />,
    )
    expect(screen.queryByText('2 → 5')).toBeNull()
    expect(screen.queryByText(/새로 등장/)).toBeNull()
    expect(screen.getByText('5개')).toBeInTheDocument()
    expect(screen.getByText(/증감을 표시하지 않습니다/)).toBeInTheDocument()
  })
})
```

`src/components/dashboard/sov-trend.test.tsx` — 위 ★ 규칙을 산문이 아니라
테스트로 못 박는다. Task 9의 `trend-chart.test.tsx`와 같은 짝이다:

```tsx
// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (Task 9 `trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AUDIT_RESULT_VERSION, type AuditResult } from '@/lib/audit/result'
import { wilsonInterval } from '@/lib/stats/wilson'
import type { RunPoint } from '@/lib/dashboard/data'
import { SovTrend } from './sov-trend'

afterEach(cleanup)

// ★ RunPoint는 `queryIds`·`detectorVersion`·`skippedBefore`까지 **필수**다
//   (Task 8 Interfaces). `skippedBefore`가 곧 이 파일이 검증할 신호다.
function point(runId: string, k: number, n: number, over: Partial<RunPoint> = {}): RunPoint {
  const result = {
    version: AUDIT_RESULT_VERSION, brandName: 'b', category: 'c', competitors: ['29CM'],
    engines: ['chatgpt'], aliases: [], measuredAt: '2026-08-03T18:30:00.000Z',
    totalAnswers: 6, citedRate: wilsonInterval(1, 6), shareOfVoice: wilsonInterval(k, n),
    ranking: [], evidence: [], byEngine: {}, byQuery: [], sources: [],
    sourceSummary: { totalAnswers: 6, answersWithCitations: 0, distinctDomains: 0, selfAnswers: 0 },
    hasSelfDomains: false, unresolved: 0,
  } as AuditResult
  return {
    runId, measuredAt: result.measuredAt, engines: ['chatgpt'], competitors: ['29CM'],
    queryIds: ['q1', 'q2'], detectorVersion: 1, skippedBefore: 0, result, ...over,
  }
}

describe('SovTrend', () => {
  test('조건이 같고 회차가 연속하면 선을 잇는다 — 멀쩡한 선을 괜히 끊지 않는다', () => {
    const { container } = render(<SovTrend points={[point('r1', 8, 20), point('r2', 12, 20)]} />)
    expect(container.querySelectorAll('[data-testid="sov-point"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(1)
  })

  test('경쟁사 집합이 바뀐 구간은 선을 끊고 이유를 쓴다', () => {
    const { container } = render(
      <SovTrend
        points={[point('r1', 8, 20), point('r2', 12, 20, { competitors: ['29CM', '지그재그'] })]}
      />,
    )
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(0)
    expect(screen.getByText(/비교하지 않습니다/)).toBeInTheDocument()
  })

  /**
   * ★ 경쟁사를 등록하기 전 회차는 SoV가 정의되지 않아(n=0) 계열에서 통째로
   *   빠진다. 조건은 그대로라 `comparableWithPrev`는 true다 — 이 구간을 끊는
   *   근거는 `runsSkippedBefore`뿐이다. 없으면 서수 축이 두 점을 옆칸에 붙여
   *   그리고, 고객은 그 사이에도 재고 있었던 것으로 읽는다.
   */
  test('점유율을 잴 수 없던 회차가 있으면 그 구간도 잇지 않는다', () => {
    const { container } = render(
      <SovTrend points={[point('r1', 8, 20), point('r2', 0, 0), point('r3', 12, 20)]} />,
    )
    expect(container.querySelectorAll('[data-testid="sov-point"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-testid="sov-line"]')).toHaveLength(0)
    expect(screen.getByText(/잴 수 없던 회차/)).toBeInTheDocument()
  })
})
```

Run: `pnpm vitest run src/components/dashboard` → FAIL

- [ ] **Step 4: 구현 — `src/components/dashboard/source-changes.tsx`**

```tsx
import { buildSourceChanges, type RunPoint } from '@/lib/dashboard/data'

/**
 * 출처 상위 변화 — 도메인별 인용 답변 수, 직전 회차 대비 (스펙 ⑤).
 *
 * ★ **`comparableWithPrev`가 false면 `prev → curr` 화살표를 그리지 않는다.**
 *   추이 차트가 선을 끊는 것과 같은 이유다: 질의를 셋 더 넣은 다음 회차는
 *   인용 수가 당연히 늘고, 판정기가 바뀌면 무엇을 인용으로 셌는지가 바뀐다.
 *   "2 → 5"는 브랜드가 한 일이 아니라 설정 변경이다. 추이만 끊고 이 표가
 *   화살표를 그리면 같은 거짓말이 표 모양으로 나갈 뿐이다.
 *   (도메인이 사라진 건 아니므로 "새로 등장"으로 떨어뜨려서도 안 된다 —
 *    `prevAnswers`는 그대로 두고 화살표만 뺀다.)
 *
 * ★ `owner`는 `'self' | 'competitor' | 'third-party'`이고 **null이 아니다.**
 *   그리고 `selfDomainsKnown === false`인 회차의 `'third-party'`는 "남의
 *   사이트"가 아니라 "자사 도메인을 몰라 못 갈랐다"이다 — 그 회차에는
 *   소유 배지를 달지 않는다.
 */
export function SourceChanges({ points }: { points: RunPoint[] }) {
  const rows = buildSourceChanges(points, 8)
  if (rows.length === 0) return null
  const incomparable = rows.some((r) => !r.comparableWithPrev && r.prevAnswers !== null)
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {rows.map((row) => (
          <li key={row.domain} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span className="flex items-baseline gap-2 font-mono text-sm">
              {row.domain}
              {row.selfDomainsKnown && row.owner === 'self' && (
                <span className="text-[0.625rem] tracking-[0.08em] text-primary uppercase">우리</span>
              )}
              {row.owner === 'competitor' && (
                <span className="text-[0.625rem] tracking-[0.08em] text-incomplete-fg uppercase">경쟁사</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
              {row.prevAnswers === null ? (
                <>새로 등장 · {row.answers}개</>
              ) : !row.comparableWithPrev || row.prevAnswers === row.answers ? (
                <>{row.answers}개</>
              ) : (
                <>{row.prevAnswers} → {row.answers}</>
              )}
            </span>
          </li>
        ))}
      </ul>
      {incomparable && (
        <p className="mt-2 text-xs text-muted-foreground">
          직전 회차와 측정 조건(엔진 구성·질의 집합·판정기 버전)이 달라 증감을 표시하지
          않습니다 — 인용 수의 차이가 브랜드의 변화인지 설정의 변화인지 가를 수 없습니다.
        </p>
      )}
    </>
  )
}
```

- [ ] **Step 5: 구현 — `src/components/dashboard/sov-trend.tsx`**

```tsx
import { buildSovTrend, type RunPoint, type SovPoint } from '@/lib/dashboard/data'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'

/**
 * 점유율 추이 (디자인 언어 §4.3). 추이 차트와 같은 점+밴드 문법의 소형판.
 *
 * ★ **선을 끊어야 하는 자리가 둘 있다 — `trend-chart.tsx`와 같은 규칙이다.**
 *   같은 서수 축을 쓰는 이상 같은 거짓말이 가능하다.
 *     - `comparableWithPrev === false` — 경쟁사 집합·엔진 구성·질의 집합·판정기
 *       버전이 바뀌었다. 분모가 달라지면 점유율은 설정 변경만으로도 움직인다.
 *     - `runsSkippedBefore > 0` — 그 사이에 잴 값이 없던 회차가 있다. 조건은
 *       같아서 비교는 가능하지만, 등간격 축이 2주를 1주로 보이게 한다.
 *       원인 중 하나가 **경쟁사 미등록**이다 — 경쟁사가 없으면 SoV는 정의되지
 *       않아 그 회차가 통째로 빠진다. 나중에 경쟁사를 등록한 고객에게 실제로
 *       일어나는 일이고, 그 자리를 감추면 "쭉 재고 있었다"가 된다.
 *   두 경우 모두 선분을 잇지 않고, 왜 끊겼는지를 캡션에 쓴다.
 *
 * 오차 밴드는 원래부터 점마다 따로 그린다(사각형) — 이어지는 띠가 없으므로
 * 추이 차트처럼 밴드를 구간별로 자를 필요가 없다.
 */
const W = 640
const H = 150
const PAD = { top: 10, right: 12, bottom: 24, left: 44 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top - PAD.bottom

/**
 * 이을 수 있는 구간으로 자른다 — Task 9 `trend-chart.tsx`의 `segmentsOf`와
 * 같은 규칙·같은 이유다. 반환은 **전역 인덱스**의 묶음이다: x 좌표는 계열
 * 전체에서의 위치로 정해야 구간이 갈려도 점이 제자리에 남는다.
 */
function segmentsOf(series: SovPoint[]): number[][] {
  const out: number[][] = []
  series.forEach((p, i) => {
    const breaks = !p.comparableWithPrev || p.runsSkippedBefore > 0
    if (i === 0 || breaks) out.push([i])
    else out[out.length - 1]!.push(i)
  })
  return out
}

export function SovTrend({ points }: { points: RunPoint[] }) {
  const sov = buildSovTrend(points)
  const latest = points[points.length - 1]
  if (sov.length === 0 || !latest) return null
  const n = sov.length
  const x = (i: number) => PAD.left + (n <= 1 ? IW / 2 : (i * IW) / (n - 1))
  const y = (v: number) => PAD.top + (1 - v) * IH
  const last = sov[n - 1]!
  const segments = segmentsOf(sov)
  // 왜 끊겼는지를 캡션에 쓴다 — 말없이 끊긴 선은 버그로 읽힌다.
  const hasConditionBreak = sov.some((p, i) => i > 0 && !p.comparableWithPrev)
  const hasGap = sov.some((p) => p.runsSkippedBefore > 0)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`언급 점유율 추이 — 최신 ${formatPercent(last.interval.point)} (${formatInterval(last.interval)})`}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono" fontSize={11}>
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        {/* ★ 계열 전체를 잇는 폴리라인 하나가 아니다. 조건이 바뀌었거나
            (`comparableWithPrev === false`) 그 사이 회차가 빠진
            (`runsSkippedBefore > 0`) 자리에서는 선분이 없다. */}
        {segments.map((idx) =>
          idx.length > 1 ? (
            <path
              key={`line-${idx[0]}`}
              data-testid="sov-line"
              d={`M ${idx.map((i) => `${x(i)},${y(sov[i]!.interval.point)}`).join(' L ')}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
            />
          ) : null,
        )}
        {sov.map((p, i) => (
          <g key={p.runId}>
            <rect x={x(i) - 4} y={y(p.interval.upper)} width={8} height={Math.max(y(p.interval.lower) - y(p.interval.upper), 1)} fill="var(--primary)" opacity={0.2} />
            <circle data-testid="sov-point" cx={x(i)} cy={y(p.interval.point)} r={4} fill="var(--primary)" />
            <title>{`${p.measuredAt.slice(5, 7)}.${p.measuredAt.slice(8, 10)} · ${formatPercent(p.interval.point)} (${formatInterval(p.interval)})`}</title>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-xs text-muted-foreground">
        분모: 등록 경쟁사({latest.competitors.join(', ') || '없음'}) 대비 언급 비중입니다.
        {hasConditionBreak &&
          ' 측정 조건(경쟁사 집합·엔진 구성·질의 집합·판정기 버전)이 바뀐 구간은 이전과 비교하지 않습니다 — 분모가 달라지면 점유율은 설정 변경만으로도 움직입니다.'}
        {hasGap &&
          ' 점유율을 잴 수 없던 회차가 있는 구간도 잇지 않습니다 — 경쟁사를 등록하기 전 회차와 스냅샷이 없는 회차가 그렇습니다. 점 사이 간격이 실제로 지난 기간과 다릅니다.'}
      </p>
    </div>
  )
}
```

- [ ] **Step 6: 구현 — `src/components/dashboard/run-list.tsx`**

```tsx
import Link from 'next/link'
import type { RunListItem } from '@/lib/dashboard/data'
import type { RunStatus } from '@/lib/db/schema'

const STATUS_LABEL: Record<RunStatus, string> = {
  running: '진행 중',
  succeeded: '완료',
  partial: '부분 완료 · 수집 90% 미만',
  failed: '실패',
}

/** 회차 목록 — 실패 회차도 감추지 않는다. 스냅샷 있는 회차만 상세로 간다. */
export function RunListSection({ items }: { items: RunListItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {items.map((item) => {
        const date = item.startedAt.slice(0, 10)
        const inner = (
          <span className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span className="font-mono text-sm tabular-nums">{date}</span>
            <span
              className={`text-sm ${
                item.status === 'failed'
                  ? 'text-metric-down-fg'
                  : item.status === 'partial'
                    ? 'text-incomplete-fg'
                    : 'text-muted-foreground'
              }`}
            >
              {STATUS_LABEL[item.status]}
            </span>
          </span>
        )
        return (
          <li key={item.runId} data-testid="run-row">
            {item.hasResult ? (
              <Link href={`/dashboard/runs/${item.runId}`} className="block transition-colors duration-[120ms] hover:bg-muted/40">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 7: 회차 상세 — `src/app/(app)/dashboard/runs/[runId]/page.tsx`**

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ResultView } from '@/components/audit/result-view'
import { loadRunDetail } from '@/lib/dashboard/load'
import { requireUser } from '@/lib/session'

export const metadata = { title: '측정 회차' }

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  // (app) 규칙 — 페이지가 자체적으로 세션을 검증한다.
  const user = await requireUser()
  const { runId } = await params
  // ★ 소유 검증은 loadRunDetail의 JOIN이 한다 — 남의 회차면 404.
  const detail = await loadRunDetail(user.id, runId)
  if (!detail) notFound()

  return (
    <div>
      <div className="mx-auto max-w-3xl px-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
          ← 대시보드
        </Link>
      </div>
      <ResultView result={detail.result} variant="run" />
    </div>
  )
}
```

- [ ] **Step 8: 대시보드 페이지에 섹션 추가**

`src/app/(app)/dashboard/page.tsx` — Task 9의 `{/* 점유율·출처·회차 목록은
Task 10이 … */}` 주석 자리를 다음으로 교체:

```tsx
      {data.points.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">언급 점유율 추이</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            등록한 경쟁사 대비 언급 비중입니다. 경쟁사를 더 등록하면 이 값은 달라집니다.
          </p>
          <SovTrend points={data.points} />
        </section>
      )}

      {data.points.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">AI가 읽는 출처</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            최신 회차에서 인용된 도메인과 직전 회차 대비 변화입니다 — 여기가 콘텐츠를 실을 곳입니다.
          </p>
          <SourceChanges points={data.points} />
        </section>
      )}

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight sm:text-xl">측정 회차</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          회차를 누르면 진단 리포트와 같은 화면 문법의 상세를 봅니다.
        </p>
        <RunListSection items={data.runList} />
      </section>
```

import 3줄 추가: `SovTrend`, `SourceChanges`, `RunListSection`.

- [ ] **Step 9: 검증 + 커밋**

Run: `pnpm vitest run src/components` && `pnpm typecheck` && `pnpm lint`
Expected: PASS

```bash
git add src/components/audit src/components/dashboard "src/app/(app)/dashboard"
git commit -m "feat(dashboard): 점유율 추이·출처 변화·회차 목록 + ResultView variant='run' 회차 상세"
```

---

### Task 11: 디자인 패스

스펙 ⑤: "신규 화면이므로 디자인 패스를 PDF 때처럼 제대로 태운다."
**`docs/design-language.md` §6 금지 목록이 체크리스트다.** 기계 검사(grep) +
실물 확인(dev 서버) + 수정 커밋.

**Files:**
- Modify: Task 3~10에서 만든 화면 파일들 (발견된 위반만)

**Interfaces:**
- Consumes: `docs/design-language.md`, 구현된 전 화면
- Produces: 위반 0건 상태의 화면 (수정 커밋)

- [ ] **Step 1: 기계 검사 — 금지 패턴 grep**

각 명령의 기대 결과는 **0건**이다. 걸리면 해당 파일을 고친다:

```bash
# 채움색을 글자에 쓴 곳 (-fg 짝 미사용) — text-metric-up-fg는 허용, text-metric-up은 금지
grep -rnE 'text-(metric-(up|down|flat)|incomplete|engine-[a-z]+)[^-]' src/app src/components
# 걷어낸 차트 슬롯 참조
grep -rn 'chart-[1-5]' src/app src/components
# EngineId 원문 노출 의심 — 화면 파일에서 engineLabel 없이 engineId를 직접 렌더
grep -rn '{.*\.engineId}' src/components/dashboard src/app/\(app\)
# reduced-motion 전역 규칙 존재 확인 (이건 1건이어야 한다)
grep -c 'prefers-reduced-motion' src/app/globals.css
```

- [ ] **Step 2: 실물 확인 — dev 서버 체크리스트**

`pnpm dev`를 띄우고 개발 DB의 시드 계정(Task 12의 seed 스크립트를 미리 써도
된다)으로 아래를 확인한다. 각 항목은 `docs/design-language.md`의 절 번호가 근거다:

- [ ] 온보딩 1~3단계: 아이브로 조판(§1), 오류 문구가 그 자리에 뜬다, 한글 줄바꿈(keep-all) 어색한 곳 없음
- [ ] 에디터: 질의/생성 카운터가 mono(§1), 검증 통과·실패 색이 `-fg` 짝(§2)
- [ ] 대시보드 헤드라인: 큰 숫자 옆 구간 상시 표기(§0·§3), 첫 회차 문구
- [ ] 추이 차트: 밴드가 점과 항상 함께(§4.1), 엔진 토글 시 마커 모양 변화(§2), 축 라벨 mono
- [ ] 히트맵: 셀 k/n 표기, 진한 셀 글자 대비, `—` 셀(§4.2)
- [ ] SoV: 분모(경쟁사 목록) 상시 표기, 끊긴 구간 문구(§4.3)
- [ ] 회차 상세: 표제 "정기 측정 리포트", 업셀 없음
- [ ] OS의 "동작 줄이기" 켜고 전환 애니메이션이 사라지는지(§5)
- [ ] 375px 폭(모바일)에서 히트맵 가로 스크롤 · 차트 축 라벨 겹침 없음

- [ ] **Step 3: 발견 사항 수정 + 커밋**

위반마다 파일을 고치고 해당 vitest를 다시 돌린다.

```bash
git add -A src/app src/components
git commit -m "polish(dashboard): 디자인 패스 — design-language §6 위반 수정"
```

(위반이 0건이면 커밋 없이 다음 태스크로 — 빈 커밋을 만들지 않는다.)

---

### Task 12: E2E + 실측 루프 검증 (수동 게이트)

스펙 보안·품질 절과 성공 기준. E2E는 두 겹이다:
① CI-safe 게이트 spec(쓰기 없음 — `free-audit.spec.ts`가 성공 경로를 가로채는
것과 같은 이유로, CI의 DATABASE_URL에 테스트 행을 만들지 않는다),
② 온보딩 완주 spec — **로컬 전용**(`E2E_ONBOARDING=1` 게이트), seed 스크립트로
계정·플랜을 만들고 dev 서버의 가짜 생성기(`E2E_FAKE_QUERY_GENERATOR=1`)로 LLM을
인터셉트한다. 마지막은 스펙 성공 기준 그대로의 수동 체크리스트다.

**Files:**
- Create: `tests/e2e/onboarding-gate.spec.ts`
- Create: `tests/e2e/onboarding-full.spec.ts`
- Create: `scripts/e2e-onboarding-seed.mts`, `scripts/e2e-onboarding-cleanup.mts`
- Modify: `package.json` (seed/cleanup 스크립트 2줄)

**Interfaces:**
- Consumes: Task 3~5의 온보딩 플로우, Task 2의 `grantPlan`, `auth`(`@/lib/auth`),
  Task 4의 `e2eFakeGenerator` 분기
- Produces: `pnpm e2e:onboarding:seed` / `pnpm e2e:onboarding:cleanup`,
  E2E 계정 상수 `E2E_EMAIL = 'e2e-onboarding@cited.co.kr'`, `E2E_PASSWORD = 'e2e-passw0rd!'`

- [ ] **Step 1: 게이트 spec — `tests/e2e/onboarding-gate.spec.ts`**

```ts
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
```

Run: `pnpm test:e2e --grep "밀려난다"` → PASS (dev 서버 필요 — playwright config가 띄운다)

- [ ] **Step 2: seed 스크립트 — `scripts/e2e-onboarding-seed.mts`**

```ts
/**
 * 온보딩 완주 E2E용 계정 시드 — **로컬 전용.** CI에서 돌리지 않는다
 * (CI의 DATABASE_URL에 테스트 행을 만들지 않는다는 기존 원칙 —
 * free-audit.spec.ts 상단 참고).
 *
 *   pnpm e2e:onboarding:seed
 *
 * Better Auth API로 가입한다 — 비밀번호 해시 형식을 우리가 알 필요가 없다.
 * 가입 인증 메일은 sendEmail이 실패를 삼키므로(발송 도메인 주소라 외부 반송
 * 없음) 여기서 emailVerified를 직접 세운다.
 */
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db, schema } from '@/lib/db'
import { grantPlan } from '@/lib/subscriptions/repository'

export const E2E_EMAIL = 'e2e-onboarding@cited.co.kr'
export const E2E_PASSWORD = 'e2e-passw0rd!'

const existing = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (existing) {
  console.log(`이미 있음: ${E2E_EMAIL} — cleanup 후 다시 실행하세요 (pnpm e2e:onboarding:cleanup)`)
  process.exit(1)
}

await auth.api.signUpEmail({
  body: { email: E2E_EMAIL, password: E2E_PASSWORD, name: 'E2E 온보딩' },
})
await db
  .update(schema.user)
  .set({ emailVerified: true })
  .where(eq(schema.user.email, E2E_EMAIL))

const user = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (!user) throw new Error('가입이 저장되지 않았습니다')
await grantPlan({ userId: user.id, plan: 'starter', queryPacks: 0, fromAuditId: null })

console.log(`시드 완료: ${E2E_EMAIL} / ${E2E_PASSWORD} (starter)`)
console.log('실행: $env:E2E_ONBOARDING=\'1\'; $env:E2E_FAKE_QUERY_GENERATOR=\'1\'; pnpm test:e2e --grep 온보딩완주')
```

- [ ] **Step 3: cleanup 스크립트 — `scripts/e2e-onboarding-cleanup.mts`**

```ts
/**
 * E2E 계정 정리. 순서가 중요하다 — subscriptions.userId가 restrict라
 * 구독을 먼저 지워야 user가 지워진다 (결제 이력이 없는 테스트 계정이라
 * 하드 삭제가 허용된다). brands·queries·runs는 user cascade로 따라간다.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

const E2E_EMAIL = 'e2e-onboarding@cited.co.kr'

const user = await db.query.user.findFirst({ where: eq(schema.user.email, E2E_EMAIL) })
if (!user) {
  console.log('정리할 계정이 없습니다.')
  process.exit(0)
}
await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, user.id))
await db.delete(schema.user).where(eq(schema.user.id, user.id))
console.log(`정리 완료: ${E2E_EMAIL}`)
```

`package.json` scripts 추가 (`plan:revoke` 아래):

```json
    "e2e:onboarding:seed": "tsx --conditions=react-server --env-file=.env.local scripts/e2e-onboarding-seed.mts",
    "e2e:onboarding:cleanup": "tsx --conditions=react-server --env-file=.env.local scripts/e2e-onboarding-cleanup.mts",
```

- [ ] **Step 4: 완주 spec — `tests/e2e/onboarding-full.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

/**
 * 온보딩 완주 — 로그인 → 브랜드 → 질의 에디터(AI 생성은 dev 전용 가짜) →
 * 동결 → 완료 화면 (스펙 테스트 요구: "온보딩 E2E 완주, LLM은 인터셉트").
 *
 * 로컬 전용. 실행 전 `pnpm e2e:onboarding:seed`, 실행 후
 * `pnpm e2e:onboarding:cleanup`. dev 서버는 E2E_FAKE_QUERY_GENERATOR=1로
 * 떠 있어야 한다 (playwright webServer가 러너의 env를 물려받는다).
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
    await page.getByRole('button', { name: /AI 후보 생성/ }).click()
    await expect(page.getByText(/AI 생성 1\/5회/)).toBeVisible()
    await expect(page.getByRole('status')).toHaveTextContent(/확정할 수 있습니다/)

    // 4. 확정 → 동결 확인 → 완료
    await page.getByRole('button', { name: '확정하기' }).click()
    await expect(page.getByText(/동결됩니다/)).toBeVisible()
    await page.getByRole('button', { name: '확정하고 동결' }).click()
    await expect(page).toHaveURL(/\/onboarding\/done/)
    await expect(page.getByText(/요일 새벽/)).toBeVisible()

    // 5. 대시보드 — 빈 상태가 방향을 준다
    await page.getByRole('link', { name: '대시보드로' }).click()
    await expect(page.getByText(/첫 측정이 끝나면/)).toBeVisible()
  })
})
```

Run (로컬):

```powershell
pnpm e2e:onboarding:seed
$env:E2E_ONBOARDING='1'; $env:E2E_FAKE_QUERY_GENERATOR='1'; pnpm test:e2e --grep 온보딩완주
pnpm e2e:onboarding:cleanup
```

Expected: PASS. (CI에서는 skip으로 뜬다 — 초록.)

- [ ] **Step 5: 전체 자동 검증**

Run: `pnpm test` && `pnpm typecheck` && `pnpm lint` && `pnpm build` && `pnpm test:e2e`
Expected: 전부 PASS (스펙 성공 기준의 명령 목록)

- [ ] **Step 6: 커밋**

```bash
git add tests/e2e/onboarding-gate.spec.ts tests/e2e/onboarding-full.spec.ts scripts/e2e-onboarding-seed.mts scripts/e2e-onboarding-cleanup.mts package.json
git commit -m "test(e2e): 온보딩 게이트(CI) + 완주(로컬 게이트, LLM 가짜 주입) + seed/cleanup"
```

- [ ] **Step 7: 실측 루프 검증 (수동 — 돈이 나간다, 스펙 성공 기준)**

운영자가 실계정으로 아래를 순서대로 밟고 결과를 기록한다:

- [ ] 프로덕션 DB 마이그레이션: `pnpm db:migrate` (DATABASE_URL=프로덕션 — Vercel 환경변수 값으로)
- [ ] GitHub 저장소 Secrets에 `CRON_SECRET` 등록 (Vercel의 값과 동일)
- [ ] 실계정 가입 확인 후 `pnpm plan:grant <실계정 이메일> starter`
- [ ] 실계정 로그인 → 온보딩 완주 (AI 생성 1~2회 실사용 — ~수십 원) → 질의 동결 확인
- [ ] Actions 탭에서 `정기 측정` `workflow_dispatch` 수동 실행 → 응답 로그에 `measured` 확인 (실측 1회 ≈ 2,400원)
- [ ] 대시보드에 점 1개 + 히트맵 1열 + 회차 상세가 뜨는지 확인 — **전 루프 완주**
- [ ] 크몽 전환 시나리오: `pnpm plan:grant <이메일> starter --from-audit <크몽 aud_id>` → 온보딩 에디터에 동결 질의 10개 프리필 확인
- [ ] 실패 메일: 로컬에서 `OPENAI_API_KEY`·`GEMINI_API_KEY`를 잘못된 값으로 바꾸고 dev 기동 → `curl -X POST -H "Authorization: Bearer <로컬 CRON_SECRET>" http://localhost:3000/api/cron/measure` → 수집 전멸 → `OPERATOR_EMAIL`로 실패 메일 수신 확인, 두 번째 호출이 attempt 2 메일, 세 번째 호출이 `measured: null`(회차 건너뜀)인지 확인
- [ ] 월·수·금 스케줄이 실제로 돈 첫 주에 Actions 실행 이력과 회차 수 대조

---

## 스펙 커버리지 (자기 검증)

| 스펙 절 | 태스크 |
|---|---|
| Task 0 디자인 언어 문서 + 모션 + 차트 문법 | Task 0 (문서), Task 9 (모션 CSS·차트 구현), Task 11 (검수) |
| ① 플랜 부여 CLI (grant/revoke, --from-audit, --packs, 가입 확인) | Task 1 (fromAuditId 컬럼), Task 2 |
| ② 게이트 (활성 구독 + 브랜드 없음 / 무플랜은 기존 화면) | Task 3 (state·gate·redirect), Task 9 (no-plan 화면 유지) |
| ② 1단계 브랜드 (업종 25종 자동완성·경쟁사 플랜 한도·도메인·지역형 지역·프리필) | Task 3 |
| ② 2단계 에디터 (프리필·편집·개별 재생성·실시간 검증·생성 한도 5회·계정 전체 한도·확정=동결) | Task 4 (서버), Task 5 (화면) |
| ② 3단계 완료 (다음 측정 시각 예고) | Task 3 (nextMeasurement), Task 5 (done 화면) |
| ③ GitHub Actions cron → API, CRON_SECRET | Task 6 (핸들러), Task 7 (워크플로) |
| ③ 호출당 1브랜드·due 판정·잠금·재시도 1회·재실패 건너뜀 | Task 6 (selectDueBrand·handleMeasure) |
| ③ 기존 파이프라인 + validateRunStart + 동결 질의 | Task 6 (measureBrand) |
| ④ collection_runs.result 스냅샷 (buildAuditResult 재사용) | Task 1 (컬럼), Task 6 (저장) |
| ④ 회차 상세 = ResultView 재사용 | Task 10 (variant='run') |
| ⑤ 브랜드 선택·헤드라인·추이(점+오차 밴드·엔진 토글) | Task 8·9 |
| ⑤ 질문별 히트맵 | Task 8·9 |
| ⑤ 경쟁사 점유율 추이·출처 상위 변화·회차 목록→상세 | Task 8·10 |
| ⑤ 계측 미학·디자인 패스 | Task 0·9·11 |
| 실패 알림 (운영자 메일) | Task 6 (measureFailureNotice) |
| 보안 (CRON_SECRET 타이밍 세이프·본인 소유만·생성 한도 서버 강제) | Task 6 (auth 재사용), Task 3~5 (gate/소유), Task 4 (원자적 차감), Task 12 (게이트 spec) |
| 테스트 (온보딩 E2E·cron DI 단위·에디터 검증 단위·대시보드 픽스처 렌더·실측 1회 수동) | Task 12 (E2E·수동), Task 6 (cron DI), Task 4·5 (에디터), Task 8~10 (픽스처 렌더) |
| 성공 기준 (전 루프 실계정 1회·크몽 프리필·실패 메일·전체 테스트 명령) | Task 12 Step 5·7 |
| 미루는 것 (Toss·주간 메일·마케팅 리트로핏·SerpApi·웹 어드민) | 어느 태스크도 만들지 않음 — Task 6이 SerpApi 엔진을 명시적으로 거른다 |
