# Cited 전면 리뉴얼 설계 — taste 스킬 주도 (계측 미학 v2 스펙 대체)

2026-08-03 작성. 이 문서는 `2026-08-03-visual-elevation-design.md`(계측 미학 v2)를 **대체**한다.
그 스펙의 실행은 Task 1까지 진행 후 철회됐다(브랜치 `visual-elevation`에 보관 — 커밋 88369ef·ce803b1·82031fa).

## 0. 확정된 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 범위 | **전체 풀 리뉴얼** — 마케팅(랜딩·요금제·무료진단) + 앱(대시보드·온보딩·회차상세·리포트) |
| 라이브러리 | **GSAP 전면 허용** (+ Motion, Phosphor 아이콘, 서체 패키지) — "CSS-first·의존성 0" 제약 폐기 |
| 테마 | **마케팅 = 시네마틱 다크** (Ethereal Glass 아키타입) · **앱 = 정제된 라이트** (Linear·Stripe 방식) |
| 한글 서체 | **SUIT Variable** (본문·디스플레이) + **IBM Plex Mono** 유지 (숫자·계측값) |
| 하드 룰 | **실측 숫자 조작 금지** 하나뿐 — 화면의 모든 수치·신뢰구간·답변 원문·질의는 실제 데이터. 가짜 고객 로고·후기·지표 금지. 그 외 기존 "정직성 규칙"(카운트업 금지 등)은 해제 — 스킬 재량 |
| 리디자인 모드 | tasteskill §11 "Overhaul" — 비주얼은 백지에서, **콘텐츠·IA·URL·내비 라벨·카피 보이스 보존** |

## 1. 스킬 권한 체계 (구현자가 반드시 원문을 읽는다)

스킬 원문 위치: `C:\Users\hayoul1999.YOUL-HOUSE\.claude\plugins\cache\taste-skill\taste-skill\1.0.0\skills\`

| 화면 | 지배 스킬 (읽기 필수) | 보조 |
|---|---|---|
| 랜딩 `(marketing)/page.tsx` · 요금제 `pricing` · 무료진단 `audit/new`·`audit/requested` | `taste-skill/SKILL.md`(전체) + `gpt-tasteskill/SKILL.md` | `soft-skill/SKILL.md` |
| 대시보드 · 온보딩 · 회차상세 · `audit/[id]` 리포트 · auth 화면 | `redesign-skill/SKILL.md` + `soft-skill/SKILL.md` | — (tasteskill §13이 대시보드·다단 폼을 자기 범위 밖으로 명시) |
| 공통 기반 (서체·색·아이콘·모션 물리) | `soft-skill/SKILL.md` | `redesign-skill` Fix Priority |

**충돌 해소 순서:** ① §0 하드 룰(실측 숫자) → ② 이 스펙의 확정 결정(§0 표) → ③ 화면의 지배 스킬 → ④ 보조 스킬. tasteskill의 Pre-Flight Check(§14)와 AI Tells(§9, 특히 em-dash 전면 금지·아이브로 배급제·스크롤 큐 금지)는 **마케팅 화면의 머지 게이트**다.

## 2. Design Read & 다이얼 (tasteskill §0–1)

> Reading this as: **B2B SaaS 랜딩(한국 브랜드 마케터·대표 대상), AI-측정 제품, dark tech + instrument 언어, Tailwind v4 + GSAP/Motion + SUIT.** 앱은 데이터 판독성이 최우선인 제품 UI.

| 표면 | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| 마케팅 | 8 | 7 | 4 |
| 앱 | 5 | 4 | 5 |

## 3. 비주얼 시스템

### 3.1 색 (Color Consistency Lock — 액센트 1개)
- **마케팅(다크):** 배경 딥 오프블랙(`#0a0a0c`급 — 순수 #000 금지), 미세 노이즈/그레인 오버레이(fixed, pointer-events-none), 메시 그라데이션 오브는 **브랜드 색상각(258 블루) 계열만** — AI-퍼플 금지(LILA RULE). 액센트 = 일렉트릭 블루 1개(채도 <80%), 페이지 전체 잠금. 글래스 패널: `backdrop-blur` + `border-white/10` 헤어라인 + inset 하이라이트 — **고정/스티키 요소에만** blur(성능 가드).
- **앱(라이트):** 현행 계측-화이트 기조 유지하되 표면 재설계 — 틴트 그림자(배경 색조 일치), double-bezel 카드(soft-skill §4.A), 순수 회색 보더 대신 헤어라인+깊이. 지표 상태색(상승 초록·하락 빨강·변화없음 회색)과 엔진 계열색은 **의미 체계 유지**, 값은 새 팔레트에 맞게 재조율 허용(대비 AA 유지).
- 다크↔라이트 경계는 표면(라우트 그룹) 단위 — 페이지 중간 반전 금지(Page Theme Lock).

### 3.2 조판
- **SUIT Variable** self-host(next/font 또는 @font-face + swap). 디스플레이는 웨이트 700–800 + 타이트 트래킹, 본문 400–500. 한글 줄바꿈 `keep-all` 유지.
- **IBM Plex Mono 유지** — 숫자·계측값·날짜·도메인의 mono 정체성은 제품 언어라 보존한다(redesign-skill "tabular figures" 권고와 일치).
- 히어로 H1: 2줄 철칙(gpt-taste §3), 와이드 컨테이너(`max-w-5xl`+), `clamp()` 스케일.
- em-dash(`—`·`–`) 마케팅 화면 전면 금지 — 기존 카피의 em-dash는 마침표·쉼표·콜론으로 재구성(카피 보이스는 유지).

### 3.3 아이콘·이미지
- 아이콘: `@phosphor-icons/react` (weight="light"·strokeWidth 통일). 손그림 SVG 금지.
- 이미지: 이미지 생성 도구 없음 → **실제 제품이 자산**. ① 실측 대시보드 스크린샷(무신사 77% 실데이터 — e2e-onboarding@ 계정) ② 실측 답변 원문(AnswerSpecimen) ③ 실제 질의 템플릿. div로 지은 가짜 스크린샷 금지(스킬 §9.E — 우리는 진짜가 있다). 분위기 배경이 필요한 곳만 `picsum.photos/seed/…` + CSS 필터(grayscale·luminosity), 사진 크레딧 장식 금지.
- 고객 로고 월·후기 섹션: **고객 없으므로 만들지 않는다**(§0 하드 룰). 신뢰 섹션은 실측 데이터·공개 질의·방법론으로 채운다.

### 3.4 모서리·표면 (Shape Consistency Lock)
- 마케팅: 셸 `rounded-[2rem]` 계열 + 필 버튼(`rounded-full`, button-in-button 트레일링 아이콘) — soft-skill 규격.
- 앱: 12px 소프트 반경으로 통일(현행 6px 계측기 모서리에서 격상), 문서화된 단일 규칙.

## 4. 페이지별 구성

### 4.1 랜딩 (AIDA — gpt-taste §2)
- **Nav:** 플로팅 글래스 필(디태치드, `mt-6` 센터), 스크롤 시 수축·블러 강화. 데스크톱 1줄·높이 ≤72px.
- **Attention(히어로):** 시네마틱 다크. 레이아웃은 Variance 엔진이 히어로 아키텍처 중 선택(gpt-taste §3의 3안 또는 tasteskill §10 히어로 패러다임 — 구현 시 `<design_plan>`으로 확정). 콘텐츠는 **실측 답변 원문 + 실측 언급률(구간 포함)** — 텍스트+그라데이션 블롭만 있는 히어로 금지. 히어로 스택 ≤4 요소, H1 ≤2줄, CTA 1+1.
- **Interest(벤토):** "리포트에 들어가는 것" 4항목 → gapless 벤토(`grid-flow-dense`, 셀 수 = 콘텐츠 수, 배경 다양성 — 실 스크린샷 셀 포함).
- **Desire(GSAP 스크롤텔링):** **"실측 재현" 핀 섹션** — 섹션 핀 + 스크럽으로 질의 타이핑 → 답변 스트리밍 → 언급 하이라이트 → 언급률+구간 정착을 스크롤에 바인딩(기존 시그니처 컨셉을 GSAP 스크롤텔링으로 승격, 데이터는 전부 실측). Sticky-stack(§5.A 스켈레톤)은 "신청하면" 3단계에 적용 검토.
- **Action:** 대형 고대비 CTA + 간결 푸터. 마퀴는 페이지당 ≤1(쓴다면 공개 질의 템플릿 스트립).
- 기존 섹션 콘텐츠(질의 프로토콜 공개·한계 고지)는 **보존** — 이 제품의 실제 차별점이자 신뢰 섹션.

### 4.2 요금제
- "측정 횟수가 곧 신뢰구간의 넓이" 헤드라인 보존. 3-타워 클리셰 탈피 — 추천 티어는 높이가 아니라 색·강조로(redesign-skill). 다크 테마, 표는 데이터 판독성 우선.

### 4.3 무료진단 신청 (`audit/new`·`requested`)
- 다크 마케팅 표면. 폼 상태(로딩·에러·성공) 풀 사이클, 폼 대비 AA, label-above-input 유지.

### 4.4 앱 (redesign-skill Fix Priority 순서로)
1. 서체 스왑(SUIT) → 2. 색·표면 재조정(double-bezel 카드·틴트 그림자) → 3. 호버·프레스 상태(스프링 물리) → 4. 레이아웃·간격(여백 확대, max-w 컨테이너) → 5. 컴포넌트 클리셰 교체 → 6. 로딩(스켈레톤 셔머)·빈 상태·에러 → 7. 타이포 스케일 폴리시.
- 차트(추이·SoV·히트맵): 렌더 데이터는 실측 그대로(하드 룰), 스타일 격상(드로우인·호버 툴팁·크로스헤어는 Motion/CSS로 — 차트에 GSAP 스크롤 하이재킹 금지). 선 끊김·구간 밴드 등 **기존 렌더 로직은 유지**(데이터 표현을 바꾸면 조작 위험).
- 온보딩: 단계 전환 모션, 에디터 마이크로(생성 스트리밍 커서·검증 피드백), 동결 확인 모먼트.
- 리포트 `audit/[id]`: 화면은 앱 격상 적용, **print/PDF CSS는 회귀 없이 보존**(유료 납품물).

## 5. 모션 시스템

- **GSAP + ScrollTrigger**: 마케팅 스크롤텔링 전용(핀·스크럽·스택). 캐노니컬 스켈레톤(tasteskill §5.A/5.B — `start:"top top"`, `pin:true`, cleanup `ctx.revert()`) 준수. `useReducedMotion` 가드 필수.
- **Motion(`motion/react`)**: UI 마이크로·상태 전환·`whileInView` 리빌(마케팅 경량 리빌 + 앱 전반). 연속 값은 `useMotionValue`/`useTransform` — `useState` 금지.
- **혼용 금지**: 같은 컴포넌트 트리에서 GSAP과 Motion을 섞지 않는다(스킬 공통 규칙).
- 모든 모션은 transform·opacity만(GPU-safe), `window.addEventListener('scroll')` 금지, 모션마다 한 문장 동기 설명 가능해야 함(Motion Motivated).
- reduced-motion: 전역 킬 스위치(기존 globals 규칙 계승) + GSAP/Motion 레벨 가드 이중화.

## 6. 콘텐츠 규칙

- 카피 보이스·주장 보존(Overhaul 모드). 마케팅 카피 손질은 히어로 2줄·서브텍스트 ≤20단어 등 레이아웃 요구 범위 내.
- 화면의 모든 수치는 실측 출처를 가진다(랜딩 표본 = 2026-07-30 실측, 대시보드 스크린샷 = 실계정). "fake-precise number" 금지는 하드 룰과 동치.
- AI Tells 금지 목록(tasteskill §9) 마케팅 전면 적용: 섹션 번호 아이브로·스크롤 큐·장식 점·버전 라벨·`·` 남용·em-dash 등.

## 7. 기술 결정

| 축 | 결정 |
|---|---|
| 신규 의존성 | `gsap`, `@gsap/react`, `motion`, `@phosphor-icons/react`, SUIT 서체(패키지 또는 woff2 self-host — 구현 시 확인) |
| 테마 구현 | 다크는 `(marketing)`·`audit` 신청 라우트 레이아웃 스코프(html 전역 아님). 앱 라이트 유지. `.dark` 전역 토글은 여전히 안 만든다 |
| 토큰 | globals.css 전면 개편 — 마케팅 다크 토큰 세트 + 앱 라이트 토큰 세트. `tests/design-tokens.test.ts`는 새 계약값으로 재작성(의미 규칙 테스트는 유지) |
| 재사용 | `visual-elevation` 브랜치의 reduced-motion delay 중화 수정(ce803b1)과 elevation 다층 그림자 개념은 새 토큰에 승계 |
| 성능 | LCP <2.5s 유지 — GSAP+Motion ≈ +90KB gz는 마케팅 우선 로드 최적화(dynamic import·클라이언트 리프 격리). 서체는 한글 서브셋 woff2 + swap |
| 테스트 | 기존 동작·데이터 테스트(1296) 전부 유지. 클래스명 단언 테스트는 새 디자인에 맞게 갱신. 마케팅 머지 게이트 = tasteskill §14 Pre-Flight 수동 체크 + 브라우저 실물 |
| PDF | `audit/[id]` print CSS 회귀 금지 — 리뉴얼 후 `pnpm audit:pdf` 실측 검증 1회 |

## 8. 실행 구조 (계획서가 태스크로 분해)

1. **F0 기반**: 의존성·서체·토큰 2세트·아이콘·모션 유틸(GSAP/Motion 래퍼·reduced-motion 가드)
2. **M1 랜딩**: `<design_plan>`(다이얼·히어로 아키텍처·컴포넌트 아스널 확정) → 구현 → §14 Pre-Flight → 브라우저 게이트
3. **M2 요금제 + 무료진단 신청**
4. **A1 앱 공통 표면**: 프리미티브(버튼·카드·입력)·헤더·간격 체계
5. **A2 대시보드**: 차트 스타일 격상 + 툴팁 + 스켈레톤
6. **A3 온보딩·회차상세·리포트**(print 검증 포함)
7. **G 마감**: AI Tells grep 배터리(em-dash·금지 패턴 자동화 가능분) + Lighthouse + 전 화면 브라우저 게이트 + PDF 검증

## 9. 리스크

- **번들·성능**: GSAP 마케팅 페이지 한정 로드로 완화. Lighthouse가 게이트.
- **다크 마케팅 ↔ 라이트 앱 경계**: 로그인 진입 시 테마 점프 — 의도된 표면 전환(Linear 동일 패턴)으로 수용.
- **서체 로딩**: SUIT 한글 서브셋 ~수백 KB — preload + swap, FOUT 1회 수용.
- **SEO**: URL·IA·메타 보존으로 통제. 히어로가 클라이언트 렌더에 기대지 않게 SSR 콘텐츠 유지.
- **기존 테스트 마찰**: 클래스 단언 갱신 비용 — 계획서에서 태스크별로 명시.
