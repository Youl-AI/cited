import type { RunPoint } from './data'

/**
 * 회차별 수치 CSV — 내보내기 버튼의 데이터. 순수 모듈(I/O 없음).
 *
 * ## 왜 CSV인가
 *
 * B2B 고객의 종착지는 보고서·스프레드시트다(동종 제품들도 Export가 우상단
 * 고정 자리다). PDF는 이미 회차 상세가 맡고 있고, 여기는 **수치의 원본**을
 * 넘긴다 — 붙여넣어 자기 차트를 그릴 수 있는 형태.
 *
 * ## 정직성 규칙
 *
 * - **모르는 값은 빈 칸이다, 0이 아니다.** 점유율(경쟁사 미등록)과 우리 사이트
 *   인용(도메인 미등록)이 그렇다 — 0을 적으면 스프레드시트에서 평균·추세에
 *   섞여 들어가 없는 사실이 된다.
 * - 비율은 반올림한 %가 아니라 **소수 4자리 원시값**이다. 화면은 정수 %로
 *   말하지만 내보내기는 분석용이다 — 반올림을 여기서 하면 받은 쪽이 되돌릴
 *   수 없다. k·n도 같이 실어 재계산 가능하게 한다.
 * - 신뢰구간 하한·상한을 뺀 내보내기는 없다 — 점추정만 나가면 화면이 지켜온
 *   "구간 없이 말하지 않는다"가 파일에서 깨진다.
 *
 * ★ 셀 이스케이프: 쉼표·따옴표·줄바꿈이 든 셀은 RFC 4180대로 큰따옴표로
 *   감싸고 내부 따옴표는 겹친다. 브랜드명·질의문이 들어올 자리는 없지만
 *   방어적으로 전 셀에 적용한다.
 * ★ BOM은 여기서 붙이지 않는다 — 문자열 조립과 파일 인코딩은 다른 층이다.
 *   다운로드 버튼이 `﻿`를 앞에 붙인다(Excel이 UTF-8 한글을 읽는 조건).
 */

const HEADER = [
  'measured_at',
  'total_answers',
  'cited_k',
  'cited_rate',
  'cited_ci_lower',
  'cited_ci_upper',
  'sov_rate',
  'sov_ci_lower',
  'sov_ci_upper',
  'distinct_domains',
  'self_cited_answers',
] as const

function cell(v: string | number | null): string {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const r4 = (v: number) => Math.round(v * 10000) / 10000

export function buildDashboardCsv(points: readonly RunPoint[]): string {
  const rows = points.map((p) => {
    const r = p.result
    const sov = r.shareOfVoice.n > 0 ? r.shareOfVoice : null
    const self = r.hasSelfDomains ? r.sourceSummary.selfAnswers : null
    return [
      r.measuredAt,
      r.totalAnswers,
      r.citedRate.k,
      r4(r.citedRate.point),
      r4(r.citedRate.lower),
      r4(r.citedRate.upper),
      sov ? r4(sov.point) : null,
      sov ? r4(sov.lower) : null,
      sov ? r4(sov.upper) : null,
      r.sourceSummary.distinctDomains,
      self,
    ]
      .map(cell)
      .join(',')
  })
  return [HEADER.join(','), ...rows].join('\n')
}

/** 파일 이름 — `cited-무신사-2026-08-03.csv`. 날짜는 마지막 회차의 측정일. */
export function csvFilename(brandName: string, points: readonly RunPoint[]): string {
  const last = points[points.length - 1]
  const date = last ? last.result.measuredAt.slice(0, 10) : 'empty'
  return `cited-${brandName}-${date}.csv`
}
