// @vitest-environment jsdom
// ★ 컴포넌트 테스트 규약 — 위 지시자·jest-dom import·afterEach(cleanup) 셋 다
//   필수다 (Task 9 `trend-chart.test.tsx` 주석 참고). tsc는 통과하고 실행이 깨진다.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { RunListItem } from '@/lib/dashboard/data'
import { RunListSection } from './run-list'

afterEach(cleanup)

const item = (over: Partial<RunListItem>): RunListItem => ({
  runId: 'r1',
  startedAt: '2026-08-03T18:30:00.000Z',
  status: 'succeeded',
  hasResult: true,
  ...over,
})

describe('RunListSection', () => {
  test('스냅샷 있는 회차는 상세로 가는 링크다', () => {
    render(<RunListSection items={[item({ runId: 'r9' })]} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/runs/r9')
  })

  /**
   * ★ `succeeded`인데 스냅샷이 없는 회차가 실제로 존재한다 (`parseRunResult`
   *   주석 — 측정은 끝났는데 저장만 실패). 이 회차는 "스냅샷 없음"으로 쓴다 —
   *   0%로 그리거나 목록에서 감추면 돈 낸 고객에게 없는 측정을 보여주게 된다.
   */
  test('succeeded인데 스냅샷이 없으면 스냅샷 없음으로 쓰고, 감추지도 0%로 그리지도 않는다', () => {
    const { container } = render(
      <RunListSection items={[item({ status: 'succeeded', hasResult: false })]} />,
    )
    expect(screen.getAllByTestId('run-row')).toHaveLength(1)
    expect(screen.getByText(/스냅샷 없음/)).toBeInTheDocument()
    expect(container.textContent).not.toContain('0%')
    // 상세가 없으므로 링크도 아니다.
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('실패 회차도 감추지 않는다', () => {
    render(
      <RunListSection
        items={[item({ runId: 'r2', status: 'failed', hasResult: false }), item({})]}
      />,
    )
    expect(screen.getAllByTestId('run-row')).toHaveLength(2)
    expect(screen.getByText('실패')).toBeInTheDocument()
  })

  /**
   * ★ §3 — 빈 상태는 방향을 준다. 동결 직후 첫 cron이 돌기 전의 브랜드가
   *   실제로 이 상태다. 제목 아래가 그냥 비어 있으면 고장으로 읽힌다 —
   *   무엇을 기다리는지·언제 오는지를 쓴다.
   */
  test('빈 목록이면 비워두지 않고 다음 측정이 언제인지 말한다', () => {
    render(<RunListSection items={[]} />)
    expect(screen.getByText(/첫 측정이 끝나면 여기에 회차가 쌓입니다/)).toBeInTheDocument()
    expect(screen.getByText(/월·수·금 새벽/)).toBeInTheDocument()
  })
})
