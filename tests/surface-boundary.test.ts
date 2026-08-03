import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 표면 경계 — 어떤 라우트가 다크이고 어떤 라우트가 라이트인가.
 *
 * 이건 취향이 아니라 **납품 계약**이다. `/audit/[id]`는 고객에게 보내는 진단
 * 리포트이고 `pnpm audit:pdf`가 그대로 인쇄한다. 다크로 넘어가면 잉크·대비가
 * 무너지고 유료 납품물이 웹페이지 캡처처럼 나온다.
 *
 * 이 경계는 **파일 배치로만** 지켜진다 — Next.js의 레이아웃은 하위 라우트를
 * 전부 감싸므로, `src/app/audit/layout.tsx`가 하나라도 있으면 신청 흐름에 건
 * 표면이 리포트까지 따라간다. 그래서 렌더 결과가 아니라 **배치 자체**를
 * 단언한다. 리뉴얼 도중 "레이아웃 하나로 합치자"가 나오면 여기서 빨개진다.
 */

const appDir = fileURLToPath(new URL('../src/app', import.meta.url))
const read = (relative: string): string => readFileSync(`${appDir}/${relative}`, 'utf8')

describe('audit 라우트의 표면 경계', () => {
  it('audit 밑에 공용 레이아웃이 없다 — 있으면 리포트까지 감싼다', () => {
    expect(existsSync(`${appDir}/audit/layout.tsx`)).toBe(false)
    // 라우트 그룹 둘과 그 레이아웃만 있어야 한다.
    expect(readdirSync(`${appDir}/audit`).sort()).toEqual(['(flow)', '(report)'])
  })

  it('신청 흐름(new · requested)은 마케팅 다크 껍데기를 쓴다', () => {
    const layout = read('audit/(flow)/layout.tsx')
    expect(layout).toContain('MarketingShell')
    expect(existsSync(`${appDir}/audit/(flow)/new/page.tsx`)).toBe(true)
    expect(existsSync(`${appDir}/audit/(flow)/requested/page.tsx`)).toBe(true)
  })

  it('리포트([id])는 라이트·인쇄 껍데기에 남는다', () => {
    const layout = read('audit/(report)/layout.tsx')
    expect(layout).toContain('SiteShell')
    expect(layout).not.toContain('MarketingShell')
    expect(layout).not.toContain('surface-dark')
    expect(existsSync(`${appDir}/audit/(report)/[id]/page.tsx`)).toBe(true)
  })

  it('URL은 그대로다 — 라우트 그룹은 주소에 나타나지 않는다', () => {
    // 메일로 나간 리포트 링크(`/audit/aud_…`)와 광고에 붙인 `/audit/new`가
    // 살아 있어야 한다. 그룹 이름이 괄호로 싸여 있는 한 경로에 끼어들지 않는다.
    for (const dir of ['(flow)', '(report)']) {
      expect(dir.startsWith('(')).toBe(true)
      expect(dir.endsWith(')')).toBe(true)
    }
  })
})

describe('다크 표면을 여는 곳은 하나다', () => {
  it('`surface-dark` 클래스를 붙이는 컴포넌트가 하나뿐이다', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url))
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`
        if (entry.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(entry.name)) files.push(full)
      }
    }
    walk(srcDir)

    // 주석이 아니라 **className에 실제로 붙는** 곳만 센다.
    const openers = files.filter((file) =>
      /className=(?:"|{`|')[^"'`]*\bsurface-dark\b/.test(readFileSync(file, 'utf8')),
    )
    expect(openers.map((f) => f.split(/[\\/]/).pop())).toEqual(['marketing-shell.tsx'])
  })
})
