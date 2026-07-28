# Cited 2단계 — 측정 코어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엔진 어댑터 4종, 2단계 브랜드 언급 판정기, Wilson 신뢰구간 기반 집계를
구현하고, 골드 라벨 세트로 판정 정확도를 CI에서 강제한다.

**Architecture:** 외부 I/O가 있는 `engines/`와 판단 로직인 `detection/`·`stats/`를
분리한다. 판정과 집계는 순수 함수이므로 저장된 실제 답변으로 회귀 테스트가 가능하고,
판정 기준을 바꿨을 때 과거 데이터로 재판정해 결과 변화를 확인할 수 있다.
1단계에서 lint 규칙으로 이 경계를 이미 강제해 두었다.

**Tech Stack:** OpenAI SDK (ChatGPT + web_search) · @google/genai (Gemini +
googleSearch grounding) · SerpApi REST (네이버 AI 브리핑 · Google AI Overviews)
· @anthropic-ai/sdk (Claude Haiku 4.5 판정기) · zod · Vitest

## Global Constraints

로드맵의 "전 단계 공통 제약" + 이 단계 전용:

- **`src/lib/detection/**`과 `src/lib/stats/**`는 외부 I/O 금지.** 1단계 Task 7의
  ESLint 규칙이 강제한다. LLM 호출이 필요한 2차 판정은 **함수를 주입받는다**
- **엔진 계약 테스트는 실제 API를 부르지 않는다.** 저장된 응답 픽스처를 파싱한다
- **실제 호출은 `*.smoke.test.ts`에만.** CI 기본 실행에서 제외된다
- **`EngineAnswer.raw`에 원본을 그대로 담는다.** 파싱 실패해도 원본은 살린다
- **판정기 모델:** `claude-haiku-4-5` (설계 문서가 명시). 모델 ID는
  `src/lib/detection/config.ts` 상수로 두고, 바꿀 때는 반드시 골드 라벨 회귀 검증을 통과해야 한다
- **비용 상수는 실측으로 갱신한다.** 추정값에 `// 추정` 주석을 남기고, 실측 후
  주석을 지운다
- 각 태스크의 마지막 Step은 커밋

## 이 단계의 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/lib/stats/wilson.ts` | Wilson score interval, 구간 겹침 판정 |
| `src/lib/stats/metrics.ts` | Cited Rate · First-Mention · Share of Voice · 질의별 집계 |
| `src/lib/engines/types.ts` | `Engine` 인터페이스, `EngineAnswer`, 에러 타입 |
| `src/lib/engines/chatgpt.ts` | OpenAI Responses API + web_search |
| `src/lib/engines/gemini.ts` | Gemini + googleSearch grounding |
| `src/lib/engines/serpapi.ts` | SerpApi 공통 클라이언트 (쿼터 헤더 파싱 포함) |
| `src/lib/engines/naver.ts` | 네이버 AI 브리핑 |
| `src/lib/engines/google-aio.ts` | Google AI Overviews |
| `src/lib/engines/index.ts` | 레지스트리 `getEngine(id)` |
| `src/lib/engines/pricing.ts` | 엔진별 단가 상수 + 원가 추정 |
| `src/lib/detection/types.ts` | `BrandProfile`, `Detection`, `DetectionInput` |
| `src/lib/detection/normalize.ts` | 한국어 정규화 (공백·자모·전각) |
| `src/lib/detection/stage1.ts` | 별칭 매칭 (recall 우선) |
| `src/lib/detection/stage2.ts` | LLM 구조화 판정 (judge 함수 주입) |
| `src/lib/detection/index.ts` | `detectMentions` 오케스트레이션 + `DETECTOR_VERSION` |
| `src/lib/detection/judge-claude.ts` | Claude Haiku judge 구현 (I/O — detection/ 밖 규칙 예외는 아님, 아래 주의) |
| `tests/fixtures/engines/*.json` | 저장된 실제 엔진 응답 |
| `tests/golden/labels.json` | 손으로 라벨링한 200개 |
| `tests/golden/regression.test.ts` | CI 게이트: recall ≥95%, precision ≥90% |
| `scripts/probe-engine.ts` | 실제 API 1회 호출 → 픽스처 저장 |
| `scripts/label-cli.ts` | 골드 라벨링 보조 CLI |

> **`judge-claude.ts`의 위치에 주의.** 이 파일은 Anthropic API를 호출하므로
> `src/lib/detection/` 안에 두면 1단계 lint 규칙에 걸린다. **`src/lib/judge/claude.ts`에
> 둔다.** `detection/stage2.ts`는 `JudgeFn` 타입만 알고, 구현은 주입받는다.
> 이 분리가 골드 라벨 회귀 테스트를 API 키 없이 돌릴 수 있게 만드는 핵심이다.

---

### Task 1: Wilson 신뢰구간과 변화 판정

**Files:**
- Create: `src/lib/stats/wilson.ts`
- Test: `src/lib/stats/wilson.test.ts`

**Interfaces:**
- Consumes: 없음 (완전 순수)
- Produces:
  - `interface Interval { point: number; lower: number; upper: number; n: number; k: number }`
  - `wilsonInterval(k: number, n: number, z?: number): Interval`
  - `Z_95 = 1.959963984540054`
  - `intervalsOverlap(a: Interval, b: Interval): boolean`
  - `type ChangeVerdict = 'up' | 'down' | 'unchanged' | 'incomparable'`
  - `judgeChange(prev, curr, opts?): ChangeVerdict`
  - 5단계 대시보드의 화살표 규칙과 3단계 집계가 소비한다

설계 ③: 교과서적 정규근사(Wald)를 쓰면 안 된다. 언급률이 0%나 100%일 때 완전히
망가진다. 작은 브랜드는 실제로 0%가 자주 나온다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/stats/wilson.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { judgeChange, intervalsOverlap, wilsonInterval } from '@/lib/stats/wilson'

describe('wilsonInterval — 설계 ⑤가 지정한 경계값', () => {
  it('n=90, k=0 → 0% ~ 4.1% (0%가 아니다)', () => {
    const ci = wilsonInterval(0, 90)
    expect(ci.point).toBe(0)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBeCloseTo(0.0409, 3)
    // Wald였다면 upper도 0이 되어 "확실히 0%"라는 거짓말이 된다
    expect(ci.upper).toBeGreaterThan(0)
  })

  it('n=90, k=90 → 95.9% ~ 100%', () => {
    const ci = wilsonInterval(90, 90)
    expect(ci.point).toBe(1)
    expect(ci.lower).toBeCloseTo(0.9591, 3)
    expect(ci.upper).toBe(1)
  })

  it('n=1 → 구간이 거의 전 범위', () => {
    const ci = wilsonInterval(0, 1)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBeGreaterThan(0.7)
  })

  it('n=300, k=102 → 34% 근처, 구간이 좁다', () => {
    const ci = wilsonInterval(102, 300)
    expect(ci.point).toBeCloseTo(0.34, 4)
    expect(ci.lower).toBeCloseTo(0.2887, 3)
    expect(ci.upper).toBeCloseTo(0.3949, 3)
    expect(ci.upper - ci.lower).toBeLessThan(0.12)
  })

  it('n이 커질수록 구간이 좁아진다', () => {
    const small = wilsonInterval(5, 10)
    const large = wilsonInterval(500, 1000)
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower)
  })

  it('구간은 항상 [0,1] 안에 있다', () => {
    for (const [k, n] of [
      [0, 1],
      [1, 1],
      [0, 3],
      [3, 3],
      [1, 2],
      [7, 1000],
    ] as const) {
      const ci = wilsonInterval(k, n)
      expect(ci.lower).toBeGreaterThanOrEqual(0)
      expect(ci.upper).toBeLessThanOrEqual(1)
      expect(ci.lower).toBeLessThanOrEqual(ci.upper)
    }
  })

  it('n=0이면 전 범위를 돌려준다 (측정 없음)', () => {
    const ci = wilsonInterval(0, 0)
    expect(ci.lower).toBe(0)
    expect(ci.upper).toBe(1)
    expect(ci.point).toBe(0)
  })

  it('k > n 이면 던진다', () => {
    expect(() => wilsonInterval(5, 3)).toThrowError(/k.*n/)
  })

  it('음수 입력을 거부한다', () => {
    expect(() => wilsonInterval(-1, 10)).toThrowError()
    expect(() => wilsonInterval(1, -10)).toThrowError()
  })
})

describe('intervalsOverlap', () => {
  it('겹치면 true', () => {
    expect(intervalsOverlap(wilsonInterval(30, 100), wilsonInterval(35, 100))).toBe(true)
  })

  it('완전히 떨어져 있으면 false', () => {
    expect(intervalsOverlap(wilsonInterval(10, 300), wilsonInterval(200, 300))).toBe(false)
  })

  it('경계가 정확히 맞닿으면 겹친 것으로 본다 (보수적)', () => {
    const a = { point: 0.1, lower: 0.0, upper: 0.2, n: 10, k: 1 }
    const b = { point: 0.3, lower: 0.2, upper: 0.4, n: 10, k: 3 }
    expect(intervalsOverlap(a, b)).toBe(true)
  })
})

describe('judgeChange — 설계 ③ 화살표 규칙', () => {
  it('구간이 겹치면 변화 없음 (노이즈를 변화로 보고하지 않는다)', () => {
    expect(judgeChange(wilsonInterval(30, 100), wilsonInterval(36, 100))).toBe('unchanged')
  })

  it('구간이 겹치지 않고 올랐으면 up', () => {
    expect(judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300))).toBe('up')
  })

  it('구간이 겹치지 않고 내렸으면 down', () => {
    expect(judgeChange(wilsonInterval(150, 300), wilsonInterval(20, 300))).toBe('down')
  })

  it('엔진 구성이 다르면 비교하지 않는다', () => {
    const verdict = judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300), {
      prevEngines: ['chatgpt', 'gemini', 'naver', 'google_aio'],
      currEngines: ['chatgpt', 'gemini', 'google_aio'],
    })
    expect(verdict).toBe('incomparable')
  })

  it('엔진 구성이 순서만 다르면 비교 가능하다', () => {
    const verdict = judgeChange(wilsonInterval(20, 300), wilsonInterval(150, 300), {
      prevEngines: ['gemini', 'chatgpt'],
      currEngines: ['chatgpt', 'gemini'],
    })
    expect(verdict).toBe('up')
  })

  it('비교할 지난주가 없으면 incomparable (첫날 대시보드)', () => {
    expect(judgeChange(null, wilsonInterval(100, 300))).toBe('incomparable')
  })

  it('측정이 0회인 주는 비교하지 않는다', () => {
    expect(judgeChange(wilsonInterval(0, 0), wilsonInterval(100, 300))).toBe('incomparable')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/stats/wilson.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/stats/wilson'`

- [ ] **Step 3: 구현**

`src/lib/stats/wilson.ts`:

```ts
/** 95% 양측 신뢰구간의 z값 */
export const Z_95 = 1.959963984540054

export interface Interval {
  /** 표본 비율 k/n */
  point: number
  lower: number
  upper: number
  n: number
  k: number
}

/**
 * Wilson score interval.
 *
 *   center    = (p̂ + z²/2n) / (1 + z²/n)
 *   halfwidth = z/(1+z²/n) × √( p̂(1-p̂)/n + z²/4n² )
 *
 * Wald(정규근사)를 쓰지 않는 이유: p̂=0 또는 1일 때 폭이 0이 되어
 * "확실히 0%"라는 거짓 확신을 만든다. 90회 시행에 0번과 10,000회에 0번은
 * 전혀 다른 정보인데 Wald는 구분하지 못한다.
 */
export function wilsonInterval(k: number, n: number, z: number = Z_95): Interval {
  if (!Number.isFinite(k) || !Number.isFinite(n)) {
    throw new Error(`wilsonInterval: 유한한 수가 필요합니다 (k=${k}, n=${n})`)
  }
  if (k < 0 || n < 0) {
    throw new Error(`wilsonInterval: 음수를 받을 수 없습니다 (k=${k}, n=${n})`)
  }
  if (k > n) {
    throw new Error(`wilsonInterval: k(${k})가 n(${n})보다 클 수 없습니다`)
  }
  if (n === 0) {
    // 측정이 없으면 아무것도 모른다. 전 범위를 돌려준다.
    return { point: 0, lower: 0, upper: 1, n: 0, k: 0 }
  }

  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))

  return {
    point: p,
    lower: clamp01(center - half),
    upper: clamp01(center + half),
    n,
    k,
  }
}

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

/** 두 구간이 조금이라도 겹치는가. 경계가 맞닿으면 겹친 것으로 본다(보수적). */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.lower <= b.upper && b.lower <= a.upper
}

export type ChangeVerdict = 'up' | 'down' | 'unchanged' | 'incomparable'

export interface ChangeOptions {
  /** 이전 수집의 엔진 구성. 현재와 다르면 비교하지 않는다. */
  prevEngines?: readonly string[]
  /** 현재 수집의 엔진 구성 */
  currEngines?: readonly string[]
}

/**
 * 설계 ③의 변화 판정 규칙.
 *
 *   두 주의 신뢰구간이 겹치지 않을 때만 유의미한 변화로 표시한다.
 *   겹치면 "변화 없음(측정 범위 내)"으로 쓴다.
 *
 * 노이즈를 변화로 보고하는 순간 신뢰를 잃는다. 화살표를 아끼는 게 제품을 지킨다.
 * 엔진 구성이 다른 주끼리는 아예 비교하지 않는다 — 숫자가 떨어진 이유가 실제
 * 하락인지 엔진 누락인지 알 수 없기 때문이다.
 */
export function judgeChange(
  prev: Interval | null,
  curr: Interval,
  opts: ChangeOptions = {},
): ChangeVerdict {
  if (prev === null) return 'incomparable'
  if (prev.n === 0 || curr.n === 0) return 'incomparable'

  if (opts.prevEngines && opts.currEngines) {
    const a = [...opts.prevEngines].sort().join(',')
    const b = [...opts.currEngines].sort().join(',')
    if (a !== b) return 'incomparable'
  }

  if (intervalsOverlap(prev, curr)) return 'unchanged'
  return curr.point > prev.point ? 'up' : 'down'
}

/** 화면 표시용 포맷. 소수점 없이 정수 퍼센트. */
export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatInterval(ci: Interval): string {
  return `${formatPercent(ci.lower)} ~ ${formatPercent(ci.upper)}`
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/stats/wilson.test.ts
```

Expected: PASS (18 passed). 경계값 테스트가 실패하면 공식을 다시 확인한다 —
`half` 계산의 `z2/(4*n*n)` 항을 빠뜨리는 것이 가장 흔한 실수다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stats/wilson.ts src/lib/stats/wilson.test.ts
git commit -m "feat(stats): Wilson 신뢰구간과 구간 겹침 기반 변화 판정"
```

---

### Task 2: 지표 집계

**Files:**
- Create: `src/lib/stats/metrics.ts`
- Test: `src/lib/stats/metrics.test.ts`

**Interfaces:**
- Consumes: `wilsonInterval`, `Interval` (Task 1)
- Produces:
  - `interface DetectionRecord { answerId: string; queryId: string; engineId: string; subject: string; mentioned: boolean; position: number | null }`
  - `interface AnswerRecord { id: string; queryId: string; queryText: string; engineId: string }`
  - `computeMetrics(answers, detections, opts): BrandMetrics`
  - `interface BrandMetrics { citedRate; firstMentionRate; shareOfVoice; byEngine; byQuery; totalAnswers }`
  - 3단계 집계 잡과 5단계 대시보드가 소비한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/stats/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'

/** 답변 n개를 만든다. 엔진과 질의를 순환시킨다. */
function makeAnswers(spec: { queryId: string; engineId: string; count: number }[]): AnswerRecord[] {
  const out: AnswerRecord[] = []
  let i = 0
  for (const s of spec) {
    for (let j = 0; j < s.count; j++) {
      out.push({
        id: `a${i++}`,
        queryId: s.queryId,
        queryText: `질의 ${s.queryId}`,
        engineId: s.engineId,
      })
    }
  }
  return out
}

function detect(
  answers: AnswerRecord[],
  subject: string,
  pattern: (i: number) => { mentioned: boolean; position?: number },
): DetectionRecord[] {
  return answers.map((a, i) => {
    const r = pattern(i)
    return {
      answerId: a.id,
      queryId: a.queryId,
      engineId: a.engineId,
      subject,
      mentioned: r.mentioned,
      position: r.position ?? null,
    }
  })
}

describe('computeMetrics — Cited Rate', () => {
  it('언급된 응답 / 전체 응답', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 4,
      position: i < 4 ? 1 : undefined,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.point).toBeCloseTo(0.4, 6)
    expect(m.citedRate.n).toBe(10)
    expect(m.citedRate.k).toBe(4)
  })

  it('언급 0회여도 신뢰구간 상한은 0보다 크다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 90 }])
    const detections = detect(answers, 'self', () => ({ mentioned: false }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.point).toBe(0)
    expect(m.citedRate.upper).toBeGreaterThan(0)
  })

  it('판정이 없는 답변은 미언급으로 센다 (분모에서 빼지 않는다)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers.slice(0, 5), 'self', () => ({ mentioned: true, position: 1 }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.n).toBe(10)
    expect(m.citedRate.k).toBe(5)
  })
})

describe('computeMetrics — First-Mention Rate', () => {
  it('첫 번째로 언급된 응답 / 전체 응답', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 6,
      position: i < 6 ? (i < 2 ? 1 : 3) : undefined,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.citedRate.k).toBe(6)
    expect(m.firstMentionRate.k).toBe(2)
    expect(m.firstMentionRate.n).toBe(10)
  })
})

describe('computeMetrics — Share of Voice', () => {
  it('우리 언급 수 / (우리 + 경쟁사 언급 수)', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 10 }])
    const mine = detect(answers, 'self', (i) => ({ mentioned: i < 3, position: 1 }))
    const rival = detect(answers, 'competitor:A', (i) => ({ mentioned: i < 7, position: 1 }))
    const m = computeMetrics(answers, [...mine, ...rival], {
      self: 'self',
      competitors: ['competitor:A'],
    })
    expect(m.shareOfVoice.point).toBeCloseTo(3 / 10, 6)
    expect(m.competitorRates['competitor:A']?.point).toBeCloseTo(0.7, 6)
  })

  it('아무도 언급되지 않으면 SoV는 0이고 던지지 않는다', () => {
    const answers = makeAnswers([{ queryId: 'q1', engineId: 'chatgpt', count: 5 }])
    const m = computeMetrics(answers, [], { self: 'self', competitors: ['competitor:A'] })
    expect(m.shareOfVoice.point).toBe(0)
    expect(m.shareOfVoice.n).toBe(0)
  })
})

describe('computeMetrics — 엔진별 · 질의별', () => {
  it('엔진별로 나눈다', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 10 },
      { queryId: 'q1', engineId: 'naver', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 10 ? i < 6 : i < 12,
      position: 1,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byEngine.chatgpt?.point).toBeCloseTo(0.6, 6)
    expect(m.byEngine.naver?.point).toBeCloseTo(0.2, 6)
  })

  it('질의별 0/N을 찾아낸다 (지금 조치할 것 카드의 근거)', () => {
    const answers = makeAnswers([
      { queryId: 'q1', engineId: 'chatgpt', count: 10 },
      { queryId: 'q2', engineId: 'chatgpt', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({ mentioned: i < 10, position: 1 }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })

    const zero = m.byQuery.filter((q) => q.interval.k === 0)
    expect(zero).toHaveLength(1)
    expect(zero[0]?.queryId).toBe('q2')
    expect(zero[0]?.queryText).toBe('질의 q2')
    expect(zero[0]?.interval.n).toBe(10)
  })

  it('질의별 결과는 언급률 오름차순 — 못 나오는 질의가 위로 온다', () => {
    const answers = makeAnswers([
      { queryId: 'high', engineId: 'chatgpt', count: 10 },
      { queryId: 'low', engineId: 'chatgpt', count: 10 },
    ])
    const detections = detect(answers, 'self', (i) => ({
      mentioned: i < 10 ? true : i < 11,
      position: 1,
    }))
    const m = computeMetrics(answers, detections, { self: 'self', competitors: [] })
    expect(m.byQuery[0]?.queryId).toBe('low')
  })
})

describe('computeMetrics — 빈 입력', () => {
  it('답변이 없으면 전부 n=0이고 던지지 않는다', () => {
    const m = computeMetrics([], [], { self: 'self', competitors: [] })
    expect(m.totalAnswers).toBe(0)
    expect(m.citedRate.n).toBe(0)
    expect(m.byQuery).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/stats/metrics.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/stats/metrics'`

- [ ] **Step 3: 구현**

`src/lib/stats/metrics.ts`:

```ts
import { type Interval, wilsonInterval } from './wilson'

export interface AnswerRecord {
  id: string
  queryId: string
  queryText: string
  engineId: string
}

export interface DetectionRecord {
  answerId: string
  queryId: string
  engineId: string
  /** 'self' 또는 'competitor:<name>' */
  subject: string
  mentioned: boolean
  /** 답변에서 몇 번째로 언급된 브랜드인가. 1부터 시작. */
  position: number | null
}

export interface QueryBreakdown {
  queryId: string
  queryText: string
  interval: Interval
}

export interface BrandMetrics {
  totalAnswers: number
  /** 대표 지표 — 언급된 응답 / 전체 응답 */
  citedRate: Interval
  /** 첫 번째로 언급된 응답 / 전체 응답 */
  firstMentionRate: Interval
  /** 우리 언급 수 / (우리 + 경쟁사 언급 수) */
  shareOfVoice: Interval
  byEngine: Record<string, Interval>
  /** 언급률 오름차순 — "이 질문에서 안 나온다"가 위로 온다 */
  byQuery: QueryBreakdown[]
  competitorRates: Record<string, Interval>
}

export interface MetricsOptions {
  /** 우리 브랜드의 subject 값 */
  self: string
  /** 경쟁사 subject 값 목록 */
  competitors: readonly string[]
}

export function computeMetrics(
  answers: readonly AnswerRecord[],
  detections: readonly DetectionRecord[],
  opts: MetricsOptions,
): BrandMetrics {
  const n = answers.length

  // 판정이 없는 답변은 "미언급"으로 센다. 분모에서 빼면 숫자가 부풀려진다.
  const selfByAnswer = new Map<string, DetectionRecord>()
  const bySubject = new Map<string, Set<string>>()

  for (const d of detections) {
    if (!d.mentioned) continue
    if (d.subject === opts.self) selfByAnswer.set(d.answerId, d)
    let set = bySubject.get(d.subject)
    if (!set) {
      set = new Set()
      bySubject.set(d.subject, set)
    }
    set.add(d.answerId)
  }

  const selfMentions = selfByAnswer.size
  let firstMentions = 0
  for (const d of selfByAnswer.values()) {
    if (d.position === 1) firstMentions++
  }

  // Share of Voice — 분모는 우리 + 경쟁사 언급 수의 합
  let competitorMentionTotal = 0
  const competitorRates: Record<string, Interval> = {}
  for (const c of opts.competitors) {
    const k = bySubject.get(c)?.size ?? 0
    competitorMentionTotal += k
    competitorRates[c] = wilsonInterval(k, n)
  }
  const sovDenominator = selfMentions + competitorMentionTotal

  // 엔진별
  const engineTotals = new Map<string, { n: number; k: number }>()
  for (const a of answers) {
    const cur = engineTotals.get(a.engineId) ?? { n: 0, k: 0 }
    cur.n++
    if (selfByAnswer.has(a.id)) cur.k++
    engineTotals.set(a.engineId, cur)
  }
  const byEngine: Record<string, Interval> = {}
  for (const [engineId, t] of engineTotals) {
    byEngine[engineId] = wilsonInterval(t.k, t.n)
  }

  // 질의별
  const queryTotals = new Map<string, { text: string; n: number; k: number }>()
  for (const a of answers) {
    const cur = queryTotals.get(a.queryId) ?? { text: a.queryText, n: 0, k: 0 }
    cur.n++
    if (selfByAnswer.has(a.id)) cur.k++
    queryTotals.set(a.queryId, cur)
  }
  const byQuery: QueryBreakdown[] = [...queryTotals.entries()]
    .map(([queryId, t]) => ({
      queryId,
      queryText: t.text,
      interval: wilsonInterval(t.k, t.n),
    }))
    // 못 나오는 질의를 위로. 동률이면 표본이 큰 쪽을 먼저.
    .sort((a, b) => a.interval.point - b.interval.point || b.interval.n - a.interval.n)

  return {
    totalAnswers: n,
    citedRate: wilsonInterval(selfMentions, n),
    firstMentionRate: wilsonInterval(firstMentions, n),
    shareOfVoice: wilsonInterval(selfMentions, sovDenominator),
    byEngine,
    byQuery,
    competitorRates,
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/stats/metrics.test.ts
```

Expected: PASS (11 passed)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stats/metrics.ts src/lib/stats/metrics.test.ts
git commit -m "feat(stats): Cited Rate · First-Mention · SoV · 엔진별/질의별 집계"
```

---

### Task 3: 엔진 인터페이스와 픽스처 수집 도구

**Files:**
- Create: `src/lib/engines/types.ts`, `src/lib/engines/pricing.ts`,
  `scripts/probe-engine.ts`, `tests/fixtures/engines/.gitkeep`
- Test: `src/lib/engines/types.test.ts`

**Interfaces:**
- Consumes: `EngineId` (1단계 `plans.ts`)
- Produces:
  - `interface Engine { id: EngineId; tier: 'llm' | 'serp'; run(query, opts): Promise<EngineAnswer> }`
  - `interface EngineAnswer { text: string; citations: Citation[]; raw: unknown; usage?: EngineUsage }`
  - `class EngineError extends Error` — `retryable` 플래그 포함
  - `estimateCostKrw(engineId, usage): number`
  - `pnpm probe:engine <engineId> "<질의>"` — 실제 API 1회 호출 후 픽스처 저장
  - Task 4~6의 모든 엔진이 이 인터페이스를 구현한다

설계 ①: 엔진 추가가 파일 하나 추가로 끝나야 한다. 네이버 공급자를 SerpApi에서
다른 곳으로 옮길 때도 마찬가지다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/engines/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EngineError, isRetryable } from '@/lib/engines/types'
import { estimateCostKrw } from '@/lib/engines/pricing'

describe('EngineError', () => {
  it('429는 재시도 가능하고 더 긴 대기를 요구한다', () => {
    const e = new EngineError('rate limited', { engineId: 'chatgpt', status: 429 })
    expect(e.retryable).toBe(true)
    expect(e.backoffHint).toBe('long')
  })

  it('5xx는 재시도 가능하다', () => {
    expect(new EngineError('boom', { engineId: 'gemini', status: 503 }).retryable).toBe(true)
  })

  it('400류는 즉시 포기한다', () => {
    const e = new EngineError('bad request', { engineId: 'naver', status: 400 })
    expect(e.retryable).toBe(false)
    expect(e.backoffHint).toBe('none')
  })

  it('네트워크 에러(status 없음)는 재시도 가능하다', () => {
    expect(new EngineError('ECONNRESET', { engineId: 'chatgpt' }).retryable).toBe(true)
  })

  it('isRetryable은 EngineError가 아닌 에러도 판정한다', () => {
    expect(isRetryable(new Error('unknown'))).toBe(true)
    expect(isRetryable(new EngineError('x', { engineId: 'naver', status: 401 }))).toBe(false)
  })
})

describe('estimateCostKrw', () => {
  it('SERP 엔진은 호출 건당 정액', () => {
    const cost = estimateCostKrw('naver', { calls: 1 })
    expect(cost).toBeGreaterThan(0)
    expect(estimateCostKrw('naver', { calls: 4 })).toBeCloseTo(cost * 4, 6)
  })

  it('LLM 엔진은 토큰에 비례한다', () => {
    const small = estimateCostKrw('chatgpt', { calls: 1, tokensIn: 100, tokensOut: 100 })
    const big = estimateCostKrw('chatgpt', { calls: 1, tokensIn: 1000, tokensOut: 1000 })
    expect(big).toBeGreaterThan(small)
  })

  it('토큰 정보가 없으면 0이 아니라 호출 기본 비용을 낸다', () => {
    expect(estimateCostKrw('gemini', { calls: 1 })).toBeGreaterThan(0)
  })

  it('원 단위 정수를 돌려준다 (소수점 금액 금지)', () => {
    expect(Number.isInteger(estimateCostKrw('chatgpt', { calls: 3, tokensIn: 1234, tokensOut: 567 })))
      .toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/engines/types.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 타입과 에러 구현**

`src/lib/engines/types.ts`:

```ts
import type { EngineId, EngineTier } from '@/lib/plans'

export interface Citation {
  url: string
  title: string
}

export interface EngineUsage {
  /** API 호출 횟수 (보통 1) */
  calls: number
  tokensIn?: number
  tokensOut?: number
  /** SerpApi 응답 헤더가 알려주는 잔여 건수 */
  quotaRemaining?: number
}

export interface EngineAnswer {
  text: string
  citations: Citation[]
  /** 원본 응답. 절대 버리지 않는다 — 판정 로직 개선 후 재판정에 쓴다. */
  raw: unknown
  usage: EngineUsage
}

export interface RunOptions {
  /**
   * SERP 2샘플을 시간대로 나누기 위한 힌트.
   * SerpApi는 결과를 1시간 캐시하고 캐시 조회는 무료다. 두 샘플을 연속으로
   * 호출하면 같은 캐시가 두 번 나와 샘플 2회의 의미가 사라진다.
   */
  sampleIndex: number
  /** 취소 신호 (Trigger.dev의 타임아웃 등) */
  signal?: AbortSignal
}

export interface Engine {
  id: EngineId
  /** 샘플 수 차등의 근거 */
  tier: EngineTier
  /** 이 엔진이 쓸 수 있는 상태인가 (API 키가 있는가) */
  isConfigured(): boolean
  run(query: string, opts: RunOptions): Promise<EngineAnswer>
}

export type BackoffHint = 'none' | 'normal' | 'long'

export class EngineError extends Error {
  readonly engineId: EngineId
  readonly status: number | undefined
  readonly retryable: boolean
  readonly backoffHint: BackoffHint

  constructor(
    message: string,
    params: { engineId: EngineId; status?: number; cause?: unknown },
  ) {
    super(message, { cause: params.cause })
    this.name = 'EngineError'
    this.engineId = params.engineId
    this.status = params.status

    const status = params.status
    if (status === undefined) {
      // 네트워크 계층 실패 — 재시도할 가치가 있다.
      this.retryable = true
      this.backoffHint = 'normal'
    } else if (status === 429) {
      this.retryable = true
      this.backoffHint = 'long'
    } else if (status >= 500) {
      this.retryable = true
      this.backoffHint = 'normal'
    } else {
      // 400류: 요청 자체가 잘못됐다. 재시도해도 같은 결과다.
      this.retryable = false
      this.backoffHint = 'none'
    }
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof EngineError) return error.retryable
  // 정체를 모르는 에러는 일단 재시도한다. 수집 데이터를 잃는 것이 더 비싸다.
  return true
}
```

`src/lib/engines/pricing.ts`:

```ts
import type { EngineId } from '@/lib/plans'

/** 환율. 원가 계산 기준 (설계 문서) */
export const USD_TO_KRW = 1400

/**
 * 엔진별 단가.
 *
 * `// 추정` 주석이 붙은 값은 실측 전이다. 실측 후 주석을 지운다.
 * 설계 문서: "이 설계 과정에서 원가 계산이 두 번 틀렸다. 계산은 틀리고 실측만 맞는다."
 */
export const PRICING: Record<
  EngineId,
  { perCallUsd: number; perMTokenInUsd: number; perMTokenOutUsd: number }
> = {
  // OpenAI 웹검색 툴 단가는 확정하지 못했다 — 2단계 Task 4 스모크 테스트에서 실측한다.
  chatgpt: { perCallUsd: 0.01, perMTokenInUsd: 2.5, perMTokenOutUsd: 10 }, // 추정
  gemini: { perCallUsd: 0.005, perMTokenInUsd: 0.3, perMTokenOutUsd: 2.5 }, // 추정
  // SerpApi Starter $25 / 1,000건 = 건당 $0.025
  naver: { perCallUsd: 0.025, perMTokenInUsd: 0, perMTokenOutUsd: 0 },
  google_aio: { perCallUsd: 0.025, perMTokenInUsd: 0, perMTokenOutUsd: 0 },
}

/** Claude Haiku 4.5 판정기 단가 ($1 / $5 per MTok) */
export const JUDGE_PRICING = { perMTokenInUsd: 1, perMTokenOutUsd: 5 }

export interface CostUsage {
  calls: number
  tokensIn?: number
  tokensOut?: number
}

/** 원(KRW) 정수. 부동소수점 금액을 그대로 흘리지 않는다. */
export function estimateCostKrw(engineId: EngineId, usage: CostUsage): number {
  const p = PRICING[engineId]
  const usd =
    usage.calls * p.perCallUsd +
    ((usage.tokensIn ?? 0) / 1_000_000) * p.perMTokenInUsd +
    ((usage.tokensOut ?? 0) / 1_000_000) * p.perMTokenOutUsd
  return Math.round(usd * USD_TO_KRW)
}

export function estimateJudgeCostKrw(tokensIn: number, tokensOut: number): number {
  const usd =
    (tokensIn / 1_000_000) * JUDGE_PRICING.perMTokenInUsd +
    (tokensOut / 1_000_000) * JUDGE_PRICING.perMTokenOutUsd
  return Math.round(usd * USD_TO_KRW)
}
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/engines/types.test.ts
```

Expected: PASS (9 passed)

- [ ] **Step 5: 픽스처 수집 스크립트**

이 스크립트는 다음 세 태스크에서 계속 쓴다. 실제 API를 한 번 호출하고 원본
JSON을 파일로 저장한다. **엔진 파서를 추측으로 쓰지 않기 위한 도구다.**

`scripts/probe-engine.ts`:

```ts
/**
 * 실제 엔진 API를 1회 호출하고 원본 응답을 픽스처로 저장한다.
 *
 *   pnpm probe:engine chatgpt "30대 남자 러닝화 추천해줘"
 *
 * 저장 위치: tests/fixtures/engines/<engineId>-<slug>.json
 * 이 파일이 엔진 계약 테스트의 입력이 된다. 실제 API를 부르는 테스트를
 * CI에 두지 않기 위해서다.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { getEngine } from '@/lib/engines'

const [engineId, query] = process.argv.slice(2)

if (!engineId || !query) {
  console.error('사용법: pnpm probe:engine <engineId> "<질의>"')
  process.exit(1)
}

const engine = getEngine(engineId)
if (!engine.isConfigured()) {
  console.error(`${engineId}: API 키가 설정되지 않았습니다. .env.local을 확인하세요.`)
  process.exit(1)
}

const started = Date.now()
const answer = await engine.run(query, { sampleIndex: 0 })
const elapsed = Date.now() - started

const slug = query.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)
const path = `tests/fixtures/engines/${engineId}-${slug}.json`

await mkdir('tests/fixtures/engines', { recursive: true })
await writeFile(
  path,
  JSON.stringify(
    { engineId, query, capturedAt: new Date().toISOString(), elapsedMs: elapsed, raw: answer.raw },
    null,
    2,
  ),
)

console.log(`저장: ${path}`)
console.log(`소요: ${elapsed}ms`)
console.log(`사용량: ${JSON.stringify(answer.usage)}`)
console.log(`인용 ${answer.citations.length}건`)
console.log('--- 응답 텍스트 (앞 500자) ---')
console.log(answer.text.slice(0, 500))
```

`package.json`의 `scripts`에 추가:

```json
{
  "probe:engine": "node --env-file=.env.local --experimental-strip-types scripts/probe-engine.ts"
}
```

Node 22의 `--experimental-strip-types`가 동작하지 않으면 `tsx`를 쓴다:
`pnpm add -D tsx` 후 `"probe:engine": "tsx --env-file=.env.local scripts/probe-engine.ts"`.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/engines scripts/probe-engine.ts package.json tests/fixtures/engines/.gitkeep
git commit -m "feat(engines): Engine 인터페이스 · 에러 분류 · 원가 추정 · 픽스처 수집 도구"
```

---

### Task 4: ChatGPT 엔진

**Files:**
- Create: `src/lib/engines/chatgpt.ts`, `src/lib/engines/index.ts`
- Test: `src/lib/engines/chatgpt.test.ts`, `src/lib/engines/chatgpt.smoke.test.ts`
- Create: `tests/fixtures/engines/chatgpt-sample.json` (Step 4에서 실제로 생성)

**Interfaces:**
- Consumes: `Engine`, `EngineAnswer`, `EngineError` (Task 3), `env` (1단계)
- Produces:
  - `chatgptEngine: Engine`
  - `parseChatgptResponse(raw: unknown): { text: string; citations: Citation[] }`
    — 순수 파서. 계약 테스트가 이것을 직접 호출한다
  - `getEngine(id: string): Engine` — 레지스트리

- [ ] **Step 1: SDK 설치와 실제 API 형태 확인**

```bash
pnpm add openai
```

`.env.local`에 `OPENAI_API_KEY`를 넣고, 웹검색 툴이 붙은 응답의 실제 형태를
직접 확인한다. **문서 기억이 아니라 실제 출력을 근거로 파서를 쓴다.**

```bash
cat > /tmp/probe-openai.mjs <<'EOF'
import OpenAI from 'openai'
const client = new OpenAI()
const r = await client.responses.create({
  model: process.env.OPENAI_MODEL ?? 'gpt-5',
  tools: [{ type: 'web_search' }],
  input: '30대 남자 러닝화 추천해줘',
})
console.log(JSON.stringify(r, null, 2))
EOF
node --env-file=.env.local /tmp/probe-openai.mjs > /tmp/openai-raw.json
head -100 /tmp/openai-raw.json
```

출력에서 확인할 것:
- 최종 텍스트가 `output_text`인지, `output[].content[].text`인지
- 인용이 `annotations`에 `url_citation` 타입으로 오는지, 필드명이 `url`/`title`인지
- 토큰 사용량 필드명 (`usage.input_tokens` / `usage.output_tokens`)
- 모델 ID가 유효한지 (404가 나면 `client.models.list()`로 실제 목록 확인)

아래 구현은 위 형태를 가정한다. 실제와 다르면 **실제 출력에 맞춰 파서를 고친다.**

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`src/lib/engines/chatgpt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseChatgptResponse } from '@/lib/engines/chatgpt'

/** Step 1에서 확인한 실제 응답 형태를 최소화한 것 */
const rawWithCitations = {
  output: [
    { type: 'web_search_call', id: 'ws_1', status: 'completed' },
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '30대 남성 러닝화로는 나이키 페가수스와 아식스 젤카야노를 추천합니다.',
          annotations: [
            { type: 'url_citation', url: 'https://a.example/1', title: '러닝화 리뷰' },
            { type: 'url_citation', url: 'https://b.example/2', title: '2026 추천' },
          ],
        },
      ],
    },
  ],
  usage: { input_tokens: 1200, output_tokens: 340 },
}

describe('parseChatgptResponse', () => {
  it('최종 텍스트를 뽑아낸다', () => {
    const parsed = parseChatgptResponse(rawWithCitations)
    expect(parsed.text).toContain('나이키 페가수스')
  })

  it('인용을 url/title로 정규화한다', () => {
    const parsed = parseChatgptResponse(rawWithCitations)
    expect(parsed.citations).toHaveLength(2)
    expect(parsed.citations[0]).toEqual({
      url: 'https://a.example/1',
      title: '러닝화 리뷰',
    })
  })

  it('중복 URL을 제거한다', () => {
    const dup = structuredClone(rawWithCitations)
    dup.output[1].content[0].annotations.push({
      type: 'url_citation',
      url: 'https://a.example/1',
      title: '다른 제목',
    })
    expect(parseChatgptResponse(dup).citations).toHaveLength(2)
  })

  it('텍스트 블록이 여러 개면 이어붙인다', () => {
    const multi = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '앞부분.', annotations: [] },
            { type: 'output_text', text: ' 뒷부분.', annotations: [] },
          ],
        },
      ],
    }
    expect(parseChatgptResponse(multi).text).toBe('앞부분. 뒷부분.')
  })

  it('인용이 없어도 던지지 않는다', () => {
    const noCite = { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '답변', annotations: [] }] }] }
    expect(parseChatgptResponse(noCite).citations).toEqual([])
  })

  it('예상치 못한 형태면 빈 텍스트를 돌려주고 던지지 않는다', () => {
    // 원본은 raw에 살아 있으므로 재파싱이 가능하다. 여기서 던지면 수집이 죽는다.
    const parsed = parseChatgptResponse({ unexpected: true })
    expect(parsed.text).toBe('')
    expect(parsed.citations).toEqual([])
  })

  it('null/undefined를 받아도 던지지 않는다', () => {
    expect(parseChatgptResponse(null).text).toBe('')
    expect(parseChatgptResponse(undefined).text).toBe('')
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/engines/chatgpt.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

`src/lib/engines/chatgpt.ts`:

```ts
import OpenAI from 'openai'
import { env } from '@/lib/env'
import type { Citation, Engine, EngineAnswer, RunOptions } from './types'
import { EngineError } from './types'

/**
 * 모델 ID는 상수로 둔다. 바꿀 때는 골드 라벨 회귀 검증을 먼저 통과해야 한다
 * (판정기 모델과 달리 수집 모델은 답변 자체를 바꾸므로 시계열이 끊긴다).
 */
export const CHATGPT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5'

/** 소비자가 실제로 묻는 방식에 가깝게. 마케팅 문구를 유도하지 않는다. */
const SYSTEM_PROMPT =
  '너는 일반 소비자의 질문에 답하는 어시스턴트다. 한국어로, 구체적인 브랜드나 제품명을 들어 간결하게 답하라.'

interface ParsedResponse {
  text: string
  citations: Citation[]
}

/**
 * 순수 파서. 실제 API를 부르지 않으므로 픽스처로 계약 테스트가 가능하다.
 * 어떤 입력을 받아도 던지지 않는다 — 파싱 실패는 원본(raw)이 살아 있으므로
 * 나중에 복구 가능한 문제지만, 여기서 던지면 수집 전체가 죽는다.
 */
export function parseChatgptResponse(raw: unknown): ParsedResponse {
  const texts: string[] = []
  const seen = new Set<string>()
  const citations: Citation[] = []

  const output = (raw as { output?: unknown })?.output
  if (!Array.isArray(output)) return { text: '', citations: [] }

  for (const item of output) {
    if (!isRecord(item) || item.type !== 'message') continue
    const content = item.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (!isRecord(block)) continue
      if (typeof block.text === 'string') texts.push(block.text)

      const annotations = block.annotations
      if (!Array.isArray(annotations)) continue
      for (const a of annotations) {
        if (!isRecord(a)) continue
        const url = typeof a.url === 'string' ? a.url : null
        if (!url || seen.has(url)) continue
        seen.add(url)
        citations.push({ url, title: typeof a.title === 'string' ? a.title : url })
      }
    }
  }

  return { text: texts.join(''), citations }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw new EngineError('OPENAI_API_KEY가 없습니다', { engineId: 'chatgpt', status: 401 })
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  }
  return client
}

export const chatgptEngine: Engine = {
  id: 'chatgpt',
  tier: 'llm',

  isConfigured() {
    return Boolean(env.OPENAI_API_KEY)
  },

  async run(query: string, opts: RunOptions): Promise<EngineAnswer> {
    let raw: unknown
    try {
      raw = await getClient().responses.create(
        {
          model: CHATGPT_MODEL,
          instructions: SYSTEM_PROMPT,
          tools: [{ type: 'web_search' }],
          input: query,
        },
        { signal: opts.signal },
      )
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : undefined
      throw new EngineError(`ChatGPT 호출 실패: ${describeError(error)}`, {
        engineId: 'chatgpt',
        status: Number.isFinite(status) ? status : undefined,
        cause: error,
      })
    }

    const parsed = parseChatgptResponse(raw)
    const usage = (raw as { usage?: { input_tokens?: number; output_tokens?: number } }).usage

    return {
      text: parsed.text,
      citations: parsed.citations,
      raw,
      usage: {
        calls: 1,
        tokensIn: usage?.input_tokens ?? 0,
        tokensOut: usage?.output_tokens ?? 0,
      },
    }
  },
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
```

`src/lib/engines/index.ts` — 지금은 ChatGPT만. Task 5·6에서 채운다.

```ts
import type { EngineId } from '@/lib/plans'
import { chatgptEngine } from './chatgpt'
import type { Engine } from './types'

const REGISTRY: Partial<Record<EngineId, Engine>> = {
  chatgpt: chatgptEngine,
}

export function getEngine(id: string): Engine {
  const engine = REGISTRY[id as EngineId]
  if (!engine) throw new Error(`알 수 없는 엔진: ${id}`)
  return engine
}

export function allEngines(): Engine[] {
  return Object.values(REGISTRY).filter((e): e is Engine => Boolean(e))
}

export * from './types'
```

- [ ] **Step 5: 계약 테스트 통과 확인**

```bash
pnpm vitest run src/lib/engines/chatgpt.test.ts
```

Expected: PASS (7 passed). 실패하면 Step 1의 실제 출력과 대조해 파서를 고친다.

- [ ] **Step 6: 실제 픽스처 수집과 단가 실측**

```bash
pnpm probe:engine chatgpt "30대 남자 러닝화 추천해줘"
pnpm probe:engine chatgpt "가성비 좋은 무선 이어폰 뭐가 있어?"
pnpm probe:engine chatgpt "발볼 넓은 사람 운동화 추천"
```

각 실행의 `사용량` 출력을 기록한다. OpenAI 대시보드에서 **이 3회 호출의 실제
청구액**을 확인하고, `src/lib/engines/pricing.ts`의 `chatgpt.perCallUsd`를
실측값으로 갱신한 뒤 `// 추정` 주석을 지운다. 이것이 설계 문서가 "확정하지
못했다"고 남긴 항목이다.

- [ ] **Step 7: 스모크 테스트 작성**

`src/lib/engines/chatgpt.smoke.test.ts` — CI에서 돌지 않는다. 주 1회 수동/크론으로
돌려 스키마 변경과 인증 만료를 조기에 발견한다.

```ts
import { describe, expect, it } from 'vitest'
import { chatgptEngine } from '@/lib/engines/chatgpt'

describe.skipIf(!process.env.OPENAI_API_KEY)('chatgpt 스모크', () => {
  it('실제 API가 텍스트와 사용량을 돌려준다', async () => {
    const answer = await chatgptEngine.run('30대 남자 러닝화 추천해줘', { sampleIndex: 0 })
    expect(answer.text.length).toBeGreaterThan(20)
    expect(answer.usage.calls).toBe(1)
    expect(answer.usage.tokensIn).toBeGreaterThan(0)
    expect(answer.raw).toBeTruthy()
  }, 60_000)
})
```

```bash
pnpm test:smoke
```

Expected: PASS (실제 API 호출 1회)

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(engines): ChatGPT 어댑터 · 픽스처 계약 테스트 · 단가 실측 반영"
```

---

### Task 5: Gemini 엔진

**Files:**
- Create: `src/lib/engines/gemini.ts`
- Test: `src/lib/engines/gemini.test.ts`, `src/lib/engines/gemini.smoke.test.ts`
- Modify: `src/lib/engines/index.ts`

**Interfaces:**
- Consumes: Task 3의 타입
- Produces: `geminiEngine: Engine`, `parseGeminiResponse(raw): { text; citations }`

- [ ] **Step 1: SDK 설치와 실제 응답 확인**

```bash
pnpm add @google/genai
```

```bash
cat > /tmp/probe-gemini.mjs <<'EOF'
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const r = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  contents: '30대 남자 러닝화 추천해줘',
  config: { tools: [{ googleSearch: {} }] },
})
console.log(JSON.stringify(r, null, 2))
EOF
node --env-file=.env.local /tmp/probe-gemini.mjs > /tmp/gemini-raw.json
head -120 /tmp/gemini-raw.json
```

확인할 것: 텍스트가 `candidates[0].content.parts[].text`인지,
그라운딩 근거가 `candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}`인지,
토큰 사용량이 `usageMetadata.promptTokenCount` / `candidatesTokenCount`인지.

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`src/lib/engines/gemini.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseGeminiResponse } from '@/lib/engines/gemini'

const raw = {
  candidates: [
    {
      content: {
        parts: [{ text: '나이키 페가수스와 뉴발란스 880을 추천합니다.' }],
        role: 'model',
      },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: 'https://c.example/1', title: '러닝화 가이드' } },
          { web: { uri: 'https://d.example/2', title: '리뷰 모음' } },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 210 },
}

describe('parseGeminiResponse', () => {
  it('텍스트를 뽑아낸다', () => {
    expect(parseGeminiResponse(raw).text).toContain('뉴발란스 880')
  })

  it('groundingChunks를 인용으로 정규화한다', () => {
    const parsed = parseGeminiResponse(raw)
    expect(parsed.citations).toHaveLength(2)
    expect(parsed.citations[0]).toEqual({
      url: 'https://c.example/1',
      title: '러닝화 가이드',
    })
  })

  it('parts가 여러 개면 이어붙인다', () => {
    const multi = structuredClone(raw)
    multi.candidates[0].content.parts = [{ text: 'A' }, { text: 'B' }]
    expect(parseGeminiResponse(multi).text).toBe('AB')
  })

  it('그라운딩 정보가 없어도 던지지 않는다', () => {
    const noGround = structuredClone(raw)
    delete (noGround.candidates[0] as Record<string, unknown>).groundingMetadata
    expect(parseGeminiResponse(noGround).citations).toEqual([])
  })

  it('title이 없으면 URL로 대체한다', () => {
    const noTitle = structuredClone(raw)
    noTitle.candidates[0].groundingMetadata.groundingChunks = [
      { web: { uri: 'https://e.example/3' } },
    ]
    expect(parseGeminiResponse(noTitle).citations[0]).toEqual({
      url: 'https://e.example/3',
      title: 'https://e.example/3',
    })
  })

  it('예상치 못한 형태면 빈 결과를 돌려주고 던지지 않는다', () => {
    expect(parseGeminiResponse({ nope: 1 })).toEqual({ text: '', citations: [] })
    expect(parseGeminiResponse(null)).toEqual({ text: '', citations: [] })
  })
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/engines/gemini.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

`src/lib/engines/gemini.ts`:

```ts
import { GoogleGenAI } from '@google/genai'
import { env } from '@/lib/env'
import type { Citation, Engine, EngineAnswer, RunOptions } from './types'
import { EngineError } from './types'

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

const SYSTEM_PROMPT =
  '너는 일반 소비자의 질문에 답하는 어시스턴트다. 한국어로, 구체적인 브랜드나 제품명을 들어 간결하게 답하라.'

export function parseGeminiResponse(raw: unknown): { text: string; citations: Citation[] } {
  const candidates = (raw as { candidates?: unknown })?.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { text: '', citations: [] }
  }
  const first = candidates[0]
  if (!isRecord(first)) return { text: '', citations: [] }

  // 텍스트
  let text = ''
  const content = first.content
  if (isRecord(content) && Array.isArray(content.parts)) {
    for (const part of content.parts) {
      if (isRecord(part) && typeof part.text === 'string') text += part.text
    }
  }

  // 인용
  const citations: Citation[] = []
  const seen = new Set<string>()
  const grounding = first.groundingMetadata
  if (isRecord(grounding) && Array.isArray(grounding.groundingChunks)) {
    for (const chunk of grounding.groundingChunks) {
      if (!isRecord(chunk) || !isRecord(chunk.web)) continue
      const url = typeof chunk.web.uri === 'string' ? chunk.web.uri : null
      if (!url || seen.has(url)) continue
      seen.add(url)
      citations.push({
        url,
        title: typeof chunk.web.title === 'string' ? chunk.web.title : url,
      })
    }
  }

  return { text, citations }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

let client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!client) {
    if (!env.GEMINI_API_KEY) {
      throw new EngineError('GEMINI_API_KEY가 없습니다', { engineId: 'gemini', status: 401 })
    }
    client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  }
  return client
}

export const geminiEngine: Engine = {
  id: 'gemini',
  tier: 'llm',

  isConfigured() {
    return Boolean(env.GEMINI_API_KEY)
  },

  async run(query: string, opts: RunOptions): Promise<EngineAnswer> {
    let raw: unknown
    try {
      raw = await getClient().models.generateContent({
        model: GEMINI_MODEL,
        contents: query,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ googleSearch: {} }],
          abortSignal: opts.signal,
        },
      })
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : undefined
      throw new EngineError(
        `Gemini 호출 실패: ${error instanceof Error ? error.message : String(error)}`,
        { engineId: 'gemini', status: Number.isFinite(status) ? status : undefined, cause: error },
      )
    }

    const parsed = parseGeminiResponse(raw)
    const usage = (raw as {
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }).usageMetadata

    return {
      text: parsed.text,
      citations: parsed.citations,
      raw,
      usage: {
        calls: 1,
        tokensIn: usage?.promptTokenCount ?? 0,
        tokensOut: usage?.candidatesTokenCount ?? 0,
      },
    }
  },
}
```

`src/lib/engines/index.ts`의 `REGISTRY`에 추가:

```ts
import { geminiEngine } from './gemini'

const REGISTRY: Partial<Record<EngineId, Engine>> = {
  chatgpt: chatgptEngine,
  gemini: geminiEngine,
}
```

- [ ] **Step 5: 통과 확인과 픽스처 수집**

```bash
pnpm vitest run src/lib/engines/gemini.test.ts
pnpm probe:engine gemini "30대 남자 러닝화 추천해줘"
pnpm probe:engine gemini "가성비 좋은 무선 이어폰 뭐가 있어?"
```

Expected: 테스트 6 passed, 픽스처 2개 생성. Gemini 대시보드에서 실제 청구액을
확인해 `pricing.ts`의 `gemini` 단가를 갱신하고 `// 추정` 주석을 지운다.

- [ ] **Step 6: 스모크 테스트**

`src/lib/engines/gemini.smoke.test.ts` — ChatGPT 스모크와 같은 구조.

```bash
pnpm test:smoke
```

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(engines): Gemini 어댑터 (googleSearch 그라운딩)"
```

---

### Task 6: SerpApi 기반 네이버·Google AIO 엔진

**Files:**
- Create: `src/lib/engines/serpapi.ts`, `src/lib/engines/naver.ts`,
  `src/lib/engines/google-aio.ts`
- Test: `src/lib/engines/naver.test.ts`, `src/lib/engines/google-aio.test.ts`,
  `src/lib/engines/serpapi.smoke.test.ts`
- Modify: `src/lib/engines/index.ts`
- Create: `docs/superpowers/notes/2026-07-28-naver-coverage.md`

**Interfaces:**
- Consumes: Task 3의 타입
- Produces:
  - `serpapiFetch(params): Promise<{ raw: unknown; quotaRemaining?: number }>`
  - `naverEngine: Engine`, `parseNaverBriefing(raw): NaverParseResult`
  - `googleAioEngine: Engine`, `parseGoogleAio(raw): { text; citations }`
  - `type NaverParseResult = { present: boolean; text: string; citations: Citation[] }`
    — `present: false`는 "브리핑 미노출"이며, 이것을 "언급 안 됨"과 구분한다

**이 태스크는 설계 문서의 미확정 항목을 해소한다.** "네이버 AI 브리핑이 아예
노출되지 않는 경우가 있다. 미노출을 '언급 안 됨'으로 볼지 '측정 불가'로 볼지
실제 응답을 보고 정해야 한다." — Step 6에서 실제 응답 20건을 보고 결정하고
기록한다.

- [ ] **Step 1: SerpApi 실제 응답 형태 확인**

SerpApi 계정을 만들고(1차 배포에는 불필요하지만 이 태스크에는 필요하다)
`.env.local`에 `SERPAPI_API_KEY`를 넣는다. 그 다음 **실제 응답을 본다.**

```bash
KEY=$(grep '^SERPAPI_API_KEY=' .env.local | cut -d= -f2)

# 네이버
curl -s "https://serpapi.com/search.json?engine=naver&query=30대+남자+러닝화+추천&api_key=$KEY" \
  > /tmp/serpapi-naver.json
python3 -c "import json;d=json.load(open('/tmp/serpapi-naver.json'));print(list(d.keys()))"

# Google AI Overviews (한국어·한국 지역)
curl -s "https://serpapi.com/search.json?engine=google&q=30대+남자+러닝화+추천&gl=kr&hl=ko&api_key=$KEY" \
  > /tmp/serpapi-google.json
python3 -c "import json;d=json.load(open('/tmp/serpapi-google.json'));print(list(d.keys()))"
```

확인할 것:
- 네이버 AI 브리핑이 어느 키에 오는가 (`ai_overview`? `ai_briefing`?)
- 그 안의 구조 — `text_blocks` / `references` / `markdown` 중 무엇이 실제로 오는가
- 브리핑이 없을 때 그 키가 아예 없는지, 아니면 빈 객체인지
- Google AIO가 `ai_overview.page_token`으로 2차 호출을 요구하는 경우가 있는지
- 응답 헤더나 본문 어디에 잔여 쿼터가 오는지
  (`curl -D - -o /dev/null ...`로 헤더 확인)

**아래 구현은 이 확인 결과에 맞춰 필드명을 조정해야 한다.** 추측한 필드명을
그대로 두면 프로덕션에서 조용히 빈 텍스트를 만든다.

- [ ] **Step 2: 실패하는 계약 테스트 작성**

`src/lib/engines/naver.test.ts` — Step 1에서 본 실제 형태를 최소화해 쓴다.

```ts
import { describe, expect, it } from 'vitest'
import { parseNaverBriefing } from '@/lib/engines/naver'

const withBriefing = {
  search_metadata: { status: 'Success' },
  ai_overview: {
    text_blocks: [
      { type: 'paragraph', snippet: '30대 남성에게는 나이키 페가수스가 인기입니다.' },
      {
        type: 'list',
        list: [{ snippet: '아식스 젤카야노' }, { snippet: '뉴발란스 880' }],
      },
    ],
    references: [
      { link: 'https://blog.naver.com/x', title: '러닝화 후기' },
      { link: 'https://cafe.naver.com/y', title: '러닝 카페' },
    ],
  },
}

const withoutBriefing = {
  search_metadata: { status: 'Success' },
  organic_results: [{ title: '아무거나', link: 'https://z.example' }],
}

describe('parseNaverBriefing', () => {
  it('브리핑이 있으면 present=true와 텍스트를 돌려준다', () => {
    const r = parseNaverBriefing(withBriefing)
    expect(r.present).toBe(true)
    expect(r.text).toContain('나이키 페가수스')
  })

  it('list 블록의 항목도 텍스트에 포함한다', () => {
    const r = parseNaverBriefing(withBriefing)
    expect(r.text).toContain('아식스 젤카야노')
    expect(r.text).toContain('뉴발란스 880')
  })

  it('references를 인용으로 정규화한다', () => {
    const r = parseNaverBriefing(withBriefing)
    expect(r.citations).toHaveLength(2)
    expect(r.citations[0]).toEqual({
      url: 'https://blog.naver.com/x',
      title: '러닝화 후기',
    })
  })

  it('브리핑이 없으면 present=false — 이것은 "언급 안 됨"과 다르다', () => {
    const r = parseNaverBriefing(withoutBriefing)
    expect(r.present).toBe(false)
    expect(r.text).toBe('')
  })

  it('markdown 필드만 있는 응답도 처리한다', () => {
    const md = { ai_overview: { markdown: '## 추천\n- 나이키 페가수스' } }
    const r = parseNaverBriefing(md)
    expect(r.present).toBe(true)
    expect(r.text).toContain('나이키 페가수스')
  })

  it('예상치 못한 형태면 present=false로 떨어지고 던지지 않는다', () => {
    expect(parseNaverBriefing(null).present).toBe(false)
    expect(parseNaverBriefing({ garbage: 1 }).present).toBe(false)
  })
})
```

`src/lib/engines/google-aio.test.ts` — 같은 구조로, `ai_overview.text_blocks`와
`references`를 검증한다. 추가로:

```ts
it('page_token만 있고 본문이 없으면 present=false로 본다', () => {
  const tokenOnly = { ai_overview: { page_token: 'abc123' } }
  expect(parseGoogleAio(tokenOnly).present).toBe(false)
})
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm vitest run src/lib/engines/naver.test.ts src/lib/engines/google-aio.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 4: SerpApi 공통 클라이언트 구현**

`src/lib/engines/serpapi.ts`:

```ts
import { env } from '@/lib/env'
import type { EngineId } from '@/lib/plans'
import { EngineError } from './types'

const BASE_URL = 'https://serpapi.com/search.json'

export interface SerpApiResult {
  raw: unknown
  /** 응답이 알려주는 잔여 건수. 없으면 undefined */
  quotaRemaining: number | undefined
}

/**
 * SerpApi 호출.
 *
 * 리스크를 아웃소싱한다는 것이 이 경로의 핵심이다. 차단 대응은 SerpApi의
 * 사업이지 우리 사업이 아니다. 네이버가 막혀도 이 파일 하나를 교체하면
 * 다른 공급자로 옮길 수 있다.
 */
export async function serpapiFetch(
  engineId: EngineId,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<SerpApiResult> {
  if (!env.SERPAPI_API_KEY) {
    throw new EngineError('SERPAPI_API_KEY가 없습니다', { engineId, status: 401 })
  }

  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('api_key', env.SERPAPI_API_KEY)
  // 캐시를 끄지 않는다 — SerpApi 캐시 조회는 무료다.
  // 대신 2샘플을 오전·오후로 나눠 호출해 진짜 2샘플이 되게 한다 (호출자 책임).

  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    throw new EngineError(
      `SerpApi 연결 실패: ${error instanceof Error ? error.message : String(error)}`,
      { engineId, cause: error },
    )
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new EngineError(`SerpApi ${response.status}: ${body.slice(0, 200)}`, {
      engineId,
      status: response.status,
    })
  }

  const raw: unknown = await response.json()

  // search_metadata.status가 Error면 HTTP 200이어도 실패다.
  const status = (raw as { search_metadata?: { status?: string } })?.search_metadata?.status
  if (status === 'Error') {
    const message =
      (raw as { error?: string }).error ?? 'SerpApi가 Error 상태를 반환했습니다'
    throw new EngineError(message, { engineId, status: 502 })
  }

  return { raw, quotaRemaining: readQuota(response, raw) }
}

/**
 * 잔여 건수 파싱. SerpApi가 헤더로 주는지 본문으로 주는지는 Step 1에서
 * 확인한 실제 응답에 맞춘다. 둘 다 없으면 undefined — 6단계의 쿼터 추적기가
 * 자체 카운터로 대체한다.
 */
function readQuota(response: Response, raw: unknown): number | undefined {
  const header = response.headers.get('x-ratelimit-remaining')
  if (header !== null) {
    const n = Number(header)
    if (Number.isFinite(n)) return n
  }
  const inBody = (raw as { search_metadata?: { total_time_taken?: number } })?.search_metadata
  void inBody // Step 1에서 실제 필드를 확인해 여기에 반영한다
  return undefined
}

/** SERP 응답의 text_blocks / references를 공통 형태로 평탄화한다. */
export function flattenTextBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const b of blocks) {
    if (typeof b !== 'object' || b === null) continue
    const rec = b as Record<string, unknown>
    if (typeof rec.snippet === 'string') parts.push(rec.snippet)
    if (Array.isArray(rec.list)) {
      for (const item of rec.list) {
        if (typeof item === 'object' && item !== null) {
          const s = (item as Record<string, unknown>).snippet
          if (typeof s === 'string') parts.push(s)
        }
      }
    }
    // 중첩 블록
    if (Array.isArray(rec.text_blocks)) parts.push(flattenTextBlocks(rec.text_blocks))
  }
  return parts.filter(Boolean).join('\n')
}

export function parseReferences(refs: unknown): { url: string; title: string }[] {
  if (!Array.isArray(refs)) return []
  const out: { url: string; title: string }[] = []
  const seen = new Set<string>()
  for (const r of refs) {
    if (typeof r !== 'object' || r === null) continue
    const rec = r as Record<string, unknown>
    const url = typeof rec.link === 'string' ? rec.link : null
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, title: typeof rec.title === 'string' ? rec.title : url })
  }
  return out
}
```

- [ ] **Step 5: 네이버·Google AIO 엔진 구현**

`src/lib/engines/naver.ts`:

```ts
import { env } from '@/lib/env'
import { flattenTextBlocks, parseReferences, serpapiFetch } from './serpapi'
import type { Citation, Engine, EngineAnswer, RunOptions } from './types'

export interface BriefingParseResult {
  /** AI 브리핑이 노출되었는가. false는 "언급 안 됨"이 아니라 "측정 불가"다. */
  present: boolean
  text: string
  citations: Citation[]
}

export function parseNaverBriefing(raw: unknown): BriefingParseResult {
  const empty: BriefingParseResult = { present: false, text: '', citations: [] }
  if (typeof raw !== 'object' || raw === null) return empty

  const overview = (raw as Record<string, unknown>).ai_overview
  if (typeof overview !== 'object' || overview === null) return empty
  const ov = overview as Record<string, unknown>

  let text = flattenTextBlocks(ov.text_blocks)
  if (!text && typeof ov.markdown === 'string') text = ov.markdown
  if (!text) return empty

  return {
    present: true,
    text,
    citations: parseReferences(ov.references),
  }
}

export const naverEngine: Engine = {
  id: 'naver',
  tier: 'serp',

  isConfigured() {
    return Boolean(env.SERPAPI_API_KEY)
  },

  async run(query: string, opts: RunOptions): Promise<EngineAnswer> {
    const { raw, quotaRemaining } = await serpapiFetch(
      'naver',
      { engine: 'naver', query, where: 'nexearch' },
      opts.signal,
    )

    const parsed = parseNaverBriefing(raw)

    return {
      // 브리핑 미노출이면 빈 텍스트. present 정보는 raw에 남아 있고,
      // 3단계 집계가 completeness로 이를 구분한다.
      text: parsed.text,
      citations: parsed.citations,
      raw,
      usage: { calls: 1, quotaRemaining },
    }
  },
}
```

`src/lib/engines/google-aio.ts` — 같은 구조. 차이점:

```ts
export function parseGoogleAio(raw: unknown): BriefingParseResult {
  const empty: BriefingParseResult = { present: false, text: '', citations: [] }
  if (typeof raw !== 'object' || raw === null) return empty

  const ov = (raw as Record<string, unknown>).ai_overview
  if (typeof ov !== 'object' || ov === null) return empty
  const rec = ov as Record<string, unknown>

  // page_token만 있고 본문이 없는 경우가 있다. 2차 호출을 하려면 SerpApi 건수가
  // 한 번 더 들어가므로, 1단계에서는 미노출로 취급하고 raw에 토큰을 남긴다.
  const text = flattenTextBlocks(rec.text_blocks)
  if (!text) return empty

  return { present: true, text, citations: parseReferences(rec.references) }
}

export const googleAioEngine: Engine = {
  id: 'google_aio',
  tier: 'serp',
  isConfigured: () => Boolean(env.SERPAPI_API_KEY),
  async run(query, opts) {
    const { raw, quotaRemaining } = await serpapiFetch(
      'google_aio',
      { engine: 'google', q: query, gl: 'kr', hl: 'ko' },
      opts.signal,
    )
    const parsed = parseGoogleAio(raw)
    return { text: parsed.text, citations: parsed.citations, raw, usage: { calls: 1, quotaRemaining } }
  },
}
```

`src/lib/engines/index.ts`의 `REGISTRY`를 완성한다:

```ts
const REGISTRY: Partial<Record<EngineId, Engine>> = {
  chatgpt: chatgptEngine,
  gemini: geminiEngine,
  naver: naverEngine,
  google_aio: googleAioEngine,
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm vitest run src/lib/engines/
```

Expected: PASS. 네이버 파싱 테스트가 실패하면 Step 1의 실제 응답 키 이름과
대조한다 (`ai_overview`가 아닐 수 있다).

- [ ] **Step 7: 네이버 AI 브리핑 커버리지 실측 — 설계 문서의 미확정 항목 해소**

실제 질의 20건을 돌려 브리핑 노출률을 잰다. 이 결과가 지표 정의에 영향을 준다.

```bash
cat > /tmp/coverage.sh <<'SH'
set -e
KEY=$(grep '^SERPAPI_API_KEY=' .env.local | cut -d= -f2)
QUERIES=(
  "30대 남자 러닝화 추천" "가성비 무선 이어폰" "발볼 넓은 운동화"
  "겨울 패딩 브랜드 추천" "직장인 노트북 추천" "국내 여행 숙소 예약 사이트"
  "다이어트 도시락 브랜드" "홈트 운동기구 추천" "아기 물티슈 추천"
  "전기차 충전기 브랜드" "캠핑 텐트 추천" "여성 러닝화 브랜드"
  "무선 청소기 비교" "선크림 추천" "단백질 보충제 브랜드"
  "커피 원두 정기배송" "반려견 사료 추천" "매트리스 브랜드 비교"
  "실내 자전거 추천" "블루투스 스피커 추천"
)
present=0
for q in "${QUERIES[@]}"; do
  out=$(curl -s "https://serpapi.com/search.json?engine=naver&query=$(printf %s "$q" | jq -sRr @uri)&api_key=$KEY")
  if echo "$out" | jq -e '.ai_overview' > /dev/null 2>&1; then
    present=$((present+1)); echo "O  $q"
  else
    echo "X  $q"
  fi
done
echo "브리핑 노출: $present / 20"
SH
bash /tmp/coverage.sh | tee /tmp/coverage.txt
```

- [ ] **Step 8: 커버리지 결정을 문서화**

`docs/superpowers/notes/2026-07-28-naver-coverage.md`:

```markdown
# 네이버 AI 브리핑 커버리지 실측 (2026-07-28)

## 결과
- 20개 질의 중 브리핑 노출: __/20 (__%)
- 노출된 질의의 공통점:
- 미노출 질의의 공통점:

## 결정: 브리핑 미노출을 어떻게 다룰 것인가

선택지는 둘이다.

**A. "언급 안 됨"으로 센다** — 분모에 포함. 브리핑이 없는 질의도 Cited Rate를
낮춘다. 노출률이 높으면(80%+) 이 쪽이 단순하고 정직하다.

**B. "측정 불가"로 뺀다** — 분모에서 제외하고 completeness에 기록. 노출률이
낮으면(50% 미만) 이 쪽이 맞다. 브리핑이 아예 없는 질의에서 "언급 안 됨"이라고
말하면 고객이 콘텐츠를 만들어도 개선되지 않는다.

**결정: (A 또는 B)**
**근거:**

## 구현에 미치는 영향
- B를 택한 경우: `collection_runs.completeness.naver.attempted`에서
  브리핑 미노출 건을 빼고, 대시보드 배지에 "네이버 브리핑 미노출 N건"을 표시한다.
- A를 택한 경우: 별도 처리 없음. 단, 질의별 상세에서 "이 질의는 네이버
  브리핑이 노출되지 않습니다"를 표시해 고객이 오해하지 않게 한다.
```

실제 숫자를 채우고 결정을 적는다. **결정 없이 다음 태스크로 넘어가지 않는다** —
3단계 집계 잡이 이 결정을 코드로 구현한다.

- [ ] **Step 9: 스모크 테스트와 커밋**

`src/lib/engines/serpapi.smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { googleAioEngine } from '@/lib/engines/google-aio'
import { naverEngine } from '@/lib/engines/naver'

describe.skipIf(!process.env.SERPAPI_API_KEY)('SerpApi 스모크', () => {
  it('네이버 응답이 온다 (브리핑 유무와 무관하게 raw가 채워진다)', async () => {
    const a = await naverEngine.run('30대 남자 러닝화 추천', { sampleIndex: 0 })
    expect(a.raw).toBeTruthy()
    expect(a.usage.calls).toBe(1)
  }, 60_000)

  it('Google AIO 응답이 온다', async () => {
    const a = await googleAioEngine.run('30대 남자 러닝화 추천', { sampleIndex: 0 })
    expect(a.raw).toBeTruthy()
  }, 60_000)
})
```

```bash
pnpm test:smoke
pnpm probe:engine naver "30대 남자 러닝화 추천해줘"
pnpm probe:engine google_aio "30대 남자 러닝화 추천해줘"
git add -A
git commit -m "feat(engines): SerpApi 네이버·Google AIO 어댑터 · 브리핑 커버리지 실측"
```

---

### Task 7: 1차 판정 — 별칭 매칭

**Files:**
- Create: `src/lib/detection/types.ts`, `src/lib/detection/normalize.ts`,
  `src/lib/detection/stage1.ts`
- Test: `src/lib/detection/normalize.test.ts`, `src/lib/detection/stage1.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수 — lint가 강제)
- Produces:
  - `interface BrandProfile { canonical: string; aliases: string[]; ambiguous: boolean }`
  - `normalizeKo(s: string): string`
  - `interface Stage1Hit { alias: string; index: number; needsStage2: boolean }`
  - `stage1Match(text: string, brand: BrandProfile): Stage1Hit[]`
  - Task 9의 `detectMentions`가 소비한다

설계 ③: **1차를 정밀하게 만들려는 유혹을 참아야 한다.** 1차의 임무는 "여기 뭔가
있을 수 있다"까지고 판단은 2차가 한다. recall 우선이다.

- [ ] **Step 1: 정규화 테스트 작성**

`src/lib/detection/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeKo } from '@/lib/detection/normalize'

describe('normalizeKo', () => {
  it('공백을 제거한다 (띄어쓰기 변형 흡수)', () => {
    expect(normalizeKo('무신사 스탠다드')).toBe(normalizeKo('무신사스탠다드'))
  })

  it('영문 대소문자를 통일한다', () => {
    expect(normalizeKo('MUSINSA')).toBe(normalizeKo('musinsa'))
  })

  it('전각 문자를 반각으로 바꾼다', () => {
    expect(normalizeKo('ＭＵＳＩＮＳＡ')).toBe(normalizeKo('MUSINSA'))
  })

  it('한글 자모를 완성형으로 결합한다 (NFC)', () => {
    // 조합형 '무신사' vs 완성형 '무신사'
    const decomposed = '무신사'.normalize('NFD')
    expect(normalizeKo(decomposed)).toBe(normalizeKo('무신사'))
  })

  it('구두점과 특수문자를 제거한다', () => {
    expect(normalizeKo('나이키-에어')).toBe(normalizeKo('나이키 에어'))
    expect(normalizeKo('L.L.Bean')).toBe(normalizeKo('LLBean'))
  })

  it('숫자는 남긴다 (뉴발란스 880 같은 모델명)', () => {
    expect(normalizeKo('뉴발란스 880')).toContain('880')
  })

  it('빈 문자열을 받아도 던지지 않는다', () => {
    expect(normalizeKo('')).toBe('')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/detection/normalize.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 정규화 구현**

`src/lib/detection/normalize.ts`:

```ts
/**
 * 한국어 브랜드명 매칭을 위한 정규화.
 *
 * 목표는 recall이다. 다음 변형을 전부 같은 것으로 만든다:
 *   "무신사 스탠다드" / "무신사스탠다드" / "MUSINSA Standard" / "musinsa standard"
 *
 * 순수 함수다. 외부 I/O 없음 (lint가 강제).
 */
export function normalizeKo(input: string): string {
  return input
    .normalize('NFKC') // 전각→반각, 호환 문자 정규화, 한글 자모 결합
    .toLowerCase()
    .replace(/[\s​-‍﻿]+/g, '') // 공백·제로폭 문자 제거
    .replace(/[^\p{L}\p{N}]/gu, '') // 문자·숫자만 남긴다
}

/**
 * 정규화된 텍스트에서 원본 텍스트의 인덱스로 되돌리기 위한 매핑.
 * position(언급 순서) 계산에 필요하다.
 */
export function normalizeWithMap(input: string): { normalized: string; map: number[] } {
  const map: number[] = []
  let normalized = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    const n = normalizeKo(ch)
    for (let j = 0; j < n.length; j++) {
      normalized += n[j]
      map.push(i)
    }
  }
  return { normalized, map }
}
```

- [ ] **Step 4: 정규화 통과 확인**

```bash
pnpm vitest run src/lib/detection/normalize.test.ts
```

Expected: PASS (7 passed)

- [ ] **Step 5: 1차 매칭 테스트 작성**

`src/lib/detection/stage1.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { stage1Match } from '@/lib/detection/stage1'
import type { BrandProfile } from '@/lib/detection/types'

const musinsa: BrandProfile = {
  canonical: '무신사',
  aliases: ['MUSINSA', 'Musinsa', '무신사스탠다드', '무탠다드'],
  ambiguous: false,
}

const ambiguous: BrandProfile = {
  canonical: '소나기',
  aliases: ['소나기'],
  ambiguous: true,
}

describe('stage1Match — recall 우선', () => {
  it('정확한 브랜드명을 찾는다', () => {
    const hits = stage1Match('무신사에서 파는 옷이 괜찮습니다.', musinsa)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.alias).toBe('무신사')
  })

  it('띄어쓰기 변형을 찾는다', () => {
    expect(stage1Match('무신사 스탠다드 티셔츠', musinsa).length).toBeGreaterThan(0)
  })

  it('영문 표기를 찾는다', () => {
    expect(stage1Match('MUSINSA is a Korean platform.', musinsa).length).toBe(1)
  })

  it('커뮤니티 축약어를 찾는다', () => {
    expect(stage1Match('무탠다드 맨투맨 추천', musinsa)[0]?.alias).toBe('무탠다드')
  })

  it('언급이 없으면 빈 배열', () => {
    expect(stage1Match('나이키와 아디다스를 추천합니다.', musinsa)).toEqual([])
  })

  it('언급 위치를 원본 텍스트 인덱스로 돌려준다', () => {
    const text = '먼저 나이키, 그리고 무신사가 있습니다.'
    const hits = stage1Match(text, musinsa)
    expect(hits[0]?.index).toBe(text.indexOf('무신사'))
  })

  it('같은 브랜드가 여러 번 나오면 첫 위치만 돌려준다', () => {
    const hits = stage1Match('무신사는 좋다. 무신사 추천.', musinsa)
    expect(hits).toHaveLength(1)
  })

  it('여러 별칭이 걸리면 가장 앞선 위치를 돌려준다', () => {
    const text = '무탠다드가 좋고, 무신사도 좋다.'
    const hits = stage1Match(text, musinsa)
    expect(hits[0]?.index).toBe(text.indexOf('무탠다드'))
  })
})

describe('stage1Match — 2차 판정 필요 여부', () => {
  it('ambiguous 브랜드는 무조건 2차를 거친다', () => {
    const hits = stage1Match('오후에 소나기가 내렸다.', ambiguous)
    expect(hits[0]?.needsStage2).toBe(true)
  })

  it('명백한 브랜드는 2차를 건너뛸 수 있다 (원가 절감)', () => {
    const hits = stage1Match('무신사에서 샀습니다.', musinsa)
    expect(hits[0]?.needsStage2).toBe(false)
  })

  it('짧은 별칭(2자 이하)은 ambiguous가 아니어도 2차를 거친다', () => {
    const short: BrandProfile = { canonical: '미미', aliases: ['미미'], ambiguous: false }
    expect(stage1Match('미미한 차이입니다.', short)[0]?.needsStage2).toBe(true)
  })

  it('경쟁사 이름이 함께 나오면 순서 판정을 위해 2차를 거친다', () => {
    const hits = stage1Match('무신사에서 샀습니다.', musinsa, {
      otherBrandsPresent: true,
    })
    expect(hits[0]?.needsStage2).toBe(true)
  })
})

describe('stage1Match — 방어', () => {
  it('빈 텍스트를 받아도 던지지 않는다', () => {
    expect(stage1Match('', musinsa)).toEqual([])
  })

  it('별칭이 비어도 canonical은 검사한다', () => {
    const bare: BrandProfile = { canonical: '나이키', aliases: [], ambiguous: false }
    expect(stage1Match('나이키 좋아요', bare)).toHaveLength(1)
  })

  it('정규식 특수문자가 든 브랜드명도 안전하다', () => {
    const weird: BrandProfile = { canonical: 'C++', aliases: ['C++'], ambiguous: false }
    expect(() => stage1Match('C++ 좋아요', weird)).not.toThrow()
  })
})
```

- [ ] **Step 6: 실패 확인**

```bash
pnpm vitest run src/lib/detection/stage1.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 7: 구현**

`src/lib/detection/types.ts`:

```ts
export interface BrandProfile {
  /** "무신사" */
  canonical: string
  /** ["MUSINSA", "Musinsa", "무신사스탠다드", "무탠다드"] */
  aliases: string[]
  /** 일반어와 겹치는가. true면 2차 판정을 무조건 거친다. */
  ambiguous: boolean
}

export interface Stage1Hit {
  /** 매칭된 별칭 (원본 표기) */
  alias: string
  /** 원본 텍스트에서의 시작 인덱스 */
  index: number
  /** 2차 LLM 판정을 거쳐야 하는가 */
  needsStage2: boolean
}

export type Sentiment = 'recommended' | 'neutral' | 'negative'

export interface Stage2Verdict {
  /** 동음이의어 배제 — 진짜 그 브랜드를 가리키는가 */
  isBrandReference: boolean
  /** 답변에서 몇 번째로 언급된 브랜드인가 (1부터). 언급 아니면 null */
  position: number | null
  sentiment: Sentiment
  /** 한 줄 요약 — 고객에게 그대로 노출한다 */
  context: string
}

export interface DetectionResult {
  subject: string
  mentioned: boolean
  position: number | null
  sentiment: Sentiment | null
  context: string | null
  /** 2차 판정이 실패해 미판정으로 남았는가 */
  unresolved: boolean
}
```

`src/lib/detection/stage1.ts`:

```ts
import { normalizeKo, normalizeWithMap } from './normalize'
import type { BrandProfile, Stage1Hit } from './types'

export interface Stage1Options {
  /**
   * 이 답변에 다른 브랜드도 등장하는가.
   * true면 언급 순서(position) 판정이 필요하므로 2차를 거친다.
   */
  otherBrandsPresent?: boolean
}

/** 이보다 짧은 별칭은 일반어와 충돌할 확률이 높아 2차를 강제한다. */
const SHORT_ALIAS_THRESHOLD = 2

/**
 * 1차 판정 — 문자열/별칭 매칭. recall 우선(놓치지 않기).
 *
 * 설계 ③: "1차를 정밀하게 만들려는 유혹을 참아야 한다. 1차의 임무는
 * '여기 뭔가 있을 수 있다'까지고 판단은 2차가 한다."
 *
 * 전체 답변의 70~80%가 여기서 탈락하고, 그만큼 LLM 호출이 줄어든다.
 * 순수 함수다 — 외부 I/O 없음.
 */
export function stage1Match(
  text: string,
  brand: BrandProfile,
  opts: Stage1Options = {},
): Stage1Hit[] {
  if (!text) return []

  const candidates = dedupe([brand.canonical, ...brand.aliases]).filter(Boolean)
  if (candidates.length === 0) return []

  const { normalized, map } = normalizeWithMap(text)
  if (!normalized) return []

  let best: { alias: string; index: number } | null = null

  for (const alias of candidates) {
    const needle = normalizeKo(alias)
    if (!needle) continue
    const at = normalized.indexOf(needle)
    if (at === -1) continue

    const originalIndex = map[at] ?? 0
    if (best === null || originalIndex < best.index) {
      best = { alias, index: originalIndex }
    }
  }

  if (best === null) return []

  const shortest = Math.min(...candidates.map((a) => normalizeKo(a).length).filter((n) => n > 0))

  return [
    {
      alias: best.alias,
      index: best.index,
      needsStage2:
        brand.ambiguous ||
        shortest <= SHORT_ALIAS_THRESHOLD ||
        opts.otherBrandsPresent === true,
    },
  ]
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))]
}
```

- [ ] **Step 8: 통과 확인**

```bash
pnpm vitest run src/lib/detection/
```

Expected: PASS (19 passed)

- [ ] **Step 9: 커밋**

```bash
git add src/lib/detection
git commit -m "feat(detection): 한국어 정규화와 1차 별칭 매칭 (recall 우선)"
```

---

### Task 8: 2차 판정 — LLM 구조화 판정

**Files:**
- Create: `src/lib/detection/stage2.ts`, `src/lib/judge/claude.ts`,
  `src/lib/judge/types.ts`
- Test: `src/lib/detection/stage2.test.ts`, `src/lib/judge/claude.smoke.test.ts`

**Interfaces:**
- Consumes: `BrandProfile`, `Stage2Verdict` (Task 7)
- Produces:
  - `type JudgeFn = (batch: JudgeRequest[]) => Promise<JudgeResponse[]>`
    — 순수 함수 경계. `stage2.ts`는 이 타입만 알고 구현은 주입받는다
  - `runStage2(items, judge): Promise<Map<string, Stage2Verdict>>`
  - `claudeJudge: JudgeFn` — Claude Haiku 4.5 구현 (`src/lib/judge/`에 둔다)
  - `JUDGE_MODEL = 'claude-haiku-4-5'`

**`judge/claude.ts`가 `detection/` 밖에 있는 이유:** 1단계 lint 규칙이
`detection/`에서 외부 I/O를 금지한다. 이 분리 덕분에 골드 라벨 회귀 테스트를
API 키 없이(가짜 judge로) 돌릴 수 있고, 판정 로직 자체는 순수하게 유지된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/detection/stage2.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { runStage2 } from '@/lib/detection/stage2'
import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'

const fakeJudge: JudgeFn = async (batch) =>
  batch.map((req) => ({
    id: req.id,
    verdict: {
      isBrandReference: req.answerText.includes(req.brand.canonical),
      position: 1,
      sentiment: 'recommended' as const,
      context: '추천 목록 첫 번째로 언급됨',
    },
  }))

function req(id: string, answerText: string, canonical = '무신사'): JudgeRequest {
  return {
    id,
    answerText,
    brand: { canonical, aliases: [], ambiguous: false },
    matchedAlias: canonical,
  }
}

describe('runStage2', () => {
  it('판정 결과를 id로 매핑해 돌려준다', async () => {
    const result = await runStage2([req('a1', '무신사가 좋습니다')], fakeJudge)
    expect(result.get('a1')?.isBrandReference).toBe(true)
    expect(result.get('a1')?.position).toBe(1)
  })

  it('배치로 묶어 호출한다 (원가 절감)', async () => {
    const spy = vi.fn(fakeJudge)
    const items = Array.from({ length: 25 }, (_, i) => req(`a${i}`, '무신사'))
    await runStage2(items, spy, { batchSize: 10 })
    expect(spy).toHaveBeenCalledTimes(3) // 10 + 10 + 5
  })

  it('빈 입력이면 judge를 호출하지 않는다', async () => {
    const spy = vi.fn(fakeJudge)
    const result = await runStage2([], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('judge가 던지면 그 배치만 미판정으로 남기고 나머지는 살린다', async () => {
    let call = 0
    const flaky: JudgeFn = async (batch) => {
      call++
      if (call === 1) throw new Error('rate limited')
      return fakeJudge(batch)
    }
    const items = Array.from({ length: 4 }, (_, i) => req(`a${i}`, '무신사'))
    const result = await runStage2(items, flaky, { batchSize: 2 })

    // 첫 배치(a0, a1)는 미판정, 둘째 배치(a2, a3)는 판정됨
    expect(result.has('a0')).toBe(false)
    expect(result.get('a2')?.isBrandReference).toBe(true)
  })

  it('judge가 일부 id를 빠뜨리면 그 id는 미판정으로 남는다', async () => {
    const partial: JudgeFn = async (batch) => batch.slice(0, 1).map((r) => ({
      id: r.id,
      verdict: { isBrandReference: true, position: 1, sentiment: 'neutral' as const, context: '' },
    }))
    const result = await runStage2([req('a1', 'x'), req('a2', 'y')], partial)
    expect(result.has('a1')).toBe(true)
    expect(result.has('a2')).toBe(false)
  })

  it('알 수 없는 id를 돌려주면 무시한다', async () => {
    const rogue: JudgeFn = async () => [
      { id: 'does-not-exist', verdict: { isBrandReference: true, position: 1, sentiment: 'neutral' as const, context: '' } },
    ]
    const result = await runStage2([req('a1', 'x')], rogue)
    expect(result.size).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/detection/stage2.test.ts
```

Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/judge/types.ts` — `detection/`이 import해도 되는 순수 타입만 담는다.

```ts
import type { BrandProfile, Stage2Verdict } from '@/lib/detection/types'

export interface JudgeRequest {
  /** 이 판정을 식별하는 키 (보통 `${answerId}:${subject}`) */
  id: string
  answerText: string
  brand: BrandProfile
  /** 1차에서 걸린 별칭 — 판정기에 힌트로 준다 */
  matchedAlias: string
}

export interface JudgeResponse {
  id: string
  verdict: Stage2Verdict
}

export interface JudgeUsage {
  tokensIn: number
  tokensOut: number
}

/**
 * 2차 판정기의 계약.
 *
 * detection/stage2.ts는 이 타입만 알고 구현은 주입받는다. 덕분에
 * 골드 라벨 회귀 테스트를 API 키 없이 돌릴 수 있고, 판정 로직 자체는
 * 순수 함수로 남는다.
 */
export type JudgeFn = (batch: JudgeRequest[]) => Promise<JudgeResponse[]>
```

`src/lib/detection/stage2.ts`:

```ts
import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'
import type { Stage2Verdict } from './types'

export interface Stage2Options {
  /** 한 번의 LLM 호출에 묶을 판정 수 */
  batchSize?: number
  /** 배치 실패를 알리는 콜백 (로깅은 호출자 책임 — 여기는 순수해야 한다) */
  onBatchError?: (error: unknown, ids: string[]) => void
}

const DEFAULT_BATCH_SIZE = 20

/**
 * 1차 통과분을 배치로 묶어 2차 판정한다.
 *
 * 판정 실패는 데이터 손실이 아니다. 미판정으로 남기면 원본(answers.raw)이
 * 있으므로 나중에 재판정할 수 있다. 설계 ②에서 수집과 판정을 분리한 배당금이다.
 *
 * 순수 함수다 — judge를 주입받으므로 외부 I/O가 없다.
 */
export async function runStage2(
  items: readonly JudgeRequest[],
  judge: JudgeFn,
  opts: Stage2Options = {},
): Promise<Map<string, Stage2Verdict>> {
  const out = new Map<string, Stage2Verdict>()
  if (items.length === 0) return out

  const size = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const known = new Set(items.map((i) => i.id))

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    try {
      const responses = await judge(batch)
      for (const r of responses) {
        // judge가 만들어낸 유령 id를 무시한다.
        if (!known.has(r.id)) continue
        out.set(r.id, r.verdict)
      }
    } catch (error) {
      // 이 배치만 미판정으로 남기고 계속 간다.
      opts.onBatchError?.(error, batch.map((b) => b.id))
    }
  }

  return out
}
```

`src/lib/judge/claude.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { JudgeFn, JudgeRequest, JudgeResponse } from './types'

/**
 * 판정 모델. 설계 ③이 지정한 "저렴한 것부터 시작" 원칙.
 * 바꾸려면 골드 라벨 회귀 테스트(recall ≥95%, precision ≥90%)를 먼저 통과해야 한다.
 */
export const JUDGE_MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `너는 AI 답변에서 특정 브랜드가 실제로 언급되었는지 판정하는 분석기다.

각 항목에 대해 다음을 판정한다:
- isBrandReference: 매칭된 문자열이 진짜 그 브랜드를 가리키는가. 동음이의어(일반명사, 다른 회사, 지명 등)면 false.
- position: 답변 전체에서 이 브랜드가 몇 번째로 언급된 브랜드인가. 1부터 센다. 언급이 아니면 null.
- sentiment: recommended(추천/긍정) | neutral(단순 언급) | negative(비추천/부정)
- context: 어떤 맥락에서 언급되었는지 한 문장 한국어 요약. 고객에게 그대로 보여줄 문장이다.

반드시 입력받은 모든 id에 대해 결과를 돌려준다. 확신이 없으면 isBrandReference를 true로 두되 context에 불확실함을 적는다.`

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          isBrandReference: { type: 'boolean' },
          position: { type: ['integer', 'null'] },
          sentiment: { type: 'string', enum: ['recommended', 'neutral', 'negative'] },
          context: { type: 'string' },
        },
        required: ['id', 'isBrandReference', 'position', 'sentiment', 'context'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다')
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

/** 실측 토큰 사용량. 호출자(3단계 수집 잡)가 원가 기록에 쓴다. */
export let lastUsage = { tokensIn: 0, tokensOut: 0 }

export const claudeJudge: JudgeFn = async (batch: JudgeRequest[]): Promise<JudgeResponse[]> => {
  const payload = batch.map((b) => ({
    id: b.id,
    brand: b.brand.canonical,
    matched: b.matchedAlias,
    // 긴 답변을 자르되, 매칭 지점 주변을 남긴다. 전체 답변이 필요한 이유가 없다.
    answer: b.answerText.slice(0, 4000),
  }))

  const response = await getClient().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
  })

  lastUsage = {
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('판정 모델이 요청을 거부했습니다')
  }

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('판정 응답에 텍스트 블록이 없습니다')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error('판정 응답이 유효한 JSON이 아닙니다')
  }

  const results = (parsed as { results?: unknown }).results
  if (!Array.isArray(results)) throw new Error('판정 응답에 results 배열이 없습니다')

  const out: JudgeResponse[] = []
  for (const r of results) {
    if (typeof r !== 'object' || r === null) continue
    const rec = r as Record<string, unknown>
    if (typeof rec.id !== 'string') continue
    out.push({
      id: rec.id,
      verdict: {
        isBrandReference: rec.isBrandReference === true,
        position: typeof rec.position === 'number' ? rec.position : null,
        sentiment:
          rec.sentiment === 'recommended' || rec.sentiment === 'negative'
            ? rec.sentiment
            : 'neutral',
        context: typeof rec.context === 'string' ? rec.context : '',
      },
    })
  }

  logger.info('judge.batch_done', { size: batch.length, returned: out.length })
  return out
}
```

```bash
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm vitest run src/lib/detection/stage2.test.ts
```

Expected: PASS (6 passed)

- [ ] **Step 5: 판정기 스모크 테스트**

`src/lib/judge/claude.smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { claudeJudge } from '@/lib/judge/claude'

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('claudeJudge 스모크', () => {
  it('동음이의어를 배제한다', async () => {
    const [r] = await claudeJudge([
      {
        id: 't1',
        answerText: '어제 오후에 갑자기 소나기가 쏟아져서 우산을 샀다.',
        brand: { canonical: '소나기', aliases: [], ambiguous: true },
        matchedAlias: '소나기',
      },
    ])
    expect(r?.verdict.isBrandReference).toBe(false)
  }, 60_000)

  it('언급 순서를 매긴다', async () => {
    const [r] = await claudeJudge([
      {
        id: 't2',
        answerText: '러닝화로는 나이키 페가수스, 아식스 젤카야노, 뉴발란스 880을 추천합니다.',
        brand: { canonical: '아식스', aliases: ['ASICS'], ambiguous: false },
        matchedAlias: '아식스',
      },
    ])
    expect(r?.verdict.isBrandReference).toBe(true)
    expect(r?.verdict.position).toBe(2)
    expect(r?.verdict.sentiment).toBe('recommended')
    expect(r?.verdict.context.length).toBeGreaterThan(0)
  }, 60_000)
})
```

```bash
pnpm test:smoke
```

Expected: PASS. 실패하면 프롬프트를 조정한다 — 특히 `position` 판정이
1부터 세는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(detection): 2차 LLM 판정 배치 실행 · Claude Haiku 판정기

judge 구현을 detection/ 밖에 두어 순수 함수 경계를 지킨다."
```

---

### Task 9: detectMentions 오케스트레이션

**Files:**
- Create: `src/lib/detection/index.ts`
- Test: `src/lib/detection/index.test.ts`

**Interfaces:**
- Consumes: `stage1Match` (Task 7), `runStage2` (Task 8)
- Produces:
  - `DETECTOR_VERSION: number` — 판정 로직이 바뀌면 올린다
  - `detectMentions(inputs, judge, opts): Promise<DetectionResult[]>`
  - `interface DetectMentionsInput { answerId: string; answerText: string; self: BrandProfile; competitors: BrandProfile[] }`
  - 3단계 판정 배치 잡과 Task 10 골드 라벨 회귀 테스트가 소비한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/detection/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DETECTOR_VERSION, detectMentions } from '@/lib/detection'
import type { DetectMentionsInput } from '@/lib/detection'
import type { JudgeFn } from '@/lib/judge/types'

const alwaysYes: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: true,
      position: 1,
      sentiment: 'recommended' as const,
      context: '추천됨',
    },
  }))

const alwaysNo: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: false,
      position: null,
      sentiment: 'neutral' as const,
      context: '동음이의어',
    },
  }))

function input(overrides: Partial<DetectMentionsInput> = {}): DetectMentionsInput {
  return {
    answerId: 'a1',
    answerText: '무신사에서 파는 옷을 추천합니다.',
    self: { canonical: '무신사', aliases: ['MUSINSA'], ambiguous: false },
    competitors: [],
    ...overrides,
  }
}

describe('DETECTOR_VERSION', () => {
  it('양의 정수다', () => {
    expect(Number.isInteger(DETECTOR_VERSION)).toBe(true)
    expect(DETECTOR_VERSION).toBeGreaterThan(0)
  })
})

describe('detectMentions', () => {
  it('1차에서 안 걸리면 미언급으로 판정하고 LLM을 부르지 않는다', async () => {
    const spy = vi.fn(alwaysYes)
    const results = await detectMentions([input({ answerText: '나이키를 추천합니다.' })], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(results[0]?.mentioned).toBe(false)
    expect(results[0]?.subject).toBe('self')
  })

  it('명백한 매칭은 2차를 건너뛴다 (원가 절감)', async () => {
    const spy = vi.fn(alwaysYes)
    const results = await detectMentions([input()], spy)
    expect(spy).not.toHaveBeenCalled()
    expect(results[0]?.mentioned).toBe(true)
  })

  it('ambiguous 브랜드는 2차를 거치고 결과를 따른다', async () => {
    const results = await detectMentions(
      [
        input({
          answerText: '오후에 소나기가 내렸습니다.',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      alwaysNo,
    )
    expect(results[0]?.mentioned).toBe(false)
    expect(results[0]?.context).toBe('동음이의어')
  })

  it('경쟁사가 함께 있으면 순서 판정을 위해 2차를 거친다', async () => {
    const spy = vi.fn(alwaysYes)
    await detectMentions(
      [
        input({
          answerText: '무신사와 29CM를 추천합니다.',
          competitors: [{ canonical: '29CM', aliases: [], ambiguous: false }],
        }),
      ],
      spy,
    )
    expect(spy).toHaveBeenCalled()
  })

  it('우리 브랜드와 경쟁사 각각에 대해 결과를 낸다', async () => {
    const results = await detectMentions(
      [
        input({
          answerText: '무신사와 29CM를 추천합니다.',
          competitors: [
            { canonical: '29CM', aliases: [], ambiguous: false },
            { canonical: '지그재그', aliases: [], ambiguous: false },
          ],
        }),
      ],
      alwaysYes,
    )
    const subjects = results.map((r) => r.subject).sort()
    expect(subjects).toEqual(['competitor:29CM', 'competitor:지그재그', 'self'])
  })

  it('2차 판정이 실패하면 unresolved로 남기고 mentioned는 1차 결과를 따른다', async () => {
    const broken: JudgeFn = async () => {
      throw new Error('판정기 장애')
    }
    const results = await detectMentions(
      [
        input({
          answerText: '오후에 소나기가 내렸습니다.',
          self: { canonical: '소나기', aliases: [], ambiguous: true },
        }),
      ],
      broken,
    )
    expect(results[0]?.unresolved).toBe(true)
    expect(results[0]?.mentioned).toBe(true) // 1차 결과 — 나중에 재판정한다
  })

  it('여러 답변을 한 번의 배치로 묶는다', async () => {
    const spy = vi.fn(alwaysYes)
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({
        answerId: `a${i}`,
        answerText: '소나기 브랜드',
        self: { canonical: '소나기', aliases: [], ambiguous: true },
      }),
    )
    await detectMentions(inputs, spy, { batchSize: 100 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[0]).toHaveLength(5)
  })

  it('1차 통과율을 보고한다 (원가를 좌우하는 수치)', async () => {
    const onStats = vi.fn()
    await detectMentions(
      [
        input({ answerText: '나이키만 나옵니다.' }),
        input({ answerId: 'a2', answerText: '무신사가 나옵니다.' }),
      ],
      alwaysYes,
      { onStats },
    )
    expect(onStats).toHaveBeenCalledWith(
      expect.objectContaining({ stage1Candidates: 2, stage1Passed: 1 }),
    )
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm vitest run src/lib/detection/index.test.ts
```

Expected: FAIL — `detectMentions` 없음

- [ ] **Step 3: 구현**

`src/lib/detection/index.ts`:

```ts
import type { JudgeFn, JudgeRequest } from '@/lib/judge/types'
import { stage1Match } from './stage1'
import { runStage2 } from './stage2'
import type { BrandProfile, DetectionResult } from './types'

export * from './types'
export { stage1Match } from './stage1'
export { runStage2 } from './stage2'
export { normalizeKo } from './normalize'

/**
 * 판정 로직 버전.
 *
 * 1차 매칭 규칙, 2차 프롬프트, 판정 모델 중 하나라도 바뀌면 올린다.
 * 올리면 과거 답변을 재판정한다. 기존 detections를 삭제하지 않고 새 버전
 * 판정을 추가한다 (감사 추적).
 *
 * v1 (2026-07-28) — 최초. Claude Haiku 4.5, 별칭 정규화 매칭.
 */
export const DETECTOR_VERSION = 1

export interface DetectMentionsInput {
  answerId: string
  answerText: string
  self: BrandProfile
  competitors: BrandProfile[]
}

export interface DetectionStats {
  /** 1차를 시도한 (답변 × 주체) 수 */
  stage1Candidates: number
  /** 1차를 통과한 수 */
  stage1Passed: number
  /** 2차 LLM 판정을 실제로 부른 수 */
  stage2Called: number
  /** 2차 판정이 실패해 미판정으로 남은 수 */
  unresolved: number
}

export interface DetectMentionsOptions {
  batchSize?: number
  onStats?: (stats: DetectionStats) => void
  onBatchError?: (error: unknown, ids: string[]) => void
}

interface Pending {
  key: string
  answerId: string
  subject: string
  alias: string
}

/**
 * 2단계 판정 오케스트레이션.
 *
 *   답변 텍스트
 *      ↓
 *   1차 — 문자열/별칭 매칭        recall 우선 (놓치지 않기)
 *      ↓  통과분만
 *   2차 — LLM 구조화 판정          precision 확보 (맞는지 확인)
 *      ↓
 *   Detection
 *
 * 순수 함수다 — judge를 주입받으므로 외부 I/O가 없다.
 */
export async function detectMentions(
  inputs: readonly DetectMentionsInput[],
  judge: JudgeFn,
  opts: DetectMentionsOptions = {},
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = []
  const pending: Pending[] = []
  const judgeRequests: JudgeRequest[] = []

  let stage1Candidates = 0
  let stage1Passed = 0

  for (const input of inputs) {
    const subjects: { subject: string; brand: BrandProfile }[] = [
      { subject: 'self', brand: input.self },
      ...input.competitors.map((c) => ({
        subject: `competitor:${c.canonical}`,
        brand: c,
      })),
    ]

    // 다른 브랜드가 이 답변에 있으면 순서 판정이 필요하다.
    const presentCount = subjects.filter(
      (s) => stage1Match(input.answerText, s.brand).length > 0,
    ).length
    const otherBrandsPresent = presentCount > 1

    for (const { subject, brand } of subjects) {
      stage1Candidates++
      const hits = stage1Match(input.answerText, brand, { otherBrandsPresent })

      if (hits.length === 0) {
        results.push({
          subject,
          mentioned: false,
          position: null,
          sentiment: null,
          context: null,
          unresolved: false,
        })
        continue
      }

      stage1Passed++
      const hit = hits[0]!

      if (!hit.needsStage2) {
        // 명백한 케이스는 2차를 건너뛴다 — 원가 절감의 핵심.
        results.push({
          subject,
          mentioned: true,
          position: null,
          sentiment: null,
          context: null,
          unresolved: false,
        })
        continue
      }

      const key = `${input.answerId}:${subject}`
      pending.push({ key, answerId: input.answerId, subject, alias: hit.alias })
      judgeRequests.push({
        id: key,
        answerText: input.answerText,
        brand,
        matchedAlias: hit.alias,
      })
    }
  }

  const verdicts = await runStage2(judgeRequests, judge, {
    batchSize: opts.batchSize,
    onBatchError: opts.onBatchError,
  })

  let unresolved = 0
  for (const p of pending) {
    const v = verdicts.get(p.key)
    if (!v) {
      // 판정 실패 — 미판정으로 남긴다. 원본이 있으므로 나중에 재판정 가능.
      unresolved++
      results.push({
        subject: p.subject,
        mentioned: true, // 1차 결과를 따른다
        position: null,
        sentiment: null,
        context: null,
        unresolved: true,
      })
      continue
    }
    results.push({
      subject: p.subject,
      mentioned: v.isBrandReference,
      position: v.isBrandReference ? v.position : null,
      sentiment: v.isBrandReference ? v.sentiment : null,
      context: v.context || null,
      unresolved: false,
    })
  }

  opts.onStats?.({
    stage1Candidates,
    stage1Passed,
    stage2Called: judgeRequests.length,
    unresolved,
  })

  return results
}
```

> **주의:** 위 구현은 `DetectionResult`에 `answerId`가 없다. 호출자가
> 입력 순서로 매핑하기 어렵다. `DetectionResult`에 `answerId: string`를
> 추가하고 각 push에 넣어라 — 테스트가 이를 요구하지 않지만 3단계에서
> 반드시 필요하다. `types.ts`의 `DetectionResult`에 `answerId: string`를
> 추가하고 위 코드의 모든 `results.push({...})`에 `answerId`를 넣는다.

- [ ] **Step 4: `answerId` 추가와 테스트 보강**

`src/lib/detection/types.ts`의 `DetectionResult`에 `answerId: string` 추가.
`index.ts`의 모든 `results.push`에 `answerId`를 넣는다.
`index.test.ts`에 테스트 추가:

```ts
it('결과에 answerId가 담겨 호출자가 매핑할 수 있다', async () => {
  const results = await detectMentions([input({ answerId: 'xyz' })], alwaysYes)
  expect(results[0]?.answerId).toBe('xyz')
})
```

- [ ] **Step 5: 통과 확인**

```bash
pnpm vitest run src/lib/detection/
pnpm typecheck && pnpm lint
```

Expected: 전부 통과. lint가 `detection/`의 I/O import를 잡지 않는지 확인
(`judge/types.ts`는 타입만이므로 통과해야 한다 — 통과하지 않으면 lint 규칙의
`group` 패턴에서 `@/lib/judge/types`를 명시적으로 허용한다).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/detection
git commit -m "feat(detection): detectMentions 오케스트레이션 · DETECTOR_VERSION"
```

---

### Task 10: 골드 라벨 세트와 CI 게이트

**Files:**
- Create: `tests/golden/labels.json`, `tests/golden/regression.test.ts`,
  `scripts/label-cli.ts`, `scripts/collect-label-candidates.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `detectMentions` (Task 9), 엔진 픽스처 (Task 4~6)
- Produces:
  - `tests/golden/labels.json` — 손으로 라벨링한 200개
  - CI 게이트: recall < 95% 또는 precision < 90%면 빌드 실패
  - `pnpm label` — 라벨링 CLI

설계 ③: **"검증하지 않은 숫자는 주장일 뿐이다."** 고객에게 "당신의 Cited Rate는
34%입니다"라고 말한다. 그게 맞는지 우리가 어떻게 아는가. 판정기가 틀리면 숫자
전체가 거짓말이고, 고객은 자기 브랜드니까 금방 알아챈다.

이 태스크가 이 단계에서 가장 중요하다. 건너뛰면 제품의 모든 숫자가 근거 없는
주장이 된다.

- [ ] **Step 1: 라벨 후보 수집 스크립트**

`scripts/collect-label-candidates.ts` — 실제 엔진으로 답변을 모아 라벨링
후보를 만든다. 라벨링 대상은 **실제 수집한 답변**이어야 한다. 합성 데이터로
검증한 정확도는 의미가 없다.

```ts
/**
 * 라벨링 후보 수집.
 *
 *   pnpm label:collect
 *
 * 브랜드 5개 × 질의 8개 × 엔진 2종 = 80개 답변을 모으고,
 * 각 답변에 대해 1차 매칭을 돌려 후보를 만든다.
 * 출력: tests/golden/candidates.json
 */
import { writeFile } from 'node:fs/promises'
import { stage1Match } from '@/lib/detection/stage1'
import type { BrandProfile } from '@/lib/detection/types'
import { getEngine } from '@/lib/engines'

/**
 * 라벨링 대상 브랜드. 다양성이 중요하다:
 * - 명백한 브랜드 (무신사)
 * - 일반어와 겹치는 브랜드 (소나기)
 * - 영문 브랜드 (ASICS)
 * - 짧은 이름 (미미)
 * - 언급이 거의 안 되는 소규모 브랜드
 */
const SUBJECTS: { brand: BrandProfile; queries: string[] }[] = [
  {
    brand: { canonical: '무신사', aliases: ['MUSINSA', '무신사스탠다드', '무탠다드'], ambiguous: false },
    queries: [
      '온라인 패션 쇼핑몰 추천',
      '20대 남자 옷 사이트',
      '가성비 좋은 무지 티셔츠 브랜드',
      '한국 패션 플랫폼 비교',
      '기본템 잘 만드는 브랜드',
      '남자 맨투맨 추천',
      '데일리룩 쇼핑몰',
      '무신사 vs 29CM 차이',
    ],
  },
  {
    brand: { canonical: '아식스', aliases: ['ASICS', 'asics', '젤카야노'], ambiguous: false },
    queries: [
      '30대 남자 러닝화 추천해줘',
      '발볼 넓은 사람 운동화',
      '초보 러너 신발',
      '쿠셔닝 좋은 러닝화',
      '마라톤 대회용 신발',
      '평발 러닝화 추천',
      '러닝화 브랜드 비교',
      '가성비 러닝화 추천',
    ],
  },
  // 나머지 3개 브랜드를 같은 형식으로 추가한다.
  // 반드시 일반어와 겹치는 브랜드를 하나 이상 포함할 것.
]

const ENGINES = ['chatgpt', 'gemini']

const out: unknown[] = []

for (const { brand, queries } of SUBJECTS) {
  for (const query of queries) {
    for (const engineId of ENGINES) {
      const engine = getEngine(engineId)
      if (!engine.isConfigured()) continue
      try {
        const answer = await engine.run(query, { sampleIndex: 0 })
        const hits = stage1Match(answer.text, brand)
        out.push({
          id: `${brand.canonical}-${engineId}-${out.length}`,
          brand,
          query,
          engineId,
          answerText: answer.text,
          stage1Hit: hits.length > 0,
          matchedAlias: hits[0]?.alias ?? null,
          // 사람이 채울 필드
          label: null,
          labelPosition: null,
          labelNote: '',
        })
        console.log(`수집 ${out.length}: ${brand.canonical} / ${engineId} / ${query}`)
      } catch (error) {
        console.error(`실패: ${engineId} / ${query} — ${String(error)}`)
      }
    }
  }
}

await writeFile('tests/golden/candidates.json', JSON.stringify(out, null, 2))
console.log(`\n총 ${out.length}건 수집. tests/golden/candidates.json`)
```

`package.json`에 추가: `"label:collect": "tsx --env-file=.env.local scripts/collect-label-candidates.ts"`

- [ ] **Step 2: 후보 수집 실행**

```bash
pnpm label:collect
```

Expected: `tests/golden/candidates.json`에 최소 80건. 200건에 미달하면
`SUBJECTS`에 브랜드와 질의를 더 추가해 다시 돌린다. **200건이 목표다.**

- [ ] **Step 3: 라벨링 CLI**

`scripts/label-cli.ts` — 반나절이면 200개를 라벨링할 수 있어야 한다. CLI가
답변을 보여주고 y/n을 받는다.

```ts
/**
 * 골드 라벨링 CLI.
 *
 *   pnpm label
 *
 * candidates.json을 하나씩 보여주고 라벨을 받아 labels.json에 저장한다.
 * 중단해도 진행 상황이 저장되므로 여러 번에 나눠 할 수 있다.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'

interface Candidate {
  id: string
  brand: { canonical: string; aliases: string[]; ambiguous: boolean }
  query: string
  engineId: string
  answerText: string
  stage1Hit: boolean
  matchedAlias: string | null
  label: boolean | null
  labelPosition: number | null
  labelNote: string
}

const candidates: Candidate[] = JSON.parse(
  await readFile('tests/golden/candidates.json', 'utf8'),
)

const rl = createInterface({ input: process.stdin, output: process.stdout })

let done = candidates.filter((c) => c.label !== null).length
console.log(`이미 라벨링됨: ${done} / ${candidates.length}\n`)

for (const c of candidates) {
  if (c.label !== null) continue

  console.log('─'.repeat(70))
  console.log(`[${done + 1}/${candidates.length}] 브랜드: ${c.brand.canonical}  엔진: ${c.engineId}`)
  console.log(`질의: ${c.query}`)
  console.log(`1차 매칭: ${c.stage1Hit ? `걸림 (${c.matchedAlias})` : '안 걸림'}`)
  console.log('─'.repeat(70))
  console.log(c.answerText.slice(0, 1200))
  console.log('─'.repeat(70))

  const ans = (await rl.question('이 답변에 브랜드가 진짜로 언급되었나? (y/n/s=건너뛰기/q=종료) ')).trim().toLowerCase()

  if (ans === 'q') break
  if (ans === 's') continue

  c.label = ans === 'y'
  if (c.label) {
    const pos = (await rl.question('몇 번째로 언급된 브랜드인가? (숫자, 모르면 엔터) ')).trim()
    c.labelPosition = pos ? Number(pos) : null
  }
  const note = (await rl.question('메모 (선택, 엔터로 건너뛰기) ')).trim()
  c.labelNote = note

  done++
  await writeFile('tests/golden/candidates.json', JSON.stringify(candidates, null, 2))
}

rl.close()

// 라벨링 완료분만 labels.json으로 확정
const labeled = candidates.filter((c) => c.label !== null)
await writeFile('tests/golden/labels.json', JSON.stringify(labeled, null, 2))

const positives = labeled.filter((c) => c.label).length
console.log(`\n확정: ${labeled.length}건 (언급 ${positives} / 미언급 ${labeled.length - positives})`)
console.log('tests/golden/labels.json 저장 완료')
```

`package.json`에 추가: `"label": "tsx scripts/label-cli.ts"`

- [ ] **Step 4: 실제로 라벨링한다 (반나절)**

```bash
pnpm label
```

**200개를 실제로 라벨링한다.** 이 작업을 건너뛰거나 자동 생성하면 이 태스크의
의미가 전부 사라진다. 라벨링하면서 판정이 애매한 사례를 `labelNote`에 적어두면
프롬프트 개선에 쓸 수 있다.

Expected: `tests/golden/labels.json`에 200건 (긍정/부정이 대략 40:60 정도면 건강하다.
전부 긍정이면 precision을 잴 수 없으므로 미언급 사례를 더 수집한다).

- [ ] **Step 5: 실패하는 회귀 테스트 작성**

`tests/golden/regression.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectMentions } from '@/lib/detection'
import type { JudgeFn } from '@/lib/judge/types'

interface Label {
  id: string
  brand: { canonical: string; aliases: string[]; ambiguous: boolean }
  answerText: string
  label: boolean
  labelPosition: number | null
}

const labels: Label[] = JSON.parse(
  readFileSync('tests/golden/labels.json', 'utf8'),
).filter((l: Label) => l.label !== null)

/**
 * API 키가 있으면 실제 판정기를, 없으면 1차 결과만으로 평가한다.
 * CI에서는 ANTHROPIC_API_KEY를 넣어 실제 판정기로 게이트를 건다.
 */
async function makeJudge(): Promise<JudgeFn> {
  if (process.env.ANTHROPIC_API_KEY) {
    const { claudeJudge } = await import('@/lib/judge/claude')
    return claudeJudge
  }
  // 키가 없으면 2차를 "언급 맞음"으로 통과시킨다 — 1차의 recall만 측정된다.
  return async (batch) =>
    batch.map((b) => ({
      id: b.id,
      verdict: {
        isBrandReference: true,
        position: 1,
        sentiment: 'neutral' as const,
        context: '',
      },
    }))
}

describe('골드 라벨 회귀 — 판정 정확도 게이트', () => {
  it('라벨 세트가 최소 100건이고 긍정·부정이 모두 있다', () => {
    expect(labels.length).toBeGreaterThanOrEqual(100)
    expect(labels.some((l) => l.label)).toBe(true)
    expect(labels.some((l) => !l.label)).toBe(true)
  })

  it(
    'recall ≥ 95% · precision ≥ 90%',
    async () => {
      const judge = await makeJudge()

      const inputs = labels.map((l) => ({
        answerId: l.id,
        answerText: l.answerText,
        self: l.brand,
        competitors: [],
      }))

      const results = await detectMentions(inputs, judge, { batchSize: 20 })
      const predicted = new Map(
        results.filter((r) => r.subject === 'self').map((r) => [r.answerId, r.mentioned]),
      )

      let tp = 0
      let fp = 0
      let fn = 0
      const misses: string[] = []

      for (const l of labels) {
        const pred = predicted.get(l.id) ?? false
        if (l.label && pred) tp++
        else if (!l.label && pred) {
          fp++
          misses.push(`FP ${l.id}: "${l.brand.canonical}" — ${l.answerText.slice(0, 80)}`)
        } else if (l.label && !pred) {
          fn++
          misses.push(`FN ${l.id}: "${l.brand.canonical}" — ${l.answerText.slice(0, 80)}`)
        }
      }

      const recall = tp / (tp + fn)
      const precision = tp / (tp + fp)

      console.log(`\n판정 정확도: recall ${(recall * 100).toFixed(1)}% · precision ${(precision * 100).toFixed(1)}%`)
      console.log(`TP ${tp} / FP ${fp} / FN ${fn}`)
      if (misses.length > 0) {
        console.log('\n오판정 사례:')
        for (const m of misses.slice(0, 15)) console.log('  ' + m)
      }

      // recall이 더 중요하다 — 놓치는 것이 잘못 잡는 것보다 나쁘다.
      expect(recall, `recall이 95% 미만입니다 (${(recall * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.95)
      expect(precision, `precision이 90% 미만입니다 (${(precision * 100).toFixed(1)}%)`).toBeGreaterThanOrEqual(0.9)
    },
    300_000,
  )
})
```

- [ ] **Step 6: 실행하고 실제 정확도를 본다**

```bash
ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2) \
  pnpm vitest run tests/golden/regression.test.ts
```

Expected: 첫 실행에서는 통과하지 못할 가능성이 높다. 출력된 FP/FN 사례를 보고:

- **FN(놓침)이 많으면** → 1차 매칭이 너무 좁다. 별칭을 추가하거나
  `normalizeKo`를 손본다
- **FP(오탐)가 많으면** → 2차 프롬프트를 손본다. `needsStage2` 조건을 넓혀
  더 많은 케이스를 2차로 보낸다
- **두 지표를 만족할 때까지 반복한다.** 이것이 이 태스크의 본체다

수정할 때마다 `DETECTOR_VERSION`을 올릴 필요는 없다 — 아직 프로덕션 데이터가
없기 때문이다. 첫 유료 고객이 생긴 뒤부터는 올린다.

- [ ] **Step 7: CI 게이트 추가**

`.github/workflows/ci.yml`의 `verify` job에 스텝을 추가한다:

```yaml
      - name: 골드 라벨 회귀 (판정 정확도 게이트)
        run: pnpm vitest run tests/golden/regression.test.ts
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DATABASE_URL: postgres://user:pass@localhost:5432/db
          BETTER_AUTH_SECRET: ci-dummy-secret-not-used-at-runtime
          BETTER_AUTH_URL: http://localhost:3000
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          RESEND_API_KEY: re_ci_dummy
          EMAIL_FROM: Cited <noreply@example.com>
```

GitHub 저장소 Settings > Secrets에 `ANTHROPIC_API_KEY`를 등록한다.
라벨 200건 × 판정 = 실행당 약 $0.05 미만이므로 매 PR에 돌려도 문제없다.

- [ ] **Step 8: CI에서 게이트가 실제로 동작하는지 확인**

일부러 판정을 망가뜨려 CI가 막히는지 본다.

```bash
# stage1.ts의 SHORT_ALIAS_THRESHOLD를 999로 바꿔 모든 매칭을 2차로 보낸 뒤
# stage2를 무조건 false로 만드는 식으로 recall을 떨어뜨린다
git stash
```

간단히는 `regression.test.ts`의 임계값을 `0.999`로 임시 상향해 실패를 확인하고
되돌린다.

```bash
pnpm vitest run tests/golden/regression.test.ts
```

Expected: FAIL — `recall이 95% 미만입니다` 형태의 메시지. 확인 후 임계값을
원복한다.

- [ ] **Step 9: 커밋**

```bash
git add tests/golden scripts/label-cli.ts scripts/collect-label-candidates.ts .github package.json
git commit -m "feat(detection): 골드 라벨 200건과 CI 정확도 게이트

recall 95% · precision 90% 미달 시 빌드 실패.
설계 ③: 검증하지 않은 숫자는 주장일 뿐이다."
```

---

### Task 11: CLI 통합 검증

**Files:**
- Create: `scripts/measure.ts`
- Test: `tests/integration/pipeline.test.ts`

**Interfaces:**
- Consumes: 이 단계의 전부
- Produces: `pnpm measure "<브랜드>" "<질의>"` — 엔진 호출부터 지표까지 한 번에.
  3단계 수집 잡이 이 흐름을 Trigger.dev 위로 옮긴다.

이 태스크는 2단계가 실제로 동작하는 소프트웨어인지 증명한다.

- [ ] **Step 1: 통합 테스트 작성 (목 엔진)**

`tests/integration/pipeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DETECTOR_VERSION, detectMentions } from '@/lib/detection'
import { computeMetrics } from '@/lib/stats/metrics'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'
import type { JudgeFn } from '@/lib/judge/types'

const judge: JudgeFn = async (batch) =>
  batch.map((b) => ({
    id: b.id,
    verdict: {
      isBrandReference: true,
      position: b.answerText.indexOf(b.matchedAlias) < 20 ? 1 : 3,
      sentiment: 'recommended' as const,
      context: '추천됨',
    },
  }))

describe('엔진 → 판정 → 집계 파이프라인', () => {
  it('저장된 답변으로 지표를 끝까지 계산한다', async () => {
    // 엔진이 이런 답변을 돌려줬다고 가정 (실제로는 픽스처에서 읽는다)
    const rawAnswers = [
      { id: 'a1', queryId: 'q1', engineId: 'chatgpt', text: '아식스 젤카야노를 가장 추천합니다. 그다음은 나이키.' },
      { id: 'a2', queryId: 'q1', engineId: 'chatgpt', text: '나이키 페가수스가 좋습니다. 아식스도 괜찮습니다.' },
      { id: 'a3', queryId: 'q1', engineId: 'gemini', text: '뉴발란스 880을 추천합니다.' },
      { id: 'a4', queryId: 'q2', engineId: 'chatgpt', text: '호카와 브룩스를 추천합니다.' },
    ]

    const self = { canonical: '아식스', aliases: ['ASICS', '젤카야노'], ambiguous: false }
    const competitors = [{ canonical: '나이키', aliases: ['NIKE'], ambiguous: false }]

    const detections = await detectMentions(
      rawAnswers.map((a) => ({
        answerId: a.id,
        answerText: a.text,
        self,
        competitors,
      })),
      judge,
    )

    const answerRecords: AnswerRecord[] = rawAnswers.map((a) => ({
      id: a.id,
      queryId: a.queryId,
      queryText: `질의 ${a.queryId}`,
      engineId: a.engineId,
    }))

    const detectionRecords: DetectionRecord[] = detections.map((d) => {
      const answer = rawAnswers.find((a) => a.id === d.answerId)!
      return {
        answerId: d.answerId,
        queryId: answer.queryId,
        engineId: answer.engineId,
        subject: d.subject,
        mentioned: d.mentioned,
        position: d.position,
      }
    })

    const metrics = computeMetrics(answerRecords, detectionRecords, {
      self: 'self',
      competitors: ['competitor:나이키'],
    })

    // 아식스는 a1, a2에 언급됨 → 2/4
    expect(metrics.citedRate.k).toBe(2)
    expect(metrics.citedRate.n).toBe(4)
    expect(metrics.citedRate.point).toBeCloseTo(0.5, 6)

    // 신뢰구간이 존재하고 점추정을 감싼다
    expect(metrics.citedRate.lower).toBeLessThan(metrics.citedRate.point)
    expect(metrics.citedRate.upper).toBeGreaterThan(metrics.citedRate.point)

    // q2에서는 아무것도 안 나옴 → "지금 조치할 것" 후보
    const zeroQuery = metrics.byQuery.find((q) => q.interval.k === 0)
    expect(zeroQuery?.queryId).toBe('q2')

    // 엔진별로 갈린다
    expect(metrics.byEngine.chatgpt?.n).toBe(3)
    expect(metrics.byEngine.gemini?.n).toBe(1)

    expect(DETECTOR_VERSION).toBe(1)
  })
})
```

- [ ] **Step 2: 실행**

```bash
pnpm vitest run tests/integration/pipeline.test.ts
```

Expected: PASS. 실패하면 `detectMentions` 결과의 `answerId` 유무를 먼저 확인한다.

- [ ] **Step 3: 실측 CLI 작성**

`scripts/measure.ts`:

```ts
/**
 * 실제 엔진으로 브랜드 언급률을 측정한다.
 *
 *   pnpm measure "아식스" "30대 남자 러닝화 추천해줘" "발볼 넓은 운동화"
 *
 * 3단계에서 Trigger.dev 위로 옮길 흐름의 축소판이다.
 * 원가도 함께 출력해 설계 문서의 추정치가 맞는지 확인한다.
 */
import { detectMentions } from '@/lib/detection'
import { estimateCostKrw, estimateJudgeCostKrw } from '@/lib/engines/pricing'
import { getEngine } from '@/lib/engines'
import { claudeJudge, lastUsage } from '@/lib/judge/claude'
import { computeMetrics } from '@/lib/stats/metrics'
import { formatInterval, formatPercent } from '@/lib/stats/wilson'
import type { AnswerRecord, DetectionRecord } from '@/lib/stats/metrics'

const [brandName, ...queries] = process.argv.slice(2)
if (!brandName || queries.length === 0) {
  console.error('사용법: pnpm measure "<브랜드>" "<질의1>" ["<질의2>" ...]')
  process.exit(1)
}

const ENGINE_IDS = ['chatgpt', 'gemini'] as const
const SAMPLES = 3

const answers: (AnswerRecord & { text: string })[] = []
let engineCostKrw = 0

console.log(`측정 시작: ${brandName} · 질의 ${queries.length}개 · 엔진 ${ENGINE_IDS.length}종 × ${SAMPLES}샘플`)

for (const [qi, query] of queries.entries()) {
  for (const engineId of ENGINE_IDS) {
    const engine = getEngine(engineId)
    if (!engine.isConfigured()) {
      console.warn(`  ${engineId}: 키 없음 — 건너뜀`)
      continue
    }
    for (let s = 0; s < SAMPLES; s++) {
      try {
        const a = await engine.run(query, { sampleIndex: s })
        engineCostKrw += estimateCostKrw(engineId, a.usage)
        answers.push({
          id: `q${qi}-${engineId}-${s}`,
          queryId: `q${qi}`,
          queryText: query,
          engineId,
          text: a.text,
        })
        process.stdout.write('.')
      } catch (error) {
        process.stdout.write('x')
        console.error(`\n  실패: ${engineId} / ${query} — ${String(error)}`)
      }
    }
  }
}
console.log(`\n수집 완료: ${answers.length}건`)

const self = { canonical: brandName, aliases: [], ambiguous: false }

const detections = await detectMentions(
  answers.map((a) => ({ answerId: a.id, answerText: a.text, self, competitors: [] })),
  claudeJudge,
  {
    onStats: (s) =>
      console.log(
        `판정: 1차 후보 ${s.stage1Candidates} → 통과 ${s.stage1Passed} (${formatPercent(s.stage1Passed / s.stage1Candidates)}) → 2차 호출 ${s.stage2Called}, 미판정 ${s.unresolved}`,
      ),
  },
)

const detectionRecords: DetectionRecord[] = detections.map((d) => {
  const a = answers.find((x) => x.id === d.answerId)!
  return {
    answerId: d.answerId,
    queryId: a.queryId,
    engineId: a.engineId,
    subject: d.subject,
    mentioned: d.mentioned,
    position: d.position,
  }
})

const m = computeMetrics(answers, detectionRecords, { self: 'self', competitors: [] })
const judgeCostKrw = estimateJudgeCostKrw(lastUsage.tokensIn, lastUsage.tokensOut)

console.log(`\n${'─'.repeat(60)}`)
console.log(`${brandName} · ${m.totalAnswers}회 시행`)
console.log(`${'─'.repeat(60)}`)
console.log(`Cited Rate        ${formatPercent(m.citedRate.point)}  (${formatInterval(m.citedRate)})`)
console.log(`First-Mention     ${formatPercent(m.firstMentionRate.point)}`)
console.log('\n엔진별')
for (const [engineId, ci] of Object.entries(m.byEngine)) {
  console.log(`  ${engineId.padEnd(12)} ${formatPercent(ci.point).padStart(5)}  (${formatInterval(ci)})`)
}
console.log('\n질의별 (못 나오는 것부터)')
for (const q of m.byQuery) {
  console.log(`  ${formatPercent(q.interval.point).padStart(5)}  ${q.interval.k}/${q.interval.n}  ${q.queryText}`)
}
console.log(`\n원가: 엔진 ${engineCostKrw}원 + 판정 ${judgeCostKrw}원 = ${engineCostKrw + judgeCostKrw}원`)
console.log(`측정 1회당 ${Math.round((engineCostKrw + judgeCostKrw) / m.totalAnswers)}원`)
```

`package.json`에 추가: `"measure": "tsx --env-file=.env.local scripts/measure.ts"`

- [ ] **Step 4: 실제로 측정한다 — 원가 추정치 검증**

```bash
pnpm measure "아식스" \
  "30대 남자 러닝화 추천해줘" \
  "발볼 넓은 사람 운동화" \
  "가성비 러닝화 추천"
```

Expected: 지표가 나오고 원가가 출력된다. **출력된 "측정 1회당 N원"을 설계
문서의 추정치(50~110원)와 비교한다.**

- 추정 범위 안이면 → `pricing.ts`의 `// 추정` 주석을 지우고 실측값으로 확정
- 크게 벗어나면 → 원가 구조 재검토가 필요하다. `docs/superpowers/notes/`에
  기록하고, 벗어난 정도가 크면(2배 이상) 요금제 재검토를 사용자에게 보고한다

또한 **1차 통과율**을 확인한다. 설계 문서는 70~80% 탈락을 가정했다. 실제
통과율이 50%를 넘으면 판정 원가가 예상보다 높아진다.

- [ ] **Step 5: 실측 결과 기록**

`docs/superpowers/notes/2026-07-28-cost-actuals.md`:

```markdown
# 원가 실측 (2026-07-28)

## 측정 조건
- 브랜드: 아식스
- 질의 3개 × 엔진 2종(chatgpt, gemini) × 3샘플 = 18회
- 판정: claude-haiku-4-5

## 결과
| 항목 | 실측 |
| --- | --- |
| 엔진 원가 | __원 |
| 판정 원가 | __원 |
| 측정 1회당 | __원 |
| 1차 통과율 | __% |

## 설계 추정치와 비교
- 설계 추정: 건당 50~110원
- 실측: __원
- 판단: (범위 내 / 초과 — 요금제 재검토 필요)

## SERP 엔진 원가 (별도)
SerpApi Starter $25 / 1,000건 = 건당 35원. 이것은 계약상 확정값이라
실측이 불필요하다.

## 플랜별 월 원가 재계산
- Starter (10질의, 월 430회): __원 → 원가율 __%
- Business (30질의, 월 1,290회): __원 → 원가율 __%
```

- [ ] **Step 6: 전체 검증과 커밋**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat: 측정 CLI와 통합 테스트 · 원가 실측 기록

pnpm measure로 엔진→판정→집계 전 흐름을 실제로 돌려 검증했다."
git tag phase-2-complete
```

---

## 2단계 완료 조건

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 전부 통과
- [ ] `pnpm test:smoke`가 엔진 4종 + 판정기에 각각 실제 1회 호출 성공
- [ ] `tests/golden/labels.json`에 **손으로 라벨링한** 200건이 있다
- [ ] `pnpm vitest run tests/golden/regression.test.ts`가 recall ≥95%, precision ≥90%로 통과
- [ ] CI에 골드 라벨 게이트가 붙어 있고, 임계값을 올리면 실제로 실패한다
- [ ] `pnpm measure "<브랜드>" "<질의>"`가 지표와 원가를 출력한다
- [ ] `docs/superpowers/notes/2026-07-28-cost-actuals.md`에 실측 원가가 기록됨
- [ ] `docs/superpowers/notes/2026-07-28-naver-coverage.md`에 브리핑 미노출 처리 결정이 기록됨
- [ ] `src/lib/detection/`이나 `src/lib/stats/`에서 `@/lib/db`를 import하면 lint 에러

## 다음 단계

[3단계 — 수집 파이프라인과 무료 진단](2026-07-28-cited-phase-3-collection-and-free-audit.md)
