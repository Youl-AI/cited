import { describe, expect, it } from 'vitest'
import { SPECIMEN } from '@/components/marketing/actuals'
import { QUERY_TEMPLATES } from '@/lib/audit/query-templates'

/**
 * 신청서 레일의 질의 미리보기가 화면에서 하는 주장을 잠근다.
 *
 * 미리보기 캡션은 "업종 '패션'에 실제로 쓰는 질의 중 하나입니다"라고
 * 말한다(request-sheet.tsx). 그 문장이 참이려면 SPECIMEN.query가 실제로
 * '패션' 템플릿의 질의여야 한다 — SPECIMEN을 다른 업종 표본으로 바꾸면
 * 캡션만 조용히 거짓이 되므로, 그 포함 관계를 여기서 단언한다(하드 룰:
 * 화면의 주장은 데이터에서 온다).
 */
describe('신청서 질의 미리보기', () => {
  it("표본 질의는 '패션' 템플릿에 실재한다 — 캡션의 주장이 데이터에서 온다", () => {
    const fashion = QUERY_TEMPLATES.find((t) => t.label === '패션')
    expect(fashion).toBeDefined()
    expect(fashion?.queries).toContain(SPECIMEN.query)
  })
})
