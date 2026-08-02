/**
 * 질의 에디터 초기값 — 순수 모듈.
 *
 * 프리필 규칙 (스펙 ②): 크몽 전환이면 동결 질의 그대로(연속성 — 크몽 리포트와
 * 비교 가능해야 한다). 아니면 업종 템플릿 3개 + 빈 칸(고객이 [AI 후보 생성]
 * 또는 직접 입력으로 채운다).
 */
/**
 * 질의 단계의 주소. 브랜드 폼(성공 후 이동)·`/onboarding`·`/dashboard`
 * (중단 계정 재개 리다이렉트)가 **같은 문자열**을 써야 한다 — 한 곳만 바뀌면
 * 재개 경로가 조용히 404가 된다.
 */
export function queriesStepPath(brandId: string): string {
  return `/onboarding/queries?brand=${encodeURIComponent(brandId)}`
}

/**
 * 확정이 **구조적으로 불가능한** 상태의 이유. 통과 상태면 null.
 *
 * ★ 남은 몫(`quota`)이 템플릿 수보다 적으면 어떤 입력으로도 동결이 안 된다.
 *   이때 진짜 이유는 "질의 개수"가 아니라 "다른 브랜드가 계정 한도를 다 쓰고
 *   있다"이므로, 개수 이야기로 번역되면 고객은 영영 엉뚱한 곳을 고친다.
 *
 * ★ 화면(에디터 진입)과 서버(`freezeQueriesAction`)가 **같은 문장**을 쓴다.
 *   두 곳이 각자 문장을 지어내면 고객은 같은 상태에 두 가지 설명을 듣는다.
 */
export function quotaBlockedReason(args: {
  quota: number
  queriesOnOtherBrands: number
  maxQueries: number
  /** 최소 질의 수 = 업종 템플릿 수 (`generateAuditQueries`의 길이) */
  minCount: number
}): string | null {
  if (args.quota >= args.minCount) return null
  return (
    `계정 전체 질의 한도(${args.maxQueries}개)가 남지 않았습니다 — 다른 브랜드가 ` +
    `${args.queriesOnOtherBrands}개를 쓰고 있습니다. 다른 브랜드의 질의를 줄이거나 ` +
    `질의 팩을 추가해 주세요.`
  )
}

export interface EditorInit {
  queries: string[]
  source: 'frozen' | 'template'
}

export function buildInitialQueries(args: {
  frozen: string[] | null
  templates: string[]
  quota: number
}): EditorInit {
  const pad = (base: string[]): string[] => [
    ...base.slice(0, args.quota),
    ...Array<string>(Math.max(0, args.quota - base.length)).fill(''),
  ]
  if (args.frozen && args.frozen.length > 0) {
    return { queries: pad(args.frozen), source: 'frozen' }
  }
  return { queries: pad(args.templates), source: 'template' }
}
