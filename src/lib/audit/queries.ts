/**
 * 무료 진단용 기본 질의 3개.
 *
 * ★ 브랜드명을 질의에 넣지 않는다. "무신사 어때?"라고 물으면 AI는 당연히
 *   무신사를 말한다. 우리가 재는 것은 **브랜드를 언급하지 않은 소비자 질문에
 *   AI가 그 브랜드를 자발적으로 꺼내는가**다. 이것이 GEO 측정의 전부다.
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
export const AUDIT_QUERY_COUNT = 3

interface CategoryTemplate {
  /** 폼에서 고르는 이름 */
  label: string
  /** 이 카테고리로 인정할 입력 (부분 일치) */
  aliases: string[]
  queries: readonly [string, string, string]
}

const TEMPLATES: readonly CategoryTemplate[] = [
  {
    label: '패션',
    aliases: ['패션', '의류', '옷', '쇼핑몰'],
    queries: [
      '30대 남자 옷 어디서 사는 게 좋아?',
      '가성비 좋은 온라인 패션 쇼핑몰 추천해줘',
      '요즘 인기 있는 국내 패션 브랜드 알려줘',
    ],
  },
  {
    label: '화장품',
    aliases: ['화장품', '뷰티', '스킨케어', '코스메틱', '기초화장품'],
    queries: [
      '건성 피부에 맞는 수분크림 추천해줘',
      '가성비 좋은 국내 스킨케어 브랜드 뭐가 있어?',
      '올리브영에서 잘 팔리는 화장품 알려줘',
    ],
  },
  {
    label: '식품',
    aliases: ['식품', '음식', '먹거리', '간편식', '밀키트'],
    queries: [
      '간편하게 먹을 수 있는 밀키트 추천해줘',
      '선물하기 좋은 국내 식품 브랜드 알려줘',
      '요즘 인기 있는 건강식품 뭐가 있어?',
    ],
  },
  {
    label: '가전',
    aliases: ['가전', '전자제품', '전자기기', '디지털'],
    queries: [
      '자취방에 놓기 좋은 소형가전 추천해줘',
      '가성비 좋은 무선 이어폰 뭐가 있어?',
      '요즘 잘 나가는 국내 가전 브랜드 알려줘',
    ],
  },
  {
    label: '교육',
    aliases: ['교육', '학원', '강의', '인강', '온라인 강의'],
    queries: [
      '온라인으로 코딩 배우려면 어디가 좋아?',
      '직장인이 듣기 좋은 온라인 강의 플랫폼 추천해줘',
      '국내 이러닝 서비스 뭐가 있어?',
    ],
  },
]

export const KNOWN_CATEGORIES: readonly string[] = TEMPLATES.map((t) => t.label)

/**
 * @param category 고객이 고르거나 입력한 카테고리
 * @param brandName 브랜드명. **질의에는 넣지 않는다.** 향후 카테고리 추론에
 *   쓸 수 있도록 받아두되, 지금은 의도적으로 사용하지 않는다.
 */
export function generateAuditQueries(category: string, brandName: string): string[] {
  void brandName
  const trimmed = category.trim()
  if (!trimmed) throw new Error('카테고리가 비어 있습니다')

  const matched = TEMPLATES.find((t) => t.aliases.some((a) => trimmed.includes(a)))
  // 복사해서 돌려준다 — 호출자가 배열을 바꿔도 템플릿이 오염되지 않는다.
  if (matched) return [...matched.queries]

  // 모르는 카테고리 — 입력을 그대로 넣어 일반형 질의를 만든다.
  // 억지로 가까운 카테고리에 끼워 맞추면 엉뚱한 질의로 측정하게 된다.
  return [
    `${trimmed} 추천해줘`,
    `가성비 좋은 ${trimmed} 브랜드 뭐가 있어?`,
    `요즘 인기 있는 ${trimmed} 알려줘`,
  ]
}
