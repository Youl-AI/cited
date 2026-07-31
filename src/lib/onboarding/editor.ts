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
