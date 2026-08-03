import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 이 테스트는 스타일 취향이 아니라 **의미 계약**을 지킨다.
// 대시보드는 지표의 방향(상승·하락·변화없음)과 수집 품질(신뢰구간·불완전)을
// 오직 이 다섯 토큰으로만 표현한다. 값이 조용히 바뀌면 화면은 여전히 렌더되지만
// 의미가 뒤집힌다 — 특히 `--color-metric-flat`이 초록이 되는 순간, 설계 ③의
// "신뢰구간이 겹치면 변화 없음" 규칙이 시각적으로 거짓말을 하기 시작한다.
// 그래서 색이 아니라 규칙을 검증한다.
//
// ★ 2026-08-03 리뉴얼(v3)에서 **정확값 스냅샷 단언을 걷어냈다.** 값 선택 권한은
//   taste 스킬(soft-skill §3 아키타입 · redesign-skill Color)에 있고, 이 파일은
//   그 아래에서 깨지면 안 되는 **구조와 의미**만 잠근다: 무채색인가, 색상환에서
//   충분히 떨어져 있는가, 실제로 읽히는 대비인가, 다크 스코프가 존재하는가.
//   "값이 브리프와 같은가"는 이제 검사하지 않는다 — 그 단언은 디자인을 못 바꾸게
//   막을 뿐 아무 사고도 잡지 못했다.
//
// ★ 규칙은 전부 **globals.css에서 읽은 값**으로 검사한다. 예전에는 이 파일 안의
//   리터럴 객체를 파싱해서 검사했는데, 그건 상수끼리 비교하는 것이라 스타일시트가
//   텅 비어 있어도 전부 초록이었다.

const cssPath = fileURLToPath(new URL('../src/app/globals.css', import.meta.url))
// 주석 안의 토큰 이름이 파싱에 섞이지 않게 먼저 걷어낸다.
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** `헤더 { ... }` 블록의 본문을 중괄호 짝을 맞춰 꺼낸다. */
function blockBody(header: RegExp): string {
  const match = header.exec(css)
  if (!match) throw new Error(`globals.css에 ${String(header)} 블록이 없다`)
  const start = match.index + match[0].length
  let depth = 1
  for (let i = start; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start, i)
    }
  }
  throw new Error(`${String(header)} 블록이 닫히지 않았다`)
}

// `@theme inline {`이 아니라 값 리터럴이 들어가는 `@theme static {`이다.
// 제품 토큰이 여기 있어야 Tailwind가 text-metric-* / bg-engine-* / shadow-elevation-*
// 유틸리티를 만들어 준다. 평범한 :root로 옮기면 변수는 살아 있지만 유틸리티가
// 사라져서 화면이 조용히 색을 잃는다 — 그래서 위치도 단언한다.
// `static`은 별도로 단언한다(아래 "리뉴얼 v3" describe) — 없으면 아무도 안 쓰는
// 토큰이 빌드 산출물에서 사라진다.
const themeBlock = blockBody(/@theme\s+static\s*\{/)
// 값이 아니라 **다른 변수를 가리키는** 별칭들. 여기 있는 이름은 유틸리티가
// `var(...)`를 그대로 뱉으므로 스코프(=다크 표면)를 탄다.
const inlineBlock = blockBody(/@theme\s+inline\s*\{/)
const rootBlock = blockBody(/:root\s*\{/)
// 마케팅 표면(랜딩·요금제·무료진단 신청)이 감싸는 다크 토큰 스코프.
const darkBlock = blockBody(/\.surface-dark\s*\{/)

/** `--이름: 값;` 선언에서 값을 꺼낸다. 없으면 null. */
function readToken(name: string, scope: string = css): string | null {
  const match = new RegExp(String.raw`--${name}\s*:\s*([^;]+);`).exec(scope)
  return match?.[1]?.trim() ?? null
}

type Oklch = { l: number; c: number; h: number }

/** `oklch(L C H)` 문자열을 숫자 세 개로 푼다. 형식이 다르면 null. */
function parseOklch(value: string | null): Oklch | null {
  if (value === null) return null
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (!match) return null
  const [, l, c, h] = match
  if (l === undefined || c === undefined || h === undefined) return null
  return { l: Number(l), c: Number(c), h: Number(h) }
}

/**
 * `oklch(L C H / P%)` — **알파를 가진** 형식을 푼다. 형식이 다르면 null.
 *
 * 다크 표면의 헤어라인 계열(`--border`·`--border-interactive`)이 이 형식이다.
 * 위 `parseOklch`는 알파를 받지 않으므로(그쪽은 불투명 표면색 전용) 갈라 둔다.
 */
function parseOklchAlpha(value: string | null): { color: Oklch; alpha: number } | null {
  if (value === null) return null
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)%\s*\)$/.exec(value)
  if (!match) return null
  const [, l, c, h, a] = match
  if (l === undefined || c === undefined || h === undefined || a === undefined) return null
  return { color: { l: Number(l), c: Number(c), h: Number(h) }, alpha: Number(a) / 100 }
}

/** 지정한 스코프에서 토큰을 읽어 oklch로 푼다. 없거나 형식이 다르면 던진다. */
function color(name: string, scope: string, label: string): Oklch {
  const parsed = parseOklch(readToken(name, scope))
  if (!parsed) throw new Error(`${label}에 oklch 형식의 --${name}이 없다`)
  return parsed
}

const themeColor = (name: string): Oklch => color(name, themeBlock, '@theme 블록')
const darkColor = (name: string): Oklch => color(name, darkBlock, '.surface-dark 블록')

// ── oklch → sRGB → WCAG 상대 휘도 → 대비비 ────────────────────────────────
// 대비는 눈대중으로 판단할 수 없다. 여기서 실제로 계산해서 문턱을 지킨다.

function toLinearSrgb({ l: L, c: C, h: H }: Oklch): [number, number, number] {
  const rad = (H * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)
  const lp = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mp = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sp = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ]
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const gammaEncode = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
const gammaDecode = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4

/** sRGB 게멋 안인가. 밖이면 브라우저가 임의로 잘라 내 실제 색이 달라진다. */
function inSrgbGamut(color: Oklch): boolean {
  return toLinearSrgb(color).every((v) => v >= -1e-4 && v <= 1 + 1e-4)
}

/** 브라우저가 실제로 그리는 8비트 sRGB 좌표 [0..1]³. */
function srgb8(color: Oklch): number[] {
  return toLinearSrgb(color).map((v) => Math.round(clamp01(gammaEncode(clamp01(v))) * 255) / 255)
}

/** 8비트 sRGB 좌표의 WCAG 상대 휘도. */
function luminanceOf(rgb: readonly number[]): number {
  const [r, g, b] = rgb.map(gammaDecode)
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/** 브라우저가 실제로 그리는 8비트 색 기준의 WCAG 상대 휘도. */
function relativeLuminance(color: Oklch): number {
  return luminanceOf(srgb8(color))
}

const ratioOfLuminance = (la: number, lb: number): number =>
  (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)

function contrastRatio(a: Oklch, b: Oklch): number {
  return ratioOfLuminance(relativeLuminance(a), relativeLuminance(b))
}

/**
 * 반투명 색을 불투명 바닥 위에 합성한다 — 브라우저와 같은 sRGB 알파 합성이고,
 * 결과를 다시 8비트로 양자화한다(화면에 실제로 찍히는 값).
 *
 * 이게 필요한 이유: 다크 표면의 헤어라인·입력 테두리는 `oklch(1 0 0 / N%)`처럼
 * **알파를 가진 색**이라 그 자체로는 대비를 말할 수 없다. 무엇 위에 놓이는지가
 * 값을 정한다. 그래서 바닥도 인자로 받고, 바닥이 또 반투명이면(필드셋처럼)
 * 이 함수를 겹쳐 쓴다.
 */
function alphaOver(src: readonly number[], alpha: number, dst: readonly number[]): number[] {
  return src.map((v, i) => Math.round(clamp01(v * alpha + (dst[i] ?? 0) * (1 - alpha)) * 255) / 255)
}

/** 합성된 색과 그 바닥의 대비비. */
function contrastOnBase(src: readonly number[], alpha: number, base: readonly number[]): number {
  return ratioOfLuminance(luminanceOf(alphaOver(src, alpha, base)), luminanceOf(base))
}

/** Oklab 좌표계에서의 색차. 사람이 겨우 구분하는 차이(JND)가 대략 0.02다. */
function deltaE(a: Oklch, b: Oklch): number {
  const lab = ({ l, c, h }: Oklch): [number, number, number] => {
    const rad = (h * Math.PI) / 180
    return [l, c * Math.cos(rad), c * Math.sin(rad)]
  }
  const [al, aa, ab] = lab(a)
  const [bl, ba, bb] = lab(b)
  return Math.hypot(al - bl, aa - ba, ab - bb)
}

/** 색상환에서의 각도 거리(0~180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

// ── 계약 대상 ─────────────────────────────────────────────────────────────

/** 채우기 전용 다섯. 값이 아니라 **뜻**이 계약이다. */
const FILL_TOKENS = [
  'color-metric-up',
  'color-metric-down',
  'color-metric-flat',
  'color-ci-band',
  'color-incomplete',
] as const

/** 텍스트·아이콘용 짝과 그 짝이 되는 채우기 토큰. */
const FOREGROUND_PAIRS = [
  ['color-metric-up-fg', 'color-metric-up'],
  ['color-metric-down-fg', 'color-metric-down'],
  ['color-metric-flat-fg', 'color-metric-flat'],
  ['color-incomplete-fg', 'color-incomplete'],
] as const

const ENGINE_TOKENS = [
  'color-engine-chatgpt',
  'color-engine-gemini',
  'color-engine-naver',
  'color-engine-google',
] as const

/** 앱 라이트 표면의 종이색. */
const lightBackground = (): Oklch => color('background', rootBlock, ':root')
/** 마케팅 다크 표면의 배경. */
const darkBackground = (): Oklch => color('background', darkBlock, '.surface-dark')

describe('제품 고유 디자인 토큰', () => {
  it.each([...FILL_TOKENS, ...FOREGROUND_PAIRS.map(([fg]) => fg), ...ENGINE_TOKENS])(
    '%s는 @theme 블록 안에 있다 — :root로 옮기면 유틸리티가 사라진다',
    (name) => {
      expect(readToken(name, themeBlock)).not.toBeNull()
    },
  )

  it('변화없음(flat)은 무채색이다 — 방향을 암시하는 색이면 안 된다', () => {
    // oklch 크로마 0.03 미만이면 눈에는 회색으로 읽힌다. 초록·빨강은 이 문턱을
    // 한참 넘는다.
    expect(themeColor('color-metric-flat').c).toBeLessThan(0.03)
    // 텍스트용 짝도 회색이어야 규칙이 유지된다.
    expect(themeColor('color-metric-flat-fg').c).toBeLessThan(0.03)
  })

  it('상승과 하락은 색상환에서 충분히 떨어져 있다', () => {
    expect(
      hueDistance(themeColor('color-metric-up').h, themeColor('color-metric-down').h),
    ).toBeGreaterThan(90)
  })

  it('상승과 하락은 명도가 같다 — 한쪽만 무거워 보이면 안 된다', () => {
    expect(themeColor('color-metric-up').l).toBe(themeColor('color-metric-down').l)
    expect(themeColor('color-metric-up-fg').l).toBe(themeColor('color-metric-down-fg').l)
  })

  it('신뢰구간 띠는 그 위에 올라갈 본문보다 훨씬 밝다 — 배경 역할이다', () => {
    expect(themeColor('color-ci-band').l).toBeGreaterThan(0.85)
  })
})

describe('대비 — 읽을 수 없는 라벨은 없는 라벨이다', () => {
  it.each(FOREGROUND_PAIRS)('--%s는 앱 라이트 배경 대비 4.5:1 이상이다', (fg) => {
    // 채우기 다섯은 면 전용이라 본문 기준에 못 미친다. 텍스트·아이콘은 반드시
    // 이 짝을 써야 한다.
    expect(contrastRatio(themeColor(fg), lightBackground())).toBeGreaterThanOrEqual(4.5)
  })

  it.each(FOREGROUND_PAIRS)('--%s는 짝이 되는 채우기색과 뜻이 같다 (같은 색상환 위치)', (fg, fill) => {
    // 명도만 움직인다. 색상각이 달라지면 같은 뜻의 색이 두 개가 된다.
    expect(themeColor(fg).h).toBe(themeColor(fill).h)
    // 라이트 표면에서는 "더 어두운 쪽"이 읽히는 쪽이다.
    expect(themeColor(fg).l).toBeLessThan(themeColor(fill).l)
  })

  it.each(ENGINE_TOKENS)('--%s는 앱 라이트 배경 대비 3:1 이상이다 — 선과 범례에 쓰인다', (name) => {
    expect(contrastRatio(themeColor(name), lightBackground())).toBeGreaterThanOrEqual(3)
  })

  it.each([...FOREGROUND_PAIRS.map(([fg]) => fg), ...ENGINE_TOKENS])(
    '--%s는 sRGB 게멋 안에 있다 — 잘리면 실제 화면 색이 계산과 달라진다',
    (name) => {
      expect(inSrgbGamut(themeColor(name))).toBe(true)
    },
  )
})

describe('엔진 계열색 — 지표 의미와 섞이면 안 된다', () => {
  const SEMANTIC_HUES = [
    ['상승', 'color-metric-up'],
    ['하락', 'color-metric-down'],
    ['불완전', 'color-incomplete'],
  ] as const

  it.each(ENGINE_TOKENS)('--%s는 지표 색상각·브랜드 색상각에서 40도 이상 떨어져 있다', (name) => {
    const engine = themeColor(name)
    for (const [, token] of SEMANTIC_HUES) {
      expect(hueDistance(engine.h, themeColor(token).h)).toBeGreaterThanOrEqual(40)
    }
    const brand = color('primary', rootBlock, ':root')
    expect(hueDistance(engine.h, brand.h)).toBeGreaterThanOrEqual(40)
  })

  it('엔진 넷은 서로 구분된다 — 인접 계열·범례에서 헷갈리면 안 된다', () => {
    for (let a = 0; a < ENGINE_TOKENS.length; a++) {
      for (let b = a + 1; b < ENGINE_TOKENS.length; b++) {
        const [na, nb] = [ENGINE_TOKENS[a], ENGINE_TOKENS[b]]
        if (na === undefined || nb === undefined) continue
        // JND(약 0.02)의 일곱 배 이상 벌린다.
        expect(deltaE(themeColor(na), themeColor(nb))).toBeGreaterThan(0.15)
      }
    }
  })

  it('회색은 여전히 "변화 없음" 하나만 뜻한다 — 계열색으로 새지 않았다', () => {
    // --chart-1..5(명도만 다른 회색 램프)를 되살리면 회색이 두 가지 뜻을 갖는다.
    expect(readToken('chart-1')).toBeNull()
    for (const name of ENGINE_TOKENS) {
      expect(themeColor(name).c).toBeGreaterThan(0.03)
    }
  })
})

describe('토큰 구조 계약 — 리뉴얼 v3', () => {
  it('마케팅 다크 스코프(.surface-dark)가 있고 배경은 순수 검정이 아니다', () => {
    const dark = blockBody(/\.surface-dark\s*\{/)
    // 브라우저가 스크롤바·자동완성·폼 컨트롤을 다크로 그리게 하는 유일한 수단.
    expect(dark).toContain('color-scheme: dark')
    const bg = readToken('background', dark)
    expect(bg).not.toBeNull()
    expect(bg).not.toMatch(/^#000000$|^oklch\(\s*0\s+0\s+0\s*\)$/)
    const l = parseOklch(bg)?.l
    if (l !== undefined) expect(l).toBeGreaterThan(0.05) // 오프블랙
  })

  it('앱 라이트(:root) 배경·전경 대비는 AA를 유지한다', () => {
    const fg = color('foreground', rootBlock, ':root')
    expect(contrastRatio(fg, lightBackground())).toBeGreaterThanOrEqual(4.5)
  })

  it('엔진 계열색 4종이 이름으로 존재하고 서로 구분된다', () => {
    for (const name of ['engine-chatgpt', 'engine-gemini', 'engine-naver', 'engine-google']) {
      expect(readToken(`color-${name}`, themeBlock)).not.toBeNull()
    }
    for (let a = 0; a < ENGINE_TOKENS.length; a++) {
      for (let b = a + 1; b < ENGINE_TOKENS.length; b++) {
        const [na, nb] = [ENGINE_TOKENS[a], ENGINE_TOKENS[b]]
        if (na === undefined || nb === undefined) continue
        expect(deltaE(themeColor(na), themeColor(nb))).toBeGreaterThan(0.15)
      }
    }
  })

  it('지표 방향색(up/down/flat)이 의미 색상각을 유지한다 — 초록/빨강/무채색', () => {
    const up = parseOklch(readToken('color-metric-up', themeBlock))
    const down = parseOklch(readToken('color-metric-down', themeBlock))
    const flat = parseOklch(readToken('color-metric-flat', themeBlock))
    expect(up && up.h > 120 && up.h < 180).toBe(true)
    expect(down && (down.h < 45 || down.h > 340)).toBe(true)
    expect(flat && flat.c < 0.03).toBe(true)
  })

  it('reduced-motion 킬 스위치는 duration·delay·iteration을 전부 중화한다', () => {
    const media = blockBody(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/)
    for (const decl of [
      'transition-duration: 0.01ms !important',
      'animation-duration: 0.01ms !important',
      'animation-iteration-count: 1 !important',
      'animation-delay: 0.01ms !important',
      'transition-delay: 0ms !important',
    ])
      expect(media).toContain(decl)
  })

  it('제품 토큰 블록은 @theme static이다 — 안 쓰는 토큰이 빌드에서 사라지면 안 된다', () => {
    // Tailwind v4는 어떤 유틸리티도 참조하지 않는 @theme 변수를 출력에서 버린다
    // (빌드 산출물로 실측). Task 3~8이 아직 안 쓴 토큰(--motion-reveal 등)이
    // 그렇게 사라지면, GSAP/Motion이 getComputedStyle로 읽을 때 빈 문자열이
    // 돌아와 모션이 조용히 죽는다. static은 사용 여부와 무관하게 전부 발행한다.
    expect(css).toMatch(/@theme\s+static\s*\{/)
  })

  it('elevation 3단이 존재하고 다층이다', () => {
    for (const n of [1, 2, 3]) {
      const v = readToken(`elev-${n}`, rootBlock)
      expect(v).not.toBeNull()
      expect((v ?? '').split(',').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('elevation은 @theme inline의 별칭이다 — 실값을 @theme에 두면 다크에서 안 바뀐다', () => {
    // Tailwind v4는 shadow 유틸리티를 만들 때 값을 레이어별로 쪼개 빌드 시점에
    // 인라인한다(산출물 실측:
    //   .shadow-elevation-1{--tw-shadow:0 0 0 1px var(--tw-shadow-color,#12161d08), …}).
    // 색이 리터럴로 박히면 .surface-dark의 재선언이 유틸리티에 닿지 못한다.
    // --radius와 같은 패턴 — 이름은 inline, 실값은 :root / .surface-dark.
    for (const n of [1, 2, 3]) {
      expect(readToken(`shadow-elevation-${n}`, inlineBlock)).toBe(`var(--elev-${n})`)
      // 실값이 @theme(static)에 남아 있으면 다시 인라인된다.
      expect(readToken(`shadow-elevation-${n}`, themeBlock)).toBeNull()
    }
  })
})

describe('마케팅 다크 스코프 — 같은 뜻, 다른 표면', () => {
  it('다크 배경 위 전경 대비도 AA를 유지한다', () => {
    expect(
      contrastRatio(darkColor('foreground'), darkBackground()),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('shadcn 표면 변수를 빠짐없이 다시 선언한다 — 하나라도 빠지면 라이트 값이 샌다', () => {
    // 라이트에서 상속되면 어두운 배경 위에 흰 카드가 뚫린다.
    for (const name of [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
      'destructive',
      'border',
      'input',
      'ring',
    ]) {
      expect(readToken(name, darkBlock)).not.toBeNull()
    }
  })

  it('보조 텍스트(muted-foreground)도 다크 배경에서 AA다', () => {
    expect(
      contrastRatio(darkColor('muted-foreground'), darkBackground()),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(FOREGROUND_PAIRS)('--%s는 다크 스코프에서도 4.5:1 이상이다', (fg) => {
    // 라이트 값을 그대로 상속하면 어두운 배경에서 대비가 무너진다 — 그래서
    // .surface-dark가 지표 색도 함께 다시 선언한다.
    expect(contrastRatio(darkColor(fg), darkBackground())).toBeGreaterThanOrEqual(4.5)
  })

  it.each(ENGINE_TOKENS)('--%s는 다크 스코프에서 3:1 이상이다', (name) => {
    expect(contrastRatio(darkColor(name), darkBackground())).toBeGreaterThanOrEqual(3)
  })

  it.each([...FOREGROUND_PAIRS.map(([fg]) => fg), ...ENGINE_TOKENS])(
    '--%s의 다크 값도 sRGB 게멋 안에 있다',
    (name) => {
      expect(inSrgbGamut(darkColor(name))).toBe(true)
    },
  )

  it('다크에서도 뜻은 그대로다 — flat은 무채색, up/down은 같은 명도·같은 색상각', () => {
    expect(darkColor('color-metric-flat').c).toBeLessThan(0.03)
    expect(darkColor('color-metric-flat-fg').c).toBeLessThan(0.03)
    expect(darkColor('color-metric-up').l).toBe(darkColor('color-metric-down').l)
    expect(darkColor('color-metric-up-fg').l).toBe(darkColor('color-metric-down-fg').l)
    for (const [fg, fill] of FOREGROUND_PAIRS) {
      expect(darkColor(fg).h).toBe(themeColor(fill).h)
      // 다크에서는 "더 밝은 쪽"이 읽히는 쪽이다 — 라이트와 방향이 뒤집힌다.
      expect(darkColor(fg).l).toBeGreaterThan(darkColor(fill).l)
    }
  })

  it('신뢰구간 띠는 다크에서도 배경 역할이다 — 배경보다 밝고 본문보다 어둡다', () => {
    const band = darkColor('color-ci-band')
    expect(band.l).toBeGreaterThan(darkBackground().l)
    expect(band.l).toBeLessThan(darkColor('foreground').l)
  })

  it('엔진 넷은 다크에서도 서로 구분된다', () => {
    // 라이트와 같은 방식 — 명도를 다시 유도하면서 둘이 붙어 버리기 쉽다
    // (gemini/naver를 0.66/0.70으로 뒀을 때 ΔE 0.127로 문턱 아래였다).
    for (let a = 0; a < ENGINE_TOKENS.length; a++) {
      for (let b = a + 1; b < ENGINE_TOKENS.length; b++) {
        const [na, nb] = [ENGINE_TOKENS[a], ENGINE_TOKENS[b]]
        if (na === undefined || nb === undefined) continue
        expect(deltaE(darkColor(na), darkColor(nb))).toBeGreaterThan(0.15)
      }
    }
  })

  /**
   * 인터랙티브 컨트롤의 경계 — WCAG 1.4.11(비텍스트 대비) 3:1.
   *
   * 장식 헤어라인(`--border`)에는 적용되지 않지만 **빈 입력 상자**에는 적용된다.
   * 글자가 없는 상태에서 그 사각형이 있다는 것을 알려 주는 것이 테두리뿐이기
   * 때문이다. `--border`(10%)와 리뉴얼 전 `--input`(14%)은 1.3~1.5:1로 한참
   * 아래였고, 그게 Task 3·4가 두 번 인계한 항목이다.
   *
   * ★ 값이 아니라 **결과**를 잠근다. 알파를 조금 낮추는 것은 눈에 잘 안 띄면서
   *   3:1을 조용히 깨는 종류의 변경이라, 리터럴 스냅샷이 아니라 합성 후 대비를
   *   계산해서 문턱을 지킨다(이 파일의 v3 원칙과 같다).
   */
  describe('--border-interactive — 빈 입력 상자의 경계는 3:1이다', () => {
    const interactive = (): { color: Oklch; alpha: number } => {
      const parsed = parseOklchAlpha(readToken('border-interactive', darkBlock))
      if (!parsed) {
        throw new Error('.surface-dark에 oklch(L C H / P%) 형식의 --border-interactive가 없다')
      }
      return parsed
    }

    /** 폼이 실제로 앉는 세 바닥. 필드셋은 카드 위에 흰색 4%를 얹은 판이다. */
    const bases = (): Record<string, number[]> => {
      const card = srgb8(darkColor('card'))
      return {
        카드: card,
        '페이지 배경': srgb8(darkBackground()),
        // request-form.tsx의 선택 항목 필드셋 = `bg-foreground/[0.04]`.
        // 바닥이 반투명이라 합성을 한 번 더 겹친다.
        필드셋: alphaOver(srgb8(darkColor('foreground')), 0.04, card),
      }
    }

    it.each(['카드', '페이지 배경', '필드셋'])('%s 위에서 3:1을 넘는다', (where) => {
      const { color: c, alpha } = interactive()
      const base = bases()[where]
      expect(base).toBeDefined()
      expect(contrastOnBase(srgb8(c), alpha, base ?? [])).toBeGreaterThanOrEqual(3)
    })

    it('입력 테두리가 실제로 이 토큰을 탄다 — 이름만 있고 안 쓰이면 계약이 아니다', () => {
      // ★ 파싱 예외: `--input`은 다크 스코프에서 **색이 아니라 참조**다. 그래서
      //   `parseOklch`가 아니라 문자열로 확인한다. 이 참조가 끊기면 위 세 단언이
      //   전부 통과하면서도 화면의 입력 테두리는 예전 값으로 돌아간다.
      expect(readToken('input', darkBlock)).toBe('var(--border-interactive)')
    })

    it('장식 헤어라인(--border)까지 밝히지는 않는다', () => {
      // 유리 표면의 가장자리는 반사광이다. 여기까지 3:1로 올리면 soft-skill
      // §3.A의 헤어라인 언어가 통째로 무너진다. 텍스트 라벨이 있는 컨트롤
      // (ghost CTA 알약)은 글자가 식별의 몫을 하므로 1.4.11 대상이 아니다.
      const border = parseOklchAlpha(readToken('border', darkBlock))
      expect(border).not.toBeNull()
      expect(border?.alpha ?? 1).toBeLessThan(interactive().alpha)
    })
  })

  it('elevation 3단도 다크에서 다시 선언된다 — 라이트 틴트 그림자는 다크에서 보이지 않는다', () => {
    for (const n of [1, 2, 3]) {
      const v = readToken(`elev-${n}`, darkBlock)
      expect(v).not.toBeNull()
      expect((v ?? '').split(',').length).toBeGreaterThanOrEqual(2)
    }
  })

  it('마케팅이 열리면 루트도 다크로 넘어간다 — 창 스크롤바가 밝은 채 남으면 안 된다', () => {
    // `.surface-dark`는 자기 서브트리만 바꾼다. 뷰포트 스크롤바와 오버스크롤
    // 캔버스는 루트 요소가 정하므로 래퍼가 손댈 수 없다.
    expect(css).toMatch(/html:has\(\.surface-dark\)\s*\{\s*color-scheme:\s*dark;/)

    // 그리고 그 캔버스 색은 다크 표면의 배경과 **같은 값**이어야 한다. 여기서는
    // var(--background)를 쓸 수 없어서(그 변수는 래퍼 안쪽에서만 다크다) 값을
    // 한 번 더 적었고, 그래서 갈라질 수 있다. 갈라지면 여기서 걸린다.
    const rule = /html:has\(\.surface-dark\)\s+body\s*\{\s*background-color:\s*([^;]+);/.exec(css)
    expect(rule?.[1]?.trim()).toBe(readToken('background', darkBlock))
  })

  it('다크 표면의 기본 칠은 base 레이어에 있다 — 유틸리티가 이겨야 한다', () => {
    // 언레이어로 두면 같은 특이도(0,1,0)의 bg-*·text-*를 레이어 순서로 이겨
    // 버려서, 래퍼에 붙인 배경 오버라이드가 통째로 죽는다.
    const base = blockBody(/@layer\s+base\s*\{/)
    expect(base).toMatch(/\.surface-dark\s*\{[^}]*background-color:\s*var\(--background\)/)
    expect(base).toMatch(/\.surface-dark\s*\{[^}]*color:\s*var\(--foreground\)/)
  })
})

describe('폼 컨트롤의 깊이와 다크 호버 — 계약 지점만 잠근다', () => {
  // ★ 여기서 클래스 문자열 스냅샷을 뜨지 않는다. 그건 디자인을 못 바꾸게
  //   막을 뿐 사고를 잡지 못한다(이 파일 머리말의 v3 방침과 같은 이유).
  //   잠그는 것은 **깨지면 화면이 조용히 틀리는 두 지점**뿐이다.

  const uiSource = (name: string): string =>
    readFileSync(
      fileURLToPath(new URL(`../src/components/ui/${name}.tsx`, import.meta.url)),
      'utf8',
    )

  it('--recess-1이 두 표면 모두에 있다 — 없으면 그림자 선언이 통째로 무효가 된다', () => {
    // Tailwind는 box-shadow를 `var(--tw-inset-shadow), …, var(--tw-shadow)`
    // 한 줄로 합성한다. 이 변수가 없으면 var()가 풀리지 않아 **선언 전체**가
    // 무효가 되고, 같은 요소의 focus-visible:ring-3까지 함께 사라진다.
    for (const scope of [rootBlock, darkBlock]) {
      expect(readToken('recess-1', scope)).not.toBeNull()
    }
    // 다크 짝은 `none`이면 안 된다 — 위와 같은 이유로 목록 안의 `none`은
    // 유효하지 않은 값이다. 투명 그림자여야 한다.
    expect(readToken('recess-1', darkBlock)).not.toBe('none')
  })

  // button은 outline variant가 같은 사고를 안고 있다 — 마케팅 신청 폼에서
  // 입력·셀렉트와 **나란히** 서는 컨트롤이라 가드가 빠지면 그 줄만 호버에서
  // 흐려진다. 세 파일이 같은 값(흰색 50%)을 쓰는지까지 여기서 잠근다.
  it.each(['input', 'select', 'button'])(
    '%s.tsx가 다크 호버 테두리를 따로 잡는다 — 없으면 호버에서 테두리가 오히려 흐려진다',
    (name) => {
      const source = uiSource(name)
      // 라이트 호버(`hover:border-ring/…`)를 쓰면서 다크 가드가 없으면,
      // 다크 표면에서 그 값이 --input(흰색 36%)을 덮어써서 테두리가
      // 오히려 흐려진다(빈 입력 실측 1.96:1 — WCAG 1.4.11 미달).
      expect(source).toMatch(/dark:hover:border-\[oklch\(/)

      // 그리고 그 값은 다크 기본 테두리보다 **밝아야** 한다. 어두우면 가드가
      // 있어도 방향이 뒤집힌 것이라 의미가 없다. 둘 다 순백의 알파라
      // 알파 비교만으로 충분하다(같은 색을 같은 바닥에 얹는다).
      const guard = /dark:hover:border-\[(oklch\([^\]]+)\)\]/.exec(source)?.[1]
      expect(guard).toBeDefined()
      const guardAlpha = parseOklchAlpha(`${guard?.split('_').join(' ')})`)?.alpha
      const baseAlpha = parseOklchAlpha(readToken('border-interactive', darkBlock))?.alpha
      expect(guardAlpha).toBeDefined()
      expect(baseAlpha).toBeDefined()
      expect(guardAlpha ?? 0).toBeGreaterThan(baseAlpha ?? 1)
    },
  )
})

describe('모션 토큰 — 값이 컴포넌트에 흩어지면 안 된다', () => {
  it('지속시간·이징이 이름으로 존재한다', () => {
    for (const name of [
      'motion-micro',
      'motion-enter',
      'motion-state',
      'motion-draw',
      'motion-reveal',
      'motion-stagger',
      'ease-instrument',
      'ease-glide',
      'ease-spring',
    ]) {
      expect(readToken(name, themeBlock)).not.toBeNull()
    }
  })

  it('이징은 전부 cubic-bezier다 — linear·ease-in-out 금지(soft-skill §2)', () => {
    for (const name of ['ease-instrument', 'ease-glide', 'ease-spring']) {
      expect(readToken(name, themeBlock)).toMatch(/^cubic-bezier\(/)
    }
  })
})
