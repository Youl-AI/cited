// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { generateAuditQueries } from '@/lib/audit/queries'
import { freezeQueriesAction, generateQueriesAction } from '../actions'
import { QueryEditor } from './query-editor'

/**
 * 에디터의 **판정과 조작 규칙** 테스트.
 *
 * ★ 서버 액션은 `@/lib/db`(+Anthropic SDK)를 끌고 오므로 대체한다. 액션의
 *   게이트·한도 판정은 `actions.test.ts`가 덮는다 — 여기서 검증하는 것은
 *   "화면이 서버와 같은 규칙으로 같은 이유를 그 자리에서 말하는가"다.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('../actions', () => ({
  generateQueriesAction: vi.fn(async () => ({
    ok: true,
    value: { queries: ['새로 만든 후보 질의 하나 알려줘'], used: 1, limit: 5 },
  })),
  freezeQueriesAction: vi.fn(async () => ({ ok: true, value: { frozen: 5 } })),
}))

const ctx = {
  brandName: '무신사',
  competitors: ['29CM'],
  category: '패션',
}
// ★ 템플릿은 실제 규칙으로 만든 값이어야 한다. 손으로 적으면 템플릿이 바뀌었을 때
//   이 파일만 조용히 옛 값을 검증한다.
const templates = generateAuditQueries('패션', '무신사')

function renderEditor(
  initial: string[],
  overrides: { quota?: number; generationsUsed?: number; templates?: string[] } = {},
) {
  return render(
    <QueryEditor
      brandId="brd_x"
      initial={initial}
      quota={overrides.quota ?? 5}
      templates={overrides.templates ?? templates}
      generationsUsed={overrides.generationsUsed ?? 0}
      generationLimit={5}
      ctx={ctx}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('QueryEditor — 실시간 검증', () => {
  // ★ quota는 **상한**이다 (Task 4 리뷰 C-1). 빈 칸을 다 채우라고 요구하면
  //   템플릿 3개로 충분한 고객이 확정하지 못한다 — 서버는 3 ≤ n ≤ quota를 받는다.
  test('템플릿만 있어도 확정할 수 있다 — quota는 상한이지 정확한 개수가 아니다', () => {
    renderEditor([...templates, '', ''])
    expect(screen.getByRole('status')).toHaveTextContent(/확정할 수 있습니다/)
    expect(screen.getByRole('button', { name: '확정하기' })).toBeEnabled()
  })

  test('템플릿보다 적으면 확정 버튼이 비활성이고 이유가 보인다', () => {
    renderEditor([templates[0]!, templates[1]!])
    expect(screen.getByRole('button', { name: '확정하기' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/3개 이상/)
  })

  test('브랜드명을 넣으면 그 자리에서 거부 이유가 보인다', () => {
    renderEditor([...templates, '무신사 어때?', '겨울 코트 추천해줘'])
    expect(screen.getByRole('status')).toHaveTextContent(/브랜드명/)
    expect(screen.getByRole('button', { name: '확정하기' })).toBeDisabled()
  })

  test('유효한 세트면 확정 버튼이 활성화된다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘'])
    expect(screen.getByRole('status')).toHaveTextContent(/확정할 수 있습니다/)
    expect(screen.getByRole('button', { name: '확정하기' })).toBeEnabled()
  })

  test('수정하면 검증이 즉시 다시 돈다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?', '겨울 코트 브랜드 추천해줘'])
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[4]!, { target: { value: '29CM 말고 뭐 있어?' } })
    expect(screen.getByRole('status')).toHaveTextContent(/경쟁사명/)
    expect(screen.getByRole('button', { name: '확정하기' })).toBeDisabled()
  })

  test('질의 카운터와 생성 카운터가 보인다', () => {
    renderEditor([...templates, '', ''])
    expect(screen.getByText('3/5')).toBeInTheDocument()
    expect(screen.getByText(/AI 생성/)).toHaveTextContent('0/5회')
  })
})

describe('QueryEditor — 줄 조작', () => {
  // ★ 한도만큼 빈 줄을 미리 깔면 Business(30개)에서 빈 입력이 27줄 늘어선다
  //   (`brand-step-form.tsx`가 경쟁사 칸에서 내린 것과 같은 결정).
  test('패딩된 빈 칸을 그대로 그리지 않는다 — 필요한 만큼만 그리고 [줄 추가]로 늘린다', () => {
    renderEditor([...templates, '', '', '', ''], { quota: 7 })
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '줄 추가' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })

  // ★ Starter(질의 3개)는 상한과 템플릿 수가 같다 — 편집할 것이 하나도 없는
  //   화면이지만 **확정은 되어야 한다.** 여기서 막히면 그 플랜은 온보딩을 못 끝낸다.
  test('상한이 템플릿 수와 같으면(Starter) 늘리지도 생성하지도 못하지만 확정은 된다', () => {
    renderEditor(templates, { quota: 3 })
    expect(screen.getByRole('button', { name: '줄 추가' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /AI 후보/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '확정하기' })).toBeEnabled()
  })

  // ★ 템플릿을 지울 수 있게 두면 실패가 [확정]에서야 드러난다.
  test('템플릿 줄은 읽기 전용이고 삭제·재생성 버튼이 없다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?'])
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveAttribute('readonly')
    expect(inputs[3]).not.toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: '질의 1 삭제' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '질의 4 삭제' })).toBeInTheDocument()
  })

  test('맞춤 질의 줄은 삭제하면 사라진다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?'])
    fireEvent.click(screen.getByRole('button', { name: '질의 4 삭제' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  // ★ 크몽 전환 계정이 업종을 바꾸면 프리필된 동결 질의에 지금 템플릿이 없다.
  //   되돌릴 방법이 화면에 없으면 [확정]에서만 막히고 고칠 수가 없다.
  test('템플릿이 빠진 프리필은 [되돌리기]로 채운다', () => {
    renderEditor(['옛날 질의 하나 알려줘', '옛날 질의 둘 알려줘', '옛날 질의 셋 알려줘'], {
      quota: 6,
    })
    expect(screen.getByRole('status')).not.toHaveTextContent(/확정할 수 있습니다/)
    fireEvent.click(screen.getByRole('button', { name: '업종 공통 질의 되돌리기' }))
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    expect(screen.getByRole('status')).toHaveTextContent(/확정할 수 있습니다/)
  })

  test('되돌릴 자리가 없으면 몇 개를 지워야 하는지 말한다', () => {
    renderEditor(['옛날 질의 하나 알려줘', '옛날 질의 둘 알려줘', '옛날 질의 셋 알려줘'], {
      quota: 4,
    })
    expect(
      screen.queryByRole('button', { name: '업종 공통 질의 되돌리기' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/2개\s*삭제한 뒤/)).toBeInTheDocument()
  })
})

describe('QueryEditor — AI 생성', () => {
  test('빈 칸이 있으면 그 칸을 채운다', async () => {
    renderEditor([...templates, ''], { quota: 5 })
    fireEvent.click(screen.getByRole('button', { name: '줄 추가' }))
    fireEvent.click(screen.getByRole('button', { name: /빈 칸 1개 채우기/ }))
    await waitFor(() =>
      expect(generateQueriesAction).toHaveBeenCalledWith({ brandId: 'brd_x', count: 1 }),
    )
    await waitFor(() =>
      expect(screen.getAllByRole('textbox')[3]).toHaveValue('새로 만든 후보 질의 하나 알려줘'),
    )
  })

  test('빈 칸이 없으면 남은 상한만큼 줄을 늘려 생성한다', async () => {
    renderEditor(templates, { quota: 4 })
    fireEvent.click(screen.getByRole('button', { name: 'AI 후보 1개 만들기' }))
    await waitFor(() =>
      expect(generateQueriesAction).toHaveBeenCalledWith({ brandId: 'brd_x', count: 1 }),
    )
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(4))
  })

  // ★ 카운터는 표시용이다. 한도는 서버가 강제하고, 거절 문구도 서버 것을 그대로 쓴다.
  test('서버가 한도로 거절하면 서버 문구를 그대로 보여준다', async () => {
    vi.mocked(generateQueriesAction).mockResolvedValueOnce({
      ok: false,
      reason: 'AI 생성은 브랜드당 5회까지입니다. 남은 질의는 직접 수정해 주세요.',
    })
    renderEditor(templates, { quota: 4 })
    fireEvent.click(screen.getByRole('button', { name: 'AI 후보 1개 만들기' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'AI 생성은 브랜드당 5회까지입니다. 남은 질의는 직접 수정해 주세요.',
      ),
    )
  })

  test('크레딧을 다 쓰면 생성 버튼이 비활성이고 안내가 보인다', () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?'], { generationsUsed: 5 })
    expect(screen.getByRole('button', { name: /AI 후보/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '질의 4 재생성' })).toBeDisabled()
    expect(screen.getByText(/직접 써 주세요/)).toBeInTheDocument()
  })
})

describe('QueryEditor — 동결', () => {
  test('확정은 두 단계다 — 동결의 뜻을 먼저 보여준다', async () => {
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?'])
    fireEvent.click(screen.getByRole('button', { name: '확정하기' }))
    expect(screen.getByText(/동결 후에는 바꾸지 않습니다/)).toBeInTheDocument()
    expect(freezeQueriesAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '확정하고 동결' }))
    await waitFor(() =>
      // 빈 칸 패딩이 아니라 실제로 채운 질의만 넘긴다
      expect(freezeQueriesAction).toHaveBeenCalledWith({
        brandId: 'brd_x',
        queries: [...templates, '직장인 출근룩 어디서 참고해?'],
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/done'))
  })

  test('서버가 거절하면 이유를 보여주고 화면에 남는다', async () => {
    vi.mocked(freezeQueriesAction).mockResolvedValueOnce({
      ok: false,
      reason: '계정 전체 질의 한도(30개)가 남지 않았습니다 — 다른 브랜드가 30개를 쓰고 있습니다.',
    })
    renderEditor([...templates, '직장인 출근룩 어디서 참고해?'])
    fireEvent.click(screen.getByRole('button', { name: '확정하기' }))
    fireEvent.click(screen.getByRole('button', { name: '확정하고 동결' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/다른 브랜드가 30개/))
    expect(push).not.toHaveBeenCalled()
  })
})
