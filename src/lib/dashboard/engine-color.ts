/**
 * 엔진 계열색 — 차트와 요약 카드가 **같은 지도**를 본다.
 *
 * ★ 여기 있는 이유는 하나다: 이 지도가 `trend-chart.tsx`(클라이언트 컴포넌트)
 *   안에 있으면, 서버 컴포넌트가 색을 알려고 클라이언트 모듈을 import하게 된다
 *   — 값 하나 때문에 번들이 딸려 온다. 색은 데이터도 상태도 아니므로 순수
 *   모듈에 둔다.
 *
 * ★ 값은 토큰 참조지 원색이 아니다(§2). 표면이 뒤집히면 `globals.css`의
 *   `--color-engine-*`가 같이 뒤집히고 여기는 손댈 것이 없다.
 *
 * ★ 모르는 엔진은 `--primary`로 떨어진다 — 없는 색을 만들어 내지 않는다.
 *   엔진이 늘면 토큰을 먼저 정의하고 여기에 한 줄 더한다(색을 생성하지 않는
 *   것이 dataviz의 못 박힌 규칙이다: 9번째 계열은 만들어 낸 색이 아니다).
 */
export const ENGINE_COLOR: Record<string, string> = {
  chatgpt: 'var(--color-engine-chatgpt)',
  gemini: 'var(--color-engine-gemini)',
  naver: 'var(--color-engine-naver)',
  google_aio: 'var(--color-engine-google)',
}

export function engineColor(id: string): string {
  return ENGINE_COLOR[id] ?? 'var(--primary)'
}

/**
 * 경쟁사 계열색 — 점유율 추이의 브랜드별 선.
 *
 * ★ 인덱스는 **등록 경쟁사 목록의 저장 순서**다(스냅샷의 `competitors`는
 *   정렬돼 저장된다 — data.ts). 순위 순서로 주면 순위가 뒤집힐 때 색이
 *   브랜드를 갈아탄다(dataviz: 색은 엔티티를 따른다, 순위를 따르지 않는다).
 * ★ 다섯째 경쟁사부터는 색을 만들어 내지 않고 순환한다 — 현 플랜 한도에서
 *   실제로 닿지 않는 자리다. 한도를 올리면 토큰을 먼저 늘려라.
 */
const COMPETITOR_COLORS = [
  'var(--color-competitor-1)',
  'var(--color-competitor-2)',
  'var(--color-competitor-3)',
  'var(--color-competitor-4)',
] as const

export function competitorColor(index: number): string {
  return COMPETITOR_COLORS[index % COMPETITOR_COLORS.length]!
}
