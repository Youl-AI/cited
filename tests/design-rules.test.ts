import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 이 파일은 **디자인 배터리**다. 취향을 채점하지 않는다 — tasteskill §9(AI Tells)
// 중에서 "정규식으로 기계가 확실히 판정할 수 있는 것"만 잠근다. 잡는 대상은
// 사람이 리뷰에서 놓치기 쉽고, 놓치면 화면이 즉시 "AI가 만든 티"가 나는 표식들:
// em-dash 남용, "Scroll to explore" 류 스크롤 큐, "01 / " 꼴 지어낸 섹션 번호.
//
// design-tokens.test.ts가 **토큰의 뜻**을 잠근다면, 여기는 **표면의 문장**을
// 잠근다. 둘이 겹치는 곳은 reduced-motion 킬 스위치 하나뿐인데, 그건 겹쳐도
// 되는 종류다(모션 전체를 끄는 유일한 스위치라, 한쪽이 지워져도 다른 쪽이 운다).

/** 마케팅 표면 소스 — 방문자가 결제 전에 보는 화면 전부. */
const MARKETING_DIRS = [
  'src/app/(marketing)',
  'src/components/marketing',
  // ★ Task 5에서 라우트 그룹으로 갈렸다. 예전 경로는 `src/app/audit/new` ·
  //   `src/app/audit/requested`였고, 지금은 둘 다 `(flow)` 아래다. 결제 없는
  //   무료 진단 신청 흐름이라 마케팅 표면으로 친다.
  'src/app/audit/(flow)',
]

const root = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(full) ? [full] : []
  })
}

/** 주석 제거 — 코드 주석의 설명용 문장부호는 규칙 대상이 아니다 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * **실측 원문 예외.** 랜딩이 싣는 ChatGPT 답변은 우리가 쓴 카피가 아니라
 * 증거물이다. 그 안의 대시는 ChatGPT가 찍은 것이고, 카피 규칙(§9.G)이
 * 증거물을 고칠 권한까지 주지는 않는다 — 하드 룰(실측 조작 금지)이 위다.
 * 같은 취지가 `src/components/marketing/actuals.ts` 주석에도 박혀 있다.
 *
 * 예외는 **파일 단위가 아니라 문자열 단위**다. actuals.ts에 새 카피가 들어오면
 * 그건 여전히 검사 대상이다. 그리고 아래 "예외 문자열이 실제로 존재하는가"
 * 단언이 짝으로 붙어 있어서, 원문이 조용히 바뀌면 예외가 먼저 운다.
 */
const VERBATIM_EVIDENCE: Record<string, readonly string[]> = {
  'src/components/marketing/actuals.ts': [
    '좋아요 — 스타일·예산에 따라 다릅니다. 간단히 정리할게요.',
  ],
}

/**
 * 검사 제외: 테스트 파일.
 *
 * `*.test.tsx`는 배송되는 표면이 아니라 이 저장소의 검사 장치다. 한국어 테스트
 * 제목은 전 저장소가 em-dash로 절을 나누는 문체를 쓰고(이 파일도 그렇다),
 * 무엇보다 "화면에 em-dash가 없다"를 단언하려면 테스트 소스가 그 문자를
 * **리터럴로 들고 있어야** 한다(pricing/page.test.tsx의 `not.toMatch(/[—–]/)`).
 * 테스트를 검사 대상에 넣으면 규칙이 자기 자신을 금지하게 된다.
 *
 * 렌더 결과 기준의 같은 규칙은 이미 컴포넌트 테스트 쪽에 있다 — 이 배터리는
 * 소스 기준으로 한 겹 더 두르는 쪽이다.
 */
const isTestFile = (path: string): boolean => /\.test\.tsx?$/.test(path)

const rel = (path: string): string => relative(root, path).split('\\').join('/')

const marketingFiles = MARKETING_DIRS.flatMap((d) => walk(join(root, d)))
  .filter((path) => !isTestFile(path))
  .map((path) => {
    const key = rel(path)
    const exempt = VERBATIM_EVIDENCE[key] ?? []
    let visible = stripComments(readFileSync(path, 'utf8'))
    for (const quote of exempt) visible = visible.split(quote).join('')
    return { path: key, visible }
  })

const offenders = (re: RegExp): string[] =>
  marketingFiles.filter((f) => re.test(f.visible)).map((f) => f.path)

describe('디자인 배터리 — 마케팅 표면 (tasteskill §9 자동화분)', () => {
  it('검사 대상 디렉터리가 실제로 존재한다 — 경로가 죽으면 배터리가 조용히 빈다', () => {
    // 이 단언이 없으면 라우트 그룹 개편(Task 5의 `(flow)` 분리 같은 것) 뒤에
    // walk가 아무것도 못 걷고 아래 규칙이 전부 초록으로 통과한다. 실제로
    // 브리프에 적힌 `src/app/audit/new` 경로가 그렇게 죽어 있었다.
    expect(MARKETING_DIRS.filter((d) => !existsSync(join(root, d)))).toEqual([])
    expect(marketingFiles.length).toBeGreaterThan(10)
  })

  it('em-dash·en-dash 금지 (§9.G — 주석 제외 전체)', () => {
    expect(offenders(/[—–]/)).toEqual([])
  })

  it('스크롤 큐 문자열 금지 (§9.F)', () => {
    expect(offenders(/Scroll to explore|스크롤하여 탐색|↓\s*scroll/i)).toEqual([])
  })

  it('섹션 번호 아이브로 금지 — "01 /", "001 ·" 류 (§9.F)', () => {
    expect(offenders(/['">]\s*0\d\s*[/·]\s/)).toEqual([])
  })

  it('실측 원문 예외는 실제 원문에만 걸려 있다 — 죽은 예외는 구멍이다', () => {
    for (const [file, quotes] of Object.entries(VERBATIM_EVIDENCE)) {
      const source = readFileSync(join(root, file), 'utf8')
      for (const quote of quotes) expect(source).toContain(quote)
    }
  })
})

describe('전역 규칙', () => {
  const globals = readFileSync(join(root, 'src/app/globals.css'), 'utf8')

  it('reduced-motion 킬 스위치 5선언 유지', () => {
    // 다섯 중 하나라도 빠지면 "모션을 줄여 달라"는 OS 설정이 부분적으로만
    // 먹는다 — 특히 iteration-count가 빠지면 무한 루프 애니메이션이 살아남는다.
    for (const decl of [
      'transition-duration: 0.01ms !important',
      'animation-duration: 0.01ms !important',
      'animation-iteration-count: 1 !important',
      'animation-delay: 0.01ms !important',
      'transition-delay: 0ms !important',
    ])
      expect(globals).toContain(decl)
  })

  it('순수 #000000 배경 금지', () => {
    expect(globals).not.toMatch(/--background:\s*(#000000|oklch\(\s*0\s+0\s+0\s*\))/)
  })
})
