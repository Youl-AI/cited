'use client'

import { Button } from '@/components/ui/button'

/**
 * CSV 다운로드 버튼 — 서버 라우트 없이 클라이언트에서 파일을 만든다.
 *
 * ★ CSV **문자열은 서버 컴포넌트가 만들어 props로 준다**(`export-csv.ts` —
 *   순수 함수). 이 컴포넌트가 RunPoint[]를 통째로 받으면 회차 전체가
 *   클라이언트 번들 데이터로 직렬화된다 — 필요한 것은 완성된 문자열뿐이다.
 * ★ BOM(U+FEFF)은 여기서 붙인다 — Excel이 UTF-8 한글을 깨지 않고 여는
 *   조건. 문자열 조립(순수 모듈)과 파일 인코딩(다운로드 층)의 경계다.
 * ★ URL.revokeObjectURL — 누르는 만큼 Blob이 쌓이는 누수를 막는다.
 */
export function ExportCsvButton({ csv, filename }: { csv: string; filename: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }}
    >
      CSV 내보내기
    </Button>
  )
}
