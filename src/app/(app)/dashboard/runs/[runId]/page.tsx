import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ResultView } from '@/components/audit/result-view'
import { loadRunDetail } from '@/lib/dashboard/load'
import { requireUser } from '@/lib/session'

export const metadata = { title: '측정 회차' }

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  // (app) 규칙 — 페이지가 자체적으로 세션을 검증한다.
  const user = await requireUser()
  const { runId } = await params
  // ★ 소유 검증은 loadRunDetail의 JOIN이 한다 — 남의 회차면 404.
  const detail = await loadRunDetail(user.id, runId)
  if (!detail) notFound()

  return (
    <div>
      {/* ★ 폭·좌우 여백은 `ResultView`(`max-w-3xl px-6`)와 **같은 값이어야 한다.**
          다르면 뒤로가기 링크와 리포트 표제의 왼쪽 모서리가 어긋나서 화면이
          미묘하게 비뚤어 보인다((app) 레이아웃 주석과 같은 이유).
        ★ `print:hidden` — 이 링크는 화면 내비게이션이다. 회차 상세를 브라우저에서
          인쇄하면 종이에 "← 대시보드"가 남는다(같은 사고로 머리글도 숨긴다 —
          site-header.tsx). PDF 납품 경로(`/audit/[id]`)에는 이 링크가 없다. */}
      <div className="mx-auto max-w-3xl px-6 print:hidden">
        <Link
          href="/dashboard"
          className="group/back inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {/* 화살표만 되돌아간다 — 방향을 손끝에 붙여 주는 최소량이다.
              `aria-hidden`인 이유: 낭독은 "대시보드"면 충분하고, 화살표까지
              읽으면 링크 이름이 기호로 시작한다.
              ★ `transition-[translate]`인 이유는 **더 좁게 선언하기 위해서**다.
                Tailwind v4에서 `-translate-x-0.5`는 독립 `translate` 속성으로
                나오고(`--tw-translate-x:…;translate:var(--tw-translate-x) …`),
                `transition-transform` 유틸리티는 그걸 포함한다 — 실측:
                `transition-property:transform,translate,scale,rotate`. 즉
                **둘 다 동작한다.** 여기서 굳이 좁히는 것은 이 span이 움직이는
                것이 translate 하나뿐이라, 쓰지 않는 세 속성까지 전이 목록에
                올려 두지 않기 위해서다(`transition-all`을 쓰지 않는 것과 같은
                이유 — button.tsx 주석). `run-list.tsx`의 쐐기도 같은 형태다.
                ※ globals.css `.motion-press`가 `scale`을 **직접 적어야 했던**
                  것은 그쪽이 유틸리티가 아니라 손으로 쓴 `transition-property`
                  선언이기 때문이다. 원시 CSS의 `transform`은 `scale`을 포함하지
                  않는다 — 유틸리티의 확장 목록과 혼동하지 말 것. */}
          <span
            aria-hidden="true"
            className="transition-[translate] duration-[var(--motion-micro)] ease-instrument group-hover/back:-translate-x-0.5"
          >
            ←
          </span>
          <span className="underline underline-offset-2">대시보드</span>
        </Link>
      </div>
      <ResultView result={detail.result} variant="run" />
    </div>
  )
}
