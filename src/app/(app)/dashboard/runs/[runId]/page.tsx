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
      <div className="mx-auto max-w-3xl px-6">
        <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
          ← 대시보드
        </Link>
      </div>
      <ResultView result={detail.result} variant="run" />
    </div>
  )
}
