# 크몽 수익화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크몽에서 팔 정밀 진단(질의 10개 × 3회, PDF 납품, 개선 가이드)을
기존 무료 진단 파이프라인 위에 얹고, 업종 커버리지를 25개로 늘린다.

**Architecture:** 새 시스템을 만들지 않는다. `free_audits`에 열 5개를 더하고,
`executeAudit`이 티어별 반복 수와 동결 질의를 받게 하고, 리포트 화면을 유료
섹션으로 확장한다. 유료 질의는 "템플릿 3 + LLM 후보 7 → 운영자 검수 → DB
동결"이다. 납품물은 Playwright로 뽑는 PDF + 웹 링크.

**Tech Stack:** 기존 스택 그대로 + `react-markdown`(가이드 렌더) 하나 추가.

**Spec:** `docs/superpowers/specs/2026-07-31-kmong-revenue-design.md`

## Global Constraints

- **질의에 브랜드명·경쟁사명 금지.** 검수자 눈이 아니라 검증 함수가 막는다
- **질의는 고객 단위로 동결한다.** 즉석 LLM 생성 금지 — 재측정 비교가 상품의 근거
- **지역형 업종은 지역 없이 실행을 거부한다.** 조용한 일반형 강등 금지
- **진단 티어(`AUDIT_TIERS`)와 구독 플랜(`PLANS`)을 섞지 않는다**
- 원가는 밀리원 정수, `subject`는 `'self'`/`` `competitor:${c}` `` 규약 유지
- CRLF 저장소 — perl 변이 시 `\r?\n` 주의. 커밋은 명시 경로만 스테이징
- `.env.local`은 읽지 않는다. 비밀 값을 출력하지 않는다
- 각 태스크 마지막 Step은 커밋

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `src/lib/audit/tiers.ts` (신규) | `AUDIT_TIERS` 상수 — 티어별 질의 수·반복 수 |
| `src/lib/audit/query-templates.ts` (신규) | 25업종 템플릿 **데이터만** (새 업종 추가 = 이 파일에 항목 1개) |
| `src/lib/audit/queries.ts` (수정) | 매칭·지역 치환 **로직만** 남긴다 |
| `src/lib/audit/custom-queries.ts` (신규) | LLM 후보 생성 + `validateCustomQueries` (순수 검증) |
| `src/lib/audit/execute.ts` (수정) | tier·region·frozenQueries 지원 |
| `src/lib/audit/repository.ts` (수정) | 새 컬럼 인자 · `freezeQueries` · `saveGuide` · `createRemeasure` |
| `src/lib/db/schema.ts` (수정) | `free_audits`에 tier·region·queries·guide_md·parent_id |
| `src/lib/email/templates.ts` (수정) | 리포트 메일 티어 인식 문구 |
| `src/lib/audit/result.ts` (수정) | `evidenceMax` 인자 (유료는 증거 6개) |
| `src/components/audit/result-view.tsx` (수정) | 유료 확장 + 가이드 + 전후 비교 |
| `src/components/audit/report-cover.tsx` (신규) | 인쇄 전용 표지 |
| `src/app/audit/[id]/page.tsx` (수정) | guide·compare·tier 전달 |
| `scripts/audit-new.mts` (수정) | `--tier` `--region` |
| `scripts/audit-queries.mts` (신규) | 후보 생성 / `--freeze` |
| `scripts/audit-remeasure.mts` (신규) | PREMIUM 재측정 등록 |
| `scripts/audit-pdf.mts` (신규) | PDF 추출 |
| `scripts/audit-run.mts` `audit-list.mts` (수정) | 동결 질의·티어 반영 |
| `docs/kmong/listing.md` (신규) | 크몽 상품 문안 |
| `docs/superpowers/notes/delivery-checklist.md` (신규) | 배송 체크리스트 |

---

### Task 1: AUDIT_TIERS 상수와 스키마 확장

**Files:**
- Create: `src/lib/audit/tiers.ts`, `src/lib/audit/tiers.test.ts`
- Modify: `src/lib/db/schema.ts` (freeAudits 테이블, 445행 부근)
- Modify: `src/lib/audit/repository.ts:37-100` (CreateAuditArgs·createVerifiedAudit)

**Interfaces:**
- Produces: `AUDIT_TIERS: Record<AuditTier, {queryCount, samplesPerEngine, label}>`,
  `type AuditTier = 'free'|'standard'|'deluxe'|'premium'`,
  `PAID_TIERS: readonly AuditTier[]`,
  `FreeAudit`에 `tier`·`region`·`queries`·`guideMd`·`parentId` 필드,
  `CreateAuditArgs`에 `tier?`·`region?`·`parentId?` (repository)

- [ ] **Step 1: tiers 실패 테스트**

`src/lib/audit/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AUDIT_TIERS, PAID_TIERS, isPaidTier } from '@/lib/audit/tiers'
import { AUDIT_QUERY_COUNT } from '@/lib/audit/queries'
import { PLANS } from '@/lib/plans'

describe('AUDIT_TIERS', () => {
  it('free는 기존 무료 진단과 정확히 같다 — 바꾸면 무료 상품이 조용히 바뀐다', () => {
    expect(AUDIT_TIERS.free.queryCount).toBe(AUDIT_QUERY_COUNT)
    expect(AUDIT_TIERS.free.samplesPerEngine).toBe(PLANS.free.samples.llm)
  })

  it('유료 3티어는 전부 10질의 × 3회다 (크몽 상품 약속)', () => {
    for (const tier of PAID_TIERS) {
      expect(AUDIT_TIERS[tier].queryCount, tier).toBe(10)
      expect(AUDIT_TIERS[tier].samplesPerEngine, tier).toBe(3)
    }
  })

  it('유료 판별이 정확하다', () => {
    expect(isPaidTier('free')).toBe(false)
    expect(isPaidTier('standard')).toBe(true)
    expect(isPaidTier('deluxe')).toBe(true)
    expect(isPaidTier('premium')).toBe(true)
  })

  it('티어마다 사람이 읽는 라벨이 있다 (CLI·리포트 표기용)', () => {
    for (const cfg of Object.values(AUDIT_TIERS)) {
      expect(cfg.label.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/lib/audit/tiers.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: tiers.ts 구현**

```ts
/**
 * 진단(1회성 상품) 티어. **구독 플랜(`plans.ts`의 PLANS)과 섞지 않는다** —
 * 진단은 크몽에서 파는 단건 상품이고, 플랜은 월 구독이다. 여기 숫자를
 * PLANS에 넣으면 요금제 화면과 한도 검증이 진단 티어를 구독으로 오해한다.
 *
 * 가격은 크몽 등록 화면에 있다(스펙 참고: 49,000 / 99,000 / 189,000).
 * 코드에는 넣지 않는다 — 결제가 크몽에서 일어나므로 코드가 참조할 곳이 없고,
 * 여기 적으면 크몽에서 가격을 바꿀 때마다 배포해야 한다.
 */
export const AUDIT_TIERS = {
  free: { queryCount: 3, samplesPerEngine: 1, label: '무료 진단' },
  standard: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단' },
  deluxe: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 개선 가이드' },
  premium: { queryCount: 10, samplesPerEngine: 3, label: '정밀 진단 + 전후 비교' },
} as const

export type AuditTier = keyof typeof AUDIT_TIERS

export const AUDIT_TIER_IDS = Object.keys(AUDIT_TIERS) as AuditTier[]
export const PAID_TIERS = AUDIT_TIER_IDS.filter((t) => t !== 'free')

export function isPaidTier(tier: AuditTier): boolean {
  return tier !== 'free'
}
```

`AUDIT_QUERY_COUNT`는 `queries.ts`에 이미 있다(값 3).

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS

- [ ] **Step 5: 스키마 컬럼 추가**

`src/lib/db/schema.ts`의 `freeAudits` 테이블, `aliases` 컬럼 아래에 추가.
파일 상단에 `import type { AuditTier } from '@/lib/audit/tiers'`를 더한다
(tiers.ts는 순수 상수라 순환이 없다).

```ts
    /**
     * 진단 티어. 크몽 유료 상품은 'standard'|'deluxe'|'premium'.
     * ★ 구독 플랜이 아니다 — `AUDIT_TIERS` 참고.
     */
    tier: text('tier').$type<AuditTier>().notNull().default('free'),
    /** 지역형 업종의 지역 (예: '강남'). 전국형은 null. CLI로만 들어온다 */
    region: text('region'),
    /**
     * 동결된 질의 목록. **null이면 템플릿에서 생성**(기존 무료 동작).
     * 유료 티어는 실행 전에 반드시 채워져야 한다 — 순서까지 상품의 일부다.
     * 재측정(전후 비교)이 이 배열을 그대로 다시 던지므로, 동결 후에는
     * 절대 수정하지 않는다.
     */
    queries: jsonb('queries').$type<string[]>(),
    /** 운영자가 쓰는 개선 가이드(마크다운). DELUXE부터. 리포트 화면이 렌더한다 */
    guideMd: text('guide_md'),
    /**
     * PREMIUM 재측정이 가리키는 원본 진단. 전후 비교 화면이 이 연결로
     * 원본 결과를 불러온다.
     */
    parentId: text('parent_id'),
```

테이블의 체크 제약 배열(`enumCheck('free_audits_source_check', ...)` 옆)에 추가:

```ts
    enumCheck('free_audits_tier_check', t.tier, AUDIT_TIER_IDS),
```

(`AUDIT_TIER_IDS`는 값 import: `import { AUDIT_TIER_IDS } from '@/lib/audit/tiers'` —
type-only import와 합쳐 `import { AUDIT_TIER_IDS, type AuditTier } from ...`)

- [ ] **Step 6: 스키마 테스트 확장**

`src/lib/db/schema.test.ts`의 기존 `free_audits` describe에 추가 (기존 테스트가
`getTableConfig(schema.freeAudits)` 패턴을 쓴다 — 그 패턴을 그대로 따른다):

```ts
  it('tier는 기본값 free에 enum check가 걸려 있다', () => {
    const config = getTableConfig(schema.freeAudits)
    const tier = config.columns.find((c) => c.name === 'tier')
    expect(tier?.notNull).toBe(true)
    expect(tier?.default).toBeDefined()
    expect(config.checks.some((c) => c.name === 'free_audits_tier_check')).toBe(true)
  })

  it('queries·guide_md·parent_id·region은 nullable이다 — 무료 진단은 채우지 않는다', () => {
    const config = getTableConfig(schema.freeAudits)
    for (const name of ['queries', 'guide_md', 'parent_id', 'region']) {
      const col = config.columns.find((c) => c.name === name)
      expect(col, name).toBeDefined()
      expect(col?.notNull, name).toBe(false)
    }
  })
```

- [ ] **Step 7: 마이그레이션 생성** — `pnpm db:generate` → drizzle/에 새 SQL 확인.
      `pnpm db:migrate`로 로컬(Neon) 적용

- [ ] **Step 8: repository 인자 확장**

`CreateAuditArgs`에 추가:

```ts
  /** 진단 티어. 웹 폼 경로는 항상 'free' — 유료는 CLI(`audit:new`)로만 만든다 */
  tier?: AuditTier
  /** 지역형 업종의 지역. `audit:new --region` */
  region?: string | null
  /** PREMIUM 재측정의 원본. `audit:remeasure`만 채운다 */
  parentId?: string | null
```

`createAuditRequest`(웹 폼 경로)는 스프레드 전에 유료 유입을 차단한다:

```ts
  // ★ 웹 폼으로 유료 티어가 들어오면 안 된다. 결제는 크몽에서 일어나고,
  //   폼은 tier를 보내지 않는다 — 보냈다면 조작된 요청이다.
  if (args.tier && args.tier !== 'free') {
    throw new Error(`웹 신청은 무료 진단만 가능합니다 (tier=${args.tier})`)
  }
```

import에 `type AuditTier` 추가. `createVerifiedAudit`은 스프레드가 이미
전달하므로 수정 불필요.

- [ ] **Step 9: 전체 확인** — `pnpm test` PASS · `pnpm typecheck` PASS

- [ ] **Step 10: 커밋**

```bash
git add src/lib/audit/tiers.ts src/lib/audit/tiers.test.ts src/lib/db/schema.ts src/lib/db/schema.test.ts src/lib/audit/repository.ts drizzle
git commit -m "feat(kmong): 진단 티어와 스키마 확장 (tier·region·queries·guideMd·parentId)"
```

---

### Task 2: 업종 템플릿 25개 (지역 슬롯 포함)

**Files:**
- Create: `src/lib/audit/query-templates.ts`
- Modify: `src/lib/audit/queries.ts` (TEMPLATES 이동, region 인자)
- Modify: `src/lib/audit/queries.test.ts` (지역·템플릿 규칙 테스트 추가)
- Modify: `src/lib/audit/execute.ts:78` (region 전달 — 시그니처만, 티어는 Task 4)

**Interfaces:**
- Consumes: 없음 (순수 데이터)
- Produces: `QUERY_TEMPLATES: readonly CategoryTemplate[]` (regional 필드 포함),
  `generateAuditQueries(category, brandName, region?)`,
  `isRegionalCategory(category): boolean`, `REGION_SLOT = '{지역}'`

- [ ] **Step 1: 템플릿 규칙 테스트 추가**

`src/lib/audit/queries.test.ts`에 describe 추가:

```ts
import { QUERY_TEMPLATES, REGION_SLOT } from '@/lib/audit/query-templates'
import { isRegionalCategory } from '@/lib/audit/queries'

describe('QUERY_TEMPLATES — 새 업종이 추가될 때마다 자동으로 검사한다', () => {
  it('모든 업종이 정확히 질의 3개를 가진다', () => {
    for (const t of QUERY_TEMPLATES) {
      expect(t.queries.length, t.label).toBe(3)
    }
  })

  it('별칭이 업종 간에 겹치지 않는다 — 겹치면 앞 업종이 조용히 가로챈다', () => {
    const seen = new Map<string, string>()
    for (const t of QUERY_TEMPLATES) {
      for (const alias of t.aliases) {
        expect(seen.has(alias), `'${alias}' — ${seen.get(alias)} vs ${t.label}`).toBe(false)
        seen.set(alias, t.label)
      }
    }
  })

  it('지역형은 모든 질의에, 전국형은 어느 질의에도 {지역}이 없다', () => {
    // regional 플래그와 실제 질의가 어긋나면: 지역형인데 슬롯 없는 질의는
    // 지역 없이도 성립하는 척하고, 전국형에 슬롯이 남으면 '{지역}'이
    // 문자 그대로 AI에게 전송된다.
    for (const t of QUERY_TEMPLATES) {
      for (const q of t.queries) {
        expect(q.includes(REGION_SLOT), `${t.label}: ${q}`).toBe(t.regional)
      }
    }
  })

  it('업종 25개 이상이다 (크몽 커버리지)', () => {
    expect(QUERY_TEMPLATES.length).toBeGreaterThanOrEqual(25)
  })
})

describe('generateAuditQueries — 지역', () => {
  it('지역형 업종은 지역 없이 던진다 — 조용한 강등 금지', () => {
    expect(() => generateAuditQueries('치과', '어느치과')).toThrowError(/지역/)
  })

  it('지역형 업종에 지역을 주면 모든 질의에 지역이 들어간다', () => {
    const out = generateAuditQueries('치과', '어느치과', '수원')
    expect(out).toHaveLength(3)
    for (const q of out) {
      expect(q).toContain('수원')
      expect(q).not.toContain(REGION_SLOT)
    }
  })

  it('전국형 업종은 지역을 무시한다', () => {
    expect(generateAuditQueries('패션', 'x', '수원')).toEqual(
      generateAuditQueries('패션', 'x'),
    )
  })

  it('모르는 업종 + 지역이면 일반형 질의에 지역을 붙인다', () => {
    const out = generateAuditQueries('네일아트 클래스', 'x', '수원')
    for (const q of out) expect(q).toContain('수원')
  })

  it('isRegionalCategory가 템플릿의 regional을 그대로 따른다', () => {
    expect(isRegionalCategory('치과')).toBe(true)
    expect(isRegionalCategory('패션')).toBe(false)
    expect(isRegionalCategory('처음 보는 업종')).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인** — `pnpm vitest run src/lib/audit/queries.test.ts` → FAIL

- [ ] **Step 3: query-templates.ts 작성 (25업종 전문)**

기존 5개는 `queries.ts`에서 **그대로 옮긴다** — 질의를 바꾸면 이미 발송된
무료 진단과 비교가 깨진다. 단 하나 예외: **교육의 별칭에서 `학원`을 뺀다**
(신규 지역형 '학원'과 겹쳐서 가로채기가 생긴다 — 별칭 중복 테스트가 잡는
바로 그 문제).

```ts
/**
 * 업종별 질의 템플릿 — **데이터만.** 로직은 `queries.ts`에 있다.
 *
 * ## 새 업종 추가 방법 (10분 작업이 되도록 유지할 것)
 *
 * 1. 아래 배열에 항목 하나 추가 — label·aliases·regional·queries 3개
 * 2. `pnpm vitest run src/lib/audit/queries.test.ts` — 규칙 테스트가
 *    질의 수·별칭 중복·지역 슬롯 일관성을 자동 검사한다
 * 3. 끝. 다른 파일은 손대지 않는다
 *
 * ## 질의 작성 규칙
 *
 * - 브랜드명·업체명을 넣지 않는다 (queries.test.ts가 검증)
 * - 실제 소비자가 AI에게 묻는 말투 (존댓말 아님, "추천해줘"체)
 * - 지역형(regional: true)은 **세 질의 모두** `{지역}` 슬롯을 갖는다
 * - 한 번 배포한 질의는 바꾸지 않는다 — 재실행 비교가 깨진다.
 *   부족하면 업종을 새로 만든다 (예: '학원'과 별개로 '영어유치원')
 *
 * ## 순서가 매칭 우선순위다
 *
 * 매칭이 부분 일치(includes)라 입력 "필라테스 학원"은 '필라테스'와 '학원'
 * 둘 다 걸린다. **더 구체적인 업종을 앞에 둔다.**
 */

export const REGION_SLOT = '{지역}'

export interface CategoryTemplate {
  /** 폼·CLI에서 고르는 이름 */
  label: string
  /** 이 업종으로 인정할 입력 (부분 일치) */
  aliases: string[]
  /** true면 모든 질의에 {지역} 슬롯이 있고, 지역 없이는 실행을 거부한다 */
  regional: boolean
  queries: readonly [string, string, string]
}

export const QUERY_TEMPLATES: readonly CategoryTemplate[] = [
  // ── 전국형 (기존 5 — 질의 변경 금지) ──────────────────────
  {
    label: '패션',
    aliases: ['패션', '의류', '옷', '쇼핑몰'],
    regional: false,
    queries: [
      '30대 남자 옷 어디서 사는 게 좋아?',
      '가성비 좋은 온라인 패션 쇼핑몰 추천해줘',
      '요즘 인기 있는 국내 패션 브랜드 알려줘',
    ],
  },
  {
    label: '화장품',
    aliases: ['화장품', '뷰티', '스킨케어', '코스메틱', '기초화장품'],
    regional: false,
    queries: [
      '건성 피부에 맞는 수분크림 추천해줘',
      '가성비 좋은 국내 스킨케어 브랜드 뭐가 있어?',
      '올리브영에서 잘 팔리는 화장품 알려줘',
    ],
  },
  {
    label: '식품',
    aliases: ['식품', '음식', '먹거리', '간편식', '밀키트'],
    regional: false,
    queries: [
      '간편하게 먹을 수 있는 밀키트 추천해줘',
      '선물하기 좋은 국내 식품 브랜드 알려줘',
      '요즘 인기 있는 건강식품 뭐가 있어?',
    ],
  },
  {
    label: '가전',
    aliases: ['가전', '전자제품', '전자기기', '디지털'],
    regional: false,
    queries: [
      '자취방에 놓기 좋은 소형가전 추천해줘',
      '가성비 좋은 무선 이어폰 뭐가 있어?',
      '요즘 잘 나가는 국내 가전 브랜드 알려줘',
    ],
  },
  {
    // ★ 별칭에서 '학원'을 뺐다(2026-07-31) — 지역형 '학원' 업종과 겹친다.
    //   교육 = 전국 단위 온라인 교육 서비스. 동네 학원은 지역형 '학원'으로.
    label: '교육',
    aliases: ['교육', '강의', '인강', '온라인 강의', '이러닝'],
    regional: false,
    queries: [
      '온라인으로 코딩 배우려면 어디가 좋아?',
      '직장인이 듣기 좋은 온라인 강의 플랫폼 추천해줘',
      '국내 이러닝 서비스 뭐가 있어?',
    ],
  },
  // ── 전국형 (신규 5) ──────────────────────────────────────
  {
    label: '이커머스',
    aliases: ['이커머스', '오픈마켓', '쇼핑 앱', '온라인 쇼핑'],
    regional: false,
    queries: [
      '온라인 쇼핑 어디서 하는 게 제일 나아?',
      '가성비 좋은 쇼핑 앱 추천해줘',
      '배송 빠른 온라인 쇼핑몰 어디야?',
    ],
  },
  {
    label: '앱 서비스',
    aliases: ['앱', '어플', '어플리케이션', '모바일 서비스'],
    regional: false,
    queries: [
      '요즘 사람들이 많이 쓰는 앱 뭐야?',
      '유료로 써도 아깝지 않은 앱 추천해줘',
      '새로 나온 앱 중에 괜찮은 거 있어?',
    ],
  },
  {
    label: '여행·숙박',
    aliases: ['여행', '숙박', '호텔', '펜션', '리조트', '항공권'],
    regional: false,
    queries: [
      '국내 여행 숙소 예약 어디서 해?',
      '호텔 싸게 예약하는 방법 알려줘',
      '휴가 때 갈 만한 국내 숙소 추천해줘',
    ],
  },
  {
    label: '금융',
    aliases: ['금융', '핀테크', '재테크', '송금', '투자'],
    regional: false,
    queries: [
      '돈 관리 도와주는 서비스 뭐가 있어?',
      '수수료 낮은 송금 방법 알려줘',
      '초보자가 쓰기 좋은 투자 앱 추천해줘',
    ],
  },
  {
    label: '프랜차이즈',
    aliases: ['프랜차이즈', '창업', '가맹점', '가맹'],
    regional: false,
    queries: [
      '요즘 창업하기 괜찮은 프랜차이즈 뭐야?',
      '소자본으로 시작할 수 있는 프랜차이즈 추천해줘',
      '프랜차이즈 창업 인기 브랜드 알려줘',
    ],
  },
  // ── 지역형 (신규 15) — 구체적인 업종을 앞에 ────────────────
  {
    label: '치과',
    aliases: ['치과', '임플란트', '치아교정'],
    regional: true,
    queries: [
      '{지역} 치과 어디가 좋아?',
      '{지역}에서 임플란트 잘하는 치과 추천해줘',
      '{지역} 교정 잘하는 치과 알려줘',
    ],
  },
  {
    label: '피부과·성형',
    aliases: ['피부과', '성형외과', '피부 시술', '레이저'],
    regional: true,
    queries: [
      '{지역} 피부과 어디가 잘해?',
      '{지역}에서 피부 시술 받을 만한 곳 추천해줘',
      '{지역} 성형외과 유명한 데 알려줘',
    ],
  },
  {
    label: '한의원',
    aliases: ['한의원', '한방병원', '추나', '침 치료'],
    regional: true,
    queries: [
      '{지역} 한의원 어디가 좋아?',
      '{지역}에서 추나 잘하는 한의원 추천해줘',
      '{지역} 교통사고 한의원 알려줘',
    ],
  },
  {
    label: '동물병원',
    aliases: ['동물병원', '수의사', '반려동물 병원'],
    regional: true,
    queries: [
      '{지역} 동물병원 어디가 좋아?',
      '{지역}에서 강아지 진료 잘 보는 동물병원 추천해줘',
      '{지역} 24시 동물병원 알려줘',
    ],
  },
  {
    label: '필라테스·요가',
    aliases: ['필라테스', '요가'],
    regional: true,
    queries: [
      '{지역} 필라테스 어디가 좋아?',
      '{지역}에서 기구 필라테스 배울 만한 곳 추천해줘',
      '{지역} 요가원 괜찮은 데 알려줘',
    ],
  },
  {
    label: '헬스장',
    aliases: ['헬스장', '헬스클럽', 'PT', '피트니스'],
    regional: true,
    queries: [
      '{지역} 헬스장 어디가 좋아?',
      '{지역}에서 PT 잘하는 곳 추천해줘',
      '{지역} 가성비 좋은 헬스장 알려줘',
    ],
  },
  {
    label: '미용실·네일',
    aliases: ['미용실', '헤어샵', '네일샵', '네일', '헤어'],
    regional: true,
    queries: [
      '{지역} 미용실 어디가 잘해?',
      '{지역}에서 염색 잘하는 미용실 추천해줘',
      '{지역} 네일샵 괜찮은 데 알려줘',
    ],
  },
  {
    label: '학원',
    aliases: ['학원', '입시학원', '보습학원', '과외'],
    regional: true,
    queries: [
      '{지역} 수학 학원 어디가 좋아?',
      '{지역}에서 영어 잘 가르치는 학원 추천해줘',
      '{지역} 고등학생 입시 학원 알려줘',
    ],
  },
  {
    label: '변호사',
    aliases: ['변호사', '법률사무소', '로펌', '법무법인'],
    regional: true,
    queries: [
      '{지역} 변호사 어디가 좋아?',
      '{지역}에서 이혼 전문 변호사 추천해줘',
      '{지역} 형사 사건 잘하는 변호사 알려줘',
    ],
  },
  {
    label: '세무사',
    aliases: ['세무사', '세무사무소', '기장', '회계사무소'],
    regional: true,
    queries: [
      '{지역} 세무사 어디가 좋아?',
      '{지역}에서 기장 맡길 세무사 추천해줘',
      '{지역} 종합소득세 상담 잘하는 세무사 알려줘',
    ],
  },
  {
    label: '인테리어',
    aliases: ['인테리어', '리모델링', '집수리'],
    regional: true,
    queries: [
      '{지역} 인테리어 업체 어디가 잘해?',
      '{지역}에서 아파트 리모델링 잘하는 곳 추천해줘',
      '{지역} 가성비 좋은 인테리어 업체 알려줘',
    ],
  },
  {
    label: '이사·청소',
    aliases: ['이사', '이삿짐', '청소업체', '입주청소', '포장이사'],
    regional: true,
    queries: [
      '{지역} 이삿짐센터 어디가 괜찮아?',
      '{지역}에서 입주청소 잘하는 업체 추천해줘',
      '{지역} 포장이사 싸고 잘하는 곳 알려줘',
    ],
  },
  {
    label: '식당·카페',
    aliases: ['식당', '맛집', '카페', '레스토랑', '브런치'],
    regional: true,
    queries: [
      '{지역} 맛집 어디야?',
      '{지역}에서 분위기 좋은 카페 추천해줘',
      '{지역} 회식하기 좋은 식당 알려줘',
    ],
  },
  {
    label: '웨딩',
    aliases: ['웨딩', '웨딩홀', '스드메', '결혼식장', '웨딩스튜디오'],
    regional: true,
    queries: [
      '{지역} 웨딩홀 어디가 좋아?',
      '{지역}에서 스드메 잘하는 곳 추천해줘',
      '{지역} 결혼식장 가성비 좋은 데 알려줘',
    ],
  },
  {
    label: '부동산',
    aliases: ['부동산', '공인중개사', '부동산 중개'],
    regional: true,
    queries: [
      '{지역} 부동산 어디가 믿을 만해?',
      '{지역}에서 전세 매물 잘 찾아주는 부동산 추천해줘',
      '{지역} 아파트 매매 상담 잘하는 공인중개사 알려줘',
    ],
  },
]
```

- [ ] **Step 4: queries.ts를 로직만 남기게 수정**

`TEMPLATES` 배열과 `CategoryTemplate` 인터페이스를 지우고 데이터 파일에서
가져온다. 파일 상단 주석(브랜드명 금지·결정성·방침 마커)은 **그대로 둔다.**

```ts
import { QUERY_TEMPLATES, REGION_SLOT } from '@/lib/audit/query-templates'

export const AUDIT_QUERY_COUNT = 3

export const KNOWN_CATEGORIES: readonly string[] = QUERY_TEMPLATES.map((t) => t.label)

function matchTemplate(category: string) {
  const trimmed = category.trim()
  return QUERY_TEMPLATES.find((t) => t.aliases.some((a) => trimmed.includes(a)))
}

/** 지역형 업종인가. CLI가 `--region` 필수 여부를 판단할 때 쓴다 */
export function isRegionalCategory(category: string): boolean {
  return matchTemplate(category)?.regional ?? false
}

/**
 * @param category 고객이 고르거나 입력한 카테고리
 * @param brandName 브랜드명. **질의에는 넣지 않는다.**
 * @param region 지역형 업종의 지역. 지역형인데 없으면 던진다 —
 *   조용히 일반형으로 강등하면 무의미한 측정이 고객에게 배송된다.
 */
export function generateAuditQueries(
  category: string,
  brandName: string,
  region?: string,
): string[] {
  void brandName
  const trimmed = category.trim()
  if (!trimmed) throw new Error('카테고리가 비어 있습니다')
  const cleanRegion = region?.trim() ?? ''

  const matched = matchTemplate(trimmed)
  if (matched) {
    if (matched.regional) {
      if (!cleanRegion) {
        throw new Error(
          `'${matched.label}'은(는) 지역이 필요한 업종입니다. --region으로 지역을 넣으세요` +
            ' (예: --region "강남"). 지역 없이 물으면 AI가 "어디 사세요?"부터 묻습니다.',
        )
      }
      return matched.queries.map((q) => q.replaceAll(REGION_SLOT, cleanRegion))
    }
    // 전국형은 지역을 무시한다 — 붙이면 전국 브랜드 질문이 지역 질문으로 변질된다.
    return [...matched.queries]
  }

  // 모르는 카테고리 — 입력을 그대로 넣어 일반형 질의를 만든다.
  // 지역이 있으면 붙인다(로컬 업종일 가능성이 높아서 왔을 것이다).
  const subject = cleanRegion ? `${cleanRegion} ${trimmed}` : trimmed
  return [
    `${subject} 추천해줘`,
    `가성비 좋은 ${subject} 브랜드 뭐가 있어?`,
    `요즘 인기 있는 ${subject} 알려줘`,
  ]
}
```

주의: 기존 테스트 중 `'학원'` 입력이 교육으로 매칭되길 기대하는 것이 있으면
지역형 학원 기대로 **바꾼다** (별칭 이동이 의도된 변경이므로).

- [ ] **Step 5: 통과 확인** — `pnpm vitest run src/lib/audit/queries.test.ts` PASS,
      이어서 `pnpm test` 전체 PASS (queries를 쓰는 다른 테스트 회귀 확인)

- [ ] **Step 6: 변이 3건**

각각 적용 → 테스트 실패 확인 → 복구 (`diff -q`로 비변이 감지):

1. `치과` 템플릿의 두 번째 질의에서 `{지역}` 삭제 → 슬롯 일관성 테스트 죽어야 함
2. `generateAuditQueries`의 지역형 throw 제거 → 지역 필수 테스트 죽어야 함
3. `replaceAll` → `replace` → "모든 질의에 지역" 테스트가 죽는지 확인
   (한 질의에 슬롯이 2개인 항목이 없으면 이 변이가 살아남는다 — 그 경우
   슬롯 2개짜리 질의를 테스트 픽스처로 추가해 죽인다)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/audit/query-templates.ts src/lib/audit/queries.ts src/lib/audit/queries.test.ts
git commit -m "feat(kmong): 업종 템플릿 25개 — 지역형 15개는 {지역} 슬롯 필수"
```

---

### Task 3: 맞춤 질의 — 생성·검증·동결 (순수 부분)

**Files:**
- Create: `src/lib/audit/custom-queries.ts`, `src/lib/audit/custom-queries.test.ts`
- Modify: `src/lib/audit/repository.ts` (freezeQueries·saveGuide 추가)

**Interfaces:**
- Consumes: `AUDIT_TIERS` (Task 1), `generateAuditQueries` (Task 2),
  aliases.ts의 Anthropic client 주입 패턴
- Produces:
  `validateCustomQueries(queries, ctx): string[]` (정상화된 배열 반환, 실패 시 throw),
  `createCustomQueryGenerator(opts): (args) => Promise<string[]>`,
  `freezeQueries(auditId, queries): Promise<void>`,
  `saveGuide(auditId, guideMd): Promise<void>`

- [ ] **Step 1: 검증 실패 테스트**

`src/lib/audit/custom-queries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateCustomQueries } from '@/lib/audit/custom-queries'

const ctx = {
  brandName: '바디텍필라테스',
  competitors: ['코어무브'],
  regional: true,
  region: '수원',
  requiredCount: 10,
}

const template3 = [
  '수원 필라테스 어디가 좋아?',
  '수원에서 기구 필라테스 배울 만한 곳 추천해줘',
  '수원 요가원 괜찮은 데 알려줘',
]

const custom7 = [
  '수원 필라테스 그룹레슨 가격 어느 정도야?',
  '수원 필라테스 1:1 레슨 어디가 괜찮아?',
  '기구 필라테스랑 매트 필라테스 차이가 뭐야?',
  '수원 산후조리 필라테스 추천해줘',
  '수원역 근처 필라테스 알려줘',
  '필라테스 처음 시작할 때 뭘 봐야 해?',
  '수원 필라테스 체험 수업 있는 곳 어디야?',
]

describe('validateCustomQueries', () => {
  it('템플릿 3 + 맞춤 7 = 10개를 통과시킨다', () => {
    expect(validateCustomQueries([...template3, ...custom7], ctx)).toHaveLength(10)
  })

  it('브랜드명이 든 질의를 거부한다 — 이름을 대면 측정이 무효다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '바디텍필라테스 어때?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/브랜드명/)
  })

  it('브랜드명 대소문자·공백 변형도 거부한다', () => {
    const englishCtx = { ...ctx, brandName: 'BodyTec' }
    const bad = [...template3, ...custom7.slice(0, 6), 'bodytec 후기 어때?']
    expect(() => validateCustomQueries(bad, englishCtx)).toThrowError(/브랜드명/)
  })

  it('경쟁사명이 든 질의를 거부한다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '코어무브랑 비교하면 어디가 나아?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/경쟁사/)
  })

  it('개수가 다르면 거부한다', () => {
    expect(() => validateCustomQueries(template3, ctx)).toThrowError(/10개/)
  })

  it('중복 질의를 거부한다', () => {
    const dup = [...template3, ...custom7.slice(0, 6), template3[0] as string]
    expect(() => validateCustomQueries(dup, ctx)).toThrowError(/중복/)
  })

  it('빈 줄·공백만인 질의를 거부한다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '   ']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/비어/)
  })

  it('지역형인데 지역이 하나도 없는 맞춤 질의가 과반이면 경고가 아니라 통과다', () => {
    // 일부 질의는 지역 없이도 성립한다("기구 필라테스랑 매트 차이") —
    // 전부 막으면 좋은 질의를 못 쓴다. 지역 강제는 **템플릿 3개**가 맡는다.
    expect(() => validateCustomQueries([...template3, ...custom7], ctx)).not.toThrow()
  })

  it('앞뒤 공백을 정돈해 돌려준다', () => {
    const padded = [...template3, ...custom7.slice(0, 6), `  ${custom7[6] as string}  `]
    const out = validateCustomQueries(padded, ctx)
    expect(out[9]).toBe(custom7[6])
  })

  it('{지역} 슬롯이 남아 있으면 거부한다 — 치환 안 된 채 AI에 가면 안 된다', () => {
    const bad = [...template3, ...custom7.slice(0, 6), '{지역} 필라테스 몇 시까지 해?']
    expect(() => validateCustomQueries(bad, ctx)).toThrowError(/지역.*슬롯|슬롯/)
  })
})
```

- [ ] **Step 2: 실패 확인** — FAIL (모듈 없음)

- [ ] **Step 3: 검증 구현**

`src/lib/audit/custom-queries.ts` — 검증 파트:

```ts
import { REGION_SLOT } from '@/lib/audit/query-templates'

/**
 * 맞춤 질의(정밀 진단)의 생성과 검증.
 *
 * 흐름: 주문 → LLM이 후보 7개 생성 → 운영자가 파일로 검수·수정 →
 * `validateCustomQueries` 통과 → DB 동결(`freezeQueries`) → 영구 사용.
 *
 * ★ 검증은 검수자 눈이 아니라 이 함수가 최종 책임진다. 브랜드명이 질의에
 *   들어가면 "이름을 댔더니 나온 답"을 측정하는 것이라 상품 전체가 무효다 —
 *   `queries.ts` 상단 주석과 같은 원칙이고, 개인정보처리방침 §1·§7·§8의
 *   고지("OpenAI·Google에 브랜드명을 전송하지 않는다")도 이 함수가 지킨다.
 */

export interface CustomQueryContext {
  brandName: string
  competitors: readonly string[]
  regional: boolean
  region?: string
  /** AUDIT_TIERS[tier].queryCount */
  requiredCount: number
}

function norm(value: string): string {
  return value.replaceAll(/\s+/g, '').toLowerCase()
}

export function validateCustomQueries(
  queries: readonly string[],
  ctx: CustomQueryContext,
): string[] {
  const cleaned = queries.map((q) => q.trim())

  for (const q of cleaned) {
    if (q.length === 0) throw new Error('비어 있는 질의가 있습니다')
    if (q.includes(REGION_SLOT)) {
      throw new Error(`치환되지 않은 지역 슬롯이 남아 있습니다: "${q}"`)
    }
  }

  if (cleaned.length !== ctx.requiredCount) {
    throw new Error(`질의는 정확히 ${ctx.requiredCount}개여야 합니다 (지금 ${cleaned.length}개)`)
  }

  const seen = new Set<string>()
  for (const q of cleaned) {
    const key = norm(q)
    if (seen.has(key)) throw new Error(`중복 질의: "${q}"`)
    seen.add(key)
  }

  // ★ 공백·대소문자를 뭉개고 비교한다. "바디텍 필라테스"와 "바디텍필라테스"는
  //   같은 브랜드다. 부분 일치라 짧은 브랜드명(예: '온')은 오탐할 수 있는데,
  //   오탐은 운영자가 질의를 고치면 되지만 미탐은 무효 측정이 고객에게 간다 —
  //   보수적인 쪽이 맞다.
  const brandKey = norm(ctx.brandName)
  for (const q of cleaned) {
    if (brandKey.length > 0 && norm(q).includes(brandKey)) {
      throw new Error(`질의에 브랜드명이 들어 있습니다: "${q}" — 이름을 대면 측정이 무효입니다`)
    }
    for (const comp of ctx.competitors) {
      const compKey = norm(comp)
      if (compKey.length > 0 && norm(q).includes(compKey)) {
        throw new Error(`질의에 경쟁사명(${comp})이 들어 있습니다: "${q}"`)
      }
    }
  }

  return cleaned
}
```

- [ ] **Step 4: 검증 테스트 통과 확인**

- [ ] **Step 5: 생성기 테스트 (parse 주입)**

같은 테스트 파일에 추가:

```ts
import { createCustomQueryGenerator } from '@/lib/audit/custom-queries'

describe('createCustomQueryGenerator', () => {
  const args = {
    brandName: '바디텍필라테스',
    category: '필라테스',
    region: '수원',
    brief: '기구 필라테스 전문, 그룹·개인 레슨',
    competitors: ['코어무브'],
    count: 7,
  }

  it('parse가 돌려준 후보를 그대로 전달한다', async () => {
    const generate = createCustomQueryGenerator({
      parse: async () => ({ queries: custom7 }),
    })
    await expect(generate(args)).resolves.toEqual(custom7)
  })

  it('프롬프트에 브랜드명을 넣지 않는다 — 생성 모델이 이름을 질의에 섞는 것을 원천 차단', async () => {
    let captured = ''
    const generate = createCustomQueryGenerator({
      parse: async (prompt) => {
        captured = prompt
        return { queries: custom7 }
      },
    })
    await generate(args)
    expect(captured).not.toContain('바디텍필라테스')
    expect(captured).not.toContain('코어무브')
    expect(captured).toContain('필라테스')
    expect(captured).toContain('수원')
    expect(captured).toContain('기구 필라테스 전문')
  })

  it('생성 실패는 그대로 던진다 — 조용히 빈 배열을 주면 검수 없이 부족한 채 동결된다', async () => {
    const generate = createCustomQueryGenerator({
      parse: async () => {
        throw new Error('api down')
      },
    })
    await expect(generate(args)).rejects.toThrow('api down')
  })
})
```

- [ ] **Step 6: 생성기 구현**

`custom-queries.ts`에 추가. `aliases.ts`의 클라이언트 패턴(공유 인스턴스,
`client` 주입, `messages.parse` + `zodOutputFormat`)을 그대로 따른다:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { env } from '@/lib/env'

/** 별칭 생성과 같은 모델·같은 이유(싸고 충분) — aliases.ts 참고 */
export const CUSTOM_QUERY_MODEL = 'claude-haiku-4-5'

const responseSchema = z.object({ queries: z.array(z.string()) })

const SYSTEM_PROMPT = `한국 소비자가 AI 챗봇에게 실제로 묻는 말투의 질문을 만듭니다.

규칙:
- 특정 업체명·브랜드명·상호를 절대 넣지 마세요. 업종과 상황만으로 묻습니다.
- "~추천해줘", "~어디가 좋아?", "~차이가 뭐야?" 같은 반말 소비자 말투.
- 서로 겹치지 않는 다양한 의도: 가격, 비교, 초보 질문, 위치, 상황별(선물·처음·급함).
- 지역이 주어지면 대부분의 질문에 자연스럽게 지역을 넣되, 지역과 무관하게
  성립하는 일반 질문(개념·차이·선택 기준)이 1~2개 섞여도 좋습니다.
- 요청된 개수만큼만 만듭니다.`

export interface GenerateCustomQueriesArgs {
  brandName: string
  category: string
  region?: string
  /** 크몽 메시지에서 받은 서비스 설명. 질의를 그 가게답게 만드는 재료 */
  brief?: string
  competitors: readonly string[]
  count: number
}

export interface CustomQueryGeneratorOptions {
  /** 테스트 주입점. 인자는 사용자 프롬프트 문자열 */
  parse?: (prompt: string) => Promise<{ queries: string[] }>
  onUsage?: (usage: { tokensIn: number; tokensOut: number }) => void
  client?: Anthropic
}

let shared: Anthropic | null = null
function sharedClient(): Anthropic {
  if (!shared) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없습니다')
    shared = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return shared
}

export function createCustomQueryGenerator(opts: CustomQueryGeneratorOptions = {}) {
  return async function generate(args: GenerateCustomQueriesArgs): Promise<string[]> {
    // ★ 프롬프트에 브랜드명·경쟁사명을 넣지 않는다. 생성 모델이 이름을 질의에
    //   섞으면 어차피 validateCustomQueries가 거부하지만, 애초에 모르게 하는
    //   것이 낫다. 검증은 방어선이지 1차 수단이 아니다.
    const prompt = JSON.stringify(
      {
        category: args.category,
        region: args.region ?? null,
        service: args.brief ?? null,
        count: args.count,
      },
      null,
      2,
    )

    if (opts.parse) {
      const out = await opts.parse(prompt)
      return out.queries
    }

    const client = opts.client ?? sharedClient()
    const message = await client.messages.parse({
      model: CUSTOM_QUERY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(responseSchema) },
      messages: [{ role: 'user', content: prompt }],
    })
    opts.onUsage?.({
      tokensIn: message.usage.input_tokens,
      tokensOut: message.usage.output_tokens,
    })
    if (message.stop_reason === 'refusal') throw new Error('질의 생성이 거부되었습니다')
    if (message.stop_reason === 'max_tokens') throw new Error('질의 생성 응답이 잘렸습니다')
    const parsed = message.parsed_output
    if (!parsed) throw new Error('질의 생성 응답을 스키마로 파싱하지 못했습니다')
    return parsed.queries
  }
}
```

- [ ] **Step 7: repository에 동결·가이드 저장 추가**

`src/lib/audit/repository.ts` 끝에:

```ts
/**
 * 검수 끝난 질의를 동결한다.
 *
 * ★ 발송 전(status가 'sent'가 아닐 때)에만 허용한다. 발송 후에 질의를 바꾸면
 *   저장된 결과와 질의가 어긋나고, 재측정(전후 비교)의 근거가 사라진다.
 */
export async function freezeQueries(auditId: string, queries: string[]): Promise<void> {
  const rows = await db
    .update(schema.freeAudits)
    .set({ queries })
    .where(and(eq(schema.freeAudits.id, auditId), ne(schema.freeAudits.status, 'sent')))
    .returning({ id: schema.freeAudits.id })
  if (rows.length === 0) {
    throw new Error(`동결 실패: ${auditId} — 없는 건이거나 이미 발송됐습니다`)
  }
}

/** 개선 가이드 저장. 발송 후에도 허용한다 — 가이드는 측정 조건이 아니라 해설이다 */
export async function saveGuide(auditId: string, guideMd: string): Promise<void> {
  const rows = await db
    .update(schema.freeAudits)
    .set({ guideMd })
    .where(eq(schema.freeAudits.id, auditId))
    .returning({ id: schema.freeAudits.id })
  if (rows.length === 0) throw new Error(`가이드 저장 실패: 없는 건입니다 (${auditId})`)
}
```

import에 `ne` 추가 (`and`·`eq`는 이미 있는지 확인, 없으면 추가).

- [ ] **Step 8: 전체 확인** — `pnpm test` PASS · `pnpm typecheck` · `pnpm lint`

- [ ] **Step 9: 커밋**

```bash
git add src/lib/audit/custom-queries.ts src/lib/audit/custom-queries.test.ts src/lib/audit/repository.ts
git commit -m "feat(kmong): 맞춤 질의 생성·검증·동결 — 브랜드명은 코드가 거부한다"
```

---

### Task 4: executeAudit 티어 지원

**Files:**
- Modify: `src/lib/audit/execute.ts`
- Modify: `src/lib/audit/execute.test.ts` (기존 테스트 파일에 추가)
- Modify: `src/lib/audit/result.ts` (evidenceMax 인자)

**Interfaces:**
- Consumes: `AUDIT_TIERS`·`isPaidTier` (Task 1), `generateAuditQueries(…, region)` (Task 2)
- Produces: `AuditSubject`에 `tier?: AuditTier`·`region?: string`·`frozenQueries?: string[]`,
  `buildAuditResult`에 `evidenceMax?: number`

- [ ] **Step 1: 실패 테스트**

`src/lib/audit/execute.test.ts`에 추가. 기존 테스트의 가짜 의존성(fake
`runOne`·`judge`·`aliasFn`) 헬퍼를 재사용한다 — 파일 상단에 이미 있다:

```ts
describe('executeAudit — 티어', () => {
  const frozen10 = [
    '수원 필라테스 어디가 좋아?',
    '수원에서 기구 필라테스 배울 만한 곳 추천해줘',
    '수원 요가원 괜찮은 데 알려줘',
    '수원 필라테스 그룹레슨 가격 어느 정도야?',
    '수원 필라테스 1:1 레슨 어디가 괜찮아?',
    '기구 필라테스랑 매트 필라테스 차이가 뭐야?',
    '수원 산후조리 필라테스 추천해줘',
    '수원역 근처 필라테스 알려줘',
    '필라테스 처음 시작할 때 뭘 봐야 해?',
    '수원 필라테스 체험 수업 있는 곳 어디야?',
  ]

  it('deluxe는 10질의 × 2엔진 × 3회 = 60회 수집한다', async () => {
    const calls: string[] = []
    const result = await executeAudit(
      { ...baseSubject, tier: 'deluxe', frozenQueries: frozen10 },
      { ...baseDeps, runOne: fakeRunOne((item) => calls.push(item.queryText)) },
    )
    expect(calls).toHaveLength(60)
    expect(result.totalAnswers).toBe(60)
  })

  it('동결 질의가 그대로, 그 순서대로 던져진다', async () => {
    const texts = new Set<string>()
    await executeAudit(
      { ...baseSubject, tier: 'deluxe', frozenQueries: frozen10 },
      { ...baseDeps, runOne: fakeRunOne((item) => texts.add(item.queryText)) },
    )
    expect([...texts]).toEqual(frozen10)
  })

  it('유료 티어인데 동결 질의가 없으면 수집 전에 던진다 — 돈을 쓰기 전에', async () => {
    let collected = 0
    await expect(
      executeAudit(
        { ...baseSubject, tier: 'deluxe' },
        { ...baseDeps, runOne: fakeRunOne(() => (collected += 1)) },
      ),
    ).rejects.toThrowError(/동결/)
    expect(collected).toBe(0)
  })

  it('유료 티어의 동결 질의 수가 어긋나면 거부한다', async () => {
    await expect(
      executeAudit(
        { ...baseSubject, tier: 'standard', frozenQueries: frozen10.slice(0, 7) },
        baseDeps,
      ),
    ).rejects.toThrowError(/10개/)
  })

  it('free는 기존과 완전히 같다 — 템플릿 3질의 × 1회', async () => {
    const calls: string[] = []
    await executeAudit(baseSubject, {
      ...baseDeps,
      runOne: fakeRunOne((item) => calls.push(item.queryText)),
    })
    expect(calls).toHaveLength(6) // 3질의 × 2엔진 × 1회
  })

  it('지역형 업종의 free 진단은 region을 템플릿에 넣는다', async () => {
    const texts = new Set<string>()
    await executeAudit(
      { ...baseSubject, category: '치과', region: '수원' },
      { ...baseDeps, runOne: fakeRunOne((item) => texts.add(item.queryText)) },
    )
    for (const t of texts) expect(t).toContain('수원')
  })
})
```

(`baseSubject`·`baseDeps`·`fakeRunOne`은 기존 파일의 헬퍼 이름에 맞춘다 —
이름이 다르면 기존 이름을 쓴다.)

- [ ] **Step 2: 실패 확인**

- [ ] **Step 3: execute.ts 수정**

`AuditSubject`에 추가:

```ts
  /** 진단 티어. 생략하면 'free' — 기존 호출부는 그대로 동작한다 */
  tier?: AuditTier
  /** 지역형 업종의 지역. 템플릿 질의 생성에 쓴다 */
  region?: string
  /**
   * 동결된 질의(`freezeQueries`가 저장한 것). 유료 티어는 필수다.
   * ★ 순서까지 상품의 일부다 — byQuery·재측정 비교가 순서에 기댄다.
   */
  frozenQueries?: string[]
```

본문 1·2단계 교체 (기존 주석 유지):

```ts
  const tier = subject.tier ?? 'free'
  const tierCfg = AUDIT_TIERS[tier]

  // 1. 질의 확정 — 유료는 동결본 필수, 무료는 템플릿 생성.
  //    ★ 검증을 수집 **전에** 한다. 뒤에서 하면 돈을 쓴 뒤에 거부하게 된다
  //    (report-url의 --base-url 검증과 같은 원칙).
  let texts: string[]
  if (isPaidTier(tier)) {
    if (!subject.frozenQueries || subject.frozenQueries.length === 0) {
      throw new Error(
        `${tierCfg.label}은 동결된 질의가 필요합니다. 먼저 실행하세요: pnpm audit:queries ${subject.id}`,
      )
    }
    if (subject.frozenQueries.length !== tierCfg.queryCount) {
      throw new Error(
        `동결 질의가 ${subject.frozenQueries.length}개입니다 — ${tierCfg.label}은 정확히 ${tierCfg.queryCount}개여야 합니다`,
      )
    }
    texts = subject.frozenQueries
  } else {
    texts = subject.frozenQueries ?? generateAuditQueries(subject.category, subject.brandName, subject.region)
  }
  const queries = texts.map((text, i) => ({ id: `q${i + 1}`, text }))

  // 2. 팬아웃. 무료 플랜 스냅샷을 기본으로, 티어의 반복 수만 덮어쓴다.
  //    ★ snapshot.plan은 'free'로 남는다 — 진단은 구독이 아니고, 이 스냅샷은
  //    저장되지 않고 팬아웃 계산에만 쓴다(무료 진단은 collection_runs를 안 쓴다).
  const snapshot = {
    ...buildPlanSnapshot({
      plan: 'free',
      queryPacks: 0,
      queryIds: queries.map((q) => q.id),
      competitors: subject.competitors,
      detectorVersion: DETECTOR_VERSION,
    }),
    samples: { llm: tierCfg.samplesPerEngine, serp: 0 },
  }
  const items = buildFanout(snapshot, queries)
```

import 추가: `import { AUDIT_TIERS, isPaidTier, type AuditTier } from '@/lib/audit/tiers'`.

`buildAuditResult` 호출에 `evidenceMax: isPaidTier(tier) ? 6 : undefined`를
조건부 전달 (`exactOptionalPropertyTypes` 관례: `...(isPaidTier(tier) ? { evidenceMax: 6 } : {})`).

- [ ] **Step 4: result.ts evidenceMax**

`BuildAuditResultArgs`에 `evidenceMax?: number` 추가, 본문의 `EVIDENCE_MAX`
사용처를 `args.evidenceMax ?? EVIDENCE_MAX`로. 테스트
(`src/lib/audit/result.test.ts`)에 추가:

```ts
  it('evidenceMax를 넘기면 증거가 그만큼 늘어난다 (유료 리포트)', () => {
    const result = buildAuditResult({ ...baseArgs(), evidenceMax: 6 })
    expect(result.evidence.length).toBeLessThanOrEqual(6)
  })
```

(픽스처에 답변이 3개뿐이면 6개 이상으로 늘려 실제로 4개 이상 나오는지
확인한다 — 상한 테스트가 상한 이하 데이터로는 아무것도 증명하지 못한다.)

- [ ] **Step 5: 통과 확인** — `pnpm test` PASS

- [ ] **Step 6: 변이 2건**

1. `samples: { llm: tierCfg.samplesPerEngine, ... }` → `{ llm: 1, ... }` —
   60회 테스트 죽어야 함
2. 유료 동결 검사 제거 — "돈 쓰기 전 거부" 테스트 죽어야 함

- [ ] **Step 7: 커밋**

```bash
git add src/lib/audit/execute.ts src/lib/audit/execute.test.ts src/lib/audit/result.ts src/lib/audit/result.test.ts
git commit -m "feat(kmong): executeAudit 티어 지원 — 유료는 동결 질의 10개 × 3회"
```

---

### Task 5: CLI — audit:new 확장 · audit:queries · audit:remeasure

**Files:**
- Modify: `scripts/audit-new.mts` (`--tier`·`--region`·지역형 가드)
- Create: `scripts/audit-queries.mts`
- Create: `scripts/audit-remeasure.mts`
- Modify: `scripts/audit-run.mts` (동결 질의·region·tier 전달)
- Modify: `scripts/audit-list.mts` (tier 표시)
- Modify: `package.json` (scripts 2개 추가)
- Modify: `.gitignore` (`/audit-queries.*.json`)

**Interfaces:**
- Consumes: Task 1~4의 전부, `createVerifiedAudit`(tier·region·parentId 전달),
  `freezeQueries`·`saveGuide`, `createCustomQueryGenerator`·`validateCustomQueries`
- Produces: 운영자 워크플로 —
  `audit:new → audit:queries → (검수) → audit:queries --freeze → audit:run --dry → audit:run`

- [ ] **Step 1: audit-new.mts 확장**

옵션 추가 (`option()` 헬퍼 사용):

```ts
const tierArg = (option('--tier') ?? 'free') as AuditTier
const region = option('--region')
```

검증 (source 검증 다음에):

```ts
if (!(AUDIT_TIER_IDS as readonly string[]).includes(tierArg)) {
  console.error(`알 수 없는 tier: ${tierArg} (${AUDIT_TIER_IDS.join(' | ')})`)
  process.exit(1)
}
// ★ 지역형 업종은 지역 없이 등록을 거부한다 — 실행 시점(executeAudit)에도
//   막히지만, 여기서 잡아야 크몽 고객에게 "지역 알려주세요"를 주문 접수
//   시점에 물을 수 있다.
if (isRegionalCategory(category) && !region?.trim()) {
  console.error(
    `'${category}'은(는) 지역이 필요한 업종입니다. --region "강남" 처럼 지역을 넣으세요.`,
  )
  process.exit(1)
}
```

`createVerifiedAudit` 호출에 `tier: tierArg, region: region?.trim() || null` 추가.
출력에 티어 표시:

```ts
console.log(`  티어: ${AUDIT_TIERS[tierArg].label}${region ? ` · 지역: ${region}` : ''}`)
if (isPaidTier(tierArg)) {
  console.log(`\n다음: pnpm audit:queries ${created.id} --brief "<서비스 설명>"`)
} else {
  console.log(`\n실행: pnpm audit:run ${created.id} --dry`)
}
```

import: `AUDIT_TIERS, AUDIT_TIER_IDS, isPaidTier, type AuditTier` from tiers,
`isRegionalCategory` from queries.

- [ ] **Step 2: audit-queries.mts 작성**

```ts
/**
 * 정밀 진단의 질의를 만들고 동결한다.
 *
 *   pnpm audit:queries aud_xxx --brief "기구 필라테스 전문, 그룹·개인 레슨"
 *     → 템플릿 3 + LLM 후보 7을 audit-queries.aud_xxx.json 에 쓴다
 *   (운영자가 파일을 열어 검수·수정한다 — 후보는 초안이지 완성본이 아니다)
 *   pnpm audit:queries aud_xxx --freeze
 *     → 파일을 검증해 DB에 동결한다
 *
 * ★ 동결 후에는 질의를 바꾸지 않는다. 재측정(전후 비교)이 이 질의를 그대로
 *   다시 던지는 것이 상품의 근거다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createCustomQueryGenerator, validateCustomQueries } from '@/lib/audit/custom-queries'
import { generateAuditQueries, isRegionalCategory } from '@/lib/audit/queries'
import { freezeQueries, getAudit } from '@/lib/audit/repository'
import { AUDIT_TIERS, isPaidTier } from '@/lib/audit/tiers'

const argv = process.argv.slice(2)
const freeze = argv.includes('--freeze')
const briefIdx = argv.indexOf('--brief')
const brief = briefIdx >= 0 ? argv[briefIdx + 1] : undefined
const auditId = argv.find((a) => !a.startsWith('--') && a !== brief)

if (!auditId) {
  console.error('사용법: pnpm audit:queries <auditId> [--brief "서비스 설명"] [--freeze]')
  process.exit(1)
}

const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (!isPaidTier(audit.tier)) {
  console.error(`무료 진단은 템플릿 질의를 씁니다 (tier=${audit.tier}). 이 단계가 필요 없습니다.`)
  process.exit(1)
}

const tierCfg = AUDIT_TIERS[audit.tier]
const file = `audit-queries.${audit.id}.json`
const ctx = {
  brandName: audit.brandName,
  competitors: audit.competitors,
  regional: isRegionalCategory(audit.category),
  ...(audit.region ? { region: audit.region } : {}),
  requiredCount: tierCfg.queryCount,
}

if (freeze) {
  if (!existsSync(file)) {
    console.error(`${file}이 없습니다. 먼저 --freeze 없이 실행해 후보를 만드세요.`)
    process.exit(1)
  }
  const queries = JSON.parse(readFileSync(file, 'utf8')) as string[]
  const validated = validateCustomQueries(queries, ctx)
  await freezeQueries(audit.id, validated)
  console.log(`동결 완료 — ${validated.length}개`)
  for (const [i, q] of validated.entries()) console.log(`  q${i + 1}  ${q}`)
  console.log(`\n다음: pnpm audit:run ${audit.id} --dry`)
  process.exit(0)
}

// 템플릿 3개(항상 포함 — 무료 샘플과의 연속성) + LLM 후보
const template = generateAuditQueries(audit.category, audit.brandName, audit.region ?? undefined)
const generate = createCustomQueryGenerator({
  onUsage: (u) => console.log(`  생성 토큰 in=${u.tokensIn} out=${u.tokensOut}`),
})
const candidates = await generate({
  brandName: audit.brandName,
  category: audit.category,
  ...(audit.region ? { region: audit.region } : {}),
  ...(brief ? { brief } : {}),
  competitors: audit.competitors,
  count: tierCfg.queryCount - template.length,
})

const draft = [...template, ...candidates]
writeFileSync(file, JSON.stringify(draft, null, 2) + '\n', 'utf8')

console.log(`후보 ${draft.length}개를 ${file} 에 썼습니다 (앞 ${template.length}개는 템플릿 — 무료 샘플과 같은 질문).`)
console.log('파일을 열어 검수·수정한 뒤 동결하세요:')
console.log(`  pnpm audit:queries ${audit.id} --freeze`)
// 검증을 미리 돌려 문제를 알려준다 — 동결 때 처음 알면 왕복이 늘어난다.
try {
  validateCustomQueries(draft, ctx)
  console.log('사전 검증: 통과 (수정해도 --freeze가 다시 검증합니다)')
} catch (error) {
  console.warn(`사전 검증 경고: ${error instanceof Error ? error.message : String(error)}`)
}
```

- [ ] **Step 3: audit-remeasure.mts 작성**

```ts
/**
 * PREMIUM 재측정을 등록한다 — 원본의 조건(질의·경쟁사·도메인·지역)을 그대로
 * 복제하고 parentId로 연결한다.
 *
 *   pnpm audit:remeasure aud_원본id
 *
 * ★ 질의를 새로 만들지 않는다. 같은 질의를 다시 던져야 "4주 전과 비교"가
 *   성립한다 — 질의가 다르면 변화가 실제인지 질문 차이인지 가릴 수 없다.
 */
import { createVerifiedAudit, getAudit, hashIp } from '@/lib/audit/repository'

const [parentId] = process.argv.slice(2)
if (!parentId) {
  console.error('사용법: pnpm audit:remeasure <원본 auditId>')
  process.exit(1)
}

const parent = await getAudit(parentId)
if (!parent) {
  console.error(`원본을 찾을 수 없습니다: ${parentId}`)
  process.exit(1)
}
if (parent.status !== 'sent' || !parent.result) {
  console.error(`원본이 발송 완료 상태가 아닙니다 (status=${parent.status}). 비교할 결과가 없습니다.`)
  process.exit(1)
}
if (!parent.queries || parent.queries.length === 0) {
  console.error('원본에 동결 질의가 없습니다 — 무료 진단은 재측정 대상이 아닙니다.')
  process.exit(1)
}

const created = await createVerifiedAudit({
  brandName: parent.brandName,
  category: parent.category,
  email: parent.email,
  competitors: parent.competitors,
  selfDomains: parent.selfDomains,
  source: 'kmong',
  ipHash: hashIp('cli'),
  tier: 'premium',
  region: parent.region,
  parentId: parent.id,
})
// 원본 질의를 그대로 동결한다.
const { freezeQueries } = await import('@/lib/audit/repository')
await freezeQueries(created.id, parent.queries)

console.log(`재측정 등록: ${created.id} (원본 ${parent.id})`)
console.log(`질의 ${parent.queries.length}개를 원본에서 복제·동결했습니다.`)
console.log(`\n실행: pnpm audit:run ${created.id} --dry`)
```

- [ ] **Step 4: audit-run.mts에 티어 반영**

`executeAudit` 호출 인자에 추가:

```ts
      tier: audit.tier,
      ...(audit.region ? { region: audit.region } : {}),
      ...(audit.queries ? { frozenQueries: audit.queries } : {}),
```

실행 헤더 출력에 티어:

```ts
console.log(`실행: ${audit.brandName} (${audit.category}) · ${AUDIT_TIERS[audit.tier].label}${dry ? ' [dry]' : ''}`)
```

`audit-list.mts`의 대기 목록 줄에 티어 표시:

```ts
      `    ${a.brandName} · ${a.category} · ${AUDIT_TIERS[a.tier].label} · 경쟁사 ${a.competitors.length}개 · ` +
```

(둘 다 import 추가: `import { AUDIT_TIERS } from '@/lib/audit/tiers'`)

- [ ] **Step 5: package.json·.gitignore**

```json
    "audit:queries": "tsx --conditions=react-server --env-file=.env.local scripts/audit-queries.mts",
    "audit:remeasure": "tsx --conditions=react-server --env-file=.env.local scripts/audit-remeasure.mts",
```

`.gitignore`에:

```
# 질의 검수용 임시 파일 (audit:queries가 만든다). 고객 데이터라 커밋 금지.
/audit-queries.*.json
```

- [ ] **Step 6: 스모크 (수동, DB 사용 — 돈 안 씀)**

```bash
pnpm audit:new "테스트필라테스" "필라테스" --email "hayoul1999@gmail.com" --source manual --tier deluxe --region "수원" --domains "example.com"
# → 등록 + "다음: pnpm audit:queries ..." 안내 확인
pnpm audit:queries <id> --brief "기구 필라테스"   # LLM 호출 ~3원
# → 파일 생성 확인, q1~q3이 수원 치환된 템플릿인지 확인
pnpm audit:queries <id> --freeze
# → 동결 완료 확인
pnpm audit:run <id> --dry 를 **실행하지 않는다** (60답변 ≈ 2,400원 — Task 10 리허설에서 한 번만)
pnpm audit:reject <id> "스모크 테스트"        # 정리
```

지역 누락 거부도 확인: `pnpm audit:new "테스트치과" "치과" --email x@y.z --source manual` → 거부 메시지.

- [ ] **Step 7: `pnpm typecheck` · `pnpm lint` · `pnpm test` PASS 확인 후 커밋**

```bash
git add scripts/audit-new.mts scripts/audit-queries.mts scripts/audit-remeasure.mts scripts/audit-run.mts scripts/audit-list.mts package.json .gitignore
git commit -m "feat(kmong): 운영자 CLI — 질의 생성·검수·동결·재측정"
```

---

### Task 6: 리포트 메일 티어 인식

**Files:**
- Modify: `src/lib/email/templates.ts` (auditReportEmail)
- Modify: `src/lib/email/templates.test.ts`
- Modify: `scripts/audit-run.mts` (tier 전달)

**Interfaces:**
- Consumes: `AuditTier`·`AUDIT_TIERS` (Task 1)
- Produces: `auditReportEmail({ result, url, tier? })`

- [ ] **Step 1: 실패 테스트**

`templates.test.ts`의 auditReportEmail describe에 추가:

```ts
  it('무료는 1회 측정의 한계를, 유료는 반복 측정을 말한다', () => {
    const free = auditReportEmail({ result: baseResult(), url: 'https://x.kr/a' })
    expect(free.html).toContain('질의 3개를 1회')

    const paid = auditReportEmail({ result: baseResult(), url: 'https://x.kr/a', tier: 'deluxe' })
    expect(paid.html).not.toContain('질의 3개를 1회')
    expect(paid.html).toContain('3회 반복')
  })

  it('유료 메일은 유료 플랜 판매 문구를 넣지 않는다 — 이미 산 사람에게 팔지 않는다', () => {
    const paid = auditReportEmail({ result: baseResult(), url: 'https://x.kr/a', tier: 'deluxe' })
    expect(paid.html).not.toContain('유료 플랜')
  })
```

(`baseResult()`는 기존 픽스처 헬퍼 이름에 맞춘다.)

- [ ] **Step 2: 구현**

`auditReportEmail`의 시그니처를 `{ result, url, tier = 'free' }`로. 기존
"무료 진단은 질의 3개를 1회 측정합니다…유료 플랜은…" 문단을 분기:

```ts
  const methodology =
    tier === 'free'
      ? `<p style="...기존 스타일...">무료 진단은 <strong>질의 3개를 1회</strong> 측정합니다. 그래서 신뢰구간이 ${formatInterval(result.citedRate)}로 넓습니다 — 이 범위 안 어디든 될 수 있다는 뜻입니다. 유료 플랜은 <strong>주 3회</strong> 측정해 이 구간을 좁히고 주간 변화를 판정합니다. 1회 측정으로는 변화를 알 수 없습니다.</p>`
      : `<p style="...같은 스타일...">이 리포트는 질의 ${result.byQuery.length}개를 각 <strong>3회 반복</strong> 측정해 답변 ${result.totalAnswers}개로 만들었습니다. 신뢰구간 ${formatInterval(result.citedRate)}는 반복 측정으로 좁힌 값입니다 — AI 답변은 물을 때마다 바뀌므로, 한 번 물어서 나온 숫자는 믿을 수 없습니다.</p>`
```

`audit-run.mts`의 `auditReportEmail({ result, url })` 호출에 `tier: audit.tier` 추가.

- [ ] **Step 3: 통과 확인 후 커밋**

```bash
git add src/lib/email/templates.ts src/lib/email/templates.test.ts scripts/audit-run.mts
git commit -m "feat(kmong): 리포트 메일이 티어를 인식한다"
```

---

### Task 7: 리포트 화면 유료 확장 — 가이드 · 전후 비교 (Fable 디자인)

**Files:**
- Modify: `src/components/audit/result-view.tsx`
- Modify: `src/components/audit/result-view.test.tsx`
- Modify: `src/app/audit/[id]/page.tsx`
- Modify: `package.json` (react-markdown 추가)

**Interfaces:**
- Consumes: `FreeAudit.guideMd`·`parentId`·`tier`, `getAudit`
- Produces: `ResultView({ result, tier?, guide?, compare? })` —
  `compare = { before: AuditResult; beforeDate: string }`

**디자인 방향 (Fable):** 기존 계측 언어 유지. 유료 확장 3가지 —
① 개선 가이드 섹션(운영자 마크다운, "여기부터는 사람이 읽고 쓴 해설"임을
서체·배경으로 구분), ② 전후 비교(왼쪽 이전·오른쪽 이후, 신뢰구간 겹침
여부로 "실제 변화인가"를 판정해서 문장으로 말해준다 — `judgeChange`가
이미 있다), ③ 증거 6개 확장. 화면 확인 후 스크린샷 리뷰.

- [ ] **Step 1: 의존성** — `pnpm add react-markdown`

- [ ] **Step 2: 실패 테스트**

`result-view.test.tsx`에 추가:

```tsx
describe('유료 확장', () => {
  it('가이드가 있으면 개선 가이드 섹션을 렌더한다', () => {
    render(<ResultView result={baseResult()} tier="deluxe" guide={'## 첫 번째로 할 일\n티스토리에 후기 글을 쓰세요'} />)
    expect(screen.getByRole('heading', { name: /개선 가이드/ })).toBeInTheDocument()
    expect(screen.getByText('티스토리에 후기 글을 쓰세요')).toBeInTheDocument()
  })

  it('가이드가 없으면 섹션 자체가 없다 — 빈 약속을 보여주지 않는다', () => {
    render(<ResultView result={baseResult()} tier="standard" />)
    expect(screen.queryByRole('heading', { name: /개선 가이드/ })).not.toBeInTheDocument()
  })

  it('가이드 마크다운의 HTML을 이스케이프한다', () => {
    render(<ResultView result={baseResult()} tier="deluxe" guide={'<script>alert(1)</script>안전한 텍스트'} />)
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/안전한 텍스트/)).toBeInTheDocument()
  })

  it('전후 비교가 있으면 이전 측정과 나란히 보여준다', () => {
    const before = { ...baseResult(), citedRate: wilsonInterval(1, 60) }
    const after = { ...baseResult(), citedRate: wilsonInterval(30, 60) }
    render(
      <ResultView result={after} tier="premium" compare={{ before, beforeDate: '2026-07-01' }} />,
    )
    expect(screen.getByText(/전후 비교/)).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
  })

  it('전후 신뢰구간이 겹치면 "측정 오차 범위"라고 정직하게 말한다', () => {
    const before = { ...baseResult(), citedRate: wilsonInterval(5, 6) }
    render(
      <ResultView
        result={baseResult()}
        tier="premium"
        compare={{ before, beforeDate: '2026-07-01' }}
      />,
    )
    expect(screen.getByText(/오차 범위/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 구현**

`ResultView` props 확장 + 섹션 2개 추가. 배치: 가이드는 **출처 섹션 다음**
(출처 데이터가 가이드의 근거라 순서가 논증이다), 전후 비교는 **맨 위 요약
바로 다음** (PREMIUM 구매자가 산 것이 바로 그 비교다). `judgeChange`
(`@/lib/stats/wilson`)로 겹침 판정:

```tsx
import Markdown from 'react-markdown'
import { judgeChange } from '@/lib/stats/wilson'

// props에 추가
export function ResultView({
  result,
  tier = 'free',
  guide,
  compare,
}: {
  result: AuditResult
  tier?: AuditTier
  guide?: string
  compare?: { before: AuditResult; beforeDate: string }
}) {
```

전후 비교 섹션 (요약 다음):

```tsx
      {compare && (
        <section className="mb-10 rounded-lg border border-border bg-card p-6">
          <SectionHeading>전후 비교</SectionHeading>
          <p className="mb-4 text-sm text-muted-foreground">
            {compare.beforeDate} 측정과 같은 질의 {result.byQuery.length}개를 다시 던졌습니다.
          </p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-muted-foreground">이전 ({compare.beforeDate})</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatPercent(compare.before.citedRate.point)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatInterval(compare.before.citedRate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">이번</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatPercent(result.citedRate.point)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatInterval(result.citedRate)}
              </p>
            </div>
          </div>
          {/* ★ 구간이 겹치면 상승처럼 보여도 상승이라고 말하지 않는다.
              이 정직함이 제품의 정체성이다 — 재측정을 판 이유가 바로
              "1회 측정으로는 변화를 모른다"였다. */}
          <p className="mt-4 border-t border-border pt-3 text-sm">
            {judgeChange(compare.before.citedRate, result.citedRate) === 'inconclusive'
              ? '두 측정의 신뢰구간이 겹칩니다 — 차이가 측정 오차 범위 안에 있어, 실제 변화라고 판정할 수 없습니다.'
              : result.citedRate.point > compare.before.citedRate.point
                ? '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 상승입니다.'
                : '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 하락입니다.'}
          </p>
        </section>
      )}
```

(`judgeChange` 반환값 이름은 `src/lib/stats/wilson.ts:113`의 실제 시그니처를
확인해 맞춘다 — 'inconclusive'가 아니라 다른 리터럴이면 그 이름을 쓴다.)

가이드 섹션 (출처 다음):

```tsx
      {guide && (
        <section className="mb-10">
          <SectionHeading>개선 가이드</SectionHeading>
          {/* 여기부터는 계측이 아니라 사람의 해설이다 — 위 데이터(출처·순위)를
              근거로 운영자가 쓴다. react-markdown은 raw HTML을 렌더하지
              않으므로(rehype-raw 없음) 스크립트 주입이 안 된다. */}
          <div className="prose prose-sm max-w-none rounded-lg border border-border bg-muted/30 p-6 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_p]:leading-relaxed">
            <Markdown>{guide}</Markdown>
          </div>
        </section>
      )}
```

`page.tsx` 수정:

```tsx
  const audit = await getAudit(id)
  if (!audit || audit.status !== 'sent' || !audit.result) notFound()

  // PREMIUM 재측정이면 원본을 불러 전후 비교를 만든다.
  let compare: { before: AuditResult; beforeDate: string } | undefined
  if (audit.parentId) {
    const parent = await getAudit(audit.parentId)
    if (parent?.result && parent.sentAt) {
      compare = {
        before: parent.result as AuditResult,
        beforeDate: parent.sentAt.toISOString().slice(0, 10),
      }
    }
  }

  return (
    <ResultView
      result={audit.result as AuditResult}
      tier={audit.tier}
      {...(audit.guideMd ? { guide: audit.guideMd } : {})}
      {...(compare ? { compare } : {})}
    />
  )
```

- [ ] **Step 4: 가이드 저장 CLI 한 줄**

`scripts/audit-guide.mts` (신규, package.json에 `audit:guide` 추가):

```ts
/**
 * 개선 가이드를 저장한다. 운영자가 마크다운 파일로 쓴 것을 붙인다.
 *   pnpm audit:guide aud_xxx guide.md
 * 발송 전이면 리포트에 실려 나가고, 발송 후 저장하면 웹 링크에서만 갱신된다
 * (메일은 이미 나갔다 — 필요하면 audit:resend).
 */
import { readFileSync } from 'node:fs'
import { getAudit, saveGuide } from '@/lib/audit/repository'
import { isPaidTier } from '@/lib/audit/tiers'

const [auditId, file] = process.argv.slice(2)
if (!auditId || !file) {
  console.error('사용법: pnpm audit:guide <auditId> <가이드.md>')
  process.exit(1)
}
const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (!isPaidTier(audit.tier) || audit.tier === 'standard') {
  console.error(`개선 가이드는 DELUXE부터입니다 (tier=${audit.tier}).`)
  process.exit(1)
}
const md = readFileSync(file, 'utf8')
await saveGuide(audit.id, md)
console.log(`가이드 저장 완료 (${md.length}자) → /audit/${audit.id}`)
```

- [ ] **Step 5: 통과 확인** — `pnpm test` · `pnpm typecheck` · `pnpm lint`

- [ ] **Step 6: 화면 확인 (dev 서버 + 스크린샷)**

발송된 실측 건(`aud_Jfm-tz4Z…`)으로 기본 화면 회귀 확인. 가이드·비교는
테스트 데이터로 로컬 DB에 임시 행을 만들어 확인하거나 컴포넌트 테스트
스크린샷으로 대체. 데스크톱·모바일 둘 다.

- [ ] **Step 7: 커밋**

```bash
git add src/components/audit/result-view.tsx src/components/audit/result-view.test.tsx "src/app/audit/[id]/page.tsx" scripts/audit-guide.mts package.json pnpm-lock.yaml
git commit -m "feat(kmong): 리포트 유료 확장 — 개선 가이드 · 전후 비교"
```

---

### Task 8: PDF 납품 — 표지 · 인쇄 CSS · audit:pdf (Fable 디자인)

**Files:**
- Create: `src/components/audit/report-cover.tsx`
- Modify: `src/components/audit/result-view.tsx` (표지 삽입 + `print:` 클래스)
- Modify: `src/components/site-shell.tsx` 또는 `src/app/audit/layout.tsx` (인쇄 시 머리글·푸터 숨김)
- Create: `scripts/audit-pdf.mts`
- Modify: `package.json` (`audit:pdf`)

**Interfaces:**
- Consumes: 발송된 리포트 페이지 `/audit/<id>`, `@playwright/test`의 chromium
- Produces: `pnpm audit:pdf <id> [--base-url …]` → `cited-<브랜드>-<날짜>.pdf`

**디자인 방향 (Fable):** 표지는 화면에서 안 보이고(`hidden print:block`)
인쇄에서만 첫 페이지가 된다 — 브랜드명 크게, 측정 조건(질의 수·반복·엔진·
날짜)을 계측 조건 띠 문법으로, Cited 워드마크. 섹션마다
`print:break-inside-avoid`. 배경색 유지(`printBackground: true`).

- [ ] **Step 1: 표지 컴포넌트**

```tsx
import { engineLabels } from '@/lib/plans'
import type { AuditResult } from '@/lib/audit/result'
import type { AuditTier } from '@/lib/audit/tiers'
import { AUDIT_TIERS } from '@/lib/audit/tiers'

/**
 * PDF 표지. 화면에는 없다 — 웹은 링크로 들어와 바로 내용을 보는 매체고,
 * PDF는 파일로 전달되는 문서라 "이게 무엇인가"가 첫 장이어야 한다.
 */
export function ReportCover({ result, tier }: { result: AuditResult; tier: AuditTier }) {
  return (
    <section className="hidden print:flex h-[26cm] flex-col justify-between break-after-page">
      <div className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
        cited.co.kr
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">AI 언급 진단 리포트</p>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight">{result.brandName}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{AUDIT_TIERS[tier].label}</p>
      </div>
      <dl className="grid grid-cols-2 gap-y-2 border-t border-border pt-4 text-sm">
        <dt className="text-muted-foreground">측정일</dt>
        <dd className="font-mono">{result.measuredAt.slice(0, 10)}</dd>
        <dt className="text-muted-foreground">엔진</dt>
        <dd>{engineLabels(result.engines as never).join(' · ')}</dd>
        <dt className="text-muted-foreground">표본</dt>
        <dd>
          질의 <span className="font-mono">{result.byQuery.length}</span>개 · 답변{' '}
          <span className="font-mono">{result.totalAnswers}</span>개
        </dd>
        <dt className="text-muted-foreground">판정 별칭</dt>
        <dd>{result.aliases.join(', ')}</dd>
      </dl>
    </section>
  )
}
```

(`engineLabels` 인자 타입은 실제 시그니처(`readonly EngineId[]`)에 맞춰
`result.engines`를 필터하거나 `engineLabel` 개별 매핑으로 조정한다 —
구현 시 타입 오류가 나는 쪽을 고친다.)

- [ ] **Step 2: ResultView에 표지·인쇄 규칙**

- `ResultView` 최상단에 `{isPaidTier(tier) && <ReportCover result={result} tier={tier} />}`
- 각 `<section>`에 `print:break-inside-avoid` 추가
- 리포트 레이아웃의 머리글·푸터에 `print:hidden` (SiteShell을 직접 고치지
  말고 `src/app/audit/layout.tsx`에서 래퍼에 클래스를 줄 수 있는지 먼저
  확인 — SiteShell 수정이 불가피하면 `<SiteHeader/>`·`<SiteFooter/>`를 감싼
  div에 `print:hidden`)

- [ ] **Step 3: audit-pdf.mts**

```ts
/**
 * 리포트를 PDF로 뽑는다 — 크몽 납품용.
 *
 *   pnpm audit:pdf aud_xxx                          로컬 dev 서버에서
 *   pnpm audit:pdf aud_xxx --base-url https://cited.co.kr   프로덕션에서
 *
 * ★ 발송된(sent) 리포트만 뽑는다. 페이지 자체가 sent 아니면 404다.
 * ★ 서버가 떠 있어야 한다. 로컬이면 pnpm dev 먼저.
 */
import { chromium } from '@playwright/test'
import { parseBaseUrlFlag, reportUrl } from '@/lib/audit/report-url'
import { getAudit } from '@/lib/audit/repository'

const argv = process.argv.slice(2)
const auditId = argv.find((a) => !a.startsWith('--'))
if (!auditId) {
  console.error('사용법: pnpm audit:pdf <auditId> [--base-url https://cited.co.kr]')
  process.exit(1)
}
const audit = await getAudit(auditId)
if (!audit) {
  console.error(`신청을 찾을 수 없습니다: ${auditId}`)
  process.exit(1)
}
if (audit.status !== 'sent') {
  console.error(`발송된 진단만 PDF로 뽑습니다 (status=${audit.status}).`)
  process.exit(1)
}

const base = (parseBaseUrlFlag(argv) ?? 'http://localhost:3000').replace(/\/+$/, '')
const url = reportUrl(base, audit.id)
const out = `cited-${audit.brandName}-${new Date().toISOString().slice(0, 10)}.pdf`

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const res = await page.goto(url, { waitUntil: 'load' })
  if (!res || res.status() !== 200) {
    throw new Error(`리포트를 열지 못했습니다: ${url} (status=${res?.status() ?? '없음'})`)
  }
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
  })
} finally {
  await browser.close()
}
console.log(`PDF 생성: ${out}`)
console.log('크몽 메시지에 파일을 첨부하고 웹 링크도 함께 보내세요:')
console.log(`  ${url}`)
```

package.json: `"audit:pdf": "tsx --conditions=react-server --env-file=.env.local scripts/audit-pdf.mts"`.
`.gitignore`에 `/cited-*.pdf` 추가.

- [ ] **Step 4: 검증**

dev 서버 띄우고 발송된 실측 건으로:

```bash
pnpm audit:pdf aud_Jfm-tz4Z3g4frEpbrZfB4A
```

PDF를 열어(Read 도구로 페이지 확인) — 표지가 첫 장인지(무료 건이면 표지
없음이 맞다 — 유료 임시 행으로도 확인), 섹션이 중간에서 잘리지 않는지,
머리글·푸터가 없는지, 한글 서체가 깨지지 않는지.

- [ ] **Step 5: 커밋**

```bash
git add src/components/audit/report-cover.tsx src/components/audit/result-view.tsx src/app/audit scripts/audit-pdf.mts package.json .gitignore
git commit -m "feat(kmong): PDF 납품 — 인쇄 표지·페이지 규칙·audit:pdf"
```

---

### Task 9: 새 업종 골드 라벨 확장

**Files:**
- Modify: `tests/golden/candidates.json`·`labels.json` (데이터 추가)
- Create: `docs/superpowers/notes/2026-07-31-golden-expansion.md`

절차 (반자동 — 기존 라벨링 파이프라인 사용):

- [ ] **Step 1:** 지역형 1업종(필라테스 권장)·전국형 1업종(금융 권장)으로
      실제 답변 수집 — `pnpm label:collect`의 기존 사용법을 따르되, 수집
      대상 질의를 새 템플릿에서 뽑는다. 브랜드는 실존 업체(예: 지역 필라테스
      상호 2~3개)로 하고 답변당 자기+경쟁 판정 대상을 만든다
- [ ] **Step 2:** `pnpm label`로 40건 이상 수동 라벨링 (운영자 작업 —
      세션에서 라벨링 UI 실행까지 준비하고 실제 판단은 사용자에게 넘긴다)
- [ ] **Step 3:** `pnpm test:golden` — recall ≥ 95%·precision ≥ 90% 유지 확인.
      미달이면 판정 프롬프트를 고치기 전에 **어느 답변 유형이 틀리는지**
      노트에 기록하고 사용자와 상의 (프롬프트 수정은 기존 골드셋 회귀와
      함께 봐야 한다)
- [ ] **Step 4:** 결과를 노트로 남기고 커밋

```bash
git add tests/golden docs/superpowers/notes/2026-07-31-golden-expansion.md
git commit -m "test(golden): 지역형·신규 업종 답변 라벨 추가"
```

---

### Task 10: 크몽 문안 · 배송 체크리스트 · 리허설

**Files:**
- Create: `docs/kmong/listing.md`
- Create: `docs/superpowers/notes/delivery-checklist.md`
- Modify: `docs/superpowers/notes/` (리허설 실측 노트)

- [ ] **Step 1: 크몽 상품 문안 초안** (`docs/kmong/listing.md`)

포함할 것 — 제목 후보 3개("AI가 당신 브랜드를 추천하는지 실측해 드립니다 —
ChatGPT·Gemini 언급률 진단" 류), 서비스 설명(무엇을 측정하고 무엇을 못
하는지 — 1회 측정 한계 명시, 랜딩 프로토콜 카드 링크), 3단 패키지 표
(49,000/99,000/189,000 + 오픈 할인 표기), 발주 시 필요한 정보(브랜드명·
업종·**지역(로컬 업종)**·사이트 주소·경쟁사 최대 3·서비스 한 줄 소개),
FAQ(측정 원리·브랜드명을 질의에 안 넣는 이유·납기 영업일 2일·환불 기준),
납품물 설명(PDF + 웹 링크). **과장 금지** — "상위 노출 보장" 류 문구를
쓰지 않는다. 측정 상품이지 마법이 아니다.

- [ ] **Step 2: 배송 체크리스트** (`docs/superpowers/notes/delivery-checklist.md`)

```
주문 접수
  [ ] 필요한 정보 수신 (브랜드·업종·지역·도메인·경쟁사·서비스 소개)
  [ ] audit:new --tier <t> --region ... --source kmong
  [ ] (무료 샘플 요청이면 --tier free로 등록해 먼저 배송)
질의
  [ ] audit:queries <id> --brief "..."
  [ ] 파일 검수 — 고객 서비스와 맞는가, 사람 말투인가
  [ ] audit:queries <id> --freeze
실행
  [ ] audit:run <id> --dry — 별칭 비어있지 않은가 · ChatGPT 0%/Gemini 양수 지문 없는가
      · 출처가 vertexaisearch로 뭉치지 않았는가 · 미판정 0인가
  [ ] (DELUXE+) 가이드 작성 → audit:guide <id> guide.md
  [ ] audit:run <id> --base-url https://cited.co.kr
납품
  [ ] audit:pdf <id> --base-url https://cited.co.kr
  [ ] PDF 열어 표지·페이지 나눔 확인
  [ ] 크몽 메시지: PDF 첨부 + 웹 링크 + 한 줄 요약
  [ ] (PREMIUM) 4주 뒤 리마인더 등록 → audit:remeasure <원본id>
```

- [ ] **Step 3: 리허설 — DELUXE 1건 실측 (실비 ~2,400원 + 가이드 작성)**

실존 지역 업종(사용자 선택)으로 전 과정을 돌린다: `audit:new --tier deluxe`
→ 질의 생성·검수·동결 → `--dry` 확인 → 가이드 작성 → 발송 → PDF. 소요
시간·원가·막힌 곳을 `docs/superpowers/notes/2026-07-31-kmong-rehearsal.md`에
기록. **여기서 나온 숫자(총 운영 시간)가 크몽 납기 약속의 근거다.**

- [ ] **Step 4: 커밋**

```bash
git add docs/kmong docs/superpowers/notes
git commit -m "docs(kmong): 상품 문안 · 배송 체크리스트 · 리허설 기록"
```

---

## 완료 조건 (= 크몽 등록 게이트)

- [ ] `pnpm test`·`typecheck`·`lint`·`build`·`test:e2e` 전부 통과
- [ ] 지역형 업종이 지역 없이 어디서도(등록·실행) 통과하지 못한다
- [ ] 유료 진단이 동결 질의 없이 실행되지 않는다 (돈 쓰기 전 거부)
- [ ] 브랜드명이 든 질의가 동결을 통과하지 못한다
- [ ] DELUXE 리허설 1건: 질의 생성 → 검수 → 60답변 완주 → 가이드 → PDF까지
      막힘 없이 끝났고 소요·원가가 기록됐다
- [ ] PDF: 표지·페이지 나눔·한글 서체 정상, 머리글·푸터 없음
- [ ] 전후 비교: 구간이 겹치면 "오차 범위"라고 말한다 (허위 상승 금지)
- [ ] 새 업종 골드 라벨 40건 이상 추가, recall ≥ 95% · precision ≥ 90% 유지
- [ ] 크몽 문안에 과장("보장" 류)이 없고 1회 측정의 한계가 명시돼 있다
