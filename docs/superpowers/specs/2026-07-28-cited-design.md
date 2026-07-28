# Cited — 설계 문서

> 작성일 2026-07-28 · **작성 중** (설계안 ③④⑤ 미완)

## 제품 개요

브랜드가 AI 답변에 얼마나 인용되는지 추적하는 한국어 GEO(Generative Engine
Optimization) 모니터링 SaaS.

소비자는 이제 "30대 남자 러닝화 추천해줘"를 검색창이 아니라 AI에게 묻는다.
AI는 문장으로 답하므로 브랜드는 자기가 그 답변에 등장했는지 알 방법이 없다.
Cited는 대신 AI에게 계속 물어보고 결과를 기록해 그 사각지대를 없앤다.

## 확정 사항

| 항목 | 결정 |
| --- | --- |
| 1차 목표 | 매출 증명 = 포트폴리오 (둘 다) |
| 범위 | 풀 SaaS — 인증 + 자동결제 + 대시보드. 단 무료 진단을 먼저 배포 |
| 타깃 | 국내 D2C·이커머스 브랜드 |
| 엔진 | ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews |
| 측정 | 질의 30개(Business) / 10개(Starter), 샘플 LLM 3회 · SERP 2회, 주 1회 |
| 요금제 | Starter 29,000원 / Business 149,000원 |

### 요금제 상세

| | Starter | Business |
| --- | --- | --- |
| 요금 | 29,000원 | 149,000원 |
| 질의 | 10개 | 30개 |
| 엔진 | ChatGPT, Gemini | + 네이버, Google AIO |
| 샘플 | LLM 3회 | LLM 3회 / SERP 2회 |
| 월 원가 | 약 5,200원 | 약 34,000원 |
| 원가율 | 18% | 23% |

무료 진단은 LLM 2종만 사용한다(SERP 제외). 원가를 건당 175~370원으로 억제하는
동시에, "네이버·구글까지 보려면 구독"이라는 업셀 축이 된다.

## 기술 스택

| 층 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 16.2.x (App Router) + React 19.2 + TypeScript |
| UI | Tailwind 4 + shadcn/ui |
| DB | Neon (Postgres) + Drizzle ORM |
| 인증 | Better Auth |
| 배치 | Trigger.dev |
| 결제 | 토스페이먼츠 (빌링키 정기결제) |
| 배포 | Vercel Pro |

Next.js 16은 LTS이며 Turbopack이 기본 번들러다. 버전은 `latest`가 아니라
`16.2.x`로 고정한다.

DB로 Neon을 택한 이유는 Supabase 무료 티어가 7일 미사용 시 프로젝트를
일시정지하기 때문이다. 초기에 조용한 날이 며칠 이어지면 방문자가 에러를 본다.
Neon은 scale-to-zero라 유휴 시 비용이 0이고 Vercel과의 연동이 기본이다.

### 월 고정비

| 단계 | 비용 |
| --- | --- |
| 초기 (고객 0명) | 약 34,000원 — Vercel Pro + 도메인 + 등록면허세 |
| 고객 5명 | 약 166,000원 (SerpApi Developer 포함) |

SerpApi는 선약정·이월불가 구조이므로 **Business 첫 고객이 생긴 뒤에 가입**한다.
무료 진단은 SERP를 쓰지 않으므로 그 전까지는 불필요하다.

## 설계안 ① — 시스템 구조와 모듈 경계

```
app/          Next.js 라우트 (랜딩·무료진단·대시보드·설정·결제)
  ↓
collection/   수집 오케스트레이션 (Trigger.dev) — 스케줄·재시도·동시성
  ↓        ↘
engines/      detection/    브랜드 언급 판정 (순수 함수)
엔진 어댑터        ↓
              stats/        집계·신뢰구간
```

### engines/

외부 엔진 하나당 파일 하나. 전부 같은 인터페이스를 구현한다.

```ts
interface Engine {
  id: 'chatgpt' | 'gemini' | 'naver' | 'google_aio'
  tier: 'llm' | 'serp'          // 샘플 수 차등의 근거
  run(query: string): Promise<EngineAnswer>
}

interface EngineAnswer {
  text: string
  citations: { url: string; title: string }[]
  raw: unknown                   // 원본 보관 (재판정용)
}
```

엔진 추가가 파일 하나 추가로 끝난다. Claude·Perplexity를 나중에 넣을 때 다른
모듈을 건드리지 않는다.

### detection/

답변 텍스트에서 브랜드 언급을 판정한다. 외부 호출이 없는 순수 함수다.

```ts
detectMentions(answer: EngineAnswer, brand: BrandProfile): Detection
```

1차는 정규식·문자열 매칭(브랜드명 + 표기 변형 + 흔한 오탈자), 2차는 1차
통과분만 LLM으로 맥락·감성·언급 순서를 판정한다. 1차에서 걸러내는 것이 원가
절감의 핵심이며, 순수 함수이므로 실제 API 없이 테스트할 수 있다.

### collection/

Trigger.dev 잡. 질의 × 샘플 × 엔진으로 팬아웃하고 재시도와 동시성 제한을
담당한다. 비즈니스 로직은 두지 않고 오케스트레이션만 한다.

### stats/

판정 결과로 언급률·신뢰구간·경쟁사 대비 점유율을 계산한다. 순수 함수다.

### 핵심 원칙

외부 I/O가 있는 곳(`engines`, `collection`)과 판단 로직(`detection`, `stats`)을
분리했다. 이 제품의 최대 리스크가 측정 신뢰도이기 때문이다. 판정 로직이 순수
함수여야 저장해둔 실제 답변으로 회귀 테스트를 돌릴 수 있고, 판정 기준을 바꿨을
때 과거 데이터로 재판정해 결과 변화를 확인할 수 있다. `EngineAnswer.raw`를
보관하는 이유도 같다.

## 설계안 ② — 데이터 모델과 수집 파이프라인

```
users (Better Auth)
  └─ brands              name, aliases[], category, competitors[]
  └─ subscriptions       plan, status, billingKey, currentPeriodEnd

brands
  └─ queries             text, isActive, source(generated|custom)
  └─ collection_runs     planSnapshot★, status, startedAt, finishedAt
       └─ answers        queryId, engineId, sampleIndex, text, citations, raw★
            └─ detections  subject, mentioned, position, sentiment,
                           detectorVersion★

free_audits              email, brandName, result, ipHash, createdAt
```

★ 세 필드가 이 설계의 핵심이다.

- **`planSnapshot`** — 수집 당시의 플랜 설정(질의 수·샘플 수·엔진)을 통째로
  박제한다. 이것이 없으면 "지난달 대비 상승"이 실제 상승인지 조건 변경인지
  구분할 수 없고 시계열 전체가 무의미해진다.
- **`answers.raw`** — 원본을 버리지 않는다. 판정 로직 개선 후 과거 데이터를
  재판정할 수 있다. 용량은 브랜드당 월 1~2MB로 무시할 수준이다.
- **`detectorVersion`** — 어느 버전 로직이 매긴 판정인지 기록한다. 재판정 후
  숫자가 달라진 이유를 고객에게 설명할 수 있다.

### 플랜 설정은 코드 상수

```ts
const PLANS = {
  starter:  { maxQueries: 10, engines: ['chatgpt', 'gemini'],
              samples: { llm: 3, serp: 0 } },
  business: { maxQueries: 30,
              engines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
              samples: { llm: 3, serp: 2 } },
} as const
```

DB가 아닌 상수로 두면 티어 추가가 한 줄로 끝나고 마이그레이션이 필요 없다.

### 수집 파이프라인

```
Trigger.dev 스케줄 (주 1회, 브랜드별)
  1. 플랜 로드 → planSnapshot 생성 → collection_run 시작
  2. 팬아웃: queries × engines × samples
     Business 기준 30 × (2 LLM × 3) + 30 × (2 SERP × 2) = 300 실행
     각 실행이 독립 서브태스크 → 개별 재시도, 동시성 제한
  3. answers 저장 (원본 포함)
  4. 판정 배치 — 1차 정규식 필터 → 2차 LLM 배치 호출
  5. 집계 → 언급률 · 신뢰구간 · 경쟁사 대비
  6. run 완료 → 주간 리포트 메일
```

판정을 수집에서 분리한 것은 의도적이다. 원본이 남아 재판정이 가능하고, LLM
판정을 배치로 묶어 원가를 낮출 수 있으며, 판정이 실패해도 수집 데이터는
살아남는다. 한 번 놓친 시점의 AI 답변은 다시 만들 수 없다.

동시성 제한은 필수다. 고객 10명이면 주 3,000회 실행이므로 한꺼번에 던지면 각
엔진의 rate limit에 걸린다. Trigger.dev의 동시성 제어를 엔진별로 나눠 건다.

### 무료 진단 플로우

10질의 × 2엔진 × 1샘플 = 20호출로 10~20초가 걸린다. Vercel 함수 타임아웃 안에서
동기 처리하면 위험하므로 Trigger.dev 잡으로 던지고 Realtime으로 진행률을
스트리밍한다.

```
브랜드명 입력 → 잡 시작
  "ChatGPT에 물어보는 중... (4/10)"
  "Gemini에 물어보는 중... (7/10)"
  → 결과 표시 → 이메일 입력해야 전체 리포트 열람
```

진행 문구 자체가 "이 도구가 진짜로 AI에 물어보고 있다"는 증거로 작동한다.

남용 방지는 이메일 인증 + 브랜드당 월 1회 + IP 해시 기준 일일 상한으로 한다.
상한 소진 시 에러가 아니라 대기 등록으로 받아 리드는 확보한다.

## 미작성 구간

아래 세 절은 아직 논의하지 않았다. 다음 세션에서 이어서 작성한다.

- **설계안 ③ 측정·판정 로직** — 브랜드 별칭 매칭 규칙, 1차/2차 판정 기준,
  신뢰구간 산출, 재판정 정책. 제품의 핵심이자 최대 리스크 구간.
- **설계안 ④ 화면 구성·사용자 플로우** — 랜딩, 무료 진단 결과 화면, 대시보드,
  온보딩(질의 생성·편집), 결제.
- **설계안 ⑤ 오류 처리·테스트 전략** — 엔진 장애 시 부분 실패 처리, 재시도
  정책, 회귀 테스트용 픽스처 구성.

## 미해결 항목

- **SerpApi Developer 플랜($75)의 정확한 검색 건수.** 공개 자료에 없다. Starter가
  1,000건/$25, Big Data가 30,000건/$275인 것으로 보아 5,000건 안팎으로
  추정되나 가입 전 직접 확인해야 한다. 고객 5명 기준 비용 추정이 여기 기대고 있다.
- **OpenAI 웹검색 툴의 호출당 단가.** 확정하지 못해 원가 계산에서 빠져 있다.
  실제 원가는 산출치보다 다소 높다.
- **도메인 확보 가능 여부.** `cited` 계열 도메인이 비어 있는지 확인하지 않았다.
