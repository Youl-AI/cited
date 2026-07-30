import { describe, expect, it } from 'vitest'
import { splitByMarks } from '@/components/audit/answer-specimen'
import type { SpecimenMark } from '@/components/audit/answer-specimen'

/** 표시 대상 하나 */
const self = (text: string, position?: number): SpecimenMark =>
  position === undefined ? { text, isSelf: true } : { text, position, isSelf: true }
const rival = (text: string, position?: number): SpecimenMark =>
  position === undefined ? { text, isSelf: false } : { text, position, isSelf: false }

describe('splitByMarks', () => {
  it('표시가 없으면 원문 한 덩어리를 돌려준다', () => {
    expect(splitByMarks('나이키를 추천합니다.', [])).toEqual([
      { text: '나이키를 추천합니다.', mark: null },
    ])
  })

  it('원문을 평문과 표시 구간으로 쪼갠다', () => {
    const parts = splitByMarks('무신사가 좋습니다.', [self('무신사', 1)])
    expect(parts.map((p) => p.text)).toEqual(['무신사', '가 좋습니다.'])
    expect(parts[0]?.mark?.isSelf).toBe(true)
    expect(parts[1]?.mark).toBeNull()
  })

  it('원문을 손실 없이 재조립할 수 있다', () => {
    // ★ 조각을 이어 붙이면 반드시 원문이 되어야 한다. 여기가 어긋나면
    //   고객에게 보여주는 "증거"가 원문과 다른 문장이 된다.
    const text = '온라인은 무신사, 디자이너는 W컨셉, 빠른 배송은 29CM입니다.'
    const parts = splitByMarks(text, [self('무신사', 1), rival('29CM', 3)])
    expect(parts.map((p) => p.text).join('')).toBe(text)
  })

  it('등록하지 않은 브랜드는 평문으로 남긴다', () => {
    // ★ 이 규칙이 Share of Voice의 주의사항을 화면으로 가르친다 —
    //   우리는 고객이 등록하지 않은 브랜드를 셀 수 없다.
    const parts = splitByMarks('무신사와 W컨셉', [self('무신사', 1)])
    const marked = parts.filter((p) => p.mark !== null).map((p) => p.text)
    expect(marked).toEqual(['무신사'])
    expect(parts.map((p) => p.text).join('')).toContain('W컨셉')
  })

  it('겹치는 표기는 긴 것을 먼저 잡는다', () => {
    // ★ 짧은 쪽을 먼저 잡으면 `무신사스탠다드`가 `무신사`[1] + `스탠다드`로
    //   찢어져서, 한 브랜드가 두 개로 보이고 위치 표시가 엉뚱한 곳에 붙는다.
    const parts = splitByMarks('무신사스탠다드를 추천합니다.', [
      self('무신사', 1),
      self('무신사스탠다드', 1),
    ])
    expect(parts[0]?.text).toBe('무신사스탠다드')
  })

  it('같은 표기가 여러 번 나오면 모두 표시한다', () => {
    const parts = splitByMarks('무신사, 그리고 무신사.', [self('무신사', 1)])
    expect(parts.filter((p) => p.mark !== null)).toHaveLength(2)
  })

  it('표기가 원문에 없으면 아무것도 표시하지 않는다', () => {
    // 별칭으로 매칭됐지만 다른 표기로 나타난 경우다. 억지로 표시하지 않는다.
    const parts = splitByMarks('MUSINSA가 좋습니다.', [self('무신사', 1)])
    expect(parts.every((p) => p.mark === null)).toBe(true)
  })

  it('빈 표기를 무시한다', () => {
    // 빈 문자열을 잡으려 들면 무한 루프가 된다.
    const parts = splitByMarks('무신사', [{ text: '', isSelf: true }])
    expect(parts).toEqual([{ text: '무신사', mark: null }])
  })

  it('원문이 비어 있어도 던지지 않는다', () => {
    expect(splitByMarks('', [self('무신사', 1)])).toEqual([])
  })

  it('위치를 모르면 위치 없는 표시를 만든다', () => {
    const parts = splitByMarks('무신사가 좋습니다.', [self('무신사')])
    expect(parts[0]?.mark?.position).toBeUndefined()
  })

  it('입력 배열을 변형하지 않는다', () => {
    // 내부에서 길이순 정렬을 하므로 복사본에 걸어야 한다.
    const marks = [self('무신사', 1), self('무신사스탠다드', 2)]
    splitByMarks('무신사스탠다드', marks)
    expect(marks.map((m) => m.text)).toEqual(['무신사', '무신사스탠다드'])
  })
})
