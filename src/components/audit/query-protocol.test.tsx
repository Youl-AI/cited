// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DISPLAYED_JUDGE_MODEL, QueryProtocol } from '@/components/audit/query-protocol'
import { KNOWN_CATEGORIES, generateAuditQueries, isRegionalCategory } from '@/lib/audit/queries'
import { JUDGE_MODEL } from '@/lib/judge/claude'

afterEach(cleanup)

describe('QueryProtocol', () => {
  // ★ 판정 모델 문자열은 클라이언트 번들 사정으로 복제되어 있다
  //   (`judge/claude.ts`는 SDK·env를 끌고 와 클라이언트에 못 들어간다).
  //   이 테스트가 유일한 동기화 장치다 — 모델을 바꾸고 이게 깨지면
  //   `query-protocol.tsx`의 DISPLAYED_JUDGE_MODEL을 같이 고쳐라.
  it('표기된 판정 모델이 실제 판정 모델과 같다', () => {
    expect(DISPLAYED_JUDGE_MODEL).toBe(JUDGE_MODEL)
  })

  it('첫 카테고리의 실제 질의 3개를 그대로 보여준다', () => {
    render(<QueryProtocol />)
    const first = KNOWN_CATEGORIES[0]
    expect(first).toBeDefined()
    for (const query of generateAuditQueries(first as string, '')) {
      expect(screen.getByText(query)).toBeInTheDocument()
    }
  })

  it('카테고리를 바꾸면 그 카테고리의 질의로 바뀐다', () => {
    render(<QueryProtocol />)
    const second = KNOWN_CATEGORIES[1]
    expect(second).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: second as string }))
    for (const query of generateAuditQueries(second as string, '')) {
      expect(screen.getByText(query)).toBeInTheDocument()
    }
    // 이전 카테고리의 질의는 사라져야 한다 — 둘이 겹쳐 보이면 어느 것이
    // 측정 질의인지 알 수 없다.
    const firstQuery = generateAuditQueries(KNOWN_CATEGORIES[0] as string, '')[0] as string
    expect(screen.queryByText(firstQuery)).not.toBeInTheDocument()
  })

  it('표본 질의와 일치하는 줄에만 표식이 붙는다', () => {
    const first = KNOWN_CATEGORIES[0] as string
    const target = generateAuditQueries(first, '')[0] as string
    render(<QueryProtocol specimenQuery={target} />)
    expect(screen.getByText('위 표본의 질문')).toBeInTheDocument()
  })

  it('표본 질의가 템플릿에 없으면 표식이 사라진다 (조용한 거짓 방지)', () => {
    // 랜딩의 표본 문구가 템플릿과 어긋나는 순간을 드러내는 장치다.
    // E2E가 표식의 존재를 단언하므로, 어긋나면 배포 전에 걸린다.
    render(<QueryProtocol specimenQuery="템플릿에 없는 질문" />)
    expect(screen.queryByText('위 표본의 질문')).not.toBeInTheDocument()
  })

  it('브랜드명 없이 질의를 만든다 — 질의에 브랜드가 들어가면 측정이 무효다', () => {
    // 컴포넌트는 generateAuditQueries(category, '')를 부른다. 이 성질이
    // 바뀌어 브랜드명이 필요해지면 이 렌더 자체가 흔들리므로 여기서 못박는다.
    // 지역형 업종은 지역 없이 던지므로(의도) 탭에 없다 — 전국형만 보증한다.
    for (const category of KNOWN_CATEGORIES) {
      if (isRegionalCategory(category)) continue
      expect(() => generateAuditQueries(category, '')).not.toThrow()
    }
  })
})
