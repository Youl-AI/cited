# Cited 전면 리뉴얼 (taste 스킬 주도) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-08-03-taste-renewal-design.md`대로 사이트 전체(마케팅 다크 + 앱 라이트)를 taste 스킬 4종 주도로 재설계한다.

**Architecture:** 기반(의존성·서체·토큰 2세트·모션 리프) → 마케팅 오버홀(tasteskill/gpt-taste, GSAP 스크롤텔링) → 앱 격상(redesign/soft-skill 레버 순서) → 배터리·게이트. **디자인 태스크는 코드가 아니라 계약으로 계획한다** — 스킬의 variance engine이 레이아웃을 확정하므로(`<design_plan>` 산출 의무), 계획서는 보존 콘텐츠·하드 룰·수용 기준·게이트를 못박는다. 이는 placeholder가 아니라 스펙 §1의 권한 위임이다.

**Tech Stack:** Next.js 16 App Router · Tailwind v4 · GSAP + @gsap/react (ScrollTrigger) · Motion(`motion/react`) · @phosphor-icons/react · SUIT Variable + IBM Plex Mono · vitest 4 + jsdom.

## Global Constraints (스펙 §0·§1에서 발췌 — 전 태스크 공통)

- **하드 룰(유일한 불변):** 실측 숫자 조작 금지 — 화면의 모든 수치·신뢰구간·답변 원문·질의는 실제 데이터. 가짜 고객 로고·후기·지표 금지. fake-precise 숫자 발명 금지.
- **스킬 원문이 디자인 권한이다.** 위치: `C:\Users\hayoul1999.YOUL-HOUSE\.claude\plugins\cache\taste-skill\taste-skill\1.0.0\skills\`
  - 마케팅(랜딩·요금제·audit/new·requested): `taste-skill/SKILL.md` + `gpt-tasteskill/SKILL.md` 지배, `soft-skill/SKILL.md` 보조
  - 앱(대시보드·온보딩·회차상세·리포트·auth): `redesign-skill/SKILL.md` + `soft-skill/SKILL.md`
  - 충돌 해소: 하드 룰 → 스펙 §0 확정 결정 → 지배 스킬 → 보조 스킬
- 테마: 마케팅 = 시네마틱 다크(순수 `#000000` 금지, 오프블랙) · 앱 = 라이트. 페이지 중간 테마 반전 금지. `.dark` 전역 토글은 만들지 않는다.
- 서체: SUIT Variable(본문·디스플레이) + IBM Plex Mono(숫자·계측값·날짜·도메인 — mono 정체성 보존). `keep-all` 유지.
- 액센트 1개(채도 <80%, 브랜드 색상각 258 계열) — 페이지 전체 잠금. AI-퍼플 금지.
- **보존(변경 금지):** URL·라우트 슬러그 · 내비 라벨("대시보드/설정/결제", "로그인 · 회원가입", "무료 진단 받기") · 폼 필드 이름/순서 · 카피 보이스와 주장 · 리포트 print/PDF CSS 동작 · 기존 동작·데이터 테스트(1296개, 클래스 단언만 갱신 허용).
- 마케팅 카피의 em-dash(`—`·`–`)는 마침표·쉼표·콜론으로 재구성(tasteskill §9.G — 의미는 보존).
- 모션: transform·opacity만(GPU-safe) · `window.addEventListener('scroll')` 금지 · GSAP과 Motion을 같은 컴포넌트 트리에 혼용 금지 · 모든 모션에 reduced-motion 가드 · 모션마다 동기를 한 문장으로 설명 가능해야 함.
- GSAP은 클라이언트 리프 컴포넌트에 격리(`'use client'` + `useEffect` cleanup `ctx.revert()`), 마케팅 전용. 차트에 스크롤 하이재킹 금지, 차트 렌더 로직(선 끊김·밴드·n=0 처리) 변경 금지.
- 커밋: 명시 경로만 스테이징(`git add -A` 금지), 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 검증 공통: `pnpm test`(전체 초록) + `pnpm typecheck` + `pnpm build`(빌드 확인 허용, dev 서버 금지). `.env.local` 읽기 금지.
- 마케팅 태스크의 머지 게이트: tasteskill **§14 Final Pre-Flight Check 전 항목**을 리포트에 표로 셀프 체크(하나라도 Fail이면 미완).

## 파일 구조

| 영역 | 파일 |
|---|---|
| 서체·의존성 | `package.json` · `src/app/fonts/SUIT-Variable.woff2`(신규) · `src/app/layout.tsx` |
| 토큰 | `src/app/globals.css`(전면 개편: `:root` 앱 라이트 + `.surface-dark` 마케팅 다크 + 모션·elevation) · `tests/design-tokens.test.ts`(재작성) · `docs/design-language.md`(v3 개정) |
| 모션 리프 | `src/components/motion/pin-scene.tsx` · `sticky-stack.tsx` · `reveal.tsx` (신규) |
| 마케팅 | `src/app/(marketing)/layout.tsx` · `page.tsx` · `pricing/page.tsx` · `src/app/audit/layout.tsx` · `new/page.tsx` · `requested/page.tsx` · `src/components/site-header.tsx` · `site-footer.tsx` · `src/components/marketing/*`(신규 섹션 컴포넌트) |
| 앱 프리미티브 | `src/components/ui/button.tsx` · `card.tsx` · `input.tsx` · `badge.tsx` · `tabs.tsx` · `select.tsx` · `dialog.tsx` · `skeleton.tsx` |
| 앱 화면 | `src/app/(app)/**` · `src/components/dashboard/*` · `src/components/audit/result-view.tsx` · `src/components/interval-bar.tsx` |
| 배터리 | `tests/design-rules.test.ts`(신규) |

재사용: 브랜치 `visual-elevation`(보관)의 ce803b1 — reduced-motion 킬 스위치 delay 중화 4줄은 Task 1이 승계한다.

---

### Task 0: 의존성 + SUIT 서체

**Files:**
- Modify: `package.json`, `src/app/layout.tsx`
- Create: `src/app/fonts/SUIT-Variable.woff2`

**Interfaces:**
- Produces: CSS 변수 `--font-suit`(layout에서 주입), 설치된 `gsap`·`@gsap/react`·`motion`·`@phosphor-icons/react`. 이후 전 태스크가 소비.

- [ ] **Step 1: 패키지 설치**

```bash
pnpm add gsap @gsap/react motion @phosphor-icons/react
```

- [ ] **Step 2: SUIT Variable woff2 확보** — 우선 jsDelivr:

```bash
curl -L -o src/app/fonts/SUIT-Variable.woff2 "https://cdn.jsdelivr.net/gh/sunn-us/SUIT@latest/fonts/variable/woff2/SUIT-Variable.woff2"
```

실패 시 GitHub 저장소 `sunn-us/SUIT`의 releases에서 variable woff2 경로를 찾아 받는다. 파일 크기가 1MB 미만이면 손상 의심 — 확인하고 리포트에 출처 URL·크기를 적는다.

- [ ] **Step 3: layout.tsx에 next/font/local 추가.** 기존 IBM Plex 로딩은 유지하고 SUIT를 추가한다:

```ts
import localFont from 'next/font/local'

const suit = localFont({
  src: './fonts/SUIT-Variable.woff2',
  display: 'swap',
  variable: '--font-suit',
  weight: '100 900',
})
```

`<html>` className에 `suit.variable`을 기존 폰트 변수들과 나란히 추가. `globals.css`의 `--font-sans` 체인 맨 앞에 `var(--font-suit)` 삽입(Plex Sans·Pretendard 폴백 유지 — 토큰 개편은 Task 1이지만 이 한 줄은 여기서).

- [ ] **Step 4: 검증** — `pnpm typecheck && pnpm build` 통과, 빌드 산출물에 woff2 포함 확인. `pnpm test` 초록(1300 passed/1 skipped 유지).

- [ ] **Step 5: 커밋**

```bash
git add package.json pnpm-lock.yaml src/app/fonts/SUIT-Variable.woff2 src/app/layout.tsx src/app/globals.css
git commit -m "feat(renewal): GSAP·Motion·Phosphor 도입 + SUIT Variable 서체"
```

---

### Task 1: 토큰 2세트 (앱 라이트 + 마케팅 다크) + 계약 테스트 재작성 + design-language v3

**Files:**
- Modify: `src/app/globals.css`, `docs/design-language.md`
- Test: `tests/design-tokens.test.ts` (재작성)

**Interfaces:**
- Produces: `.surface-dark` 클래스(마케팅 라우트 레이아웃이 감싸는 다크 토큰 스코프 — shadcn 변수 `--background`·`--foreground`·`--card`·`--border`·`--muted`·`--primary` 등을 다크 값으로 재선언 + `color-scheme: dark`), 앱 라이트 토큰 재조율(radius 12px = `--radius: 0.75rem`, 틴트 그림자 `--shadow-elevation-1/2/3` 다층), 모션 토큰(`--ease-spring` 등 구현자 재량 명명), reduced-motion 킬 스위치(duration·**delay**·iteration 전부 중화 — ce803b1 승계). Task 3~8 전부 소비.

**구현 재량:** 값 선택(다크 배경·액센트 정확값, 그림자 수치)은 soft-skill·tasteskill 규칙 안에서 구현자가 정한다. 아래 테스트가 계약의 **구조·의미**를 잠근다(정확값 스냅샷이 아니라).

- [ ] **Step 1: 계약 테스트 먼저** — `tests/design-tokens.test.ts`를 다음 내용으로 재작성(기존 헬퍼 `blockBody`/`readToken`/`parseOklch`/대비 계산 함수는 유지·재사용):

```ts
describe('토큰 구조 계약 — 리뉴얼 v3', () => {
  it('마케팅 다크 스코프(.surface-dark)가 있고 배경은 순수 검정이 아니다', () => {
    const dark = blockBody(/\.surface-dark\s*\{/)
    expect(dark).toContain('color-scheme: dark')
    const bg = readToken('background', dark)
    expect(bg).not.toBeNull()
    expect(bg).not.toMatch(/^#000000$|^oklch\(\s*0\s+0\s+0\s*\)$/)
    const l = parseOklch(bg)?.l
    if (l !== undefined) expect(l).toBeGreaterThan(0.05) // 오프블랙
  })

  it('앱 라이트(:root) 배경·전경 대비는 AA를 유지한다', () => {
    // 기존 대비 계산 함수 재사용 — background vs foreground >= 4.5
  })

  it('엔진 계열색 4종이 이름으로 존재하고 서로 구분된다', () => {
    for (const name of ['engine-chatgpt', 'engine-gemini', 'engine-naver', 'engine-google']) {
      expect(readToken(`color-${name}`, themeBlock)).not.toBeNull()
    }
  })

  it('지표 방향색(up/down/flat)이 의미 색상각을 유지한다 — 초록/빨강/무채색', () => {
    const up = parseOklch(readToken('color-metric-up', themeBlock))
    const down = parseOklch(readToken('color-metric-down', themeBlock))
    const flat = parseOklch(readToken('color-metric-flat', themeBlock))
    expect(up && up.h > 120 && up.h < 180).toBe(true)
    expect(down && (down.h < 45 || down.h > 340)).toBe(true)
    expect(flat && flat.c < 0.03).toBe(true)
  })

  it('reduced-motion 킬 스위치는 duration·delay·iteration을 전부 중화한다', () => {
    const media = blockBody(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/)
    for (const decl of [
      'transition-duration: 0.01ms !important',
      'animation-duration: 0.01ms !important',
      'animation-iteration-count: 1 !important',
      'animation-delay: 0.01ms !important',
      'transition-delay: 0ms !important',
    ]) expect(media).toContain(decl)
  })

  it('elevation 3단이 존재하고 다층이다', () => {
    for (const n of [1, 2, 3]) {
      const v = readToken(`shadow-elevation-${n}`, themeBlock)
      expect(v).not.toBeNull()
      expect((v ?? '').split(',').length).toBeGreaterThanOrEqual(2)
    }
  })
})
```

(기존 테스트 중 구체 값 스냅샷 단언은 삭제, 의미 규칙·대비 계산 단언은 새 값 기준으로 이식.)

- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/design-tokens.test.ts` → FAIL
- [ ] **Step 3: globals.css 개편** — soft-skill §3(아키타입 값) + redesign-skill Color 절 기준으로 값 확정. `.surface-dark` 스코프, 라이트 재조율(radius 0.75rem, 틴트 그림자), 모션 토큰, 킬 스위치 5줄. 지표·엔진 색 의미 유지(값 재조율 허용, 대비 근거 주석).
- [ ] **Step 4: 통과 확인** — 위 테스트 + `pnpm test` 전체(색 관련 기존 테스트 갱신 포함) + `pnpm build`.
- [ ] **Step 5: design-language.md v3 개정** — 문서 머리에 "2026-08-03 리뉴얼: 이 문서는 taste 스펙(§1 권한 체계) 아래의 **데이터 표현 규칙만** 다룬다"로 축소 개정: 하드 룰(실측 숫자), mono 계측값, 지표·엔진 색 의미, 차트 렌더 로직 불변(선 끊김·밴드·n=0), print 보존. 모션·조판·색 값 규칙(구 §1·§2·§5·§6)은 스킬 권한으로 이관한다고 명시.
- [ ] **Step 6: 커밋**

```bash
git add src/app/globals.css tests/design-tokens.test.ts docs/design-language.md
git commit -m "feat(renewal): 토큰 2세트 — 마케팅 다크 스코프 + 앱 라이트 재조율 + 계약 테스트 v3"
```

---

### Task 2: 모션 리프 컴포넌트 (GSAP·Motion 격리)

**Files:**
- Create: `src/components/motion/pin-scene.tsx`, `src/components/motion/sticky-stack.tsx`, `src/components/motion/reveal.tsx`
- Test: `src/components/motion/reveal.test.tsx`

**Interfaces:**
- Produces:
  - `PinScene({ children, length, onProgress }: { children: ReactNode; length?: number; onProgress?: (p: number) => void })` — 섹션을 `start:"top top"`에서 핀하고 `length`(px, 기본 1500) 만큼 스크럽, 진행률 0~1을 `onProgress`로 전달. GSAP ScrollTrigger, tasteskill §5.B 골격 준수, `useReducedMotion`이면 핀 없이 정적 렌더.
  - `StickyStack({ cards }: { cards: ReactNode[] })` — tasteskill §5.A 캐노니컬 골격 그대로.
  - `Reveal({ children, index, className }: { children: ReactNode; index?: number; className?: string })` — Motion `whileInView` 스태거(tasteskill §5.C 골격: `viewport={{ once: true, amount: 0.3 }}`, `delay: index * 0.06`, ease `[0.16, 1, 0.3, 1]`, reduced-motion이면 `initial={false}`).
- 셋 다 `'use client'` 리프. GSAP 컴포넌트 안에서 Motion 사용 금지(혼용 금지 규칙).

- [ ] **Step 1: Reveal 테스트 먼저** — jsdom에서 렌더·reduced-motion 분기 검증:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Reveal } from './reveal'

afterEach(cleanup)

describe('Reveal — Motion whileInView 리빌', () => {
  it('자식을 렌더하고 viewport-once 리빌 래퍼를 단다', () => {
    render(<Reveal index={2}>내용</Reveal>)
    expect(screen.getByText('내용')).toBeTruthy()
  })
  it('index 스태거 지연이 60ms 단위다 (계약: delay = index * 0.06s)', async () => {
    // 컴포넌트가 export하는 REVEAL_STAGGER_S 상수로 단언 (매직넘버 방지)
    const { REVEAL_STAGGER_S } = await import('./reveal')
    expect(REVEAL_STAGGER_S).toBeCloseTo(0.06)
  })
})
```

- [ ] **Step 2: 실패 확인** → **Step 3: 세 컴포넌트 구현** (스킬 골격 코드 사용 — tasteskill §5.A/5.B/5.C를 그대로 옮기되 프로젝트 컨벤션 주석) → **Step 4: `pnpm test` + `pnpm build`** (GSAP SSR 안전 확인 — 클라이언트 리프라 빌드에 문제 없어야 함)
- [ ] **Step 5: 커밋**

```bash
git add src/components/motion
git commit -m "feat(renewal): 모션 리프 — PinScene·StickyStack(GSAP)·Reveal(Motion)"
```

---

### Task 3: 마케팅 셸 — 다크 표면 + 글래스 필 내비 + 히어로 (M1a)

**Files:**
- Modify: `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`(히어로 구간), `src/components/site-header.tsx`, `src/components/site-footer.tsx`
- Create: `src/components/marketing/`(히어로 등 섹션 컴포넌트 — 구성은 design_plan이 확정)

**절차 계약 (스킬 주도 — 코드는 design_plan이 결정):**

- [ ] **Step 1: 스킬 원문 정독** — `taste-skill/SKILL.md` 전체 + `gpt-tasteskill/SKILL.md` 전체 + `soft-skill/SKILL.md` §3·§4·§5.
- [ ] **Step 2: `<design_plan>` 산출(리포트에 기록, 코드 작성 전)** — gpt-taste §8 형식: 다이얼(VARIANCE 8·MOTION 7·DENSITY 4) · 히어로 아키텍처 선택(랜덤화 근거) · 타이포 스택(SUIT 확정, 웨이트·스케일) · 컴포넌트 아스널 3종 · GSAP 패러다임 2종 · 히어로 H1 `max-w` 검증(2줄 보장) · AIDA 배치.
- [ ] **Step 3: 구현.** 계약:
  - `(marketing)/layout.tsx`(및 이 태스크에서는 아님 — audit은 Task 5)가 `.surface-dark` 래퍼로 다크 스코프를 연다.
  - 내비: 플로팅 글래스 필(디태치드), 데스크톱 1줄·높이 ≤72px, blur는 고정 요소에만. `SiteHeader`의 **로그인 분기·내비 라벨·로그아웃 로직은 보존**(마크업·스타일만 재구성). 앱 표면에서는 기존 라이트 헤더 유지 — 헤더 컴포넌트에 표면 변형 prop 또는 마케팅 전용 헤더 분리(구현자 판단, 리포트에 근거).
  - 히어로 콘텐츠(보존): H1 "고객이 AI에게 물었을 때, 우리 브랜드가 불리고 있나"(2줄 유지 확인) · 실측 답변 원문(`AnswerSpecimen` 데이터 — 2026-07-30 실측, marks 규칙 유지) · 실측 언급률+구간(wilsonInterval(5,6)) · CTA "무료 진단 받기" 1개 + 보조 1개. 히어로 스택 ≤4 요소.
  - 무료진단 신청 폼(RequestForm)은 히어로 또는 직하 섹션에 유지 — 전환 경로 보존.
- [ ] **Step 4: 검증** — `pnpm test`(랜딩 관련 기존 테스트 갱신 포함) + `pnpm typecheck` + `pnpm build`. 리포트에 §14 Pre-Flight 중 히어로·내비 관련 항목 체크표.
- [ ] **Step 5: 커밋** — `feat(renewal): 마케팅 다크 셸 + 글래스 필 내비 + 히어로` (명시 경로)

---

### Task 4: 랜딩 본문 — 벤토·"실측 재현" 스크롤텔링·Action (M1b)

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Create: `src/components/marketing/`(벤토·스크롤텔링·CTA 섹션)

**절차 계약:**

- [ ] **Step 1: design_plan 갱신** — Task 3 리포트의 design_plan에 이어 섹션 구성 확정: 레이아웃 패밀리 ≥4종, 지그재그 ≤2연속, 아이브로 ≤ceil(섹션수/3), 마퀴 ≤1.
- [ ] **Step 2: 구현.** 계약:
  - **Interest:** "리포트에 들어가는 것" 4항목 → gapless 벤토(`grid-flow-dense`, 셀 수=4, 배경 다양성 — 실측 화면/표본 셀 포함, 흰 텍스트 카드만 금지).
  - **Desire — 시그니처:** `PinScene` 기반 "실측 재현" 스크롤텔링 — 진행률에 바인딩해 ① 실측 질의 타이핑 ② 답변 스트리밍(실측 원문) ③ 자기 브랜드 언급 하이라이트 ④ 언급률 83% (61%~96%) 정착. 데이터는 `AnswerSpecimen` 표본과 wilsonInterval(5,6) — **조작 금지**. reduced-motion이면 완성 상태 정적 렌더.
  - 보존 섹션: "무엇을 묻는지 공개합니다"(QueryProtocol — 측정 파이프라인과 같은 함수) · "신청하면" 3단계(StickyStack 적용 검토 — 순서가 실제 정보) · "무료 진단으로 알 수 없는 것"(한계 고지 — 이 제품의 신뢰 섹션, 삭제 금지).
  - 고객 로고·후기 섹션 만들지 않는다(하드 룰).
  - 카피: 보이스 보존, em-dash 재구성, 서브텍스트 ≤20단어 규칙 적용 시에도 주장 불변.
- [ ] **Step 3: 검증** — `pnpm test`+`typecheck`+`build`. **리포트에 §14 Pre-Flight 전 항목 체크표**(마케팅 페이지 완성 게이트).
- [ ] **Step 4: 커밋** — `feat(renewal): 랜딩 본문 — 벤토·실측 재현 스크롤텔링·CTA`

---

### Task 5: 요금제 + 무료진단 신청·완료 화면 (M2)

**Files:**
- Modify: `src/app/(marketing)/pricing/page.tsx`, `src/app/audit/layout.tsx`, `src/app/audit/new/page.tsx`, `src/app/audit/requested/page.tsx`, `src/components/audit/request-form.tsx`(스타일만)

**절차 계약:**

- [ ] **Step 1:** audit 레이아웃에 `.surface-dark` 적용(신청 흐름 = 마케팅 표면). 단 `audit/[id]` 리포트는 **라이트 유지**(앱·인쇄 표면) — 레이아웃 분기 확인, 리포트 라우트가 다크에 물리면 안 된다.
- [ ] **Step 2: 요금제.** 보존: H1 "측정 횟수가 곧 신뢰구간의 넓이입니다" · `PLANS` 데이터 구동(하드코딩 금지) · 정직 블록("결제는 아직 열리지 않았습니다"). 3-타워 클리셰 탈피(추천 티어는 색·강조로), 표 판독성 우선, Reveal 리빌.
- [ ] **Step 3: 신청 폼.** 필드 이름·순서·검증 로직 보존(분석·자동완성 보호), 라벨-위-인풋 유지, 다크 폼 대비 AA(§14 Form Contrast), 로딩·에러·성공 풀 사이클 확인(기존 로직 보존, 스타일 격상).
- [ ] **Step 4: 검증** — `pnpm test`(audit 관련 테스트 초록)+`typecheck`+`build` + §14 체크표(요금제·신청 페이지분).
- [ ] **Step 5: 커밋** — `feat(renewal): 요금제·무료진단 신청 다크 리뉴얼`

**⚠️ 컨트롤러 브라우저 게이트 #1:** 랜딩·요금제·신청 실물(playwright webServer :3000, 종료 후 netstat) — 히어로 2줄·스크롤텔링 핀 동작·reduced-motion·375px·폼 제출 경로·다크/라이트 경계(`audit/[id]`는 라이트).

---

### Task 6: 앱 공통 프리미티브 + 표면 (A1)

**Files:**
- Modify: `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`, `tabs.tsx`, `select.tsx`, `dialog.tsx`, `skeleton.tsx`, `src/components/site-header.tsx`(앱 표면), `src/app/(app)/layout.tsx`(컨테이너·간격)

**절차 계약:**

- [ ] **Step 1: 스킬 정독** — `redesign-skill/SKILL.md` 전체 + `soft-skill/SKILL.md` §2·§4·§6.
- [ ] **Step 2: 구현.** redesign-skill Fix Priority 순서(1 서체 → 2 색 → 3 호버·프레스 → 4 간격 → 5 컴포넌트 → 6 상태). 계약:
  - double-bezel 카드(soft-skill §4.A — 외피+내핵, radius 계산식), 틴트 그림자, 스프링 프레스(`active:scale-[0.98]`), 포커스 링 보존(접근성 회귀 금지).
  - 스켈레톤: 레이아웃 모양 셔머(redesign-skill).
  - `radius 0.75rem` 체계 일관 적용(Shape Lock).
  - 기존 컴포넌트 API·variant 이름 변경 금지(호출부 호환) — 클래스 문자열만 재설계.
- [ ] **Step 3: 검증** — `pnpm test` 전체(UI 관련 단언 갱신 포함)+`typecheck`+`build`.
- [ ] **Step 4: 커밋** — `feat(renewal): 앱 프리미티브 격상 — double-bezel·스프링 프레스·셔머`

---

### Task 7: 대시보드 (A2)

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard/*`(전부), `src/components/interval-bar.tsx`
- Create: `src/app/(app)/dashboard/loading.tsx`

**절차 계약:**

- [ ] **Step 1: 구현.** 계약:
  - 헤드라인·차트·히트맵·출처·회차 목록 표면 격상(카드·간격·타이포), Motion 진입 모션(Reveal — 계기판이므로 절제, once).
  - 추이 차트: 호버 툴팁+크로스헤어 신설(기존 `<title>` 내용 그대로 시각화), 드로우인은 Motion/CSS로. **렌더 로직(splitSegments·밴드·n=0·캡션) 변경 금지** — 스타일 레이어만.
  - 히트맵: 셀 램프 의미 유지(브랜드색 농도), 스타일 격상.
  - `loading.tsx` 스켈레톤(실 레이아웃 뼈대).
  - 빈 상태 문구 보존(방향 제시 카피).
- [ ] **Step 2: 검증** — `pnpm test`(dashboard 스위트 초록 — 데이터 단언 불변)+`typecheck`+`build`.
- [ ] **Step 3: 커밋** — `feat(renewal): 대시보드 격상 — 표면·툴팁·스켈레톤`

---

### Task 8: 온보딩 + 회차상세·리포트 (A3)

**Files:**
- Modify: `src/app/(app)/onboarding/**`(3단계 페이지 + query-editor), `src/app/(app)/dashboard/runs/[runId]/page.tsx`, `src/components/audit/result-view.tsx`, `report-cover.tsx`(필요시)

**절차 계약:**

- [ ] **Step 1: 온보딩.** 단계 전환 모션(진행 방향), 에디터 마이크로(생성 중 표시·검증 피드백·동결 확인 모먼트 — Motion), 폼 필드·검증 로직·문구 보존.
- [ ] **Step 2: 리포트.** 화면 표면 격상 + `result-view.tsx:303-312` 경쟁사 배지 `text-incomplete-fg` → 중립색 정정(이연 백로그 해소). **print CSS 규칙(break-*·orphans·표지) 한 줄도 제거 금지** — 변경분이 print에 영향 주는지 diff로 확인해 리포트에 명시.
- [ ] **Step 3: 검증** — `pnpm test` 전체+`typecheck`+`build`.
- [ ] **Step 4: 커밋** — `feat(renewal): 온보딩·리포트 격상 + 경쟁사 배지 정정`

**⚠️ 컨트롤러 브라우저 게이트 #2:** 앱 전 화면 실물(실데이터 계정) — 대시보드 판독성·차트 동작·온보딩 완주 경로·reduced-motion·375px + **`pnpm audit:pdf` 실측 1회로 PDF 회귀 검증**.

---

### Task 9: 디자인 배터리 + 카피 스윕 (G)

**Files:**
- Create: `tests/design-rules.test.ts`

- [ ] **Step 1: 배터리 작성:**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 마케팅 표면 소스 — tasteskill §9(AI Tells)의 자동화 가능분을 잠근다 */
const MARKETING_DIRS = ['src/app/(marketing)', 'src/components/marketing', 'src/app/audit/new', 'src/app/audit/requested']
const root = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(full) ? [full] : []
  })
}

/** 주석 제거 — 코드 주석의 설명용 문장부호는 규칙 대상이 아니다 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const marketingFiles = MARKETING_DIRS.flatMap((d) => walk(join(root, d))).map((path) => ({
  path,
  visible: stripComments(readFileSync(path, 'utf8')),
}))

describe('디자인 배터리 — 마케팅 표면 (tasteskill §9 자동화분)', () => {
  it('em-dash·en-dash 금지 (§9.G — 주석 제외 전체)', () => {
    expect(marketingFiles.filter((f) => /[—–]/.test(f.visible)).map((f) => f.path)).toEqual([])
  })

  it('스크롤 큐 문자열 금지 (§9.F)', () => {
    expect(
      marketingFiles.filter((f) => /Scroll to explore|스크롤하여 탐색|↓\s*scroll/i.test(f.visible)).map((f) => f.path),
    ).toEqual([])
  })

  it('섹션 번호 아이브로 금지 — "01 /", "001 ·" 류 (§9.F)', () => {
    expect(
      marketingFiles.filter((f) => /['">]\s*0\d\s*[/·]\s/.test(f.visible)).map((f) => f.path),
    ).toEqual([])
  })
})

describe('전역 규칙', () => {
  const globals = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
  it('reduced-motion 킬 스위치 5선언 유지', () => {
    for (const decl of [
      'transition-duration: 0.01ms !important',
      'animation-duration: 0.01ms !important',
      'animation-iteration-count: 1 !important',
      'animation-delay: 0.01ms !important',
      'transition-delay: 0ms !important',
    ]) expect(globals).toContain(decl)
  })
  it('순수 #000000 배경 금지', () => {
    expect(globals).not.toMatch(/--background:\s*(#000000|oklch\(\s*0\s+0\s+0\s*\))/)
  })
})
```

- [ ] **Step 2: 실행 — 위반 시 배터리가 아니라 위반 파일을 고친다.** `pnpm test` 전체 초록.
- [ ] **Step 3: 커밋** — `test(design): 마케팅 AI-Tells 배터리 + 전역 모션·색 규칙 잠금`

**⚠️ 컨트롤러 브라우저 게이트 #3 (최종):** 전 화면 스크린샷 패스 + Lighthouse(모바일 — LCP<2.5s·CLS<0.1 확인, GSAP 번들이 앱 라우트에 새지 않는지 빌드 분석) + tasteskill §14 전 항목 최종 대조 + 최종 전체 브랜치 리뷰.

---

## 이연·주의

- 이미지 생성 도구 없음 — 실 스크린샷·실측 데이터가 비주얼 자산. 분위기 배경만 picsum+CSS 필터 허용.
- `visual-elevation` 브랜치는 최종 병합 후 삭제 판단(사용자 확인).
- Lighthouse·PDF·브라우저 게이트는 컨트롤러(메인 세션) 몫 — 서브에이전트는 dev 서버 금지.
