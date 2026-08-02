// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResultView } from '@/components/audit/result-view'
import type { AuditResult } from '@/lib/audit/result'
import { formatInterval, wilsonInterval } from '@/lib/stats/wilson'

// `globals: true`가 아니므로 RTL이 자동 정리를 걸지 못한다. 명시적으로 건다 —
// 안 걸면 이전 테스트의 DOM이 남아 `getByText`가 중복으로 던진다.
afterEach(cleanup)

/**
 * 화면에 보이는 글자 전체.
 *
 * ★ 숫자는 mono로 조판하려고 `<span>`으로 감싼다("sans는 말, mono는 계측값"
 *   규칙). 그래서 `주 3회`가 세 개의 텍스트 노드로 쪼개지고 `getByText`가
 *   찾지 못한다. 화면에는 분명히 그렇게 보이므로, 조판 때문에 단언을 약하게
 *   만들지 않고 정규화한 textContent를 본다.
 */
function visibleText(container: HTMLElement): string {
  return (container.textContent ?? '').replace(/\s+/g, ' ')
}

const base: AuditResult = {
  version: 1,
  brandName: '무신사',
  category: '패션',
  competitors: ['29CM'],
  engines: ['gemini'],
  measuredAt: '2026-07-30T02:00:00.000Z',
  totalAnswers: 3,
  citedRate: wilsonInterval(1, 3),
  shareOfVoice: wilsonInterval(1, 3),
  ranking: [
    { name: '29CM', mentions: 2, isSelf: false },
    { name: '무신사', mentions: 1, isSelf: true },
  ],
  evidence: [
    {
      query: '러닝화 추천',
      engineId: 'gemini',
      text: '무신사가 좋습니다.',
      mentioned: true,
      context: '첫 번째로 언급',
      sentiment: 'recommended',
      position: 1,
    },
  ],
  byEngine: { gemini: wilsonInterval(1, 3) },
  byQuery: [{ queryText: '러닝화 추천', interval: wilsonInterval(0, 1) }],
  aliases: ['MUSINSA'],
  sources: [
    {
      domain: 'namu.wiki',
      answers: 2,
      share: wilsonInterval(2, 3),
      pages: [{ url: 'https://namu.wiki/w/x', title: '나무위키 - 무신사', answers: 2 }],
      owner: 'third-party',
    },
  ],
  sourceSummary: {
    totalAnswers: 3,
    answersWithCitations: 2,
    distinctDomains: 1,
    selfAnswers: 0,
  },
  hasSelfDomains: false,
  unresolved: 0,
}

describe('ResultView', () => {
  it('큰 숫자와 신뢰구간을 같은 블록에 함께 보여준다', () => {
    // ★ 화면 어딘가에 구간이 있는 것으로는 부족하다. 큰 숫자 옆에 없으면
    //   고객은 그 숫자를 점추정으로 읽는다.
    //
    // ★ 계획서는 `2% ~ 87%`를 기대했지만 이 구현의 값이 아니다. Wilson score
    //   구간에서 k=1·n=3은 `6% ~ 79%`다(2%~87%는 다른 구간 계산법의 값이다).
    //   그래서 값을 손으로 적지 않고 `formatInterval`로 유도한다 — 손으로 적으면
    //   그 값이 맞는지 아무도 다시 확인하지 않는다.
    render(<ResultView result={base} />)
    const block = screen.getByTestId('headline')
    const expected = formatInterval(base.citedRate)
    expect(visibleText(block)).toContain('33%')
    expect(visibleText(block)).toContain(expected)
    expect(expected).toBe('6% ~ 79%')
  })

  it('측정 조건(엔진·경쟁사·시각)을 보여준다', () => {
    const { container } = render(<ResultView result={base} />)
    expect(visibleText(container)).toContain('2026-07-30')
    expect(screen.getAllByText(/29CM/).length).toBeGreaterThan(0)
  })

  it('엔진을 내부 식별자가 아니라 표시 이름으로 쓴다', () => {
    // ★ `google_aio`·`chatgpt`는 내부 식별자다. 실제로 랜딩에 "무료 진단은
    //   chatgpt · gemini만 봅니다"가 찍혀 나갔다.
    const { container } = render(
      <ResultView
        result={{
          ...base,
          engines: ['chatgpt', 'google_aio'],
          evidence: [{ ...base.evidence[0]!, engineId: 'google_aio' }],
        }}
      />,
    )
    const text = visibleText(container)
    expect(text).toContain('ChatGPT')
    expect(text).toContain('Google AI 개요')
    expect(text).not.toContain('google_aio')
  })

  it('모르는 엔진 값은 지우지 않고 그대로 보여준다', () => {
    // 리포트는 jsonb로 저장된다. 과거 리포트에 지금 없는 엔진이 들어 있을 수
    // 있고, 그때 이름이 사라지면 측정 조건을 재현할 수 없다.
    const { container } = render(<ResultView result={{ ...base, engines: ['perplexity'] }} />)
    expect(visibleText(container)).toContain('perplexity')
  })

  it('경쟁사가 없으면 Share of Voice 영역을 아예 그리지 않는다', () => {
    render(
      <ResultView result={{ ...base, competitors: [], shareOfVoice: wilsonInterval(0, 0) }} />,
    )
    expect(screen.queryByText(/점유율|Share of Voice/)).not.toBeInTheDocument()
  })

  it('미판정이 있으면 표시한다', () => {
    render(<ResultView result={{ ...base, unresolved: 2 }} />)
    expect(screen.getByText(/판정하지 못/)).toBeInTheDocument()
  })

  it('미판정이 0이면 그 줄을 그리지 않는다', () => {
    render(<ResultView result={base} />)
    expect(screen.queryByText(/판정하지 못/)).not.toBeInTheDocument()
  })

  it('언급이 0건이어도 증거를 보여준다', () => {
    render(
      <ResultView
        result={{
          ...base,
          citedRate: wilsonInterval(0, 3),
          evidence: [{ ...base.evidence[0]!, mentioned: false, context: null, sentiment: null }],
        }}
      />,
    )
    expect(screen.getByText(/무신사가 좋습니다/)).toBeInTheDocument()
  })

  it('인용 출처를 보여준다', () => {
    render(<ResultView result={base} />)
    expect(screen.getByText('namu.wiki')).toBeInTheDocument()
  })

  it('언급률 0%일 때도 인용 출처는 그린다', () => {
    // ★ 0%가 가장 흔한 결과다. 여기서 출처까지 없으면 리포트에 남는 것이
    //   "당신은 없습니다" 한 줄뿐이고, 고객이 할 수 있는 일이 없다.
    render(<ResultView result={{ ...base, citedRate: wilsonInterval(0, 3) }} />)
    expect(screen.getByText('namu.wiki')).toBeInTheDocument()
  })

  it('도메인을 모르면 "우리 사이트 인용 없음"을 쓰지 않는다', () => {
    // ★ hasSelfDomains가 false면 selfAnswers 0은 "모른다"는 뜻이다.
    //   그것을 "한 번도 인용되지 않았습니다"로 쓰면 근거 없는 단정이 된다.
    render(<ResultView result={base} />)
    expect(screen.queryByText(/한 번도 인용되지 않/)).not.toBeInTheDocument()
  })

  it('도메인을 모르면 알려 달라고 요청한다', () => {
    render(<ResultView result={base} />)
    expect(screen.getByText(/사이트 주소를 알려/)).toBeInTheDocument()
  })

  it('도메인을 알고 0회면 그 사실을 분명히 쓴다', () => {
    render(<ResultView result={{ ...base, hasSelfDomains: true }} />)
    expect(screen.getByText(/한 번도 인용되지 않/)).toBeInTheDocument()
  })

  it('도메인을 알고 1회 이상이면 인용됐다고 쓴다', () => {
    const { container } = render(
      <ResultView
        result={{
          ...base,
          hasSelfDomains: true,
          sourceSummary: { ...base.sourceSummary, selfAnswers: 2 },
        }}
      />,
    )
    expect(visibleText(container)).toMatch(/2개 답변에서 인용/)
    expect(screen.queryByText(/한 번도 인용되지 않/)).not.toBeInTheDocument()
  })

  it('인용이 하나도 없으면 출처 섹션을 그리지 않는다', () => {
    render(
      <ResultView
        result={{
          ...base,
          sources: [],
          sourceSummary: {
            totalAnswers: 3,
            answersWithCitations: 0,
            distinctDomains: 0,
            selfAnswers: 0,
          },
        }}
      />,
    )
    expect(screen.queryByText(/AI가 읽는 출처/)).not.toBeInTheDocument()
  })

  it('측정에 쓴 표기를 보여준다', () => {
    // ★ 고객이 빠진 표기를 알려줄 수 있는 유일한 지점이다. 별칭이 언급률을
    //   좌우하므로 그 제보가 다음 측정의 정확도를 올린다.
    render(<ResultView result={base} />)
    expect(screen.getByText(/MUSINSA/)).toBeInTheDocument()
  })

  it('질의별 결과를 metrics가 준 순서대로 그린다', () => {
    // 언급률이 낮은 순 — "이 질문에서 안 나온다"가 위로 와야 행동으로 이어진다.
    const two: AuditResult = {
      ...base,
      byQuery: [
        { queryText: '안 나오는 질문', interval: wilsonInterval(0, 1) },
        { queryText: '나오는 질문', interval: wilsonInterval(1, 1) },
      ],
    }
    render(<ResultView result={two} />)
    const rows = screen.getAllByTestId('query-row')
    expect(rows[0]).toHaveTextContent('안 나오는 질문')
    expect(rows[1]).toHaveTextContent('나오는 질문')
  })

  it('1회 측정이라는 사실과 유료의 차이를 말한다', () => {
    const { container } = render(<ResultView result={base} />)
    const text = visibleText(container)
    expect(text).toMatch(/1 ?회 측정/)
    expect(text).toMatch(/주 3 ?회/)
  })

  it('요금제로 가는 링크가 있다', () => {
    render(<ResultView result={base} />)
    expect(screen.getByRole('link', { name: /요금제/ })).toHaveAttribute('href', '/pricing')
  })

  it('경쟁사 순위에 자기 브랜드를 표시한다', () => {
    render(<ResultView result={base} />)
    const rows = screen.getAllByTestId('ranking-row')
    expect(rows).toHaveLength(2)
    // 언급 수 내림차순이므로 29CM이 먼저다.
    expect(rows[0]).toHaveTextContent('29CM')
    expect(rows[1]).toHaveTextContent('무신사')
  })

  it('답변 원문의 스크립트를 실행 가능한 형태로 넣지 않는다', () => {
    // 답변 원문은 AI가 만든 것이고 무엇이 들어 있을지 모른다.
    const { container } = render(
      <ResultView
        result={{
          ...base,
          evidence: [{ ...base.evidence[0]!, text: '<script>alert(1)</script>' }],
        }}
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()
  })
})

describe('증거 표시', () => {
  it('언급된 답변에서 우리 브랜드에 순서 번호를 붙인다', () => {
    // ★ 랜딩이 보여주는 것과 같아야 한다. 랜딩에만 번호가 있으면
    //   "보여준 것과 받은 것이 다르다"가 된다.
    render(
      <ResultView
        result={{
          ...base,
          evidence: [{ ...base.evidence[0]!, text: '무신사가 좋습니다.', position: 2 }],
        }}
      />,
    )
    expect(screen.getByLabelText('2번째로 언급')).toBeInTheDocument()
  })

  it('미언급 답변에는 우리 브랜드 표시를 붙이지 않는다', () => {
    // 판정이 "언급 아님"인데 원문에 표기가 우연히 있으면(동명이의어)
    // 표시가 판정과 어긋난다.
    const { container } = render(
      <ResultView
        result={{
          ...base,
          evidence: [
            { ...base.evidence[0]!, mentioned: false, context: null, sentiment: null, position: null },
          ],
        }}
      />,
    )
    expect(container.querySelectorAll('mark')).toHaveLength(0)
  })

  it('등록한 경쟁사는 표시하되 순서 번호는 붙이지 않는다', () => {
    // 경쟁사의 답변별 순서는 리포트에 담지 않는다. 없는 값을 지어내지 않는다.
    const { container } = render(
      <ResultView
        result={{
          ...base,
          evidence: [{ ...base.evidence[0]!, text: '29CM이 좋습니다.', mentioned: false, position: null }],
        }}
      />,
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]?.querySelector('sup')).toBeNull()
  })
})

describe('유료 확장', () => {
  it('가이드가 있으면 개선 가이드 섹션을 렌더한다', () => {
    render(
      <ResultView
        result={base}
        tier="deluxe"
        guide={'## 첫 번째로 할 일\n\n티스토리에 후기 글을 쓰세요'}
      />,
    )
    expect(screen.getByRole('heading', { name: /개선 가이드/ })).toBeInTheDocument()
    expect(screen.getByText('티스토리에 후기 글을 쓰세요')).toBeInTheDocument()
  })

  it('가이드가 없으면 섹션 자체가 없다 — 빈 약속을 보여주지 않는다', () => {
    render(<ResultView result={base} tier="standard" />)
    expect(screen.queryByRole('heading', { name: /개선 가이드/ })).not.toBeInTheDocument()
  })

  it('가이드 마크다운의 HTML을 실행 가능한 형태로 넣지 않는다', () => {
    // 가이드는 운영자가 쓰지만, 렌더 경로가 raw HTML을 살리면 그 보증이
    // 사람의 실수 하나에 걸린다. react-markdown은 rehype-raw 없이는 HTML
    // 노드를 렌더하지 않는다 — 그 사실을 여기 못박는다.
    render(
      <ResultView
        result={base}
        tier="deluxe"
        guide={'주의: <script>alert(1)</script>안전한 텍스트'}
      />,
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/안전한 텍스트/)).toBeInTheDocument()
  })

  it('전후 비교가 있으면 이전 측정과 나란히 보여준다', () => {
    const before = { ...base, citedRate: wilsonInterval(1, 60) }
    const after = { ...base, citedRate: wilsonInterval(30, 60) }
    const { container } = render(
      <ResultView result={after} tier="premium" compare={{ before, beforeDate: '2026-07-01' }} />,
    )
    // ★ 텍스트 매칭이 아니라 제목 role이다 — PDF 표지의 티어 라벨
    //   "정밀 진단 + 전후 비교"도 /전후 비교/에 걸리기 때문.
    expect(screen.getByRole('heading', { name: '전후 비교' })).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    // 두 측정값이 함께 보인다 — 이전과 이번.
    const text = visibleText(container)
    expect(text).toContain(formatInterval(before.citedRate))
    expect(text).toContain(formatInterval(after.citedRate))
  })

  it('전후 신뢰구간이 겹치면 "측정 오차 범위"라고 정직하게 말한다', () => {
    const before = { ...base, citedRate: wilsonInterval(5, 6) }
    render(
      <ResultView result={base} tier="premium" compare={{ before, beforeDate: '2026-07-01' }} />,
    )
    expect(screen.getByText(/오차 범위/)).toBeInTheDocument()
    expect(screen.queryByText(/유의미한 (상승|하락)/)).not.toBeInTheDocument()
  })

  it('전후 신뢰구간이 겹치지 않으면 유의미한 변화라고 판정한다', () => {
    const before = { ...base, citedRate: wilsonInterval(1, 60) }
    const after = { ...base, citedRate: wilsonInterval(30, 60) }
    render(
      <ResultView result={after} tier="premium" compare={{ before, beforeDate: '2026-07-01' }} />,
    )
    expect(screen.getByText(/유의미한 상승/)).toBeInTheDocument()
  })

  it('엔진 구성이 다르면 변화 판정을 하지 않는다', () => {
    // 숫자가 떨어진 이유가 실제 하락인지 엔진 누락인지 알 수 없다.
    const before = { ...base, engines: ['chatgpt'], citedRate: wilsonInterval(1, 60) }
    const after = { ...base, citedRate: wilsonInterval(30, 60) }
    render(
      <ResultView result={after} tier="premium" compare={{ before, beforeDate: '2026-07-01' }} />,
    )
    expect(screen.getByText(/비교할 수 없/)).toBeInTheDocument()
    expect(screen.queryByText(/유의미한 (상승|하락)/)).not.toBeInTheDocument()
  })

  it('유료 리포트는 PDF 표지를 넣는다 — 화면에는 숨기고 인쇄에서만 편다', () => {
    // 표지는 납품 문서의 첫 장이다. 화면(`hidden`)에는 없고 인쇄(`print:flex`)에만
    // 있어야 하며, 표지에는 브랜드명·티어 라벨·측정 조건이 실린다.
    const { container } = render(<ResultView result={base} tier="deluxe" />)
    const cover = screen.getByText('AI 언급 진단 리포트').closest('section')
    expect(cover).not.toBeNull()
    expect(cover?.className).toContain('hidden')
    expect(cover?.className).toContain('print:flex')
    expect(cover?.className).toContain('break-after-page')
    const coverText = (cover?.textContent ?? '').replace(/\s+/g, ' ')
    expect(coverText).toContain('무신사')
    expect(coverText).toContain('정밀 진단 + 개선 가이드')
    expect(coverText).toContain('2026-07-30')
    expect(coverText).toContain('MUSINSA')
    // 표지의 대표 계측값 — 큰 숫자 옆에 구간이 반드시 함께 있어야 한다.
    // 본문 요약 카드와 같은 규칙: 점추정 단독 노출은 거짓말이다.
    expect(coverText).toContain('33%')
    expect(coverText).toContain(formatInterval(base.citedRate))
    expect(visibleText(container)).toContain('cited.co.kr')
  })

  it('표지의 엔진 이름도 내부 식별자가 아니라 표시 이름이다', () => {
    render(<ResultView result={{ ...base, engines: ['google_aio'] }} tier="standard" />)
    const cover = screen.getByText('AI 언급 진단 리포트').closest('section')
    const coverText = (cover?.textContent ?? '').replace(/\s+/g, ' ')
    expect(coverText).toContain('Google AI 개요')
    expect(coverText).not.toContain('google_aio')
  })

  it('무료 리포트에는 PDF 표지가 없다 — 공짜 PDF에 납품 문서의 옷을 입히지 않는다', () => {
    const { container } = render(<ResultView result={base} />)
    expect(screen.queryByText('AI 언급 진단 리포트')).not.toBeInTheDocument()
    expect(visibleText(container)).not.toContain('cited.co.kr')
  })

  it('유료 리포트는 "무료 진단"이라고 말하지 않는다', () => {
    // 표제·해석 문구가 무료 전용 카피를 그대로 쓰면 산 것과 받은 것이 다르다.
    const { container } = render(<ResultView result={base} tier="standard" />)
    expect(visibleText(container)).not.toContain('무료 진단')
    expect(visibleText(container)).toContain('정밀 진단 리포트')
  })
})

describe('ResultView variant="run" (정기 측정 회차 상세)', () => {
  it('표제가 정기 측정 리포트다 — 산 것과 받은 것이 같아야 한다', () => {
    render(<ResultView result={base} variant="run" />)
    expect(screen.getByText('정기 측정 리포트')).toBeInTheDocument()
    expect(screen.queryByText(/무료 진단 리포트/)).toBeNull()
  })

  it('요금제 업셀 섹션이 없다 — 이미 구독 중인 고객이다', () => {
    render(<ResultView result={base} variant="run" />)
    expect(screen.queryByRole('link', { name: '요금제 보기' })).toBeNull()
  })

  it('기본값은 audit — 기존 화면 무변경', () => {
    render(<ResultView result={base} />)
    expect(screen.getByText('무료 진단 리포트')).toBeInTheDocument()
  })
})

describe('우리 브랜드와 경쟁사를 구분해서 표시한다', () => {
  it('두 표시가 서로 다르게 보인다', () => {
    // ★ 표시가 같아 보이면 이 화면의 요점이 사라진다 — 밑줄이 내 브랜드인지
    //   남의 브랜드인지 구분되지 않는다. 특정 색이 아니라 **다르다는 것**을
    //   단언한다(색을 바꿔도 통과하고, 같아지면 실패한다).
    const { container } = render(
      <ResultView
        result={{
          ...base,
          evidence: [{ ...base.evidence[0]!, text: '무신사와 29CM을 추천합니다.', position: 1 }],
        }}
      />,
    )
    const marks = [...container.querySelectorAll('mark')]
    expect(marks).toHaveLength(2)
    const classes = marks.map((m) => m.className)
    expect(classes[0]).not.toBe(classes[1])
  })
})
