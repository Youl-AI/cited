import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 이 테스트는 스타일 취향이 아니라 **의미 계약**을 지킨다.
// 5단계 대시보드는 지표의 방향(상승·하락·변화없음)과 수집 품질(신뢰구간·불완전)을
// 오직 이 다섯 토큰으로만 표현한다. 값이 조용히 바뀌면 화면은 여전히 렌더되지만
// 의미가 뒤집힌다 — 특히 `--color-metric-flat`이 초록이 되는 순간, 설계 ③의
// "신뢰구간이 겹치면 변화 없음" 규칙이 시각적으로 거짓말을 하기 시작한다.
// 그래서 색이 아니라 규칙을 검증한다.

const cssPath = fileURLToPath(new URL('../src/app/globals.css', import.meta.url))
const css = readFileSync(cssPath, 'utf8')

/** `--color-foo: oklch(L C H);` 선언에서 값을 꺼낸다. 없으면 null. */
function readToken(name: string): string | null {
  const match = new RegExp(String.raw`--${name}\s*:\s*([^;]+);`).exec(css)
  return match?.[1]?.trim() ?? null
}

/** `oklch(L C H)` 문자열을 숫자 세 개로 푼다. 형식이 다르면 null. */
function parseOklch(value: string): { l: number; c: number; h: number } | null {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (!match) return null
  const [, l, c, h] = match
  if (l === undefined || c === undefined || h === undefined) return null
  return { l: Number(l), c: Number(c), h: Number(h) }
}

const PRODUCT_TOKENS = {
  'color-metric-up': 'oklch(0.55 0.12 155)',
  'color-metric-down': 'oklch(0.55 0.18 25)',
  'color-metric-flat': 'oklch(0.62 0.01 90)',
  'color-ci-band': 'oklch(0.92 0.02 250)',
  'color-incomplete': 'oklch(0.75 0.12 70)',
} as const

describe('제품 고유 디자인 토큰', () => {
  it.each(Object.entries(PRODUCT_TOKENS))('%s 토큰이 브리프가 지정한 값 그대로다', (name, expected) => {
    expect(readToken(name)).toBe(expected)
  })

  it('변화없음(flat)은 무채색이다 — 방향을 암시하는 색이면 안 된다', () => {
    const flat = parseOklch(PRODUCT_TOKENS['color-metric-flat'])
    expect(flat).not.toBeNull()
    // oklch 크로마 0.03 미만이면 눈에는 회색으로 읽힌다. 초록(0.12)·빨강(0.18)은
    // 이 문턱을 한참 넘는다.
    expect(flat?.c).toBeLessThan(0.03)
  })

  it('상승과 하락은 색상환에서 충분히 떨어져 있다', () => {
    const up = parseOklch(PRODUCT_TOKENS['color-metric-up'])
    const down = parseOklch(PRODUCT_TOKENS['color-metric-down'])
    expect(up).not.toBeNull()
    expect(down).not.toBeNull()
    const distance = Math.abs((up?.h ?? 0) - (down?.h ?? 0))
    expect(Math.min(distance, 360 - distance)).toBeGreaterThan(90)
  })

  it('상승과 하락은 명도가 같다 — 한쪽만 무거워 보이면 안 된다', () => {
    expect(parseOklch(PRODUCT_TOKENS['color-metric-up'])?.l).toBe(
      parseOklch(PRODUCT_TOKENS['color-metric-down'])?.l,
    )
  })

  it('신뢰구간 띠는 그 위에 올라갈 본문보다 훨씬 밝다 — 배경 역할이다', () => {
    const band = parseOklch(PRODUCT_TOKENS['color-ci-band'])
    expect(band?.l).toBeGreaterThan(0.85)
  })
})
