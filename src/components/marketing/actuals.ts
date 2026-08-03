import { wilsonInterval } from '@/lib/stats/wilson'

/**
 * 랜딩이 보여주는 **실측 데이터**. 지어낸 값이 여기 들어오면 안 된다.
 *
 * 2026-07-30 `pnpm audit:run`으로 실제 ChatGPT·Gemini에 물어 받은 결과다.
 * 지어낸 예시를 쓰면 첫 리포트에서 톤이 달라지고, 그 차이가 바로 의심이 된다.
 * `docs/superpowers/notes/2026-07-30-first-audit-actuals.md` 참고.
 *
 * ★ 리뉴얼(2026-08-03)에서 랜딩 페이지 본문에서 이 파일로 옮겼다. 히어로와
 *   질의 프로토콜 섹션이 **같은 표본**을 참조해야 "위 표본의 질문"이라는
 *   표시가 성립하기 때문이고, 화면 구성이 바뀔 때 데이터가 따라 흔들리지
 *   않게 하기 위해서다.
 */

export const SPECIMEN = {
  engineId: 'chatgpt',
  query: '30대 남자 옷 어디서 사는 게 좋아?',
  // ★ 원문이다. 손대지 않는다 — 이 안의 대시·가운뎃점은 우리가 쓴 것이 아니라
  //   ChatGPT가 쓴 것이고, 마케팅 카피 규칙(em-dash 금지)이 **증거물의 원문을
  //   고칠 권한까지 주지는 않는다.** 하드 룰(실측 조작 금지)이 위다.
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
 * 위 답변이 속한 측정의 **실제 결과**. 같은 실행에서 나온 숫자다.
 *
 * ★ 히어로에서 이미 신뢰구간을 보여준다. 이 제품의 정체성이 "숫자"가 아니라
 *   "그 숫자를 얼마나 믿어도 되는가"이므로, 구간을 뒤쪽 섹션으로 미루면
 *   가장 중요한 차별점을 스크롤 아래에 숨기는 것이 된다.
 */
export const MEASURED = {
  cited: wilsonInterval(5, 6),
  byEngine: [
    { engine: 'ChatGPT', interval: wilsonInterval(3, 3) },
    { engine: 'Gemini', interval: wilsonInterval(2, 3) },
  ],
} as const

/**
 * 같은 실행의 **인용 출처 집계**. 언급률이 0%인 브랜드에게도 남는 유일한
 * 집행 가능한 정보다 — "AI가 이 질문에 답할 때 어떤 페이지를 읽는가".
 *
 * 출처: `docs/superpowers/notes/2026-07-30-first-audit-actuals.md`
 * ("인용 출처가 리포트의 실질이라는 근거" — 도메인 20개, tistory.com 3/6,
 *  youtube.com 2/6).
 *
 * ★ 비율은 **답변 수 기준**이다(원시 인용 수가 아니다 — 한 답변이 같은 페이지를
 *   다섯 번 인용해도 1로 센다). 분모가 언급률과 같은 6이므로 같은 화면에
 *   나란히 둘 수 있다. 점추정만 적지 않는다 — 다른 모든 지표와 같은 규칙이다.
 */
export const SOURCES = {
  /** 6개 답변에서 집계된 서로 다른 도메인 수 */
  domains: 20,
  top: [
    { domain: 'tistory.com', share: wilsonInterval(3, 6) },
    { domain: 'youtube.com', share: wilsonInterval(2, 6) },
  ],
} as const

/**
 * 같은 6개 답변에서 센 **브랜드별 언급 횟수**(실측의 "순위" 항목).
 *
 * ★ 비율이 아니라 **횟수**다. 분모를 만들어 "점유율 56%" 같은 숫자를 지어내지
 *   않는다 — 우리는 등록된 브랜드만 셀 수 있고, 등록되지 않은 브랜드가 빠진
 *   분모로 계산한 점유율은 실제보다 높게 나온다. 그 주의사항이 이 섹션의
 *   본문이기도 하다.
 */
export const MENTION_COUNTS = [
  { brand: '무신사', count: 5, isSelf: true },
  { brand: '29CM', count: 2, isSelf: false },
  { brand: '지그재그', count: 2, isSelf: false },
] as const
