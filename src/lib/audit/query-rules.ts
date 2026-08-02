import { generateAuditQueries } from '@/lib/audit/queries'
import { REGION_SLOT } from '@/lib/audit/query-templates'

/**
 * 맞춤 질의의 **검증 규칙** — 순수 모듈.
 *
 * ★ 이 파일은 `custom-queries.ts`에서 갈라져 나왔다(4단계). 이유는 하나다:
 *   질의 에디터 화면이 실시간 검증에 **같은 함수**를 써야 하는데,
 *   `custom-queries.ts`는 최상위에서 Anthropic SDK와 server-only `env`를 끌고
 *   있어 클라이언트가 import하면 빌드가 죽는다. 여기 import는
 *   `generateAuditQueries`·`REGION_SLOT` 둘뿐이고 둘 다 순수다 —
 *   **이 모듈에 서버 전용 import를 들이지 말 것.** 들이는 순간 화면이 규칙을
 *   따로 구현하게 되고, 서버와 화면이 다른 말을 하기 시작한다.
 *
 * 흐름: 주문 → LLM이 후보 생성 → 검수·수정 → `validateCustomQueries` 통과 →
 * DB 동결 → 영구 사용.
 *
 * ★ 검증은 검수자 눈이 아니라 이 함수가 최종 책임진다. 브랜드명이 질의에
 *   들어가면 "이름을 댔더니 나온 답"을 측정하는 것이라 상품 전체가 무효다 —
 *   `queries.ts` 상단 주석과 같은 원칙이고, 개인정보처리방침 §1·§7·§8의
 *   고지("OpenAI·Google에 브랜드명을 전송하지 않는다")도 이 함수가 지킨다.
 */

export interface CustomQueryContext {
  brandName: string
  competitors: readonly string[]
  /**
   * 신청의 업종. 템플릿 3개(`generateAuditQueries`)를 여기서 다시 만들어
   * 동결 대상에 들어 있는지 검사한다 — 아래 ★ 템플릿 주석 참고.
   */
  category: string
  /** 지역형 업종의 지역. 템플릿 재생성에 그대로 넘어간다 */
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

  // ★ 템플릿 3개가 전부 들어 있어야 통과다. 상품 약속이 "템플릿 3 + 맞춤 7"이고
  //   (무료 샘플과의 연속성), 지역형 업종의 지역 강제도 템플릿 3이 맡는다 —
  //   아래 지역 관련 테스트가 맞춤 질의에 지역을 강제하지 않는 근거가 그것이다.
  //   운영자가 검수 파일에서 템플릿 줄을 지우면 그 두 약속이 조용히 사라지므로,
  //   동결 전에 여기서 멈춘다. 비교는 중복 검사와 같은 norm 기준이다.
  const templates = generateAuditQueries(ctx.category, ctx.brandName, ctx.region)
  for (const t of templates) {
    if (!seen.has(norm(t))) {
      throw new Error(
        `템플릿 질의가 빠져 있습니다: "${t}" — 템플릿 ${templates.length}개는 무료 샘플과 같은 질문이라 반드시 포함해야 합니다`,
      )
    }
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
