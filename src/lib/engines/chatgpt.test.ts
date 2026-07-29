import { describe, expect, it } from 'vitest'
import {
  cleanCitationUrl,
  extractUsage,
  parseChatgptResponse,
  stripInlineCitations,
} from '@/lib/engines/chatgpt'

/**
 * 2026-07-30 실측 응답을 최소화한 것. 필드명을 추측하지 않았다 —
 * .tmp-probe로 실제 응답을 받아 확인한 형태다.
 */
const raw = {
  status: 'completed',
  model: 'gpt-5-mini-2025-08-07',
  output: [
    {
      type: 'web_search_call',
      id: 'ws_1',
      status: 'completed',
      // ★ 질의가 여러 개지만 청구는 호출 1건이다.
      action: { type: 'search', queries: ['q1', 'q2', 'q3'], query: 'q1' },
    },
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '30대 남성 러닝화로는 나이키 페가수스와 아식스 젤카야노를 추천합니다.',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://a.example/1?utm_source=openai',
              title: '러닝화 리뷰',
            },
            { type: 'url_citation', url: 'https://b.example/2', title: '2026 추천' },
          ],
        },
      ],
    },
  ],
  tool_usage: { web_search: { num_requests: 1 } },
  usage: {
    input_tokens: 8468,
    output_tokens: 358,
    output_tokens_details: { reasoning_tokens: 84 },
    total_tokens: 8826,
  },
}

describe('parseChatgptResponse', () => {
  it('최종 텍스트를 뽑아낸다', () => {
    expect(parseChatgptResponse(raw).text).toContain('나이키 페가수스')
  })

  it('인용을 url/title로 정규화한다', () => {
    const c = parseChatgptResponse(raw).citations
    expect(c).toHaveLength(2)
    expect(c[0]).toEqual({ url: 'https://a.example/1', title: '러닝화 리뷰' })
  })

  it('web_search_call 블록의 내용을 답변 본문에 섞지 않는다', () => {
    expect(parseChatgptResponse(raw).text).not.toContain('q1')
  })

  it('reasoning 블록도 본문에 섞지 않는다', () => {
    const withReasoning = {
      ...raw,
      output: [
        { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: '생각중' }] },
        ...raw.output,
      ],
    }
    expect(parseChatgptResponse(withReasoning).text).not.toContain('생각중')
  })

  it('추적 파라미터 차이로 같은 페이지가 두 번 세지지 않는다', () => {
    const dup = structuredClone(raw)
    dup.output[1]!.content![0]!.annotations!.push({
      type: 'url_citation',
      url: 'https://a.example/1',
      title: '다른 제목',
    })
    expect(parseChatgptResponse(dup).citations).toHaveLength(2)
  })

  it('url_citation이 아닌 주석은 인용이 아니다', () => {
    const other = structuredClone(raw)
    other.output[1]!.content![0]!.annotations! = [
      { type: 'file_citation', url: 'https://x.example', title: '파일' },
    ]
    expect(parseChatgptResponse(other).citations).toEqual([])
  })

  it('제목이 비면 URL을 제목으로 쓴다', () => {
    const noTitle = structuredClone(raw)
    noTitle.output[1]!.content![0]!.annotations! = [
      { type: 'url_citation', url: 'https://a.example/1', title: '' },
    ]
    expect(parseChatgptResponse(noTitle).citations[0]?.title).toBe('https://a.example/1')
  })

  it('텍스트 블록이 여러 개면 이어붙인다', () => {
    const multi = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '앞부분.', annotations: [] },
            { type: 'output_text', text: ' 뒷부분.', annotations: [] },
          ],
        },
      ],
    }
    expect(parseChatgptResponse(multi).text).toBe('앞부분. 뒷부분.')
  })

  it('인용이 없어도 던지지 않는다', () => {
    const noCite = {
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '답변', annotations: [] }],
        },
      ],
    }
    expect(parseChatgptResponse(noCite).citations).toEqual([])
  })

  it('status를 그대로 넘긴다 (빈 답변 원인 판정에 쓴다)', () => {
    expect(parseChatgptResponse({ status: 'incomplete', output: [] }).status).toBe('incomplete')
  })

  it('예상치 못한 형태면 빈 텍스트를 돌려주고 던지지 않는다', () => {
    expect(parseChatgptResponse({ unexpected: true }).text).toBe('')
    expect(parseChatgptResponse({ unexpected: true }).citations).toEqual([])
  })

  it('null/undefined를 받아도 던지지 않는다', () => {
    expect(parseChatgptResponse(null).text).toBe('')
    expect(parseChatgptResponse(undefined).text).toBe('')
  })
})

describe('stripInlineCitations — 언급률 부풀림 방지', () => {
  // 2026-07-30 실측 답변에서 그대로 가져온 형태
  const real =
    '- Nike Pegasus 42 — 반응성 좋고 다목적(템포·일상 훈련 모두 가능). ([nike.com](https://www.nike.com/a/pegasus-42-release-date?utm_source=openai))  \n' +
    '- HOKA Clifton 10 — 경량이면서 쿠셔닝이 좋아 장거리에 적합. ([nz.hoka.com](https://nz.hoka.com/blog/clifton-10?utm_source=openai))'

  it('URL에 든 브랜드명이 본문에 남지 않는다', () => {
    // 이게 남으면 출처로만 인용된 브랜드가 "언급됨"으로 잡혀 Cited Rate가
    // 실제보다 높아진다. 우리가 파는 것이 그 숫자다.
    const out = stripInlineCitations(real)
    expect(out).not.toContain('nike.com')
    expect(out).not.toContain('hoka.com')
    expect(out).not.toContain('http')
  })

  it('본문에서 진짜 언급된 브랜드는 남긴다', () => {
    const out = stripInlineCitations(real)
    expect(out).toContain('Nike Pegasus 42')
    expect(out).toContain('HOKA Clifton 10')
    expect(out).toContain('반응성 좋고 다목적')
  })

  it('괄호로 감싸지 않은 맨 마크다운 링크도 지운다', () => {
    expect(stripInlineCitations('무신사가 좋습니다 [musinsa.com](https://musinsa.com/a).')).toBe(
      '무신사가 좋습니다.',
    )
  })

  it('링크가 아닌 마크다운은 건드리지 않는다 (고객에게 보여줄 원문이다)', () => {
    const md = '- **무신사 스탠다드**는 기본템이 좋습니다.\n1. 29CM\n2. 지그재그'
    expect(stripInlineCitations(md)).toBe(md)
  })

  it('링크가 없으면 그대로 돌려준다', () => {
    expect(stripInlineCitations('무신사를 추천합니다.')).toBe('무신사를 추천합니다.')
  })

  it('빈 문자열도 처리한다', () => {
    expect(stripInlineCitations('')).toBe('')
  })

  it('괄호 안 텍스트가 링크가 아니면 남긴다', () => {
    expect(stripInlineCitations('아식스(ASICS)를 추천합니다.')).toBe('아식스(ASICS)를 추천합니다.')
  })
})

describe('cleanCitationUrl', () => {
  it('utm_source만 지우고 나머지 파라미터는 남긴다', () => {
    expect(cleanCitationUrl('https://a.example/p?id=7&utm_source=openai')).toBe(
      'https://a.example/p?id=7',
    )
  })

  it('파라미터가 utm_source뿐이면 물음표까지 없앤다', () => {
    expect(cleanCitationUrl('https://a.example/p?utm_source=openai')).toBe('https://a.example/p')
  })

  it('파싱할 수 없는 값은 손대지 않는다', () => {
    expect(cleanCitationUrl('not a url')).toBe('not a url')
  })

  it('표기 차이를 정규화한다 (같은 페이지가 두 번 세지지 않게)', () => {
    // URL 파싱을 거치므로 호스트 대소문자와 루트 슬래시가 통일된다.
    // 이건 부작용이 아니라 중복 제거에 필요한 동작이다.
    expect(cleanCitationUrl('https://A.Example')).toBe('https://a.example/')
    expect(cleanCitationUrl('https://a.example/')).toBe('https://a.example/')
  })
})

describe('extractUsage', () => {
  it('청구 카운터를 읽는다 — 검색 질의 수가 아니라 호출 수다', () => {
    // action.queries가 3개지만 청구는 1건이다. 질의를 세면 원가가 3배가 된다.
    expect(extractUsage(raw).searches).toBe(1)
  })

  it('tool_usage가 없으면 web_search_call 항목 수로 물러선다', () => {
    const noToolUsage = { ...raw, tool_usage: undefined }
    expect(extractUsage(noToolUsage).searches).toBe(1)
  })

  it('검색을 안 했으면 0이다 (검색 요금이 붙지 않는다)', () => {
    const noSearch = {
      ...raw,
      tool_usage: { web_search: { num_requests: 0 } },
      output: [raw.output[1]],
    }
    expect(extractUsage(noSearch).searches).toBe(0)
  })

  it('사고 토큰을 출력 토큰에서 빼서 이중 계상을 막는다', () => {
    // OpenAI의 reasoning_tokens는 output_tokens에 이미 포함되어 있다.
    // pricing.ts가 tokensOut + tokensThinking으로 더하므로 여기서 빼야 한다.
    const u = extractUsage(raw)
    expect(u.tokensOut).toBe(358 - 84)
    expect(u.tokensThinking).toBe(84)
    expect((u.tokensOut ?? 0) + (u.tokensThinking ?? 0)).toBe(358)
  })

  it('사고 토큰이 출력 토큰보다 크다고 나와도 음수가 되지 않는다', () => {
    const weird = {
      ...raw,
      usage: { input_tokens: 10, output_tokens: 5, output_tokens_details: { reasoning_tokens: 99 } },
    }
    const u = extractUsage(weird)
    expect(u.tokensOut).toBe(0)
    expect(u.tokensThinking).toBe(5)
  })

  it('검색 본문은 input_tokens에 이미 들어 있다 (따로 더하지 않는다)', () => {
    expect(extractUsage(raw).tokensIn).toBe(8468)
  })

  it('usage가 없어도 던지지 않는다', () => {
    expect(extractUsage({ output: [] })).toEqual({
      calls: 1,
      searches: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensThinking: 0,
    })
  })

  it('null을 받아도 던지지 않는다', () => {
    expect(extractUsage(null).calls).toBe(1)
  })
})
