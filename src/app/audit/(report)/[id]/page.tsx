import { notFound } from 'next/navigation'
import { ResultView } from '@/components/audit/result-view'
import { getAudit } from '@/lib/audit/repository'
import type { AuditResult } from '@/lib/audit/result'

export const dynamic = 'force-dynamic'

/**
 * ★ 이 페이지는 인증하지 않는다. `aud_` + 16바이트 난수 ID가 곧 비공개 링크다.
 *   로그인 벽을 세우면 리포트를 메일로 받은 사람이 못 본다.
 *
 * ★ 그래서 `noindex`가 필수다. 검색엔진에 남으면 비공개가 아니다.
 */
export const metadata = {
  title: '진단 리포트',
  robots: { index: false, follow: false },
}

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const audit = await getAudit(id)

  // ★ 발송 전 리포트를 노출하지 않는다. 링크를 미리 알아내도 볼 것이 없어야 한다 —
  //   운영자가 `--dry`로 확인하는 중인 미완성 결과가 새어 나가면 안 된다.
  if (!audit || audit.status !== 'sent' || !audit.result) notFound()

  // PREMIUM 재측정이면 원본을 불러 전후 비교를 만든다. 원본이 아직 발송 전이거나
  // 결과가 없으면 비교 없이 그린다 — 반쪽 비교를 보여주지 않는다.
  let compare: { before: AuditResult; beforeDate: string } | undefined
  if (audit.parentId) {
    const parent = await getAudit(audit.parentId)
    if (parent?.result && parent.sentAt) {
      compare = {
        before: parent.result as AuditResult,
        beforeDate: parent.sentAt.toISOString().slice(0, 10),
      }
    }
  }

  return (
    <ResultView
      result={audit.result as AuditResult}
      tier={audit.tier}
      {...(audit.guideMd ? { guide: audit.guideMd } : {})}
      {...(compare ? { compare } : {})}
    />
  )
}
