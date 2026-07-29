import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 이 테스트는 스타일 취향이 아니라 **의미 계약**을 지킨다.
// 5단계 대시보드는 지표의 방향(상승·하락·변화없음)과 수집 품질(신뢰구간·불완전)을
// 오직 이 다섯 토큰으로만 표현한다. 값이 조용히 바뀌면 화면은 여전히 렌더되지만
// 의미가 뒤집힌다 — 특히 `--color-metric-flat`이 초록이 되는 순간, 설계 ③의
// "신뢰구간이 겹치면 변화 없음" 규칙이 시각적으로 거짓말을 하기 시작한다.
// 그래서 색이 아니라 규칙을 검증한다.
//
// ★ 규칙은 전부 **globals.css에서 읽은 값**으로 검사한다. 예전에는 이 파일 안의
//   리터럴 객체를 파싱해서 검사했는데, 그건 상수끼리 비교하는 것이라 스타일시트가
//   텅 비어 있어도 전부 초록이었다. 값 일치 실패와 의미 규칙 실패는 독립된
//   사건이어야 한다.

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

// `@theme inline {`이 아니라 값 리터럴이 들어가는 `@theme {`이다.
// 제품 토큰이 여기 있어야 Tailwind가 text-metric-* / bg-engine-* 유틸리티를
// 만들어 준다. 평범한 :root로 옮기면 변수는 살아 있지만 유틸리티가 사라져서
// 5단계 화면이 조용히 색을 잃는다 — 그래서 위치도 단언한다.
const themeBlock = blockBody(/@theme\s*\{/)
const rootBlock = blockBody(/:root\s*\{/)

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

/** @theme 블록에서 토큰을 읽어 oklch로 푼다. 없거나 형식이 다르면 던진다. */
function themeColor(name: string): Oklch {
  const parsed = parseOklch(readToken(name, themeBlock))
  if (!parsed) throw new Error(`@theme 블록에 oklch 형식의 --${name}이 없다`)
  return parsed
}

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

/** 브라우저가 실제로 그리는 8비트 색 기준의 WCAG 상대 휘도. */
function relativeLuminance(color: Oklch): number {
  const [r, g, b] = toLinearSrgb(color)
    .map((v) => Math.round(clamp01(gammaEncode(clamp01(v))) * 255) / 255)
    .map(gammaDecode)
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
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

// ── 계약값 ────────────────────────────────────────────────────────────────

/** 계획서가 고정한 다섯. 값 자체가 계약이다. */
const PRODUCT_TOKENS = {
  'color-metric-up': 'oklch(0.55 0.12 155)',
  'color-metric-down': 'oklch(0.55 0.18 25)',
  'color-metric-flat': 'oklch(0.62 0.01 90)',
  'color-ci-band': 'oklch(0.92 0.02 250)',
  'color-incomplete': 'oklch(0.75 0.12 70)',
} as const

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

const background = (): Oklch => {
  const parsed = parseOklch(readToken('background', rootBlock))
  if (!parsed) throw new Error(':root에 oklch 형식의 --background가 없다')
  return parsed
}

describe('제품 고유 디자인 토큰', () => {
  it.each(Object.entries(PRODUCT_TOKENS))('%s 토큰이 브리프가 지정한 값 그대로다', (name, expected) => {
    expect(readToken(name, themeBlock)).toBe(expected)
  })

  it.each([...Object.keys(PRODUCT_TOKENS), ...FOREGROUND_PAIRS.map(([fg]) => fg), ...ENGINE_TOKENS])(
    '%s는 @theme 블록 안에 있다 — :root로 옮기면 유틸리티가 사라진다',
    (name) => {
      expect(readToken(name, themeBlock)).not.toBeNull()
    },
  )

  it('변화없음(flat)은 무채색이다 — 방향을 암시하는 색이면 안 된다', () => {
    // oklch 크로마 0.03 미만이면 눈에는 회색으로 읽힌다. 초록(0.12)·빨강(0.18)은
    // 이 문턱을 한참 넘는다.
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
  it.each(FOREGROUND_PAIRS)('--%s는 배경 대비 4.5:1 이상이다', (fg) => {
    // 계획서가 고정한 다섯은 채우기 전용이라 flat 3.58:1 · incomplete 2.23:1로
    // 본문 기준에 못 미친다. 텍스트·아이콘은 반드시 이 짝을 써야 한다.
    expect(contrastRatio(themeColor(fg), background())).toBeGreaterThanOrEqual(4.5)
  })

  it.each(FOREGROUND_PAIRS)('--%s는 짝이 되는 채우기색과 뜻이 같다 (같은 색상환 위치)', (fg, fill) => {
    // 명도만 내린다. 색상각이 달라지면 같은 뜻의 색이 두 개가 된다.
    expect(themeColor(fg).h).toBe(themeColor(fill).h)
    expect(themeColor(fg).l).toBeLessThan(themeColor(fill).l)
  })

  it.each(ENGINE_TOKENS)('--%s는 배경 대비 3:1 이상이다 — 선과 범례에 쓰인다', (name) => {
    expect(contrastRatio(themeColor(name), background())).toBeGreaterThanOrEqual(3)
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
    ['상승', 155],
    ['하락', 25],
    ['불완전', 70],
  ] as const

  it.each(ENGINE_TOKENS)('--%s는 지표 색상각·브랜드 색상각에서 40도 이상 떨어져 있다', (name) => {
    const engine = themeColor(name)
    for (const [, hue] of SEMANTIC_HUES) {
      expect(hueDistance(engine.h, hue)).toBeGreaterThanOrEqual(40)
    }
    const brand = parseOklch(readToken('primary', rootBlock))
    expect(brand).not.toBeNull()
    expect(hueDistance(engine.h, brand?.h ?? 0)).toBeGreaterThanOrEqual(40)
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
