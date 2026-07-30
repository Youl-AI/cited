/**
 * 무료 진단용 기본 질의 3개.
 *
 * ★ 브랜드명을 질의에 넣지 않는다. "무신사 어때?"라고 물으면 AI는 당연히
 *   무신사를 말한다. 우리가 재는 것은 **브랜드를 언급하지 않은 소비자 질문에
 *   AI가 그 브랜드를 자발적으로 꺼내는가**다. 이것이 GEO 측정의 전부다.
 *
 * ★★ 이 사실이 **개인정보처리방침의 고지 내용이다.** §1·§7·§8이 "OpenAI와
 *   Google에는 브랜드명·경쟁사명을 전송하지 않는다"고 명시한다. 여기서 질의에
 *   브랜드명이나 경쟁사명을 넣으면 그 고지가 거짓이 되므로,
 *   `src/app/legal/privacy/page.tsx`를 **먼저** 고쳐야 한다.
 *   (`queries.test.ts`가 브랜드명이 새어 들어가지 않는지 검증한다.)
 *
 * ★ 3개인 이유는 원가다. 이 숫자를 올리려면 `src/lib/plans.ts`의
 *   `free.maxQueries`와 함께 올려야 하고, 그 전에 무료 진단 월 예산을 다시
 *   계산해야 한다. `queries.test.ts`가 두 값이 갈리는 것을 막는다.
 *
 * ★ 결정적이어야 한다. 재실행 때 질의가 달라지면 첫 실행과 비교할 수 없고
 *   "왜 숫자가 달라졌냐"에 답할 수가 없다. 그래서 LLM 생성이 아니라 템플릿이다.
 *
 * 순수 함수다. 외부 I/O 없음.
 */
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
