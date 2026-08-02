import { describe, expect, test } from 'vitest'
import { changeSentence } from './change-copy'

describe('changeSentence — 판정 하나에 문장 하나', () => {
  test('unchanged는 오차 범위 문장', () => {
    expect(changeSentence('unchanged')).toContain('측정 오차 범위')
  })
  test('up/down은 신뢰구간 비겹침 문장', () => {
    expect(changeSentence('up')).toContain('상승')
    expect(changeSentence('down')).toContain('하락')
  })
  test('incomparable은 조건 차이 문장', () => {
    expect(changeSentence('incomparable')).toContain('비교할 수 없습니다')
  })

  /**
   * ★ 문장을 **글자 그대로** 못박는다. 이 모듈이 존재하는 이유가 "리포트와
   *   대시보드가 같은 판정에 같은 말을 한다"이므로, 부분 문자열만 보면 한쪽
   *   화면을 고치려고 문장을 손봐도 스위트가 초록으로 남는다. 여기 값은
   *   추출 전 `result-view.tsx`의 문자열과 바이트 단위로 같다.
   */
  test('네 문장은 추출 전 리포트 문구와 글자 그대로 같다', () => {
    expect(changeSentence('unchanged')).toBe(
      '두 측정의 신뢰구간이 겹칩니다 — 차이가 측정 오차 범위 안에 있어, 실제 변화라고 판정할 수 없습니다.',
    )
    expect(changeSentence('up')).toBe('신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 상승입니다.')
    expect(changeSentence('down')).toBe('신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 하락입니다.')
    expect(changeSentence('incomparable')).toBe(
      '두 측정의 조건(엔진 구성)이 달라 변화를 비교할 수 없습니다.',
    )
  })
})
