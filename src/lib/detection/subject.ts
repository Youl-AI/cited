/**
 * 판정 결과의 `subject` 표기.
 *
 * `DetectionResult.subject`·`DetectionRecord.subject`·`detections.subject`(DB)는
 * **표시용 브랜드명이 아니다.** `'self'` 아니면 `` `competitor:${canonical}` ``이다.
 * 이 구분이 필요한 이유는 자기 브랜드의 이름이 바뀌어도 과거 판정이 계속
 * "우리"를 가리켜야 하고, 경쟁사 이름이 `'self'`와 겹칠 수 있기 때문이다.
 *
 * ★ 이 파일이 생긴 이유: `` `competitor:${c.canonical}` ``이 세 군데에 각각
 *   적혀 있었고(`detection/index.ts`, `detection/pipeline.ts`, 그리고 3단계
 *   리포트 구성), 그중 한 곳이 접두사 없이 브랜드명을 그대로 비교하고 있었다.
 *   그러면 언급 수가 **전부 0으로 집계되는데** 지표 쪽 숫자는 정상이라
 *   "언급률 33%인데 순위표에는 아무도 언급되지 않음"인 리포트가 고객에게
 *   나간다. 조립과 해체를 한 곳에 둬서 그 종류의 어긋남을 없앤다.
 *
 * 순수 모듈이다 — ESLint pure-boundary 안에 있고 아무것도 import하지 않는다.
 */

/** 우리 브랜드의 subject 값. */
export const SELF_SUBJECT = 'self'

const COMPETITOR_PREFIX = 'competitor:'

/** 경쟁사의 subject 값을 만든다. `canonical`은 `BrandProfile.canonical`이다. */
export function competitorSubject(canonical: string): string {
  return `${COMPETITOR_PREFIX}${canonical}`
}

export type ParsedSubject = { kind: 'self' } | { kind: 'competitor'; canonical: string }

/**
 * subject를 되읽는다.
 *
 * 접두사도 없고 `'self'`도 아닌 값은 경쟁사로 읽지 않는다 — 그런 값은
 * 이 규약을 모르는 코드가 넣은 것이고, 경쟁사로 오인하면 순위표에
 * `'self'`나 원시 브랜드명이 별개 항목으로 끼어든다.
 */
export function parseSubject(subject: string): ParsedSubject | null {
  if (subject === SELF_SUBJECT) return { kind: 'self' }
  if (!subject.startsWith(COMPETITOR_PREFIX)) return null
  const canonical = subject.slice(COMPETITOR_PREFIX.length)
  // `'competitor:'`만 있는 값은 이름 없는 경쟁사다 — 순위표에 빈 줄이 된다.
  if (canonical.length === 0) return null
  return { kind: 'competitor', canonical }
}
