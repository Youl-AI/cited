# 시각 격상 (계측 미학 v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** design-v1(절제판)에 스펙 `docs/superpowers/specs/2026-08-03-visual-elevation-design.md`의 모션·연출·엘리베이션을 입힌다 — 반응성과 연출로 프리미엄 인상을 만들되 정직성 규칙은 한 줄도 깨지 않는다.

**Architecture:** CSS-first. 모든 움직임은 `globals.css`의 토큰·키프레임·클래스 어휘 하나로 통일하고, 컴포넌트는 클래스와 인라인 CSS 변수(`--motion-index`, `--draw-*`)만 단다. 세션 내 1회 규칙은 `MotionScope`(클라이언트 게이트 1개)가 `data-animate` 속성으로 전체를 켜고 끈다. 시그니처 히어로만 JS 타임라인(rAF)을 쓰는 클라이언트 컴포넌트다.

**Tech Stack:** Tailwind v4 `@theme` 토큰 · CSS keyframes · IntersectionObserver(랜딩 스크롤 리빌 1곳) · vitest 4 + jsdom. **신규 의존성 0개.**

## Global Constraints

스펙에서 그대로 옮긴 계약 — 모든 태스크에 적용된다.

- 토큰 값(계약): `--motion-micro: 120ms` · `--motion-enter: 200ms` · `--motion-chart: 240ms` · `--motion-draw: 600ms` · `--motion-stagger: 50ms` · `--ease-out: cubic-bezier(0.2, 0, 0, 1)` · `--ease-spring: cubic-bezier(0.34, 1.4, 0.4, 1)`
- **점과 구간 밴드는 반드시 동시 완성** — 점이 밴드보다 먼저 완성되는 드로우인은 §0 위반. 테스트로 지킨다.
- **계측값 카운트업 금지** (굴러가는 숫자는 전부 거짓 값을 경유한다). 히어로 카운터는 "개별 사건 1건씩 누적"만 허용.
- **등장 오케스트레이션은 화면당 세션 내 1회**, 위계 순(제목 → 계측값 → 보조), 총 600ms 이내.
- **스크롤 트리거 리빌은 랜딩(마케팅 화면)만.** 앱 화면(온보딩·대시보드) 금지.
- **루프 애니메이션 금지** — 유일한 예외는 로딩 스켈레톤의 셔머와 로딩 상태 표시(스트리밍 커서 포함).
- **레이아웃 속성(width·height·top·margin) 애니메이션 금지** — opacity·transform·color·box-shadow·filter만.
- **스프링 이징은 프레스 복귀·비데이터 아이콘 전용.** 데이터 요소(점·밴드·바) 금지.
- **호버 리프트는 클릭 가능한 것만.** 정보 표시용 카드는 움직이지 않는다.
- `prefers-reduced-motion: reduce` 전역 킬 스위치(globals.css 기존 규칙) 아래에서 전 기능 사용 가능해야 한다.
- **모션 클래스의 초기 상태(opacity 0 등)는 키프레임 `from` 또는 `@media screen` 안에만** 둔다 — 프린트(PDF)·no-JS에서 콘텐츠가 사라지면 안 된다. 모션 어휘 블록 전체를 `@media screen`으로 감싼다.
- 신규 npm 의존성 금지. API 비용 0원(히어로는 저장된 실측 표본 박제).
- 조판 규칙 유지: sans는 말·mono는 계측값, keep-all, 원색 팔레트 클래스 금지, `-fg` 짝.
- 커밋: 명시 경로만 스테이징(`git add -A` 금지), 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 테스트: `pnpm test`(vitest run). 기존 1296개 전부 유지.

**스펙과의 해소된 충돌 2건** (구현 전 확정):
1. 스펙 §4.1 "헤더 스크롤 시 blur + **축소**" — 높이 축소는 §5 레이아웃 속성 금지와 충돌. **blur + 배경 반투명 + 그림자만** 적용하고 높이는 고정한다(계약 우선).
2. 스펙 §1 #12 View Transitions(2순위) — Next 16에서 experimental 플래그가 필요해 이번 패스에서 **이연**한다. 강등 경로(일반 내비게이션)가 이미 기본이므로 잃는 것이 없다. 백로그에 남긴다.

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/app/globals.css` | 모션 토큰 + elevation 토큰 + 키프레임 + 모션 클래스 어휘 (전부 여기 한 곳) |
| `docs/design-language.md` | §5 v2 개정 + §6 체크리스트 추가 |
| `tests/design-tokens.test.ts` | 모션·elevation 토큰 값 계약 |
| `tests/design-rules.test.ts` (신설) | grep 배터리 — transition-all·인라인 cubic-bezier·원색 팔레트 금지 |
| `src/components/motion/motion-scope.tsx` (신설) | 화면 단위 세션 1회 게이트 (`data-animate`) |
| `src/components/motion/reveal-on-scroll.tsx` (신설) | 랜딩 전용 스크롤 리빌 |
| `src/components/marketing/hero-sample.ts` (신설) | 히어로 실측 표본(랜딩 페이지에서 이동) |
| `src/components/marketing/replay-timeline.ts` (신설) | 히어로 재생 시간표 — 순수 함수 |
| `src/components/marketing/replay-hero.tsx` (신설) | 시그니처 히어로 "실측 재현" |
| `src/components/dashboard/draw-schedule.ts` (신설) | 차트 드로우인 시간표 — 순수 함수(점·밴드 동시 완성 불변식) |
| `src/components/ui/button.tsx` `badge.tsx` `tabs.tsx` `skeleton.tsx` | 프리미티브 — transition-all 제거·프레스·셔머 |
| `src/components/interval-bar.tsx` | `drawIn` 옵션 |
| `src/components/dashboard/trend-chart.tsx` `sov-trend.tsx` `query-heatmap.tsx` `run-list.tsx` `headline-card.tsx` `brand-picker.tsx` | 드로우인·툴팁·스태거·호버 |
| `src/components/site-header.tsx` | 스크롤 blur |
| `src/app/(marketing)/page.tsx` `pricing/page.tsx` | 히어로 교체·리빌·elevation |
| `src/app/(app)/dashboard/page.tsx` + `loading.tsx`(신설) + `runs/[runId]/loading.tsx`(신설) | 오케스트레이션·스켈레톤 |
| `src/app/(app)/onboarding/page.tsx` `queries/page.tsx` `queries/query-editor.tsx` `done/page.tsx` | 단계 전환·마이크로·동결 연출 |
| `src/components/audit/answer-specimen.tsx` | `trailing`/`queryTrailing` 슬롯(히어로 타이핑용) |
| `src/components/audit/result-view.tsx` + `src/app/(app)/dashboard/runs/[runId]/page.tsx` | 등장 + 경쟁사 배지 색 정정 |

---

### Task 0: 모션 토큰·키프레임·어휘 + design-language §5 v2 (P0)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/design-tokens.test.ts`
- Modify: `docs/design-language.md`

**Interfaces:**
- Produces: CSS 클래스 어휘 — `.motion-rise` `.motion-fade` `.motion-slide-in` `.motion-hold` `.motion-press` `.motion-shimmer` `.motion-caret` `.motion-check` `.motion-lock` `.motion-bar-fill` `.motion-draw-line` `.motion-draw-fade`; CSS 변수 — `--motion-*` 5종, `--ease-out`(재정의) `--ease-spring`, `--shadow-elevation-1/2/3`(→ Tailwind `shadow-elevation-N` 유틸리티); 게이트 셀렉터 `[data-animate='false']`. 이후 모든 태스크가 이 이름들을 쓴다.
- 인라인 변수 규약: `--motion-index`(스태거 순번) · `--draw-ms` `--draw-delay` `--draw-opacity`(드로우인 시간표).

- [ ] **Step 1: 토큰 계약 테스트부터 쓴다** — `tests/design-tokens.test.ts` 끝에 추가:

```ts
describe('모션 토큰 v2 — 시각 격상의 계약 (design-language §5 v2)', () => {
  it('지속시간·스태거 토큰이 계약값 그대로다', () => {
    expect(readToken('motion-micro', themeBlock)).toBe('120ms')
    expect(readToken('motion-enter', themeBlock)).toBe('200ms')
    expect(readToken('motion-chart', themeBlock)).toBe('240ms')
    expect(readToken('motion-draw', themeBlock)).toBe('600ms')
    expect(readToken('motion-stagger', themeBlock)).toBe('50ms')
  })

  it('이징 — ease-out은 §5 곡선으로 재정의되고, spring은 복귀 전용 곡선이다', () => {
    expect(readToken('ease-out', themeBlock)).toBe('cubic-bezier(0.2, 0, 0, 1)')
    expect(readToken('ease-spring', themeBlock)).toBe('cubic-bezier(0.34, 1.4, 0.4, 1)')
  })

  it('elevation 3단이 있고 전부 다층 그림자다 (1px 윤곽 + 확산)', () => {
    for (const name of ['shadow-elevation-1', 'shadow-elevation-2', 'shadow-elevation-3']) {
      const value = readToken(name, themeBlock)
      expect(value, name).not.toBeNull()
      // oklch()는 쉼표를 안 쓰므로 쉼표 개수 = 레이어 수 - 1
      expect((value ?? '').split(',').length, `${name}는 다층이어야 한다`).toBeGreaterThanOrEqual(2)
    }
  })

  it('모션 어휘 블록은 @media screen 안에 있다 — 프린트·PDF는 항상 최종 상태다', () => {
    const screenBlock = blockBody(/@media\s+screen\s*\{/)
    for (const cls of ['motion-rise', 'motion-draw-line', 'motion-shimmer', 'motion-hold']) {
      expect(screenBlock, `.${cls}는 @media screen 안에 있어야 한다`).toContain(`.${cls}`)
    }
  })
})
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `pnpm vitest run tests/design-tokens.test.ts`
Expected: FAIL (`motion-micro` 토큰 없음)

- [ ] **Step 3: globals.css — `@theme` 블록(한글 조판 스케일 위쪽, 엔진 계열색 아래)에 토큰 추가**

```css
  /* ---- 모션 토큰 v2 (docs/design-language.md §5) ------------------------
     감쇠 있는 정밀 기계 — 움직임은 장식이 아니라 "계측기가 살아 있다"는
     증거다. 값은 계약이다(tests/design-tokens.test.ts).
     --ease-out 재정의: Tailwind 기본(0,0,0.2,1)을 §5 계약 곡선으로 바꾼다 —
     이제 `ease-out` 유틸리티가 곧 디자인 언어의 곡선이라 인라인
     cubic-bezier를 쓸 이유가 없다(grep 배터리가 금지한다).
     --ease-spring은 프레스 복귀·비데이터 아이콘 전용(오버슈트 4% 이내).
     데이터 요소(점·밴드·바)에 쓰면 §5 위반이다. */
  --motion-micro: 120ms;
  --motion-enter: 200ms;
  --motion-chart: 240ms;
  --motion-draw: 600ms;
  --motion-stagger: 50ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.4, 1);

  /* ---- elevation 3단 ----------------------------------------------------
     다층이어야 "종이 위 높이"로 읽힌다: 1px 윤곽 + 근거리 + (2단부터) 원거리.
     색은 --foreground와 같은 색조(258)의 저불투명 — 배경과 이질감이 없다.
     쓰는 곳: 1 = 떠 있는 카드·버튼, 2 = 호버 확장·툴팁, 3 = 모달급. */
  --shadow-elevation-1: 0 0 0 1px oklch(0.2 0.015 258 / 0.03), 0 1px 2px oklch(0.2 0.015 258 / 0.05);
  --shadow-elevation-2: 0 0 0 1px oklch(0.2 0.015 258 / 0.03), 0 2px 4px -1px oklch(0.2 0.015 258 / 0.05), 0 8px 16px -4px oklch(0.2 0.015 258 / 0.06);
  --shadow-elevation-3: 0 0 0 1px oklch(0.2 0.015 258 / 0.04), 0 4px 8px -2px oklch(0.2 0.015 258 / 0.06), 0 16px 32px -8px oklch(0.2 0.015 258 / 0.09);
```

- [ ] **Step 4: globals.css — 파일 끝(`@layer base` 블록 뒤)에 모션 어휘 추가**

```css
/* ---------------------------------------------------------------------------
   모션 어휘 v2 — docs/design-language.md §5.
   전부 @media screen 안이다. 프린트(리포트 PDF)와 비화면 매체는 애니메이션
   속성 자체를 받지 않으므로 항상 최종 상태로 찍힌다. 초기 상태(opacity 0,
   dashoffset)는 이 블록과 키프레임 from에만 있다 — 컴포넌트 클래스에 직접
   opacity-0을 쓰면 애니메이션이 죽은 환경에서 요소가 영영 안 보인다.

   인라인 변수 규약:
   - --motion-index: 등장 스태거 순번 (지연 = index × --motion-stagger)
   - --draw-ms / --draw-delay / --draw-opacity: 차트 드로우인 시간표
     (drawSchedule()이 세그먼트별로 계산해 준다)
--------------------------------------------------------------------------- */
@media screen {
  /* 등장 오케스트레이션 — 위계 순 스태거. 화면당 세션 내 1회(MotionScope). */
  .motion-rise {
    animation: motion-rise var(--motion-enter) var(--ease-out) both;
    animation-delay: calc(var(--motion-index, 0) * var(--motion-stagger));
  }

  /* 등장(fade만) — 히트맵 셀처럼 자리 이동이 어색한 곳 */
  .motion-fade {
    animation: motion-fade var(--motion-enter) var(--ease-out) both;
    animation-delay: calc(var(--motion-index, 0) * var(--motion-stagger));
  }

  /* 온보딩 단계 전환 — 진행 방향(오른쪽)에서 들어온다. 단계마다 재생(진행감). */
  .motion-slide-in {
    animation: motion-slide-in var(--motion-enter) var(--ease-out) both;
  }

  /* 스크롤 리빌 대기 상태 — RevealOnScroll이 뷰포트 밖 요소에만 붙인다 */
  .motion-hold {
    opacity: 0;
  }

  /* 프레스 피드백 — transition-all의 대체 어휘. 복귀(transform)만 스프링. */
  .motion-press {
    transition:
      color var(--motion-micro) var(--ease-out),
      background-color var(--motion-micro) var(--ease-out),
      border-color var(--motion-micro) var(--ease-out),
      opacity var(--motion-micro) var(--ease-out),
      box-shadow var(--motion-micro) var(--ease-out),
      transform var(--motion-micro) var(--ease-spring),
      translate var(--motion-micro) var(--ease-spring),
      scale var(--motion-micro) var(--ease-spring);
  }

  /* 셔머 — §5 루프 금지의 유일한 예외 (로딩 스켈레톤 한정) */
  .motion-shimmer {
    position: relative;
    overflow: hidden;
  }
  .motion-shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, oklch(1 0 0 / 0.6), transparent);
    animation: motion-shimmer 1.6s var(--ease-out) infinite;
  }

  /* 스트리밍 커서 — 생성·스트리밍이 실제로 진행 중일 때만 (로딩 상태 표시) */
  .motion-caret {
    animation: motion-caret 1s steps(2, jump-none) infinite;
  }

  /* 마이크로 확인 — 검증 통과 체크 아이콘 (비데이터라 스프링 허용) */
  .motion-check {
    animation: motion-check var(--motion-micro) var(--ease-spring) both;
  }

  /* 잠금 정착 — 동결 확인 패널의 자물쇠 */
  .motion-lock {
    animation: motion-lock var(--motion-chart) var(--ease-spring) both;
  }

  /* IntervalBar 차오름 — 밴드가 왼쪽에서 차오른다(transform이라 §5 합법) */
  .motion-bar-fill {
    transform-origin: left;
    animation: motion-bar-fill var(--motion-draw) var(--ease-out) both;
  }

  /* 차트 선 드로우인 — 반드시 pathLength={1}과 함께 쓴다 */
  .motion-draw-line {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: motion-draw-line var(--draw-ms, var(--motion-draw)) var(--ease-out)
      var(--draw-delay, 0ms) forwards;
  }

  /* 차트 페이드 등장 — 밴드·점. 최종 불투명도는 --draw-opacity.
     ★ 점의 완성 시각(delay+ms)은 밴드의 완성 시각과 같아야 한다 —
       drawSchedule()이 계산하고 테스트가 지킨다(§0: 점추정 단독 노출 금지). */
  .motion-draw-fade {
    opacity: 0;
    animation: motion-draw-fade var(--draw-ms, var(--motion-enter)) linear
      var(--draw-delay, 0ms) forwards;
  }

  /* 화면 단위 모션 게이트 — MotionScope가 단다. 세션 내 재방문이면
     등장·드로우인을 즉시 최종 상태로 보낸다(0.01ms에 forwards 완료). */
  [data-animate='false'] .motion-rise,
  [data-animate='false'] .motion-fade,
  [data-animate='false'] .motion-bar-fill,
  [data-animate='false'] .motion-draw-line,
  [data-animate='false'] .motion-draw-fade {
    animation-duration: 0.01ms;
    animation-delay: 0ms;
  }

  @keyframes motion-rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes motion-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes motion-slide-in {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes motion-shimmer {
    to {
      transform: translateX(100%);
    }
  }
  @keyframes motion-caret {
    50% {
      opacity: 0;
    }
  }
  @keyframes motion-check {
    from {
      opacity: 0;
      scale: 0.6;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
  @keyframes motion-lock {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.85);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes motion-bar-fill {
    from {
      scale: 0 1;
    }
    to {
      scale: 1 1;
    }
  }
  @keyframes motion-draw-line {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes motion-draw-fade {
    to {
      opacity: var(--draw-opacity, 1);
    }
  }
}
```

- [ ] **Step 5: 실행 — 통과 확인**

Run: `pnpm vitest run tests/design-tokens.test.ts`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 6: design-language.md §5를 v2로 교체** — 현재 §5 전체(`## 5. 모션`부터 `## 6.` 직전까지)를 다음으로 교체:

```markdown
## 5. 모션 (v2 — 2026-08-03 시각 격상)

미학의 뼈대는 **감쇠 있는 정밀 기계**다. 좋은 계측기는 바늘이 *움직여서*
신뢰를 준다 — 튀지 않고, 감쇠를 갖고, 정확히 멈춘다.

- **움직이는 것:** opacity·transform(translate/scale)·color 계열
  (color·background-color·border-color)·box-shadow·backdrop-filter만.
  레이아웃 속성(width·height·top·margin)은 애니메이션하지 않는다.
- **지속시간 토큰:** 마이크로 `--motion-micro`(120ms) · 등장
  `--motion-enter`(200ms) · 차트 상태 전환 `--motion-chart`(240ms) ·
  차트 최초 드로우인 상한 `--motion-draw`(600ms) · 등장 스태거 간격
  `--motion-stagger`(50ms). 이보다 길게 쓰지 않는다.
- **이징:** `--ease-out`(= `ease-out` 유틸리티) 기본. `--ease-spring`은
  **프레스 복귀·비데이터 아이콘 전용**(오버슈트 4% 이내) — 데이터 요소
  (점·밴드·바·숫자)에 쓰면 위반이다. 인라인 cubic-bezier 금지
  (tests/design-rules.test.ts가 지킨다).
- **등장 오케스트레이션:** 화면당 **세션 내 1회**(`MotionScope`), 위계 순
  스태거(제목 → 계측값 → 보조), 총 600ms 이내. 재방문·리렌더에는 재생 안 함.
- **차트 드로우인:** 마운트 1회만. 선은 그리기(dashoffset), 밴드는 fade,
  **점과 밴드는 동시 완성**(`drawSchedule()` — 점이 구간보다 먼저 완성되면
  §0 위반이다). 끊긴 세그먼트는 세그먼트별 순차 등장 — 끊김 자체가 연출로
  강조된다(정직성의 시각화). 히트맵은 행 우선 셀 스태거 fade.
- **프레스 피드백:** `.motion-press` + `active:scale-[0.98]` + 그림자 수축.
  복귀만 스프링.
- **호버 리프트는 클릭 가능한 것만.** 정보 표시용 카드는 움직이지 않는다 —
  눌리는 것만 움직여야 어포던스가 정직하다.
- **스크롤 트리거 리빌은 마케팅(랜딩·요금제)만.** 앱 화면은 문서가 아니라
  계기판이다.
- **루프 애니메이션 금지.** 예외 둘뿐: 로딩 스켈레톤의 셔머(`.motion-shimmer`),
  실제 진행 중인 생성·스트리밍의 커서(`.motion-caret`) — 둘 다 로딩 상태
  표시로 한정한다.
- **`prefers-reduced-motion: reduce`면 전부 끈다.** 전역 규칙(globals.css).
  모션 클래스의 초기 상태는 키프레임 `from`과 `@media screen` 안에만 둔다 —
  프린트·no-JS에서 콘텐츠가 사라지면 안 된다.
- 데이터가 바뀌었다고 숫자를 굴리는(count-up) 연출 금지 — 계측값은 튀지 않고
  제자리에 있어야 한다. 굴러가는 숫자는 전부 거짓 값을 경유한다. 이 금지
  자체가 브랜드 스테이트먼트다.
```

- [ ] **Step 7: design-language.md §6 끝에 체크리스트 4줄 추가**

```markdown
- [ ] 점이 구간 밴드보다 먼저 완성되는 드로우인
- [ ] 앱 화면(온보딩·대시보드)의 스크롤 트리거 리빌
- [ ] 정보 표시용(비클릭) 카드의 호버 리프트
- [ ] 스프링 이징(--ease-spring)의 데이터 요소 사용
```

- [ ] **Step 8: 전체 테스트 + 커밋**

Run: `pnpm test` — Expected: PASS (1296+신규)

```bash
git add src/app/globals.css tests/design-tokens.test.ts docs/design-language.md
git commit -m "feat(motion): 모션 시스템 v2 — 토큰·키프레임·어휘 + design-language §5 개정"
```

---

### Task 1: 프리미티브 — 프레스 피드백·elevation·IntervalBar drawIn (P0)

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/tabs.tsx:66`
- Modify: `src/components/interval-bar.tsx`

**Interfaces:**
- Consumes: Task 0의 `.motion-press` `.motion-bar-fill` `.motion-draw-fade`, `shadow-elevation-*` 유틸리티, `--motion-draw` `--motion-micro`
- Produces: `IntervalBar({ interval, drawIn }: { interval: Interval; drawIn?: boolean })` — `drawIn`이면 밴드가 왼쪽에서 차오르고 점추정 눈금은 밴드 완성과 **동시에** 나타난다. Task 3(히어로)·Task 7(헤드라인)·Task 11(리포트)이 쓴다.

- [ ] **Step 1: button.tsx — cva 베이스 문자열 교체.** `transition-all` 제거, `.motion-press` 추가, `active:not-aria-[haspopup]:translate-y-px` → `active:not-aria-[haspopup]:scale-[0.98]`:

```ts
const buttonVariants = cva(
  "group/button motion-press inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
```

- [ ] **Step 2: button.tsx — default·outline 변형 교체** (CTA 미세 그라데이션 + elevation + 프레스 시 그림자 수축):

```ts
        // CTA 미세 그라데이션 — 브랜드색 위에 상부광(white/12) 오버레이만 얹는다.
        // 배경색 자체는 단색이라 hover 전환이 부드럽게 transition된다
        // (그라데이션 두 개를 갈아끼우면 전환이 뚝 끊긴다).
        default:
          "relative overflow-hidden bg-primary text-primary-foreground shadow-elevation-1 before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-b before:from-white/12 before:to-transparent hover:bg-primary/85 active:shadow-none",
        outline:
          "border-border bg-background shadow-elevation-1 hover:bg-muted hover:text-foreground active:shadow-none aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
```

- [ ] **Step 3: badge.tsx — `transition-all`을 명시 속성으로 교체.** cva 베이스에서 `transition-all` → `transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-out`

- [ ] **Step 4: tabs.tsx:66 TabsTrigger — 같은 교체.** `transition-all` → `transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-out`

- [ ] **Step 5: interval-bar.tsx 전체 교체:**

```tsx
import { formatInterval } from '@/lib/stats/wilson'
import type { Interval } from '@/lib/stats/wilson'
import { cn } from '@/lib/utils'

/**
 * 신뢰구간 띠. 점추정 하나만 보여주지 않겠다는 약속을 그림으로 만든다.
 *
 * `drawIn` — 마운트 1회 드로우인(§5 v2): 밴드가 왼쪽에서 차오르고
 * (transform scale이라 레이아웃 애니메이션 아님), 점추정 눈금은 밴드 완성
 * 시각(--motion-draw)에 **정확히 같이** 나타난다. 눈금이 먼저 뜨면 찰나라도
 * "구간 없는 점추정"이라 §0 위반이다 — 지연 = draw − micro, 길이 = micro.
 */
export function IntervalBar({ interval, drawIn = false }: { interval: Interval; drawIn?: boolean }) {
  const left = interval.lower * 100
  const width = Math.max((interval.upper - interval.lower) * 100, 0.75)
  const point = interval.point * 100
  return (
    <div
      // `print:h-2` — 화면의 1.5(6px)는 종이에서 4.5pt 남짓으로 얇아져
      // 띠 안의 점추정 눈금이 뭉개진다. 실측으로 한 단만 올린다.
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted print:h-2"
      role="img"
      aria-label={`신뢰구간 ${formatInterval(interval)}`}
    >
      <div
        className={cn('absolute inset-y-0 rounded-full bg-ci-band', drawIn && 'motion-bar-fill')}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
      <div
        className={cn('absolute inset-y-0 w-[2px] rounded-full bg-primary', drawIn && 'motion-draw-fade')}
        style={{
          left: `calc(${point}% - 1px)`,
          ...(drawIn
            ? {
                '--draw-delay': 'calc(var(--motion-draw) - var(--motion-micro))',
                '--draw-ms': 'var(--motion-micro)',
              }
            : {}),
        }}
      />
    </div>
  )
}
```

(주의: style 객체의 커스텀 속성 키는 React 19에서 그대로 허용된다 — 타입 오류가 나면 `style={{ ... } as React.CSSProperties}`로 캐스팅.)

- [ ] **Step 6: 실행**

Run: `pnpm test && pnpm typecheck`
Expected: PASS — IntervalBar 관련 기존 테스트(리포트·헤드라인)가 그대로 통과해야 한다 (`drawIn` 기본 false = 렌더 불변).

- [ ] **Step 7: 커밋**

```bash
git add src/components/ui/button.tsx src/components/ui/badge.tsx src/components/ui/tabs.tsx src/components/interval-bar.tsx
git commit -m "feat(motion): 프리미티브 프레스 피드백·elevation + IntervalBar drawIn"
```

---

### Task 2: MotionScope + RevealOnScroll (P1 기반)

**Files:**
- Create: `src/components/motion/motion-scope.tsx`
- Create: `src/components/motion/reveal-on-scroll.tsx`
- Test: `src/components/motion/motion-scope.test.tsx`, `src/components/motion/reveal-on-scroll.test.tsx`

**Interfaces:**
- Produces: `MotionScope({ scope, className, children })` — 감싼 서브트리에 `data-animate="true|false"`를 단다. 같은 `scope` 문자열로 세션 내 첫 마운트만 true. `RevealOnScroll({ index, className, children })` — 랜딩 전용, 뷰포트 진입 시 1회 `.motion-rise`.

- [ ] **Step 1: 테스트 먼저** — `src/components/motion/motion-scope.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MotionScope } from './motion-scope'

afterEach(cleanup)
beforeEach(() => window.sessionStorage.clear())

describe('MotionScope — 화면당 세션 내 1회 (§5 v2)', () => {
  it('첫 마운트는 data-animate=true고 본 것으로 기록한다', () => {
    const { container } = render(
      <MotionScope scope="test-screen">
        <p>내용</p>
      </MotionScope>,
    )
    expect(container.querySelector('[data-animate="true"]')).not.toBeNull()
    expect(window.sessionStorage.getItem('motion:test-screen')).toBe('1')
  })

  it('같은 scope의 두 번째 마운트는 data-animate=false다', () => {
    const first = render(<MotionScope scope="test-screen">1</MotionScope>)
    first.unmount()
    const { container } = render(<MotionScope scope="test-screen">2</MotionScope>)
    expect(container.querySelector('[data-animate="false"]')).not.toBeNull()
  })

  it('scope가 다르면 서로 간섭하지 않는다', () => {
    render(<MotionScope scope="a">a</MotionScope>)
    const { container } = render(<MotionScope scope="b">b</MotionScope>)
    expect(container.querySelector('[data-animate="true"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run src/components/motion` → FAIL (모듈 없음)

- [ ] **Step 3: motion-scope.tsx:**

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * 화면 단위 모션 게이트 — §5 v2 "등장 오케스트레이션은 화면당 세션 내 1회".
 *
 * 자식들은 서버 컴포넌트인 채로 `.motion-rise` 등을 항상 달고, 이 래퍼의
 * `data-animate` 속성이 globals.css의 게이트 셀렉터로 전체를 켜고 끈다 —
 * 화면마다 클라이언트 컴포넌트로 바꿀 필요가 없다.
 *
 * ★ SSR은 true로 그린다: 진짜 첫 방문은 하이드레이션 전 첫 페인트부터
 *   연출이 시작돼야 한다. 재방문은 하이드레이션 시점에 false로 뒤집혀
 *   즉시 최종 상태로 정착한다(0.01ms 완료 — 게이트 셀렉터). 그 속성 불일치는
 *   의도된 것이라 suppressHydrationWarning을 단다.
 */
export function MotionScope({
  scope,
  className,
  children,
}: {
  scope: string
  className?: string
  children: ReactNode
}) {
  const [animate] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.sessionStorage.getItem(`motion:${scope}`) === null
  })
  useEffect(() => {
    window.sessionStorage.setItem(`motion:${scope}`, '1')
  }, [scope])
  return (
    <div suppressHydrationWarning data-animate={animate} className={className}>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: reveal-on-scroll 테스트** — `src/components/motion/reveal-on-scroll.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RevealOnScroll } from './reveal-on-scroll'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubIO() {
  let callback: IntersectionObserverCallback = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    },
  )
  return { fire: (isIntersecting: boolean) => act(() => callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)), disconnect }
}

describe('RevealOnScroll — 랜딩 전용 스크롤 리빌', () => {
  it('뷰포트 밖 요소는 hold로 숨겼다가 진입 시 rise로 등장한다', () => {
    const io = stubIO()
    // jsdom의 getBoundingClientRect는 0을 주므로 "뷰포트 아래"로 강제한다
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5000, bottom: 5100, left: 0, right: 0, width: 0, height: 100, x: 0, y: 5000, toJSON: () => ({}),
    } as DOMRect)
    const { container } = render(<RevealOnScroll>섹션</RevealOnScroll>)
    expect(container.firstElementChild?.className).toContain('motion-hold')
    io.fire(true)
    expect(container.firstElementChild?.className).toContain('motion-rise')
    expect(container.firstElementChild?.className).not.toContain('motion-hold')
  })

  it('마운트 시 이미 뷰포트 안이면 절대 숨기지 않는다 (no-JS·크롤러 안전과 같은 원칙)', () => {
    stubIO()
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10, bottom: 110, left: 0, right: 0, width: 0, height: 100, x: 0, y: 10, toJSON: () => ({}),
    } as DOMRect)
    const { container } = render(<RevealOnScroll>히어로 근처</RevealOnScroll>)
    expect(container.firstElementChild?.className).not.toContain('motion-hold')
    expect(container.firstElementChild?.className).not.toContain('motion-rise')
  })

  it('IntersectionObserver가 없으면 아무것도 하지 않는다 (그냥 보인다)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<RevealOnScroll>구형 브라우저</RevealOnScroll>)
    expect(container.firstElementChild?.className).not.toContain('motion-hold')
  })
})
```

- [ ] **Step 5: reveal-on-scroll.tsx:**

```tsx
'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Phase = 'visible' | 'waiting' | 'shown'

/**
 * 스크롤 트리거 리빌 — **마케팅 화면 전용** (§5 v2: 앱 화면 금지).
 *
 * ★ SSR·no-JS·뷰포트 안 요소는 절대 숨기지 않는다. 마운트 후 "뷰포트 아래에
 *   있다"고 확인된 요소만 숨기고 관찰한다 — 크롤러와 JS 꺼진 방문자에게
 *   랜딩이 빈 화면이면 안 된다. 한 번 등장하면 다시 숨기지 않는다.
 */
export function RevealOnScroll({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [phase, setPhase] = useState<Phase>('visible')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (el.getBoundingClientRect().top < window.innerHeight) return // 이미 보인다
    setPhase('waiting')
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase('shown')
          io.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(phase === 'waiting' && 'motion-hold', phase === 'shown' && 'motion-rise', className)}
      style={phase === 'shown' ? ({ '--motion-index': index } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 6: 실행 + 커밋**

Run: `pnpm vitest run src/components/motion && pnpm typecheck` — Expected: PASS

```bash
git add src/components/motion
git commit -m "feat(motion): MotionScope(세션 1회 게이트) + RevealOnScroll(랜딩 전용)"
```

---

### Task 3: 시그니처 히어로 "실측 재현" — 타임라인 + ReplayHero (P1)

**Files:**
- Create: `src/components/marketing/hero-sample.ts`
- Create: `src/components/marketing/replay-timeline.ts`
- Create: `src/components/marketing/replay-hero.tsx`
- Modify: `src/components/audit/answer-specimen.tsx` (`trailing`/`queryTrailing` 슬롯)
- Test: `src/components/marketing/replay-timeline.test.ts`, `src/components/marketing/replay-hero.test.tsx`

**Interfaces:**
- Consumes: `AnswerSpecimen`(확장), `IntervalBar drawIn`(Task 1), `wilsonInterval/formatPercent/formatInterval`
- Produces: `HERO_SPECIMEN`·`HERO_MEASURED`(hero-sample.ts — 랜딩 페이지의 기존 `SPECIMEN`·`MEASURED` 상수를 **그대로 이동**, 주석 포함), `buildScript(query, answer, marks): ReplayScript`, `stateAt(script, elapsedMs): ReplayState`, `<ReplayHero />`. Task 4가 `<ReplayHero />`와 `HERO_SPECIMEN`(QueryProtocol용)을 임포트한다.

**연출 정의 (스펙 §2 — 이 순서 그대로):**
1. 검색창(계측 조건 띠)에 실측 질의가 타이핑된다 (45ms/글자)
2. 답변이 스트리밍으로 흐른다 (14ms/글자, 타이핑 종료 후 350ms 쉬고 시작)
3. 답변 속 **자기 브랜드** 언급이 전부 흘러나온 순간 하이라이트되고 카운터가 1건씩 오른다 (개별 사건 누적 — 카운트업 아님)
4. 스트리밍이 끝나고 350ms 후 정착: IntervalBar가 차오르며 실측 언급률 + 구간 (`HERO_MEASURED.cited` = wilsonInterval(5, 6))
5. **루프 없음.** [다시 재생] 버튼으로만 반복. reduced-motion·세션 내 재방문이면 처음부터 최종 상태.
6. SSR·no-JS는 최종 상태를 그린다 (크롤러·JS 꺼진 방문자에게 완성본).

- [ ] **Step 1: hero-sample.ts** — `src/app/(marketing)/page.tsx`의 `SPECIMEN`(주석 포함)과 `MEASURED`(주석 포함) 상수를 그대로 옮기고 이름만 바꾼다:

```ts
import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * 히어로 "실측 재현"의 표본 — 랜딩 페이지에서 이동해 온 실측 데이터다.
 *
 * ## 아래 답변은 실측이다
 *
 * 2026-07-30 `pnpm audit:run`으로 실제 ChatGPT에 물어 받은 답변의 일부다.
 * 지어낸 예시를 쓰면 첫 리포트에서 톤이 달라지고, 그 차이가 바로 의심이 된다.
 * `docs/superpowers/notes/2026-07-30-first-audit-actuals.md` 참고.
 */
export const HERO_SPECIMEN = {
  engineId: 'chatgpt',
  query: '30대 남자 옷 어디서 사는 게 좋아?',
  text: `좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.

- 온라인 / 편리: 무신사(스트리트·캐주얼), W컨셉(디자이너), 29CM·쿠팡·지마켓(빠른 배송).
- 베이식·미니멀(30대에 무난): 유니클로, COS, 무탠다드.`,
  // ★ 등록한 브랜드만 표시한다. W컨셉·쿠팡·유니클로는 평문으로 남는다 —
  //   우리는 고객이 등록하지 않은 브랜드를 셀 수 없고, 그 사실을 감추면
  //   언급 점유율을 오해하게 된다. 이 규칙 하나가 그 주의사항을 가르친다.
  //
  // ★ 순서 번호는 **자기 브랜드에만** 붙인다. 리포트가 정확히 그렇게 그린다
  //   (`evidenceMarks`) — 랜딩에서 본 것과 배송물이 달라지면 "이거 진짜야?"가
  //   되살아난다. 여기 표시 규칙을 바꾸려면 그쪽도 같이 봐야 한다.
  marks: [
    { text: '무신사', position: 1, isSelf: true },
    { text: '무탠다드', position: 1, isSelf: true },
    { text: '29CM', isSelf: false },
  ],
} as const

/**
 * 위 답변이 속한 측정의 **실제 결과**. 같은 실행에서 나온 숫자다
 * (`notes/2026-07-30-first-audit-actuals.md`).
 *
 * ★ 히어로에서 이미 신뢰구간을 보여준다. 이 제품의 정체성이 "숫자"가 아니라
 *   "그 숫자를 얼마나 믿어도 되는가"이므로, 구간을 뒤쪽 섹션으로 미루면
 *   가장 중요한 차별점을 스크롤 아래에 숨기는 것이 된다.
 */
export const HERO_MEASURED = {
  cited: wilsonInterval(5, 6),
  byEngine: [
    { engine: 'ChatGPT', interval: wilsonInterval(3, 3) },
    { engine: 'Gemini', interval: wilsonInterval(2, 3) },
  ],
} as const
```

(원본 `src/app/(marketing)/page.tsx`의 `SPECIMEN`·`MEASURED`와 글자까지 같아야 한다 — 실측 데이터 조작 금지.)

- [ ] **Step 2: 타임라인 테스트 먼저** — `src/components/marketing/replay-timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HERO_SPECIMEN } from './hero-sample'
import { STREAM_PAUSE_MS, buildScript, stateAt } from './replay-timeline'

const script = buildScript(HERO_SPECIMEN.query, HERO_SPECIMEN.text, HERO_SPECIMEN.marks)

describe('히어로 재생 시간표 — 실측 재현의 정직 규칙', () => {
  it('언급 이벤트는 자기 브랜드만 센다 (등록 안 된 브랜드는 세지 않는다는 규칙 그대로)', () => {
    // HERO_SPECIMEN.marks: 무신사·무탠다드(isSelf) + 29CM(비자기)
    expect(script.markEnds).toHaveLength(2)
  })

  it('질문 타이핑이 끝난 뒤에야 답변이 흐른다', () => {
    expect(stateAt(script, 0).answerChars).toBe(0)
    expect(stateAt(script, script.typeDoneAt + STREAM_PAUSE_MS - 1).answerChars).toBe(0)
    expect(stateAt(script, script.typeDoneAt).queryChars).toBe(HERO_SPECIMEN.query.length)
  })

  it('언급 카운터는 해당 표기가 전부 흘러나온 뒤에만 오른다', () => {
    for (const end of script.markEnds) {
      const before = stateAt(script, timeForAnswerChars(end - 1))
      const after = stateAt(script, timeForAnswerChars(end))
      expect(after.markCount).toBe(before.markCount + 1)
    }
  })

  it('정착은 스트리밍 완료 후에만, 그 뒤로는 상태가 변하지 않는다 (루프 없음)', () => {
    expect(stateAt(script, script.streamDoneAt).settled).toBe(false)
    const settled = stateAt(script, script.settleAt)
    expect(settled.settled).toBe(true)
    expect(settled.markCount).toBe(2)
    expect(settled.answerChars).toBe(HERO_SPECIMEN.text.length)
    expect(stateAt(script, script.settleAt + 60_000)).toEqual(settled)
  })

  it('경과 시간에 대해 단조 증가다 — 되감기는 없다', () => {
    let prev = stateAt(script, 0)
    for (let t = 0; t <= script.settleAt + 100; t += 33) {
      const cur = stateAt(script, t)
      expect(cur.queryChars).toBeGreaterThanOrEqual(prev.queryChars)
      expect(cur.answerChars).toBeGreaterThanOrEqual(prev.answerChars)
      expect(cur.markCount).toBeGreaterThanOrEqual(prev.markCount)
      prev = cur
    }
  })
})

/** answerChars가 정확히 n이 되는 최소 경과 시간 */
function timeForAnswerChars(n: number): number {
  return script.typeDoneAt + STREAM_PAUSE_MS + n * 14
}
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm vitest run src/components/marketing` → FAIL

- [ ] **Step 4: replay-timeline.ts:**

```ts
import type { SpecimenMark } from '@/components/audit/answer-specimen'

/**
 * 히어로 "실측 재현"의 시간표 — 순수 함수라 컴포넌트 없이 검증한다.
 *
 * 재생되는 것은 저장된 실측 표본(hero-sample.ts) 그대로다 — 조작 금지.
 * 카운터는 개별 언급 사건의 누적이지 카운트업이 아니다(§5: 굴러가는 숫자는
 * 거짓 값을 경유한다). 루프하지 않는다 — settleAt 이후 상태는 불변이다.
 */

export const TYPE_MS_PER_CHAR = 45
export const STREAM_MS_PER_CHAR = 14
export const STREAM_PAUSE_MS = 350
export const SETTLE_HOLD_MS = 350

export interface ReplayScript {
  query: string
  answer: string
  /** 자기 브랜드 언급의 답변 내 끝 위치(오름차순) — 이 글자까지 흐르면 켠다 */
  markEnds: number[]
  typeDoneAt: number
  streamDoneAt: number
  settleAt: number
}

export interface ReplayState {
  queryChars: number
  answerChars: number
  /** 답변에 전부 흘러나온(=하이라이트 켤) 자기 브랜드 언급 수 */
  markCount: number
  settled: boolean
}

export function buildScript(
  query: string,
  answer: string,
  marks: readonly SpecimenMark[],
): ReplayScript {
  const markEnds: number[] = []
  for (const mark of marks) {
    if (!mark.isSelf || mark.text.length === 0) continue
    let from = 0
    for (;;) {
      const i = answer.indexOf(mark.text, from)
      if (i === -1) break
      markEnds.push(i + mark.text.length)
      from = i + mark.text.length
    }
  }
  markEnds.sort((a, b) => a - b)
  const typeDoneAt = query.length * TYPE_MS_PER_CHAR
  const streamDoneAt = typeDoneAt + STREAM_PAUSE_MS + answer.length * STREAM_MS_PER_CHAR
  return { query, answer, markEnds, typeDoneAt, streamDoneAt, settleAt: streamDoneAt + SETTLE_HOLD_MS }
}

export function stateAt(script: ReplayScript, elapsedMs: number): ReplayState {
  const queryChars = Math.min(script.query.length, Math.max(0, Math.floor(elapsedMs / TYPE_MS_PER_CHAR)))
  const streamStart = script.typeDoneAt + STREAM_PAUSE_MS
  const answerChars =
    elapsedMs <= streamStart
      ? 0
      : Math.min(script.answer.length, Math.floor((elapsedMs - streamStart) / STREAM_MS_PER_CHAR))
  const markCount = script.markEnds.filter((end) => end <= answerChars).length
  return { queryChars, answerChars, markCount, settled: elapsedMs >= script.settleAt }
}
```

- [ ] **Step 5: 실행** — Run: `pnpm vitest run src/components/marketing/replay-timeline.test.ts` → PASS

- [ ] **Step 6: answer-specimen.tsx에 슬롯 2개 추가.** `AnswerSpecimenProps`에:

```ts
  /** 답변 뒤에 붙는 노드(스트리밍 커서 등). 화면 전용 — 리포트는 쓰지 않는다 */
  trailing?: React.ReactNode
  /** 질문 뒤에 붙는 노드(타이핑 커서 등) */
  queryTrailing?: React.ReactNode
```

함수 시그니처에 `trailing`, `queryTrailing` 추가하고, `<q>` 닫는 태그 직후에 `{queryTrailing ?? null}`, `<blockquote>` 안 `parts.map(...)` 직후에 `{trailing ?? null}` 렌더.

- [ ] **Step 7: replay-hero.tsx:**

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnswerSpecimen } from '@/components/audit/answer-specimen'
import { IntervalBar } from '@/components/interval-bar'
import { Button } from '@/components/ui/button'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'
import { HERO_MEASURED, HERO_SPECIMEN } from './hero-sample'
import { buildScript, stateAt, type ReplayState } from './replay-timeline'

/**
 * 시그니처 히어로 — "실측 재현" (스펙 §2).
 *
 * Cited가 파는 장면을 그대로 재생한다: 질의 타이핑 → 답변 스트리밍 →
 * 언급 하이라이트·집계 → 언급률+구간 정착. 재생되는 텍스트·숫자는 전부
 * hero-sample.ts의 저장된 실측이다.
 *
 * ★ SSR은 최종 상태를 그린다 — 크롤러·no-JS에 완성본이 보여야 한다.
 *   자동 재생은 세션 내 1회(재방문·reduced-motion은 최종 상태 유지),
 *   그 뒤는 [다시 재생]으로만 반복한다(§5 루프 금지).
 */

const script = buildScript(HERO_SPECIMEN.query, HERO_SPECIMEN.text, HERO_SPECIMEN.marks)
const FINAL: ReplayState = stateAt(script, script.settleAt)

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="motion-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] bg-primary"
    />
  )
}

export function ReplayHero() {
  const [state, setState] = useState<ReplayState>(FINAL)
  const [playing, setPlaying] = useState(false)
  const rafRef = useRef(0)

  const play = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setPlaying(true)
    const start = performance.now()
    const tick = (now: number) => {
      const next = stateAt(script, now - start)
      setState(next)
      if (next.settled) {
        setPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.sessionStorage.getItem('motion:hero') !== null) return
    window.sessionStorage.setItem('motion:hero', '1')
    play()
    return () => cancelAnimationFrame(rafRef.current)
  }, [play])

  const typing = state.queryChars < script.query.length
  const streaming = !typing && state.answerChars < script.answer.length
  const visibleText = HERO_SPECIMEN.text.slice(0, state.answerChars)
  const visibleMarks = HERO_SPECIMEN.marks.filter((mark) => {
    const i = HERO_SPECIMEN.text.indexOf(mark.text)
    return i !== -1 && i + mark.text.length <= state.answerChars
  })

  return (
    <div>
      <AnswerSpecimen
        engineId={HERO_SPECIMEN.engineId}
        query={HERO_SPECIMEN.query.slice(0, state.queryChars)}
        queryTrailing={typing || (playing && state.answerChars === 0) ? <Caret /> : undefined}
        text={visibleText}
        marks={visibleMarks}
        trailing={streaming ? <Caret /> : undefined}
        footer={
          state.settled ? <span>2026-07-30 실측 · 밑줄이 우리가 센 브랜드입니다</span> : undefined
        }
      />

      {/* 집계 → 정착. 카운터는 개별 언급 사건의 누적이다 — 굴러가는 숫자가 아니다. */}
      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-5 shadow-elevation-1">
        {state.settled ? (
          <>
            <p className="text-sm font-medium">위 측정의 결과</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-3xl font-semibold tracking-tighter tabular-nums">
                {formatPercent(HERO_MEASURED.cited.point)}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatInterval(HERO_MEASURED.cited)}
              </span>
            </div>
            <div className="mt-4">
              <IntervalBar interval={HERO_MEASURED.cited} drawIn />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              답변 <span className="font-mono tabular-nums">{HERO_MEASURED.cited.n}</span>개 중{' '}
              <span className="font-mono tabular-nums">{HERO_MEASURED.cited.k}</span>개에서 언급 —
              위 답변은 그중 <span className="font-mono tabular-nums">1</span>개입니다.
            </p>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              {HERO_MEASURED.byEngine.map((row, i) => (
                <div
                  key={row.engine}
                  className="motion-rise flex items-baseline justify-between gap-4"
                  style={{ '--motion-index': i } as React.CSSProperties}
                >
                  <dt className="text-muted-foreground">{row.engine}</dt>
                  <dd className="font-mono tabular-nums">
                    {formatPercent(row.interval.point)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatInterval(row.interval)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              범위가 넓은 것은 <span className="font-mono tabular-nums">1</span>회만 측정했기
              때문입니다. 여러 번 재면 좁아집니다.
            </p>
            <Button variant="ghost" size="sm" className="mt-4" onClick={play} disabled={playing}>
              다시 재생
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">언급 집계 중</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-semibold tracking-tighter tabular-nums">
                {state.markCount}
              </span>
              <span className="text-sm text-muted-foreground">곳 언급</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              답변에 등록 브랜드가 나올 때마다 한 건씩 셉니다.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 컴포넌트 테스트** — `src/components/marketing/replay-hero.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPercent } from '@/lib/stats/wilson'
import { HERO_MEASURED } from './hero-sample'
import { ReplayHero } from './replay-hero'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  window.sessionStorage.clear()
  // matchMedia — jsdom에 없다
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
})

describe('ReplayHero — 실측 재현', () => {
  it('reduced-motion이면 처음부터 최종 상태다 — 실측 언급률과 구간이 바로 보인다', () => {
    render(<ReplayHero />)
    expect(screen.getByText(formatPercent(HERO_MEASURED.cited.point))).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 재생' })).toBeTruthy()
  })

  it('세션 내 재방문(motion:hero 기록)이면 자동 재생하지 않는다', () => {
    window.sessionStorage.setItem('motion:hero', '1')
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    )
    render(<ReplayHero />)
    expect(screen.getByText(formatPercent(HERO_MEASURED.cited.point))).toBeTruthy()
  })
})
```

- [ ] **Step 9: 실행 + 커밋**

Run: `pnpm vitest run src/components/marketing src/components/audit && pnpm typecheck` — Expected: PASS (answer-specimen 기존 테스트 포함)

```bash
git add src/components/marketing src/components/audit/answer-specimen.tsx
git commit -m "feat(landing): 시그니처 히어로 '실측 재현' — 타임라인·ReplayHero·표본 이동"
```

---

### Task 4: 랜딩·요금제 배선 + 헤더 blur (P1)

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/components/site-header.tsx`

**Interfaces:**
- Consumes: `<ReplayHero />`·`HERO_SPECIMEN`(Task 3), `MotionScope`·`RevealOnScroll`(Task 2), `shadow-elevation-*`(Task 0)

- [ ] **Step 1: page.tsx — 표본 상수 이동 정리.** `SPECIMEN`·`MEASURED` 상수(주석 포함)와 이제 안 쓰는 임포트(`AnswerSpecimen`, `wilsonInterval`, `formatInterval`, `formatPercent`)를 지우고 다음 임포트 추가:

```tsx
import { HERO_SPECIMEN } from '@/components/marketing/hero-sample'
import { ReplayHero } from '@/components/marketing/replay-hero'
import { MotionScope } from '@/components/motion/motion-scope'
import { RevealOnScroll } from '@/components/motion/reveal-on-scroll'
```

`SPECIMEN.query` 참조 2곳(`QueryProtocol specimenQuery`)은 `HERO_SPECIMEN.query`로 바꾼다.

- [ ] **Step 2: page.tsx — 히어로 섹션 교체.** 히어로 `<section>` 내부를 `MotionScope`로 감싸 위계 순 스태거를 주고, 좌측 컬럼의 `AnswerSpecimen`+결과 카드 블록을 `<ReplayHero />`로 교체한다:

```tsx
      {/* ── 히어로 ───────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
        <MotionScope scope="landing">
          {/* (기존 아이브로 p — className 앞에 motion-rise 추가, style로 --motion-index: 0) */}
          <p
            className="motion-rise text-sm font-medium tracking-wide text-muted-foreground"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            한국어 GEO 모니터링
          </p>
          {/* 디스플레이 조판 (스펙 §1 #15 — 신규 서체 없이): 한 단계 무거운
              웨이트 + 타이트 트래킹. 랜딩 히어로 한 곳만이다. */}
          <h1
            className="motion-rise mt-5 max-w-3xl text-4xl font-bold tracking-tighter text-balance sm:text-5xl"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            고객이 AI에게 물었을 때, 우리 브랜드가 불리고 있나
          </h1>
          <p
            className="motion-rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ '--motion-index': 2 } as React.CSSProperties}
          >
            검색 순위는 우리가 올릴 수 있습니다. AI 답변은 그렇지 않습니다. Cited는 ChatGPT와
            Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 기록합니다.
          </p>

          <div
            className="motion-rise mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12"
            style={{ '--motion-index': 3 } as React.CSSProperties}
          >
            {/* 서명 요소 — 실측 재현. 남의 문장이 눈앞에서 측정된다. */}
            <div>
              <ReplayHero />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                표시가 없는 브랜드는{' '}
                <strong className="font-medium text-foreground">등록되지 않아 세지 않은 것</strong>
                입니다. 우리는 알려주신 브랜드만 셀 수 있습니다 — 그래서 경쟁사를 적게 넣으면
                점유율이 실제보다 높게 보입니다. 리포트에 분모를 항상 함께 적는 이유입니다.
              </p>
            </div>

            {/* 폼 — 히어로 안에 둔다. 스크롤해서 찾게 만들 이유가 없다. */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-elevation-1 sm:p-7">
              <h2 className="text-xl font-semibold tracking-tight">무료 진단 신청</h2>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">
                질의 <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를{' '}
                <span className="font-mono tabular-nums">1</span>회 측정해 메일로 보내드립니다.
                결제 정보는 받지 않습니다.
              </p>
              <RequestForm />
            </div>
          </div>
        </MotionScope>
      </section>
```

- [ ] **Step 3: page.tsx — 아래 4개 섹션 스크롤 리빌 + 계측 조건표 elevation.** 각 섹션(`질의 프로토콜`·`리포트에 들어가는 것`·`신청하면`·`무료 진단으로 알 수 없는 것`)의 `<div className="mx-auto w-full max-w-6xl …">` 내부 전체를 `<RevealOnScroll>…</RevealOnScroll>`로 감싼다 (섹션당 1개 — 개별 카드 스태거는 하지 않는다, 총 길이 600ms 규칙). `DELIVERABLES` 카드 그리드의 각 항목에는 `motion-rise`를 붙이지 **않는다** (RevealOnScroll이 통째로 올린다). 계측 조건표(`src/components/audit/query-protocol.tsx`)의 카드 루트(rounded-lg border 컨테이너)에 `shadow-elevation-1`을 추가한다 — 호버 리프트는 없다(전체가 링크가 아니다, §4.1 조건).

- [ ] **Step 4: pricing/page.tsx** —
  1. 최상단 표제 블록(아이브로 p·h1·리드 p)을 `<MotionScope scope="pricing">`로 감싸고 `motion-rise` + `--motion-index` 0·1·2를 단다 (Step 2와 같은 문법).
  2. 모바일 카드 `div className="rounded-lg border border-border bg-card p-6"` → `"rounded-lg border border-border bg-card p-6 shadow-elevation-1"`.
  3. 질의 팩 섹션과 정직 블록 섹션을 각각 `<RevealOnScroll>`로 감싼다.
  4. 데스크톱 표는 elevation을 걸지 않는다(카드가 아니라 표다). 호버 리프트도 없다 — **요금제 카드는 전체가 링크가 아니므로** §5 v2 "클릭 가능한 것만" 규칙상 리프트 금지.

- [ ] **Step 5: site-header.tsx — 스크롤 blur.** `useState` 옆에 스크롤 상태 추가:

```tsx
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
```

(`useEffect` 임포트 추가.) `<header>` className 교체 — **높이는 고정한다**(축소는 §5 레이아웃 애니메이션 금지와 충돌, Global Constraints 참고):

```tsx
    <header
      className={
        scrolled
          ? 'sticky top-0 z-40 border-b border-border/60 bg-background/80 shadow-elevation-1 backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-out'
          : 'sticky top-0 z-40 border-b border-border bg-background transition-[background-color,border-color,box-shadow] duration-[var(--motion-micro)] ease-out'
      }
    >
```

- [ ] **Step 6: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — Expected: PASS (랜딩 관련 기존 테스트 확인 — `page.tsx` 참조 테스트가 있으면 `HERO_SPECIMEN` 경로로 고친다)

```bash
git add "src/app/(marketing)/page.tsx" "src/app/(marketing)/pricing/page.tsx" src/components/site-header.tsx
git commit -m "feat(landing): 히어로 실측 재현 배선 + 스크롤 리빌 + elevation + 헤더 blur"
```

**⚠️ 컨트롤러 브라우저 게이트 #1 (P0+P1):** 랜딩·요금제 실물 확인 — 히어로 재생(타이핑→스트리밍→하이라이트→정착), 다시 재생 버튼, 스크롤 리빌, 버튼 프레스, 헤더 blur, reduced-motion에서 전부 정지·완전 사용 가능, 375px 넘침 없음.

---

### Task 5: 차트 드로우인 — drawSchedule + 추이·SoV (P2)

**Files:**
- Create: `src/components/dashboard/draw-schedule.ts`
- Test: `src/components/dashboard/draw-schedule.test.ts`
- Modify: `src/components/dashboard/trend-chart.tsx`
- Modify: `src/components/dashboard/sov-trend.tsx`
- Test(수정): `src/components/dashboard/trend-chart.test.tsx`

**Interfaces:**
- Consumes: `.motion-draw-line` `.motion-draw-fade`(Task 0)
- Produces: `drawSchedule(segmentCount: number): SegmentSchedule[]` — `{ delayMs, durationMs, pointDelayMs, pointDurationMs }`. sov-trend와 trend-chart가 같은 함수를 쓴다.

- [ ] **Step 1: 불변식 테스트 먼저** — `draw-schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DRAW_TOTAL_MS, drawSchedule } from './draw-schedule'

describe('drawSchedule — 드로우인 시간표의 정직 불변식 (§5 v2)', () => {
  it('전체 길이가 상한(--motion-draw=600ms)을 넘지 않는다', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const last = drawSchedule(n).at(-1)!
      expect(last.delayMs + last.durationMs).toBeLessThanOrEqual(DRAW_TOTAL_MS)
    }
  })

  it('세그먼트는 순차 등장한다 — 끊김이 연출로 보이는 이유', () => {
    const schedule = drawSchedule(4)
    for (let i = 1; i < schedule.length; i++) {
      const prev = schedule[i - 1]!
      expect(schedule[i]!.delayMs).toBeGreaterThanOrEqual(prev.delayMs + prev.durationMs - 0.001)
    }
  })

  it('★ 점의 완성 시각은 밴드의 완성 시각과 정확히 같다 — 점이 먼저 완성되면 §0 위반', () => {
    for (const n of [1, 2, 3, 5, 8, 20]) {
      for (const seg of drawSchedule(n)) {
        expect(seg.pointDelayMs + seg.pointDurationMs).toBeCloseTo(seg.delayMs + seg.durationMs, 5)
        expect(seg.pointDurationMs).toBeGreaterThan(0)
      }
    }
  })

  it('0 이하는 빈 배열이다', () => {
    expect(drawSchedule(0)).toEqual([])
    expect(drawSchedule(-1)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run src/components/dashboard/draw-schedule.test.ts` → FAIL

- [ ] **Step 3: draw-schedule.ts:**

```ts
/**
 * 차트 최초 드로우인의 시간표 (§5 v2). 순수 함수 — 불변식은 테스트가 지킨다.
 *
 *  1. 전체 ≤ DRAW_TOTAL_MS (--motion-draw 상한과 같은 값 — 계측기는 굼뜨지 않다)
 *  2. 세그먼트 순차 등장 — 끊긴 자리(조건 변경·빠진 회차)가 연출로 강조된다
 *  3. **점 완성 시각 == 밴드 완성 시각** — 점이 밴드보다 먼저 완성되면
 *     찰나라도 "구간 없는 점추정"이라 §0 위반이다
 */
export const DRAW_TOTAL_MS = 600
export const POINT_FADE_MS = 120

export interface SegmentSchedule {
  delayMs: number
  durationMs: number
  pointDelayMs: number
  pointDurationMs: number
}

export function drawSchedule(segmentCount: number): SegmentSchedule[] {
  if (segmentCount <= 0) return []
  const per = DRAW_TOTAL_MS / segmentCount
  const pointDuration = Math.min(POINT_FADE_MS, per)
  return Array.from({ length: segmentCount }, (_, i) => ({
    delayMs: i * per,
    durationMs: per,
    pointDelayMs: i * per + per - pointDuration,
    pointDurationMs: pointDuration,
  }))
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run src/components/dashboard/draw-schedule.test.ts` → PASS

- [ ] **Step 5: trend-chart.tsx 드로우인 배선.**
  1. 임포트: `import { drawSchedule } from './draw-schedule'`
  2. `const segments = splitSegments(series)` 아래에:

```tsx
  const schedule = drawSchedule(segments.length)
  /** 전역 점 인덱스 → 세그먼트 서수 */
  const segmentOf = new Map<number, number>()
  segments.forEach((seg, s) => seg.pts.forEach((_, j) => segmentOf.set(seg.startIndex + j, s)))
  const drawVars = (s: number, kind: 'band' | 'point', opacity: number) => {
    const t = schedule[s]
    if (!t) return {}
    return {
      '--draw-delay': `${kind === 'band' ? t.delayMs : t.pointDelayMs}ms`,
      '--draw-ms': `${kind === 'band' ? t.durationMs : t.pointDurationMs}ms`,
      '--draw-opacity': opacity,
    } as React.CSSProperties
  }
```

  3. 혼자 남은 점의 `<rect>` 밴드에: `className="motion-draw-fade"` + `style={drawVars(segIndex, 'band', 0.25)}`, `opacity={0.25}` 속성은 **제거**하고 `--draw-opacity`로 통일 (세그먼트 서수는 `segments.map((seg, segIndex) => …)`로 콜백 인자에서 받는다).
  4. 여러 점 세그먼트: 밴드 `<path>`는 `fill-opacity` 대신 — 기존 `opacity={0.14}` 제거, `className="motion-draw-fade"` + `style={drawVars(segIndex, 'band', 0.14)}`. 선 `<path data-testid="trend-line">`에 `pathLength={1}` 속성과 `className="motion-draw-line"` + `style={drawVars(segIndex, 'band', 1)}` (선은 밴드와 같은 구간에 그려진다).
  5. 점 마커: `series.map((p, i) => …)` 그룹 `<g>`에 `className="motion-draw-fade"` + `style={drawVars(segmentOf.get(i) ?? 0, 'point', 1)}`.
  6. 엔진 토글 버튼의 `transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]` → `transition-colors duration-[var(--motion-micro)] ease-out` (인라인 이징 소탕 — 배터리 대비).
  7. **엔진 토글 시 드로우인 재생 금지** — 드로우인은 마운트 1회다(§5 v2). 사용자가 토글을 한 번이라도 누르면 그 뒤로는 드로우 클래스를 붙이지 않는다:

```tsx
  const [interacted, setInteracted] = useState(false)
  const withDraw = !interacted
```

  토글 버튼 onClick을 `onClick={() => { setInteracted(true); setEngine(id) }}`로 바꾼다. `withDraw`가 false면 위 3~5의 드로우 클래스·`drawVars` 스타일을 아예 붙이지 않는다(토글 전환은 기존 opacity 240ms 유지).

- [ ] **Step 6: trend-chart.test.tsx에 동시성 배선 테스트 추가** (기존 테스트 파일 끝):

```tsx
describe('드로우인 배선 — 점·밴드 동시 완성 (§5 v2)', () => {
  function finishOf(el: Element, fallbackMs: string): number {
    const style = (el as HTMLElement | SVGElement).getAttribute('style') ?? ''
    const delay = /--draw-delay:\s*([\d.]+)ms/.exec(style)?.[1] ?? '0'
    const ms = /--draw-ms:\s*([\d.]+)ms/.exec(style)?.[1] ?? fallbackMs
    return Number(delay) + Number(ms)
  }

  it('모든 점의 완성 시각이 자기 세그먼트 밴드의 완성 시각과 같다', () => {
    // twoSegments: 기존 픽스처 중 comparableWithPrev=false로 끊기는 시리즈 사용
    const { container } = render(<TrendChart points={twoSegmentFixture} />)
    const bands = [...container.querySelectorAll('[data-testid="trend-band"]')]
    const bandFinish = bands.map((b) => finishOf(b, '600'))
    const points = [...container.querySelectorAll('g.motion-draw-fade')]
    expect(bands.length).toBeGreaterThan(1)
    expect(points.length).toBeGreaterThan(0)
    for (const p of points) {
      const finish = finishOf(p, '600')
      expect(bandFinish.some((b) => Math.abs(b - finish) < 0.01), `점 완성 ${finish}ms가 어떤 밴드와도 안 맞는다`).toBe(true)
    }
  })

  it('두 세그먼트의 밴드는 서로 다른 시각에 시작한다 — 끊김의 순차 연출', () => {
    const { container } = render(<TrendChart points={twoSegmentFixture} />)
    const delays = [...container.querySelectorAll('[data-testid="trend-band"]')].map(
      (b) => /--draw-delay:\s*([\d.]+)ms/.exec(b.getAttribute('style') ?? '')?.[1],
    )
    expect(new Set(delays).size).toBeGreaterThan(1)
  })
})
```

(픽스처 이름은 기존 테스트 파일의 끊김 픽스처를 재사용한다 — 구현자는 파일을 열어 실제 이름으로 맞춘다. 없으면 `comparableWithPrev: false` 점 하나를 넣은 4점짜리 픽스처를 만든다.)

- [ ] **Step 7: sov-trend.tsx 같은 배선.** `segmentsOf` 결과에 `drawSchedule(segments.length)` 적용:
  - 선 `<path data-testid="sov-line">`: `pathLength={1}` + `motion-draw-line` + 세그먼트 시간표
  - 점별 밴드 `<rect>`: 기존 `opacity={isolated.has(i) ? 0.25 : 0.14}` 제거 → `motion-draw-fade` + `--draw-opacity`를 같은 값으로
  - 점 `<circle data-testid="sov-point">`: 그룹 `<g>`에 `motion-draw-fade` + point 시간표
  - sov-trend는 서버 컴포넌트 그대로 둔다 (상태 없음 — 토글이 없어 재생 문제도 없다)

- [ ] **Step 8: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — Expected: PASS (기존 trend/sov 테스트 전부 유지 — 밴드 opacity 단언이 있으면 `--draw-opacity` 기준으로 고친다)

```bash
git add src/components/dashboard/draw-schedule.ts src/components/dashboard/draw-schedule.test.ts src/components/dashboard/trend-chart.tsx src/components/dashboard/trend-chart.test.tsx src/components/dashboard/sov-trend.tsx
git commit -m "feat(dashboard): 차트 드로우인 — 세그먼트 순차·점밴드 동시 완성 시간표"
```

---

### Task 6: 추이 차트 시각 툴팁 + 크로스헤어 (P2)

**Files:**
- Modify: `src/components/dashboard/trend-chart.tsx`
- Test(수정): `src/components/dashboard/trend-chart.test.tsx`

**Interfaces:**
- Consumes: 기존 `<title>` 내용 문법 `날짜 · 점추정 (구간) · k/n` — 툴팁 카드는 **정확히 같은 내용**을 시각화한다(승격이지 신설이 아니다). `<title>`은 보조기기용으로 유지.

- [ ] **Step 1: 테스트 먼저** (trend-chart.test.tsx):

```tsx
describe('시각 툴팁 — <title>의 승격 (§4.2 스펙)', () => {
  it('점 호버 시 크로스헤어와 툴팁 카드가 뜨고, 내용이 title과 같다', () => {
    const { container } = render(<TrendChart points={basicFixture} />)
    const zones = container.querySelectorAll('[data-testid="trend-hover-zone"]')
    expect(zones.length).toBeGreaterThan(0)
    fireEvent.mouseEnter(zones[0]!)
    const tooltip = container.querySelector('[data-testid="trend-tooltip"]')
    expect(tooltip).not.toBeNull()
    const title = container.querySelector('g > title')?.textContent ?? ''
    expect(tooltip?.textContent).toBe(title)
    expect(container.querySelector('[data-testid="trend-crosshair"]')).not.toBeNull()
    fireEvent.mouseLeave(zones[0]!)
    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: 구현.**
  1. `const [hovered, setHovered] = useState<number | null>(null)`
  2. `<svg>`를 `<div className="relative">`로 감싼다.
  3. svg 안, 축 그리드 다음에 호버 존(점당 세로 기둥, 투명):

```tsx
        {series.map((p, i) => (
          <rect
            key={`hover-${p.runId}`}
            data-testid="trend-hover-zone"
            x={n <= 1 ? PAD.left : x(i) - IW / (n - 1) / 2}
            y={PAD.top}
            width={n <= 1 ? IW : IW / (n - 1)}
            height={IH}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
```

  4. 크로스헤어(점 마커 앞에 그린다):

```tsx
        {hovered !== null && series[hovered] && (
          <line
            data-testid="trend-crosshair"
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD.top}
            y2={PAD.top + IH}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
```

  5. 툴팁 카드(래퍼 div 안, svg 뒤):

```tsx
      {hovered !== null && series[hovered] && (
        <div
          data-testid="trend-tooltip"
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 font-mono text-xs whitespace-nowrap tabular-nums shadow-elevation-2"
          style={{
            left: `${(x(hovered) / W) * 100}%`,
            top: `calc(${(y(series[hovered].interval.point) / H) * 100}% - 2.75rem)`,
          }}
        >
          {`${mmdd(series[hovered].measuredAt)} · ${formatPercent(series[hovered].interval.point)} (${formatInterval(series[hovered].interval)}) · ${series[hovered].interval.k}/${series[hovered].interval.n}`}
        </div>
      )}
```

  (호버 존이 `<title>` 그룹과 겹치므로 네이티브 title 툴팁이 가려지는 것은 의도 — 시각 툴팁이 그 승격판이다. `<title>` 자체는 SVG 접근성 이름으로 유지된다.)

- [ ] **Step 4: 실행 + 커밋**

Run: `pnpm vitest run src/components/dashboard && pnpm typecheck` — PASS

```bash
git add src/components/dashboard/trend-chart.tsx src/components/dashboard/trend-chart.test.tsx
git commit -m "feat(dashboard): 추이 차트 크로스헤어 + 시각 툴팁 (title 승격)"
```

---

### Task 7: 대시보드 오케스트레이션 — 진입·히트맵·회차 목록 (P2)

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/headline-card.tsx`
- Modify: `src/components/dashboard/query-heatmap.tsx`
- Modify: `src/components/dashboard/run-list.tsx`
- Modify: `src/components/dashboard/brand-picker.tsx`

**Interfaces:**
- Consumes: `MotionScope`(Task 2), `IntervalBar drawIn`(Task 1), `.motion-rise` `.motion-fade`

- [ ] **Step 1: dashboard/page.tsx.** 임포트 `import { MotionScope } from '@/components/motion/motion-scope'`. 메인 반환의 `<div className="space-y-10">` → `<MotionScope scope="dashboard" className="space-y-10">`(닫는 태그도). 위계 순 인덱스(§5 v2: 제목 → 계측값 → 보조):
  - 제목 블록 `<div className="flex flex-wrap items-end justify-between gap-4">` → `className="motion-rise flex …"` + `style={{ '--motion-index': 0 } as React.CSSProperties}`
  - `<HeadlineCard …/>`를 `<div className="motion-rise" style={{ '--motion-index': 1 } as React.CSSProperties}>`로 감싼다
  - 추이 섹션 `<section>` → `motion-rise` + index 2 · 히트맵 3 · SoV 4 · 출처 5 · 회차 6
  - 해지 배너·미확정 배너는 인덱스 없이 `motion-rise`만 (index 0과 동시 등장 — 안내는 제목과 같은 위계)
  - **참고:** 총 지연 6×50ms+200ms = 500ms ≤ 600ms 상한. 인덱스를 더 늘리면 상한 계산을 다시 한다.

- [ ] **Step 2: headline-card.tsx.** `<IntervalBar interval={ci} />` → `<IntervalBar interval={ci} drawIn />`. (게이트: MotionScope가 data-animate=false면 즉시 완료되므로 세션 1회 규칙 자동 충족.)

- [ ] **Step 3: query-heatmap.tsx.** 셀 스태거(행 우선 — "못 나오는 질문"이 먼저 뜬다) + 호버 보더:
  - 값 있는 `<td>` className에 추가: `motion-fade outline-primary/60 transition-[outline-color] duration-[var(--motion-micro)] ease-out hover:outline-2 hover:-outline-offset-2`
  - style에 추가: `'--motion-index': Math.min(rowIndex, 11)` (캡 — 12행 이상이어도 총 600ms 이내)
  - `—` 셀(측정 없음)은 그대로 둔다 (등장 연출 없음 — 없는 값은 조용히).

- [ ] **Step 4: run-list.tsx.** 클릭 가능 행(Link)만 리프트 — 컨테이너 `overflow-hidden` 때문에 그림자 리프트는 잘린다. 배경+1px 변위로 간다(§5 transform 합법):
  - `<Link …>`의 className: `block transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-muted/40` → `block transition-[background-color,transform] duration-[var(--motion-micro)] ease-out hover:-translate-y-px hover:bg-muted/60`
  - 비클릭 행(`hasResult === false`)은 그대로 — 정보 표시용은 움직이지 않는다.

- [ ] **Step 5: brand-picker.tsx.** 인라인 이징 소탕 + 프레스: `transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]` → `motion-press` (motion-press가 color·transform 전환을 다 가진다), 클래스 문자열 나머지는 유지. `+ 브랜드 추가` 링크에도 `motion-press` 추가.

- [ ] **Step 6: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — PASS (dashboard/page.test.tsx·query-heatmap.test.tsx·run-list.test.tsx 기존 단언 유지 확인 — 클래스 추가는 기존 텍스트·구조 단언을 깨지 않는다)

```bash
git add "src/app/(app)/dashboard/page.tsx" src/components/dashboard/headline-card.tsx src/components/dashboard/query-heatmap.tsx src/components/dashboard/run-list.tsx src/components/dashboard/brand-picker.tsx
git commit -m "feat(dashboard): 진입 오케스트레이션 + 히트맵 셀 스태거 + 회차 호버"
```

---

### Task 8: 로딩 스켈레톤 + 셔머 (P2)

**Files:**
- Modify: `src/components/ui/skeleton.tsx`
- Create: `src/app/(app)/dashboard/loading.tsx`
- Create: `src/app/(app)/dashboard/runs/[runId]/loading.tsx`

- [ ] **Step 1: skeleton.tsx** — `animate-pulse` → 셔머 (§5 v2 루프 예외):

```tsx
import { cn } from "@/lib/utils"

/** 로딩 자리 표시. 셔머는 §5 루프 금지의 유일한 예외다 — 로딩 상태 한정. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("motion-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

- [ ] **Step 2: dashboard/loading.tsx** — 실제 레이아웃과 같은 뼈대(전환 시 자리 이동 없게):

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 대시보드 서버 렌더 대기 화면. 실제 화면과 같은 뼈대를 그려 로드 완료 시
 * 자리 이동이 없게 한다. 셔머는 로딩 상태 표시라 루프가 허용된다(§5 v2).
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="대시보드 불러오는 중">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-44" />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 sm:p-7">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-[220px] w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: runs/[runId]/loading.tsx:**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function RunDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-14 sm:py-20" aria-busy="true" aria-label="회차 상세 불러오는 중">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 sm:p-7">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-14 w-44" />
        <Skeleton className="h-1.5 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
```

- [ ] **Step 4: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — PASS

```bash
git add src/components/ui/skeleton.tsx "src/app/(app)/dashboard/loading.tsx" "src/app/(app)/dashboard/runs/[runId]/loading.tsx"
git commit -m "feat(dashboard): 로딩 스켈레톤 + 셔머 (실제 레이아웃 뼈대)"
```

**⚠️ 컨트롤러 브라우저 게이트 #2 (P2):** 대시보드 실물 확인(실데이터 — e2e-onboarding@ 계정 무신사) — 진입 오케스트레이션 1회·재방문 무재생, 드로우인 점·밴드 동시, 툴팁·크로스헤어, 히트맵 스태거, 스켈레톤, reduced-motion, 375px.

---

### Task 9: 온보딩 — 단계 전환 + 완료 오케스트레이션 (P3)

**Files:**
- Modify: `src/app/(app)/onboarding/page.tsx`
- Modify: `src/app/(app)/onboarding/queries/page.tsx`
- Modify: `src/app/(app)/onboarding/done/page.tsx`

- [ ] **Step 1: 단계 전환.** 다음 단계가 오른쪽에서 슬라이드+페이드(진행 방향의 시각화 — 단계마다 재생하므로 MotionScope를 쓰지 **않는다**):
  - `onboarding/page.tsx`: `<div className="mx-auto max-w-2xl">` → `<div className="motion-slide-in mx-auto max-w-2xl">`
  - `queries/page.tsx`: 같은 교체 (`<div className="mx-auto max-w-2xl">` → `motion-slide-in` 추가)

- [ ] **Step 2: done/page.tsx — 등장 오케스트레이션** (다음 측정 예고가 주인공):
  - 컨테이너: `<div className="mx-auto max-w-2xl">` 유지
  - 아이브로 `<p>`: `motion-rise` + `--motion-index: 0`
  - `<h1>`: `motion-rise` + index 1
  - 예고 문단(`다음 측정은…`): `motion-rise` + index 2
  - 기대치 문단(`첫 회차가 끝나면…`): `motion-rise` + index 3
  - 버튼 `<div className="mt-8">`: `motion-rise` + index 4
  - (style 문법은 Task 4 Step 2와 동일: `style={{ '--motion-index': n } as React.CSSProperties}`)

- [ ] **Step 3: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — PASS

```bash
git add "src/app/(app)/onboarding/page.tsx" "src/app/(app)/onboarding/queries/page.tsx" "src/app/(app)/onboarding/done/page.tsx"
git commit -m "feat(onboarding): 단계 전환 슬라이드 + 완료 화면 오케스트레이션"
```

---

### Task 10: 질의 에디터 마이크로 + 동결 연출 (P3)

**Files:**
- Modify: `src/app/(app)/onboarding/queries/query-editor.tsx`
- Test(수정): `src/app/(app)/onboarding/queries/query-editor.test.tsx`

**Interfaces:**
- Consumes: `.motion-check` `.motion-caret` `.motion-rise` `.motion-lock`, `shadow-elevation-2`

- [ ] **Step 1: 테스트 먼저** (query-editor.test.tsx 끝에 — 기존 렌더 헬퍼·프롭 픽스처 재사용):

```tsx
describe('마이크로 연출 (§4.3 스펙)', () => {
  it('검증 통과 상태에는 체크 아이콘이 있고, 실패 상태에는 없다', () => {
    // 기존 "통과 상태" 픽스처로 렌더
    renderPassingEditor()
    expect(document.querySelector('[data-testid="verdict-check"]')).not.toBeNull()
    cleanup()
    renderFailingEditor()
    expect(document.querySelector('[data-testid="verdict-check"]')).toBeNull()
  })

  it('확정 패널에는 잠금 아이콘이 정착 연출 클래스와 함께 뜬다', async () => {
    renderPassingEditor()
    await userEvent.click(screen.getByRole('button', { name: '확정하기' }))
    const lock = document.querySelector('[data-testid="freeze-lock"]')
    expect(lock).not.toBeNull()
    expect(lock?.getAttribute('class') ?? '').toContain('motion-lock')
  })
})
```

(`renderPassingEditor`/`renderFailingEditor`는 기존 테스트의 렌더 방식을 따르는 헬퍼 — 구현자는 파일의 기존 픽스처 이름에 맞춘다.)

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: 검증 통과 체크.** 검증 status `<p role="status">` 내부를 교체 — 통과 시 인라인 체크 SVG(120ms 팝, 통과로 **바뀌는 순간**만):

```tsx
  const prevOkRef = useRef(verdict.ok)
  const [justPassed, setJustPassed] = useState(false)
  useEffect(() => {
    if (verdict.ok && !prevOkRef.current) setJustPassed(true)
    if (!verdict.ok) setJustPassed(false)
    prevOkRef.current = verdict.ok
  }, [verdict.ok])
```

(`useRef`·`useEffect` 임포트 추가.) status 문단 내용:

```tsx
        {verdict.ok ? (
          <span className="flex items-start gap-2">
            <svg
              viewBox="0 0 16 16"
              data-testid="verdict-check"
              className={justPassed ? 'motion-check mt-0.5 size-4 shrink-0' : 'mt-0.5 size-4 shrink-0'}
              aria-hidden="true"
            >
              <path
                d="M3 8.5 6.5 12 13 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>질의 {cleaned.length}개가 규칙을 통과했습니다 — 확정할 수 있습니다.</span>
          </span>
        ) : (
          verdict.reason
        )}
```

- [ ] **Step 4: 생성 중 스트리밍 커서.** 생성이 실제로 진행 중인 행에만(정직 — 생성은 실제 비동기 호출이다). `Input`을 감싸는 `<div className="min-w-0 flex-1 space-y-1">` → `relative` 추가, Input 뒤에:

```tsx
                {(busyRow === i || (busyRow === -1 && value.trim().length === 0)) && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-[1.125rem] right-3 -translate-y-1/2"
                  >
                    <span className="motion-caret inline-block h-4 w-[2px] bg-primary align-middle" />
                  </span>
                )}
```

- [ ] **Step 5: 생성 완료 행 스태거.** 상태 추가 `const [freshRows, setFreshRows] = useState<number[]>([])`. `generate()`의 `apply(result.value.queries)` 직후는 호출부마다 대상 인덱스를 아므로 각 apply 콜백에서 `setFreshRows(...)`:
  - `regenerateRow`: `setFreshRows([index])`
  - `generateMore` 빈칸 채우기: `setFreshRows(slots.slice(0, generated.length))`
  - `generateMore` 줄 추가: `setFreshRows(Array.from({ length: generated.length }, (_, k) => prevLen + k))` (`prevLen`은 setQueries 콜백 밖에서 `queries.length`로 캡처)
  - `setQuery`(사용자 입력)와 `removeRow`에서 `setFreshRows([])`
  - 행 `<li>` className: `freshRows.includes(i)`면 `motion-rise` + `style={{ '--motion-index': freshRows.indexOf(i) } as React.CSSProperties}`

- [ ] **Step 6: 동결 확정 패널 — 이 패스에서 가장 공들이는 마이크로 순간.** confirming 패널 교체:

```tsx
        <div className="motion-rise space-y-3 rounded-lg border border-border bg-card p-5 shadow-elevation-2">
          <div className="flex items-start gap-3">
            {/* 자물쇠 정착 — "동결"이 무거운 행동임을 모션이 전달한다.
                수제 SVG(의존성 없음, IntervalBar 전례). 비데이터라 스프링 허용. */}
            <svg
              viewBox="0 0 16 16"
              data-testid="freeze-lock"
              className="motion-lock mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            >
              <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
              <path d="M5.5 7V4.75a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth={1.8} />
            </svg>
            <p className="text-sm leading-relaxed">
              확정하면 질의 <span className="font-mono tabular-nums">{cleaned.length}</span>개가{' '}
              <strong className="font-semibold">동결</strong>됩니다. 회차끼리 비교할 수 있으려면
              질의가 같아야 하므로, 동결 후에는 바꾸지 않습니다 — 수정이 꼭 필요하면 운영자에게
              문의해 주세요.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={busy || !verdict.ok} onClick={freeze}>
              {pending ? '동결 중…' : '확정하고 동결'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              더 고치기
            </Button>
          </div>
        </div>
```

- [ ] **Step 7: 실행 + 커밋**

Run: `pnpm vitest run "src/app/(app)/onboarding" && pnpm typecheck` — PASS (기존 에디터 테스트 전부 유지)

```bash
git add "src/app/(app)/onboarding/queries/query-editor.tsx" "src/app/(app)/onboarding/queries/query-editor.test.tsx"
git commit -m "feat(onboarding): 질의 에디터 마이크로 — 검증 체크·스트리밍 커서·생성 스태거·동결 연출"
```

---

### Task 11: 리포트·회차 상세 — 등장 + 배지 리트로핏 (P3)

**Files:**
- Modify: `src/components/audit/result-view.tsx`
- Modify: `src/app/(app)/dashboard/runs/[runId]/page.tsx`
- Test(수정): `src/components/audit/result-view.test.tsx`

- [ ] **Step 1: 배지 색 테스트 먼저** (result-view.test.tsx — 기존 sources 픽스처 재사용):

```tsx
it('경쟁사 출처 배지는 중립색이다 — incomplete는 수집 품질의 색이지 소유의 색이 아니다', () => {
  // owner: 'competitor'인 소스가 있는 기존 픽스처로 렌더
  renderWithCompetitorSource()
  const badge = screen.getByText('경쟁사')
  expect(badge.className).toContain('text-muted-foreground')
  expect(badge.className).not.toContain('text-incomplete-fg')
})
```

- [ ] **Step 2: 실패 확인** → FAIL

- [ ] **Step 3: result-view.tsx:309** — 이연됐던 리트로핏. `text-incomplete-fg` → `text-muted-foreground`:

```tsx
                  {source.owner === 'competitor' && (
                    <span className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">
                      경쟁사
                    </span>
                  )}
```

- [ ] **Step 4: result-view.tsx — 대표 지표 IntervalBar 드로우인.** 대표 지표 섹션의 `<IntervalBar interval={result.citedRate} />`(구현자는 파일에서 위치 확인) → `<IntervalBar interval={result.citedRate} drawIn />`. 모션 어휘는 `@media screen` 전용이라 **PDF·프린트는 영향 없다** (Task 0에서 보장 — 리뷰어는 이 전제를 확인).

- [ ] **Step 5: runs/[runId]/page.tsx — 등장 오케스트레이션** (구조 변경 없음):

```tsx
import { MotionScope } from '@/components/motion/motion-scope'
```

반환부:

```tsx
  return (
    <MotionScope scope="run-detail">
      <div className="motion-rise mx-auto max-w-3xl px-6" style={{ '--motion-index': 0 } as React.CSSProperties}>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
          ← 대시보드
        </Link>
      </div>
      <div className="motion-rise" style={{ '--motion-index': 1 } as React.CSSProperties}>
        <ResultView result={detail.result} variant="run" />
      </div>
    </MotionScope>
  )
```

(공개 리포트 `/audit/[id]`에는 오케스트레이션을 걸지 않는다 — 그 라우트가 PDF 인쇄 대상이고, 메일로 받은 사람이 처음 여는 화면은 문서로 즉시 읽혀야 한다. 스펙 §4.4의 "등장"은 회차 상세로 충족한다.)

- [ ] **Step 6: 실행 + 커밋**

Run: `pnpm test && pnpm typecheck` — PASS

```bash
git add src/components/audit/result-view.tsx src/components/audit/result-view.test.tsx "src/app/(app)/dashboard/runs/[runId]/page.tsx"
git commit -m "feat(report): 회차 상세 등장 + 경쟁사 배지 중립색 리트로핏 + 헤드라인 드로우인"
```

---

### Task 12: 디자인 규칙 grep 배터리 (마무리 게이트)

**Files:**
- Create: `tests/design-rules.test.ts`

백로그(“grep 배터리에 raw-palette·이징 누락”)를 코드화한다. 이 태스크는 **마지막**이어야 한다 — 앞 태스크들이 인라인 이징·transition-all을 전부 소탕한 뒤에야 통과한다.

- [ ] **Step 1: tests/design-rules.test.ts:**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 디자인 규칙 grep 배터리 — docs/design-language.md §5·§6을 문자열 수준에서
 * 지킨다. 값의 계약은 design-tokens.test.ts, **사용 규칙**의 계약은 여기다.
 * 위반이 하나라도 생기면 어떤 파일인지 이름으로 말한다.
 */

const srcDir = fileURLToPath(new URL('../src', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.tsx') || full.endsWith('.ts') ? [full] : []
  })
}

const files = walk(srcDir).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

function offenders(pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(f.text)).map((f) => f.path)
}

describe('디자인 규칙 배터리 (§6 v2)', () => {
  it('transition-all 금지 — 움직일 속성을 이름으로 적는다 (§5)', () => {
    expect(offenders(/transition-all/)).toEqual([])
  })

  it('인라인 cubic-bezier 금지 — 이징은 토큰(ease-out·ease-spring)만 (§5 v2)', () => {
    expect(offenders(/cubic-bezier/)).toEqual([])
  })

  it('원색 팔레트 클래스 금지 — 색은 전부 토큰이다 (§2)', () => {
    expect(
      offenders(
        /["'`\s](?:text|bg|border|fill|stroke|outline|from|to|via)-(?:red|green|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|orange)-[0-9]{2,3}/,
      ),
    ).toEqual([])
  })

  it('채움색을 글자에 쓰지 않는다 — -fg 짝만 (§2)', () => {
    expect(offenders(/text-metric-(?:up|down|flat)(?!-fg)/)).toEqual([])
  })

  it('--chart-N 참조 금지 — 엔진 계열색을 이름으로 쓴다 (§6)', () => {
    expect(offenders(/--chart-[1-5]/)).toEqual([])
  })

  it('animate-pulse 금지 — 로딩은 셔머 하나로 통일한다 (§5 v2)', () => {
    expect(offenders(/animate-pulse/)).toEqual([])
  })
})
```

- [ ] **Step 2: 실행 — 위반 0 확인.** 실패하면 배터리를 고치지 말고 **위반 파일을 고친다** (남은 인라인 이징·raw 팔레트가 있다는 뜻이다).

Run: `pnpm test` — Expected: PASS 전체

- [ ] **Step 3: 커밋**

```bash
git add tests/design-rules.test.ts
git commit -m "test(design): grep 배터리 — transition-all·인라인 이징·원색 팔레트 금지 계약화"
```

**⚠️ 컨트롤러 브라우저 게이트 #3 (P3+전체):** 온보딩(전환·에디터·동결)·회차 상세·리포트 PDF 인쇄 미리보기(모션 무영향), reduced-motion 전 화면, Lighthouse 성능 스팟 체크(compositor 속성만 — 점수 하락 없음), §6 v2 체크리스트 전 항목.

---

## 이연 (이 패스에서 하지 않는 것)

- **View Transitions** (스펙 §1 #12, 2순위) — Next 16 experimental 플래그 필요. 일반 내비게이션 강등이 이미 기본이라 잃는 것 없음. 다음 패스 백로그.
- 랜딩 히어로 **신규 디스플레이 서체** — 스펙 §1 #15의 조건부 항목. 한글 웹폰트 로딩 비용(FOUT) 때문에 현행 웨이트 조합 유지. 도입하려면 별도 검토.
- 헤더 높이 **축소** — §5 레이아웃 애니메이션 금지와 충돌해 blur만 적용 (Global Constraints 참고).

## 실행 메모 (컨트롤러용)

- 워크트리에서 실행한다 (서브에이전트 구현 — 메인 체크아웃 오염 방지). 브리프는 **워크트리의 plan에서 추출**한다 (Task 9 사고 재발 방지).
- dev 서버 금지 규칙 유지 — 브라우저 게이트는 playwright webServer(:3000, 종료 후 netstat 확인) 방식만.
- 서브에이전트 dispatch에 `.env.local` 금지 문구 포함.
- 브라우저 게이트 #2는 e2e-onboarding@cited.co.kr(canceled, 무신사 실데이터)로 확인한다 — 이 계정이 남아 있는 이유가 바로 이것이다.
