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
