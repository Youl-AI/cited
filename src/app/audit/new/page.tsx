import Link from 'next/link'
import { RequestForm } from '@/components/audit/request-form'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 무료 진단 신청 — 독립 페이지.
 *
 * ## 랜딩의 폼을 대체하지 않는다
 *
 * 랜딩 히어로는 왼쪽에 실제 AI 답변, 오른쪽에 폼이다. 답변을 보고 "어 우리
 * 브랜드는?"이 되는 그 순간에 폼이 손 닿는 곳에 있어야 한다. 폼을 여기로
 * **옮기면** 그 순간과 행동 사이에 클릭이 하나 들어가고, GEO를 모르는
 * 사람일수록 거기서 샌다.
 *
 * 이 페이지가 있는 이유는 **주소가 필요해서**다:
 * - 머리글의 `무료 진단 받기` 버튼이 갈 곳 (랜딩에 있으면 눌러도 제자리다)
 * - 크몽 프로필·광고·메신저에 붙일 수 있는 링크
 *
 * `RequestForm`은 이미 분리된 컴포넌트라 두 곳에 두는 비용이 없다. 순서 안내와
 * "계정을 만들지 않는다"는 폼 **안에** 있으므로 여기서도 자동으로 따라온다.
 */

export const metadata = {
  title: '무료 진단 신청',
  description:
    'ChatGPT와 Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 메일로 보내드립니다. 카드 정보는 받지 않습니다.',
}

export default function NewAuditPage() {
  return (
    <section className="mx-auto w-full max-w-xl px-6 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">무료 진단 신청</h1>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground">
        {engineLabels(PLANS.free.engines).join('와 ')}에 소비자가 할 법한 질문{' '}
        <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를 직접 던지고,
        답변에 브랜드가 나왔는지 세어 메일로 보내드립니다.
      </p>
      {/* ★ 질의에 브랜드명을 넣지 않는다는 것이 이 제품의 핵심이다. 신청
          화면에서 말해야 "우리 이름을 넣고 물어본 거 아니야?"가 안 나온다. */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        질문에는 브랜드명을 넣지 않습니다. 이름을 대고 물으면 AI는 당연히 그 브랜드를 말합니다 —
        재는 것은 <strong className="font-medium text-foreground">이름을 대지 않았을 때도 불리는가</strong>입니다.
      </p>

      <div className="mt-10 rounded-lg border border-border bg-card p-6 sm:p-7">
        <RequestForm />
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        무료 진단으로 알 수 없는 것과 유료 플랜의 차이는{' '}
        <Link href="/pricing" className="text-foreground underline underline-offset-4">
          요금제
        </Link>
        에 적어 두었습니다.
      </p>
    </section>
  )
}
